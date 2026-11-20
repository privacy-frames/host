import { createGuestWindow } from '../src/guest/session.ts';
import { createNativeWasm } from '../src/guest/native-wasm.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';
const check = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
const bytes = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 127, 3, 2, 1, 0, 7, 5, 1, 1, 102, 0, 0,
  10, 6, 1, 4, 0, 65, 7, 11,
]);
async function run() {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const realm = frame.contentWindow!;
  const foreign = Reflect.get(realm, 'WebAssembly') as typeof WebAssembly;
  const memory = new foreign.Memory({ initial: 1, maximum: 2 });
  const module = new foreign.Module(bytes);
  const table = new foreign.Table({ element: 'anyfunc', initial: 1 });
  const fn = new foreign.Instance(module).exports.f as Function;
  let getters = 0,
    traps = 0;
  Object.defineProperty(foreign.Memory.prototype, 'unreviewedWasmFixture', {
    configurable: true,
    get() {
      getters++;
      return 'native positive';
    },
  });
  check(
    Reflect.get(memory, 'unreviewedWasmFixture') === 'native positive',
    'Native foreign getter control',
  );
  check(getters === 1, 'Native foreign getter must execute once');
  getters = 0;
  Object.setPrototypeOf(
    memory,
    new Proxy(foreign.Memory.prototype, {
      has(target, key) {
        traps++;
        return Reflect.has(target, key);
      },
    }),
  );
  Object.setPrototypeOf(
    fn,
    new Proxy(Object.getPrototypeOf(fn), {
      has(target, key) {
        traps++;
        return Reflect.has(target, key);
      },
    }),
  );
  const domain = createNativeWasm({
    captureImports: () => ({}),
    retainBuffer: () => {},
    runWasm: (action) => action(),
  });
  check(domain.owns(memory), 'Foreign memory native brand');
  const unreviewed = domain.get(memory, 'unreviewedWasmFixture');
  Reflect.set(window, '__wasmPolicyObserved', {
    getters,
    traps,
    denied: unreviewed === undefined,
  });
  check(
    getters === 0 && traps === 0 && unreviewed === undefined,
    'Unknown foreign getter must remain unexecuted',
  );
  check(
    domain.prototype(memory) === WebAssembly.Memory.prototype,
    'Local semantic anchor',
  );
  const catalog: GuestContextCatalog = {
    application: 'wasm-policy-fixture',
    generation: 'fixture-generation',
    sourceURL: 'https://fixture.invalid/',
    documentBase: 'https://fixture.invalid/',
    runtimeURL: location.origin + '/',
    applicationURL: location.origin + '/app/',
    engineWasm: await (await fetch('/engine.wasm')).arrayBuffer(),
    workerBootstrap: {
      dedicated: new ArrayBuffer(0),
      shared: new ArrayBuffer(0),
      worklet: new ArrayBuffer(0),
    },
    resources: [],
  };
  const nativeTag = new WebAssembly.Tag({ parameters: ['externref'] });
  const nativeStackTypes = [true, true, false, true, false, true].map(
    (traceStack) =>
      typeof new WebAssembly.Exception(nativeTag, [null], { traceStack }).stack,
  );
  const session = await createGuestWindow(catalog, window);
  try {
    session.engine.set('nativeStackTypes', nativeStackTypes);
    session.engine.set('foreignMemory', memory);
    session.engine.set('foreignModule', module);
    session.engine.set('foreignTable', table);
    session.engine.set('foreignFunction', fn);
    session.engine.set('wasmFixtureBytes', bytes);
    const result = await session.engine.evaluate(
      `(async () => {
      function check(value,message){if(!value)throw new Error(message);}
      check(foreignMemory instanceof WebAssembly.Memory && foreignModule instanceof WebAssembly.Module && foreignTable instanceof WebAssembly.Table, 'Cross-realm native brands');
      check(Object.getPrototypeOf(foreignMemory) === WebAssembly.Memory.prototype, 'Foreign memory local anchor');
      check(Object.getPrototypeOf(foreignModule) === WebAssembly.Module.prototype, 'Foreign module local anchor');
      check(Object.getPrototypeOf(foreignTable) === WebAssembly.Table.prototype, 'Foreign table local anchor');
      check(foreignFunction() === 7, 'Foreign native function calls');
      foreignTable.set(0,foreignFunction); check(foreignTable.get(0)===foreignFunction, 'Raw funcref identity through native table');
      const global = new WebAssembly.Global({value:'anyfunc',mutable:true},foreignFunction);
      check(global.value===foreignFunction, 'Raw funcref identity through native global');
      const previous=foreignMemory.buffer; check(foreignMemory.grow(1)===1&&foreignMemory.buffer.byteLength===131072&&previous.byteLength===0, 'Foreign memory grow and buffer retention');
      const callback=value=>value+1, extern=new WebAssembly.Table({element:'externref',initial:1});
      extern.set(0,callback);check(extern.get(0)===callback&&extern.get(0)(4)===5, 'Guest externref callback ownership');
      if(typeof WebAssembly.Tag==='function'){
        const tag=new WebAssembly.Tag({parameters:['externref']});
        for(const [index,traceStack] of [true,true,false,true,false,true].entries()){
          const ex=new WebAssembly.Exception(tag,[callback],{traceStack});
          check(typeof ex.stack===nativeStackTypes[index],'Repeated native exception stack');
          check(ex.is(tag)&&ex.getArg(tag,0)===callback,'Exception externref ownership');
        }
      }
      for(const name of ['CompileError','LinkError','RuntimeError']){
        let calls=0;const C=WebAssembly[name],error=C({toString(){calls++;return 'marker';}},{cause:19});
        check(calls===1&&error instanceof C&&error.message==='marker'&&error.cause===19,'Callable Wasm error constructor');
        check(C.prototype.constructor===C,'Error constructor alias');
      }
      const compiled=await WebAssembly.compile(wasmFixtureBytes);
      const instance=await WebAssembly.instantiate(compiled,{});
      check(instance.exports.f()===7,'Async native compilation and promise assimilation');
      const imports=WebAssembly.Module.imports;
      check(imports.call(null,compiled).length===0,'Borrowed native Module static method');
      const ownedMemory=new WebAssembly.Memory({initial:1,maximum:2});
      const optional=[];
      for(const name of ['toFixedLengthBuffer','toResizableBuffer'])if(typeof ownedMemory[name]==='function'){
        const buffer=ownedMemory[name]();check(buffer.byteLength===65536,'Optional memory buffer result');optional.push(name);
      }
      check(typeof WebAssembly.promising==='undefined'&&typeof WebAssembly.Suspending==='undefined'&&typeof WebAssembly.SuspendError==='undefined','Unreviewed JSPI remains unavailable');
      return JSON.stringify({crossRealm:true,funcrefIdentity:true,externrefOwnership:true,errorCalls:true,asyncInstantiation:true,localAnchors:true,optionalMemoryMethods:optional});
    })()`,
      'wasm:policy-fixture',
    );
    check(getters === 0 && traps === 0, 'Foreign physical prototype remains unused');
    return JSON.parse(String(result)) as unknown;
  } finally {
    session.close();
    frame.remove();
  }
}
run()
  .then((result) => Reflect.set(window, '__wasmPolicyResult', result))
  .catch((error) =>
    Reflect.set(
      window,
      '__wasmPolicyFailure',
      String(error) + (error instanceof Error && error.stack ? '\n' + error.stack : ''),
    ),
  );
