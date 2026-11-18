//! Disposable browser feasibility embedding, not a browser API implementation.
use std::{cell::RefCell, rc::Rc};

use boa_engine::{
    Context, JsNativeError, JsResult, JsValue as GuestValue, Module, NativeFunction, Source,
    js_string,
};
use wasm_bindgen::prelude::*;

thread_local! {
    static ENGINE: RefCell<Option<Context>> = const { RefCell::new(None) };
}

// A native call explicitly lends its Context while the synchronous browser call
// runs. `with` temporarily removes the mutable slot, preventing overlapping use.
scoped_tls_hkt::scoped_thread_local!(static mut ACTIVE: Context);

#[wasm_bindgen(module = "/bridge.js")]
extern "C" {
    #[wasm_bindgen(catch)]
    fn browser_call(operation: &str, argument: &str) -> Result<String, JsValue>;
}

fn host(_: &GuestValue, args: &[GuestValue], context: &mut Context) -> JsResult<GuestValue> {
    let operation = args
        .first()
        .cloned()
        .unwrap_or_default()
        .to_string(context)?
        .to_std_string_escaped();
    let argument = args
        .get(1)
        .cloned()
        .unwrap_or_default()
        .to_string(context)?
        .to_std_string_escaped();
    let scoped = operation != "dispatch-naive";
    let result = if scoped {
        ACTIVE.set(context, || browser_call(&operation, &argument))
    } else {
        browser_call(&operation, &argument)
    };
    result
        .map(|value| js_string!(value).into())
        .map_err(|error| {
            JsNativeError::error()
                .with_message(error.as_string().unwrap_or_else(|| format!("{error:?}")))
                .into()
        })
}

fn with_context<T>(action: impl FnOnce(&mut Context) -> Result<T, JsValue>) -> Result<T, JsValue> {
    if ACTIVE.is_set() {
        ACTIVE.with(action)
    } else {
        ENGINE.with(|engine| {
            let mut slot = engine.try_borrow_mut().map_err(|_| {
                JsValue::from_str("Context already borrowed: naive reentry rejected")
            })?;
            action(
                slot.as_mut()
                    .ok_or_else(|| JsValue::from_str("not initialized"))?,
            )
        })
    }
}

#[wasm_bindgen]
pub fn initialize() -> Result<(), JsValue> {
    console_error_panic_hook::set_once();
    let loader = Rc::new(boa_engine::module::MapModuleLoader::new());
    let mut context = Context::builder()
        .module_loader(loader.clone())
        .build()
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    context
        .runtime_limits_mut()
        .set_loop_iteration_limit(1_000_000);
    let admitted = Module::parse(
        Source::from_bytes("export const value = 23;"),
        None,
        &mut context,
    )
    .map_err(|e| JsValue::from_str(&e.to_string()))?;
    loader.insert("/admitted.mjs", admitted);
    context
        .register_global_builtin_callable(js_string!("host"), 2, NativeFunction::from_fn_ptr(host))
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    ENGINE.with(|engine| *engine.borrow_mut() = Some(context));
    Ok(())
}

#[wasm_bindgen]
pub fn evaluate(source: &str) -> Result<String, JsValue> {
    with_context(|context| {
        context
            .eval(Source::from_bytes(source))
            .map(|value| value.display().to_string())
            .map_err(|e| JsValue::from_str(&e.to_string()))
    })
}

#[wasm_bindgen]
pub fn jobs() -> Result<(), JsValue> {
    with_context(|context| {
        context
            .run_jobs()
            .map_err(|e| JsValue::from_str(&e.to_string()))
    })
}

#[wasm_bindgen]
pub fn module(source: &str) -> Result<String, JsValue> {
    with_context(|context| {
        let module = Module::parse(Source::from_bytes(source), None, context)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        let promise = module.load_link_evaluate(context);
        context
            .run_jobs()
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(format!("{:?}", promise.state()))
    })
}

/// Invoke a retained guest callback through Boa's function-call API, rather than
/// evaluating a nested script whose abrupt completion can affect its caller.
#[wasm_bindgen]
pub fn call_listener(name: &str) -> Result<String, JsValue> {
    with_context(|context| {
        let result = (|| {
            let listeners = context
                .global_object()
                .get(js_string!("listeners"), context)?;
            let listeners = listeners
                .as_object()
                .ok_or_else(|| JsNativeError::typ().with_message("missing listeners"))?;
            let callback = listeners.get(js_string!(name), context)?;
            let callback = callback
                .as_callable()
                .ok_or_else(|| JsNativeError::typ().with_message("missing callback"))?;
            callback.call(&GuestValue::undefined(), &[], context)
        })();
        result
            .map(|value| value.display().to_string())
            .map_err(|error: boa_engine::JsError| JsValue::from_str(&error.to_string()))
    })
}
