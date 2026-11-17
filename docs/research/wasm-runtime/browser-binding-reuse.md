# Reusing native browser bindings for a Wasm JavaScript guest

Research date: 2026-11-17. Scope: established binding infrastructure for the browser's real DOM, HTML/CSS, layout and rendering. Application callbacks stay in the guest engine; synchronous DOM operations and events must survive. This report selects neither an engine nor engine placement. It contains source research, no implementation, build or application qualification. IFC and JSFlow implementation reuse are excluded. Application service-worker execution is deferred; the host's service worker and manifests remain in scope.

## Findings

There are useful libraries to reuse, but the inspected candidates do not provide a complete, confined browser environment inside QuickJS or Boa. The most direct QuickJS candidate is **quickjs-emscripten-sync**: it supplies identity bookkeeping, function conversion, property/prototype conversion and handle ownership. **webidl2js** offers a different saving: generate guest JavaScript interfaces and Web IDL conversions, then connect their implementation objects to admitted native browser operations. For Boa, **web-sys** supplies extensive typed Rust access to the browser, while Boa's interop traits and native classes supply the other side. These are separate boundaries; using both does not automatically connect them. [Sync source][sync-index] · [WebIDL generator][idl-readme] · [web-sys imports][web-guide] · [Boa interop][boa-interop]

| Candidate                         | Code it can replace                                                                                                          | Work still owned by Privacy Frames                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| quickjs-emscripten                | Wasm engine integration, handles, native functions/properties, promise/job hooks, opaque host references                     | Browser interfaces, mediation, identity policy, event integration and lifetime across browser and guest          |
| quickjs-emscripten-sync           | Generic object/function marshalling, identity map, proxies, prototypes/descriptors, arena cleanup                            | DOM exotic behavior, native changes, authority filtering, buffer aliasing and qualified callback reentry         |
| Boa interop/macros/native classes | Rust function argument/result conversion, data conversion derives, native class/prototype scaffolding                        | Browser interface generation and mapping to browser objects, identity caches, callback and GC integration        |
| wasm-bindgen + web-sys/js-sys     | Typed Rust calls to real browser JS objects, generated imports and JS reference management                                   | Guest-facing classes, conversions, mediation and callback routing into Boa                                       |
| webidl2js                         | Guest JS Web IDL wrapper classes, brands, overloads/conversions, inheritance, indexed/named properties and callback wrappers | Native browser forwarding implementations, cross-engine handles, special HTML hooks and unsupported IDL features |

The rows are a decomposition inferred from the source contracts below, not interoperable components already demonstrated together.

## Inspected revisions and maintenance

Pins identify inspected source, not a proposed dependency lockfile. A recent commit demonstrates activity, not suitability or a support commitment.

| Project                         | Source inspected                           | Version and observed activity                                                             | License           |
| ------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------- |
| justjake/quickjs-emscripten     | `7b7af98e4e69757c64c27aac46a74e1e07229545` | package 0.32.0; head 2026-07-23                                                           | MIT               |
| reearth/quickjs-emscripten-sync | `26218c277f1c3b9315ff861c5da572a8c1ba8d00` | package 1.11.0; head 2026-10-22; GitHub latest Release is older v1.8.1 (2026-02-03)       | MIT               |
| boa-dev/boa                     | `337a3668a0dc86dd401ea20906e782249a64a228` | release v0.22, 2026-08-28                                                                 | Unlicense OR MIT  |
| wasm-bindgen/wasm-bindgen       | `e692fe24a361915d9abb3fe88e0f591ea1fa5088` | head 2026-11-17; workspace 0.2.130, web-sys 0.3.107; release 0.2.130 published 2026-10-30 | MIT OR Apache-2.0 |
| jsdom/webidl2js                 | `d61dde003ea3ff5de60b9e4b115dd6a79e150656` | package/release 21.2.0; 2026-10-29                                                        | MIT               |

Sources: [QuickJS package][qjs-package], [QuickJS commit][qjs-commit], [sync package][sync-package], [sync commit][sync-commit], [sync Release API][sync-release], [Boa release][boa-release], [Boa manifest][boa-manifest], [wasm-bindgen commit][wbg-commit], [wasm-bindgen manifest][wbg-manifest], [web-sys manifest][web-manifest], [wasm-bindgen release][wbg-release], [webidl2js package][idl-package], [webidl2js release][idl-release].

The sync package accepts `quickjs-emscripten: "*"` as a peer and develops against ^0.32.0. This is not evidence of every wrapper version working. The QuickJS capability report separately identifies the wrapper's older vendored engine revisions; adopting generic bindings does not upgrade language support. [Sync manifest][sync-package] · [QuickJS research](https://github.com/privacy-frames/host/blob/fb922b0c5617f8250ce6a3ec8b617fc6ba8ccfae/docs/research/wasm-runtime/quickjs-capabilities.md)

## QuickJS: reusable engine boundary and object bridge

quickjs-emscripten provides synchronous `newFunction`/`callFunction`, properties/accessors, explicit handle duplication/disposal and opaque `newHostRef` values. HostRef keeps a host resource available for round trips without giving guest code its properties. It does not make a usable guest Node interface. `newArrayBuffer` and `getArrayBuffer` are byte-conversion facilities, not a live shared browser-memory abstraction. The wrapper also leaves guest promise jobs under host control. [Context API][qjs-context] · [Runtime API][qjs-runtime]

quickjs-emscripten-sync is real and directly relevant. Its `Arena` owns handles and converts function arguments, receivers and results in both directions. `VMMap` retains bidirectional host/guest pairs; checked-in identity tests cover round trips and repeated returns of the same object. Those tests also explicitly expect identity to be lost with `syncEnabled: false`. These are general object tests, not DOM conformance receipts. [Arena][sync-index] · [Identity map][sync-map] · [Identity tests][sync-identity]

It traverses own property descriptors and the prototype chain. Host functions run through `.apply` after unmarshalling `this`; guest functions become host functions that call `ctx.callFunction`. This reduces manual callback wrapping and permits synchronous invocation at the API level. It does not prove nested native event dispatch works for every callback pattern. AsyncArena can suspend asyncified host calls, but supports only one suspended call at a time; suspension is not a general synchronous DOM transport or a solution to worker placement. Class constructors receive special treatment that copies fields from a host-constructed result; the documented limitation says live `this` and `new.target` cannot be fully proxied. Plain host function calls receive `undefined` instead of the guest global as their receiver. [Objects][sync-object] · [Properties][sync-properties] · [Host functions][sync-functions] · [Guest callbacks][sync-callbacks] · [Limitations][sync-readme]

A key limit for DOM use is visible in the implementation: reads are `Reflect.get` on the copied guest object, while writes/deletes/definitions can propagate through proxies. Marshalled native accessors and methods can call back into the browser, but the proxy is not a general remote property lookup. Raw host mutations do not propagate unless they pass through the returned sync proxy; native DOM changes, live collections and named/indexed exotic behavior cannot be assumed to follow that route. A complete Node/HTMLCollection/Window adapter must therefore be investigated separately. No DOM/event-specific tests were found in the inspected `src` tests. This is a bounded search finding, not proof that no downstream user has such an adapter. [Proxy implementation][sync-wrapper] · [Descriptor conversion][sync-properties] · [Documented sync contract][sync-readme]

Memory and binary semantics constrain reuse. The map strongly retains host keys and guest handles; the guest-side WeakMaps do not make the entire bridge weak. The arena supports unregistering values and must be disposed before its context. Disabling retention avoids growth but sacrifices identity. ArrayBuffer and views are copied; Date/Map/Set are also snapshots, and self-referential Map/Set is documented as unsupported. These defaults cannot preserve browser `WebAssembly.Memory.buffer` aliasing, transfer/detachment or mutable native buffer sharing. Custom converters and opaque HostRefs offer integration points, not an existing solution. [Map ownership][sync-map] · [Binary conversion][sync-binary] · [Reverse binary conversion][sync-unbinary] · [Options/limitations][sync-readme]

Confinement must remain explicit. The current `_isMarshalable` implementation defaults to JSON; full marshalling requires opt-in. Another README paragraph says that nothing is blocked by default, which is imprecise alongside that default: use the pinned code contract. The README warns about exposing window, storage, network APIs and prototype-polluting host functions. Registered builtins map host `Function` to guest `Function`, rather than indiscriminately exporting the host constructor; that mapping is useful but not an escape audit. Whitelisting marshallable objects does not authorize every effect of callable methods or returned objects. [Default selection][sync-index] · [Registered builtins][sync-default] · [Security discussion][sync-readme]

## Boa: substantial host-side reuse, missing guest browser generator

Boa's `IntoJsFunctionCopied`, `UnsafeIntoJsFunction`, `TryFromJs` and `TryIntoJs` reduce Rust call and data conversion boilerplate. Derives support named-field structs and configurable field conversion; they do not derive the DOM interface hierarchy from Web IDL. Native `Class`/`ClassBuilder` provides methods, static methods, prototype properties and native data downcasts. Browser objects would still require wrappers and stable maps to preserve guest identity and listener removal. [Interop traits][boa-interop] · [Derives][boa-macros] · [Class example][boa-class]

The callback constraint is concrete. Unsafe typed `FnMut` conversion uses RefCell: some generated variants return an explicit recursion error on `try_borrow_mut`, while context-taking variants use `borrow_mut`. That convenience adapter is unsuitable as blanket evidence for recursive DOM callbacks. Lower-level native function pointers receive the currently executing mutable Context and can invoke guest code through it, but a browser callback arriving through an exported Wasm closure while that Context is already borrowed needs a deliberate reentry design. Captured guest references must be traced; Boa supplies explicit traceable captures and warns about untraced closure captures. These findings identify obligations, not an impossibility result for Boa. [Typed implementation][boa-functions] · [Native functions and tracing][boa-native] · [Existing engine research](https://github.com/privacy-frames/host/blob/4f2988fbfc116fa8d51953f532dede0bb715052d/docs/research/wasm-runtime/boa-capabilities.md)

web-sys imports the browser's existing objects into Rust. Its generated Node declaration contains native JS inheritance, getters and method imports, including optional results and caught exceptions. wasm-bindgen `JsValue` cloning/dropping manages host JS references; it is a different type from Boa `JsValue`. Consequently, a web-sys Node is useful inside a Rust native-method implementation but is not itself a Boa Node. The host still needs to construct guest prototypes/objects and associate them with retained browser references. [Generated Node][web-node] · [Reference lifecycle][wbg-value] · [Inheritance][web-inheritance]

web-sys callback arguments are `js_sys::Function`; Rust closures must be wrapped with wasm-bindgen's callback machinery. The closure source documents errors for recursively invoking a mutable closure or using a dropped closure. Holding the callback until listener removal, keeping the guest function alive and supporting nested dispatch remain host duties. BufferSource translations use JS objects or mutable byte slices; slice conversions include copies and memory views with explicit lifetimes. This does not join Boa's backing stores to arbitrary browser ArrayBuffers. [Type translations][web-types] · [Closure contract][wbg-closure] · [Slice conversions][wbg-slices]

wasm-bindgen's WebIDL tooling emits imports for the outer JS runtime. Reusing its IDL corpus or parser could reduce inventory and parsing work for a new Boa generator, but emitting guest Boa classes would require a new backend. That is development work, not a supplied browser binding. [WebIDL compiler][wbg-idl]

## Web IDL generation inside either guest

webidl2js is the strongest inspected engine-independent generator candidate. Its generated JavaScript classes implement brands, argument checks/conversions, overloads, inheritance, descriptors, callback wrappers and named/indexed property handling, then delegate to implementation classes. Its wrapper/implementation registry and `[SameObject]` caching reduce identity machinery within that generated environment. Native browser forwarding can be the implementation: no HTML/CSS engine is required. The last possibility is an architectural inference, not a tested integration. [Generator contract and supported features][idl-readme] · [Interface source][idl-interface] · [Utilities][idl-utils] · [Callback generation][idl-callback]

The generated wrapper and implementation objects live in one JavaScript environment. Feeding raw browser objects into its implementation registry does not create guest objects across QuickJS/Boa heaps. An adapter must map native handles to guest implementation records and reuse those records when nodes recur. Callback implementation records must route synchronously into guest functions. This is how the generator could eliminate per-interface wrapper boilerplate while leaving native operation forwarding and authority checks explicit. [Generated wrapper contract][idl-readme] · [Interface source][idl-interface]

It is not a complete Web IDL/browser implementation. Its README lists missing maplike/setlike, Global consequences, LegacyFactoryFunction, LegacyNamespace and SecureContext handling. CEReactions and HTMLConstructor are ignored by default unless hooks are supplied; reflection also needs host hooks. Generated modules use CommonJS `require` and webidl-conversions, so bundling/module provisioning and exact guest intrinsic support need qualification. The generator runs at build time; that does not require running Node.js in the browser guest. Its utilities call `globalObject.eval` with a fixed intrinsic-discovery expression; when installed in the guest, that must resolve to guest evaluation. It is not a reason to expose native eval. Full browser IDL inventories, special Window behavior and security policy are additional work. [Limits, hooks and module examples][idl-readme] · [Build transformer][idl-transformer] · [Intrinsic discovery][idl-utils]

A generic bridge must never hand guest source to native `eval`/`Function`, event-handler compilation or script-loading routes as a shortcut. Similarly, exposing an admitted DOM object must not implicitly admit its ownerDocument/defaultView, constructors, network effects, navigation, script insertion or handler-string evaluation. No inspected library proves those routes confined. The chosen native DOM boundary requires those routes to be specified and mediated; Web IDL types describe interfaces, not Privacy Frames authorization. [Sync security warning][sync-readme] · [HTML dynamic markup insertion](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html) · [HTML event handlers](https://html.spec.whatwg.org/multipage/webappapis.html#event-handlers)

## Open decisions and qualification work

1. **Choose the binding composition after engine placement is understood.** QuickJS-sync can reduce generic marshalling; generated Web IDL wrappers can reduce interface semantics; Boa plus web-sys can reduce Rust browser calls. None establishes synchronous access from a worker. Engine placement remains open.
2. **Decide how broad the first binding inventory is.** Use actual application access to prioritize interfaces, while retaining required dynamic lookup, reflection, prototype and constructor behavior. Avoid substituting a small bespoke UI API for unchanged browser applications.
3. **Qualify identity and reentry before adopting a bridge.** Repeated queries/parent traversal, expandos, brand checks, live collections, listener add/remove identity, dispatchEvent → guest listener → nested DOM call, preventDefault timing and exception propagation need execution evidence. Include custom-element or other synchronous browser callbacks if applications require them.
4. **Set a lifetime and buffer contract.** Test detached nodes, retained listeners, guest/browser cycles, disposal during callbacks, memory growth and long sessions. Separately settle live typed-array aliases, browser Wasm memory, transfers and shared memory; copied bytes are insufficient evidence.
5. **Audit every path to native effects and code execution.** Identity reuse and convenient callbacks do not establish confinement. The capability boundary, resource routes, script/handler execution and returned-object graph need a separate policy and review.

These are research follow-ups; no prototype, production change, source downleveling or engine recommendation was performed here.

[sync-index]: https://github.com/reearth/quickjs-emscripten-sync/blob/26218c277f1c3b9315ff861c5da572a8c1ba8d00/src/index.ts
[sync-package]: https://github.com/reearth/quickjs-emscripten-sync/blob/26218c277f1c3b9315ff861c5da572a8c1ba8d00/package.json
[sync-map]: https://github.com/reearth/quickjs-emscripten-sync/blob/26218c277f1c3b9315ff861c5da572a8c1ba8d00/src/vmmap.ts
[sync-identity]: https://github.com/reearth/quickjs-emscripten-sync/blob/26218c277f1c3b9315ff861c5da572a8c1ba8d00/src/identity.test.ts
[sync-object]: https://github.com/reearth/quickjs-emscripten-sync/blob/26218c277f1c3b9315ff861c5da572a8c1ba8d00/src/marshal/object.ts
[sync-properties]: https://github.com/reearth/quickjs-emscripten-sync/blob/26218c277f1c3b9315ff861c5da572a8c1ba8d00/src/marshal/properties.ts
[sync-functions]: https://github.com/reearth/quickjs-emscripten-sync/blob/26218c277f1c3b9315ff861c5da572a8c1ba8d00/src/marshal/function.ts
[sync-callbacks]: https://github.com/reearth/quickjs-emscripten-sync/blob/26218c277f1c3b9315ff861c5da572a8c1ba8d00/src/unmarshal/function.ts
[sync-readme]: https://github.com/reearth/quickjs-emscripten-sync/blob/26218c277f1c3b9315ff861c5da572a8c1ba8d00/README.md
[sync-wrapper]: https://github.com/reearth/quickjs-emscripten-sync/blob/26218c277f1c3b9315ff861c5da572a8c1ba8d00/src/wrapper.ts
[sync-binary]: https://github.com/reearth/quickjs-emscripten-sync/blob/26218c277f1c3b9315ff861c5da572a8c1ba8d00/src/marshal/custom.ts
[sync-unbinary]: https://github.com/reearth/quickjs-emscripten-sync/blob/26218c277f1c3b9315ff861c5da572a8c1ba8d00/src/unmarshal/custom.ts
[sync-default]: https://github.com/reearth/quickjs-emscripten-sync/blob/26218c277f1c3b9315ff861c5da572a8c1ba8d00/src/default.ts
[sync-commit]: https://github.com/reearth/quickjs-emscripten-sync/commit/26218c277f1c3b9315ff861c5da572a8c1ba8d00
[qjs-package]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/packages/quickjs-emscripten/package.json
[qjs-context]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/packages/quickjs-emscripten-core/src/context.ts
[qjs-runtime]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/packages/quickjs-emscripten-core/src/runtime.ts
[qjs-commit]: https://github.com/justjake/quickjs-emscripten/commit/7b7af98e4e69757c64c27aac46a74e1e07229545
[boa-interop]: https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/interop/mod.rs
[boa-manifest]: https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/Cargo.toml
[boa-macros]: https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/macros/src/lib.rs
[boa-class]: https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/examples/src/bin/classes.rs
[boa-functions]: https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/interop/into_js_function_impls.rs
[boa-native]: https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/native_function/mod.rs
[wbg-manifest]: https://github.com/wasm-bindgen/wasm-bindgen/blob/e692fe24a361915d9abb3fe88e0f591ea1fa5088/Cargo.toml
[wbg-value]: https://github.com/wasm-bindgen/wasm-bindgen/blob/e692fe24a361915d9abb3fe88e0f591ea1fa5088/src/lib.rs
[wbg-closure]: https://github.com/wasm-bindgen/wasm-bindgen/blob/e692fe24a361915d9abb3fe88e0f591ea1fa5088/src/closure.rs
[wbg-slices]: https://github.com/wasm-bindgen/wasm-bindgen/blob/e692fe24a361915d9abb3fe88e0f591ea1fa5088/guide/src/reference/types/number-slices.md
[wbg-idl]: https://github.com/wasm-bindgen/wasm-bindgen/blob/e692fe24a361915d9abb3fe88e0f591ea1fa5088/crates/webidl/src/lib.rs
[wbg-commit]: https://github.com/wasm-bindgen/wasm-bindgen/commit/e692fe24a361915d9abb3fe88e0f591ea1fa5088
[web-manifest]: https://github.com/wasm-bindgen/wasm-bindgen/blob/e692fe24a361915d9abb3fe88e0f591ea1fa5088/crates/web-sys/Cargo.toml
[web-guide]: https://github.com/wasm-bindgen/wasm-bindgen/blob/e692fe24a361915d9abb3fe88e0f591ea1fa5088/guide/src/web-sys/index.md
[web-node]: https://github.com/wasm-bindgen/wasm-bindgen/blob/e692fe24a361915d9abb3fe88e0f591ea1fa5088/crates/web-sys/src/features/gen_Node.rs
[web-inheritance]: https://github.com/wasm-bindgen/wasm-bindgen/blob/e692fe24a361915d9abb3fe88e0f591ea1fa5088/guide/src/web-sys/inheritance.md
[web-types]: https://github.com/wasm-bindgen/wasm-bindgen/blob/e692fe24a361915d9abb3fe88e0f591ea1fa5088/guide/src/web-sys/type-translations.md
[idl-readme]: https://github.com/jsdom/webidl2js/blob/d61dde003ea3ff5de60b9e4b115dd6a79e150656/README.md
[idl-package]: https://github.com/jsdom/webidl2js/blob/d61dde003ea3ff5de60b9e4b115dd6a79e150656/package.json
[idl-interface]: https://github.com/jsdom/webidl2js/blob/d61dde003ea3ff5de60b9e4b115dd6a79e150656/lib/constructs/interface.js
[idl-utils]: https://github.com/jsdom/webidl2js/blob/d61dde003ea3ff5de60b9e4b115dd6a79e150656/lib/output/utils.js
[idl-callback]: https://github.com/jsdom/webidl2js/blob/d61dde003ea3ff5de60b9e4b115dd6a79e150656/lib/constructs/callback-function.js
[idl-transformer]: https://github.com/jsdom/webidl2js/blob/d61dde003ea3ff5de60b9e4b115dd6a79e150656/lib/transformer.js
[sync-release]: https://api.github.com/repos/reearth/quickjs-emscripten-sync/releases/latest
[boa-release]: https://github.com/boa-dev/boa/releases/tag/v0.22
[wbg-release]: https://github.com/wasm-bindgen/wasm-bindgen/releases/tag/0.2.130
[idl-release]: https://github.com/jsdom/webidl2js/releases/tag/v21.2.0
