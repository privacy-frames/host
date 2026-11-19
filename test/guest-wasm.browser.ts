import { GuestEngine } from '../src/guest/engine.ts';
import type { GuestHost } from '../src/guest/protocol.ts';
import { createGuestWindow } from '../src/guest/session.ts';

type CaseResult = { name: string; passed: boolean; error?: string };
declare global {
  var guestWasmResults:
    | {
        isolated: boolean;
        native: CaseResult[];
        guest: CaseResult[];
        error?: string;
        policy?: { control: boolean[]; guest: boolean[] };
        foreign?: string[];
      }
    | undefined;
}

// The same program exercises browser-native controls and the actual guest bridge.
// Native callbacks below are fixture adapters, not the production DOM policy.
const cases = [
  {
    name: 'consecutive imports preserve ordinary bytes through native reentry and throw',
    source: `
      const ordinary = new Uint8Array(4);
      nativeKind(ordinary); // Establish an ordinary host/guest buffer mirror.
      ordinary[0] = 1;
      const memory = new WebAssembly.Memory({initial: 1, maximum: 3});
      const words = new Int32Array(memory.buffer);
      const sentinel = new Error('second import');
      let calls = 0;
      const instance = new WebAssembly.Instance(new WebAssembly.Module(plainBytes), {
        env: {memory, callback() {
          calls++;
          if (calls === 1) {
            check(ordinary[0] === 1 && words[0] === 10, 'first import sees current bytes');
            ordinary[0] = 2;
            const result = nativeBufferRoundtrip(ordinary, () => {
              check(ordinary[1] === 7, 'nested native mutation reaches ordinary callback');
              ordinary[2] = 9;
            });
            check(result.before === 2 && result.written === 9, 'nested native consumer sees guest writes');
            check(ordinary[3] === 8, 'native continuation reaches imported callback');
            ordinary[0] = 3;
            return 22;
          }
          check(ordinary[0] === 3, 'second import retains preceding guest-only write');
          check(words[0] === 11, 'native continuation invalidates indexed heap reads');
          ordinary[0] = 4;
          throw sentinel;
        }},
      });
      let sameError = false;
      try {instance.exports.twice(0);} catch(error) {sameError = error === sentinel;}
      check(sameError && calls === 2, 'exception crosses the outer Wasm scope');
      check(ordinary.join(',') === '4,7,9,8', 'exceptional scope exit preserves all ordinary bytes');
    `,
  },
  {
    name: 'ordinary memory, reentrant import and alias writes',
    source: `
      const memory = new WebAssembly.Memory({ initial: 1, maximum: 3 });
      const words = new Int32Array(memory.buffer);
      const instance = new WebAssembly.Instance(new WebAssembly.Module(plainBytes), {
        env: { memory, callback(value) {
          check(words[0] === 10, 'native Wasm write visible inside guest callback');
          words[0] = 20;
          return value + 10;
        } },
      });
      check(instance.exports.roundtrip(7) === 37, 'nested callback return/write');
      check(words.buffer === memory.buffer, 'native buffer identity');
      const alias = words.subarray(0, 2);
      alias[0] = 31;
      check(instance.exports.read(0) === 31, 'subarray aliases native memory');
      const data = new DataView(memory.buffer);
      data.setInt32(0, 91, true);
      check(words[0] === 91 && data.getInt32(0, true) === 91, 'DataView native brand');
      check(ArrayBuffer.isView(data) && ArrayBuffer.isView(words), 'native view brands');
      check(words.map(value => value + 1)[0] === 92, 'native callback typed map');
      const previous = memory.buffer;
      check(instance.exports.grow(1) === 1, 'Wasm memory growth return');
      check(previous.byteLength === 0 && words.length === 0, 'growth detaches old views');
      check(memory.buffer.byteLength === 131072, 'new memory size');
      check(new Int32Array(memory.buffer)[0] === 91, 'growth preserves bytes');
      let trapped = false;
      try { instance.exports.read(200000); } catch (error) {
        trapped = error instanceof WebAssembly.RuntimeError;
      }
      check(trapped, 'native Wasm runtime error brand');
      const sentinel = new Error('guest callback sentinel');
      const throwing = new WebAssembly.Instance(new WebAssembly.Module(plainBytes), {
        env: {memory, callback() { throw sentinel; }},
      });
      let sameError = false;
      try { throwing.exports.roundtrip(1); } catch (error) { sameError = error === sentinel; }
      check(sameError, 'guest callback exception survives native Wasm boundary');
    `,
  },
  {
    name: 'local and native binary constructors, indexed descriptors and species',
    source: `
      const local = new Uint8Array([1, 2, 3]);
      const memory = new WebAssembly.Memory({initial: 1, maximum: 3});
      const native = new Uint8Array(memory.buffer, 0, 3);
      for (const view of [local, native]) {
        Object.defineProperty(view, '0', {value: 9});
        check(view[0] === 9 && view.slice()[0] === 9, 'indexed defineProperty writes bytes');
        check(Object.getOwnPropertyDescriptor(view, '0').value === 9, 'indexed descriptor');
        check(Reflect.defineProperty(view, '99', {value: 1}) === false, 'out of bounds definition');
        view.set([4, 5], 1);
        check(view.join(',') === '9,4,5', 'set and iteration');
      }
      class Derived extends Uint8Array {}
      const derived = new Derived([6, 7]);
      check(derived instanceof Derived, 'local subclass identity');
      check(derived.map(value => value + 1) instanceof Derived, 'local subclass species');
      const inherited = new Derived(memory.buffer, 0, 3);
      check(inherited instanceof Derived, 'native-backed subclass identity');
      check(inherited.slice() instanceof Derived, 'native-backed subclass species');
      check(new TextDecoder().decode(new Uint8Array([65, 66])) === 'AB', 'native decoder local view');
      check(new TextDecoder().decode(native) === String.fromCharCode(9, 4, 5), 'native decoder native view');
      const localCopy = new Uint8Array(native);
      native[0] = 77;
      check(localCopy[0] === 9, 'native to local constructor copies');
      native.set(localCopy);
      check(native[0] === 9, 'local to native set copies');
      check([...native].join(',') === '9,4,5', 'native typed iterator');
      const nanMemory = new WebAssembly.Memory({initial: 1});
      const nanBits = new Uint32Array(nanMemory.buffer);
      nanBits[0] = 0x7fc01234;
      const nanSource = new Float32Array(nanMemory.buffer, 0, 1);
      const nanLocal = new Float32Array(1);
      nanLocal.set(nanSource);
      check(new Uint32Array(nanLocal.buffer)[0] === 0x7fc01234, 'mixed native-to-local set preserves raw NaN payload');
      const nanBorrowed = new Float32Array(1);
      Float32Array.prototype.set.call(nanBorrowed, nanSource);
      check(new Uint32Array(nanBorrowed.buffer)[0] === 0x7fc01234, 'borrowed mixed set preserves raw NaN payload');
    `,
  },
  {
    name: 'shared Wasm memory, atomics and structured clone through dedicated worker',
    source: `
      const memory = new WebAssembly.Memory({initial: 1, maximum: 3, shared: true});
      const module = new WebAssembly.Module(sharedBytes);
      const words = new Int32Array(memory.buffer);
      check(memory.buffer instanceof SharedArrayBuffer, 'shared buffer brand');
      const old = memory.buffer;
      Atomics.store(words, 0, 40);
      const result = await workerRoundtrip(memory, module);
      check(result.before === 40 && result.after === 42, 'worker native Wasm atomic write');
      check(Atomics.load(words, 0) === 42, 'guest immediately observes worker write');
      check(result.clonedMemory && result.clonedModule, 'worker structured clone brands');
      memory.grow(1);
      check(old.byteLength === 65536, 'shared old buffer remains attached');
      check(memory.buffer.byteLength === 131072, 'shared growth');
      check(new Int32Array(memory.buffer)[0] === 42, 'shared growth aliases bytes');
      check(Atomics.compareExchange(words, 0, 42, 43) === 42, 'Atomics proxy arguments');
    `,
  },
  {
    name: 'Wasm shared-buffer slice copies into a separate shared block',
    source: `
      const memory = new WebAssembly.Memory({initial: 1, maximum: 3, shared: true});
      const buffer = memory.buffer;
      new Uint8Array(buffer)[0] = 71;
      const result = SharedArrayBuffer.prototype.slice.call(buffer, 0, 4);
      check(result instanceof SharedArrayBuffer, 'shared Wasm slice buffer brand');
      check(result.byteLength === 4 && new Uint8Array(result)[0] === 71, 'shared Wasm slice copies bytes');
      new Uint8Array(result)[0] = 19;
      check(new Uint8Array(buffer)[0] === 71, 'shared Wasm slice owns a separate data block');
    `,
  },
  {
    name: 'declared imports use inherited getters without traversing unused fields',
    source: `
      const trace = [];
      const memory = new WebAssembly.Memory({initial: 1, maximum: 3});
      const namespace = Object.create({
        get memory() { trace.push('memory'); return memory; },
        get callback() { trace.push('callback'); return value => value; },
      });
      Object.defineProperty(namespace, 'unused', {enumerable: true, get() {
        throw new Error('undeclared import getter evaluated');
      }});
      const imports = Object.create({get env() {trace.push('env'); return namespace;}});
      const instance = new WebAssembly.Instance(new WebAssembly.Module(plainBytes), imports);
      check(trace.join(',') === 'env,memory,env,callback', 'declaration-order import getters: ' + trace.join(','));
      check(instance.exports.roundtrip(2) === 12, 'inherited import fields');
      const sentinel = new Error('declared import getter sentinel');
      let same = false;
      try {
        new WebAssembly.Instance(new WebAssembly.Module(plainBytes), {
          env: {get memory() {throw sentinel;}},
        });
      } catch (error) {same = error === sentinel;}
      check(same, 'declared import getter preserves guest exception identity');
    `,
  },
  {
    name: 'native function imports retain the owning host call policy',
    source: `
      check(nativePolicyCallback(0) === expectedPolicyValue, 'direct native call uses fixture policy');
      const memory = new WebAssembly.Memory({initial:1,maximum:3});
      const instance = new WebAssembly.Instance(new WebAssembly.Module(plainBytes), {
        env:{memory,callback:nativePolicyCallback},
      });
      check(instance.exports.roundtrip(0) === expectedPolicyValue + 10, 'native Wasm import uses fixture policy');
      const trace=[];
      const mixedImports = {
        get env(){trace.push('env');return {get item(){trace.push('item');return nativePolicyCallback;}};},
        get unused(){throw new Error('undeclared enumerable import getter');},
      };
      const mixed = new WebAssembly.Instance(new WebAssembly.Module(mixedBytes), mixedImports);
      check(trace.join(',') === 'env,item,env,item', 'mixed-kind import getter order');
      check(mixed.exports.call(0) === expectedPolicyValue, 'mixed-kind function import uses fixture policy');
      check(mixed.exports.reference() === nativePolicyCallback, 'externref import preserves original object identity');
      check(mixed.exports.reference()(0) === expectedPolicyValue, 'returned externref function keeps fixture policy');
      for(const [imports,kind] of [[[], 'Array'], [new Uint8Array(8),'Uint8Array'], [new ArrayBuffer(8),'ArrayBuffer'], [new Map(),'Map']]) {
        imports.env = {memory,callback:nativePolicyCallback};
        new WebAssembly.Instance(new WebAssembly.Module(plainBytes), imports);
        check(nativeKind(imports) === kind, 'opaque import reference preserves subsequent native ' + kind + ' conversion');
      }
      const asyncTrace=[];
      const pending = WebAssembly.instantiate(plainBytes, {
        get env(){asyncTrace.push('env');return {memory,callback:nativePolicyCallback};},
        get unused(){throw new Error('undeclared asynchronous import getter');},
      });
      check(asyncTrace.length === 0, 'async compile does not eagerly read imports');
      const asynchronous = await pending;
      check(asyncTrace.join(',') === 'env,env', 'async imports read in declaration order');
      check(asynchronous.instance.exports.roundtrip(0) === expectedPolicyValue+10, 'async native function import uses fixture policy');
    `,
  },
  {
    name: 'fixed Wasm buffers refuse transfer and detach only on native growth',
    source: `
      const memory = new WebAssembly.Memory({initial:1,maximum:3});
      const buffer = memory.buffer;
      const bytes = new Uint8Array(buffer);
      bytes[0]=71;
      for(const key of ['transfer','transferToFixedLength']) {
        const method=ArrayBuffer.prototype[key];
        if(typeof method!=='function')continue;
        let rejected=false;
        try {method.call(buffer);} catch(error){rejected=error instanceof TypeError;}
        check(rejected, 'Wasm buffer rejects '+key);
        check(buffer.byteLength===65536 && bytes[0]===71,'failed '+key+' leaves bytes attached');
      }
      let cloneRejected=false;
      try {transferNative(buffer);} catch(error){cloneRejected=error.name==='TypeError';}
      check(cloneRejected,'native structured clone rejects Wasm transfer');
      check(buffer.byteLength===65536 && bytes[0]===71,'failed native transfer does not detach guest');
      check(memory.grow(0)===1,'zero growth returns previous pages');
      check(buffer.byteLength===0 && bytes.length===0,'zero growth detaches old fixed buffer');
      check(memory.buffer!==buffer && new Uint8Array(memory.buffer)[0]===71,'zero growth replaces buffer and preserves bytes');
      if(typeof memory.toResizableBuffer==='function') {
        const resizable=memory.toResizableBuffer();
        const view=new Uint8Array(resizable);
        view[0]=79;
        check(resizable.resizable===true,'resizable Wasm buffer remains resizable');
        memory.grow(1);
        check(resizable.byteLength===131072 && view.length===131072,'resizable Wasm views track native growth');
        check(view[0]===79,'resizable Wasm growth preserves writes');
      }
    `,
  },
  {
    name: 'async compile and instantiate retain import callbacks',
    source: `
      const memory = new WebAssembly.Memory({initial: 1, maximum: 3});
      const compiled = await WebAssembly.compile(plainBytes);
      check(compiled instanceof WebAssembly.Module, 'compile module brand');
      const result = await WebAssembly.instantiate(plainBytes, {
        env: {memory, callback(value) { return value; }},
      });
      check(result.instance instanceof WebAssembly.Instance, 'instantiate result brand');
      check(result.module instanceof WebAssembly.Module, 'instantiate module brand');
      check(result.instance.exports.roundtrip(2) === 12, 'async imported callback');
      check(WebAssembly.validate(plainBytes), 'validate native buffer source');
    `,
  },
];

const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  console.log('Wasm check: ' + message);
};
const workers = new Set<Worker>();
const workerRoundtrip = (memory: WebAssembly.Memory, module: WebAssembly.Module) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(
      new Blob(
        [
          `
      onmessage = ({data}) => {
        const instance = new WebAssembly.Instance(data.module, {env:{memory:data.memory}});
        const before = instance.exports.add(2);
        postMessage({before,after:instance.exports.read(),
          clonedMemory:data.memory instanceof WebAssembly.Memory,
          clonedModule:data.module instanceof WebAssembly.Module});
      };
    `,
        ],
        { type: 'text/javascript' },
      ),
    );
    const worker = new Worker(url);
    workers.add(worker);
    URL.revokeObjectURL(url);
    worker.onmessage = (event) => {
      workers.delete(worker);
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (event) => reject(new Error(event.message));
    worker.postMessage({ memory, module });
  });

const nativePolicyCallback = (_value: number) => 1;
const transferNative = (value: ArrayBuffer) =>
  structuredClone(value, { transfer: [value] });
const nativeKind = (value: unknown) => Object.prototype.toString.call(value).slice(8, -1);
const nativeBufferRoundtrip = (bytes: Uint8Array, callback: () => void) => {
  const before = bytes[0];
  bytes[1] = 7;
  callback();
  const written = bytes[2];
  bytes[3] = 8;
  return { before, written };
};
const host: GuestHost = {
  get: (target, key) => Reflect.get(target, key),
  set: (target, key, value) => Reflect.set(target, key, value),
  settable: (target) => ArrayBuffer.isView(target),
  call: (target, receiver, args) =>
    target === nativePolicyCallback ? 2 : Reflect.apply(target, receiver, args),
  construct: (target, args) => Reflect.construct(target, args),
  ownKeys: (target) => Reflect.ownKeys(target),
  descriptor: (target, key) => Object.getOwnPropertyDescriptor(target, key),
  prototype: (target) => Object.getPrototypeOf(target),
};

const runCases = async (evaluate: (source: string) => unknown): Promise<CaseResult[]> => {
  const results: CaseResult[] = [];
  for (const test of cases) {
    console.log('Wasm fixture: ' + test.name);
    try {
      await evaluate(`(async () => {${test.source}})()`);
      results.push({ name: test.name, passed: true });
    } catch (error) {
      results.push({ name: test.name, passed: false, error: String(error) });
    }
  }
  return results;
};

try {
  const plainBytes = new Uint8Array(await (await fetch('/memory.wasm')).arrayBuffer());
  const sharedBytes = new Uint8Array(await (await fetch('/shared.wasm')).arrayBuffer());
  const mixedBytes = new Uint8Array(
    await (await fetch('/mixed-import.wasm')).arrayBuffer(),
  );
  const native = await runCases((source) =>
    new Function(
      'plainBytes',
      'sharedBytes',
      'workerRoundtrip',
      'check',
      'nativePolicyCallback',
      'expectedPolicyValue',
      'mixedBytes',
      'nativeKind',
      'transferNative',
      'nativeBufferRoundtrip',
      `return ${source}`,
    )(
      plainBytes,
      sharedBytes,
      workerRoundtrip,
      check,
      nativePolicyCallback,
      1,
      mixedBytes,
      nativeKind,
      transferNative,
      nativeBufferRoundtrip,
    ),
  );
  let outcome: NonNullable<typeof globalThis.guestWasmResults>;
  console.log('Wasm fixture: creating guest engine');
  const engine = await GuestEngine.create({ host, wasmURL: '/quickjs.wasm' });
  try {
    console.log('Wasm fixture: registering guest fixtures');
    engine.set('plainBytes', plainBytes);
    engine.set('sharedBytes', sharedBytes);
    engine.set('check', check);
    engine.set('nativePolicyCallback', nativePolicyCallback);
    engine.set('expectedPolicyValue', 2);
    engine.set('mixedBytes', mixedBytes);
    engine.set('nativeKind', nativeKind);
    engine.set('nativeBufferRoundtrip', nativeBufferRoundtrip);
    engine.set('transferNative', (buffer: ArrayBuffer) => {
      const clone = transferNative(buffer);
      engine.detachTransferred([buffer]);
      return clone;
    });
    engine.set('workerRoundtrip', workerRoundtrip);
    engine.set('TextDecoder', TextDecoder);
    const guest = await runCases((source) => engine.evaluate(source, 'wasm:fixture'));
    outcome = { isolated: crossOriginIsolated, native, guest };
  } finally {
    console.log('Wasm fixture: disposing core engine');
    engine.dispose();
  }
  const foreign: string[] = [];
  const tableStartBytes = new Uint8Array(
    await (await fetch('/table-start.wasm')).arrayBuffer(),
  );
  for (const variant of [
    'raw export',
    'late imported memory',
    'late imported table start',
  ]) {
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 3 });
    const bytes = new Uint8Array(memory.buffer);
    const foreignEngine = await GuestEngine.create({ host, wasmURL: '/quickjs.wasm' });
    try {
      // Deliberately expose bytes before the owner learns their Wasm identity.
      foreignEngine.set('foreignBytes', bytes);
      foreignEngine.set('plainBytes', plainBytes);
      foreignEngine.set('check', check);
      if (variant === 'raw export') {
        const instance = new WebAssembly.Instance(new WebAssembly.Module(plainBytes), {
          env: { memory, callback: (value: number) => value },
        });
        foreignEngine.set('foreignRoundtrip', instance.exports.roundtrip);
        foreignEngine.evaluate(`
          foreignBytes[0] = 3;
          check(foreignRoundtrip(5) === 15, 'foreign native export return value');
          check(foreignBytes[0] === 10, 'unrecognized native Wasm memory refreshes ordinary mirror');
        `);
      } else if (variant === 'late imported memory') {
        foreignEngine.set('lateMemory', () => memory);
        foreignEngine.evaluate(`
          let memoryReads = 0;
          const instance = new WebAssembly.Instance(new WebAssembly.Module(plainBytes), {
            env: {
              get memory() { memoryReads++; return lateMemory(); },
              callback(value) {
                check(foreignBytes[0] === 10, 'late recognized memory reaches imported callback');
                foreignBytes[0] = 20;
                return value;
              },
            },
          });
          check(memoryReads === 1, 'memory provenance observes the actual import Get once');
          check(instance.exports.roundtrip(7) === 27, 'late imported memory preserves callback writes');
          check(foreignBytes[0] === 20, 'ordinary mirror retains native callback result');
        `);
      } else {
        const instance = new WebAssembly.Instance(new WebAssembly.Module(plainBytes), {
          env: { memory, callback: (value: number) => value },
        });
        const table = new WebAssembly.Table({ initial: 1, element: 'anyfunc' });
        table.set(0, instance.exports.roundtrip);
        foreignEngine.set('tableStartBytes', tableStartBytes);
        foreignEngine.set('lateTable', () => table);
        foreignEngine.evaluate(`
          foreignBytes[0] = 3;
          let tableReads = 0;
          new WebAssembly.Instance(new WebAssembly.Module(tableStartBytes), {
            env: {get table() {tableReads++; return lateTable();}},
          });
          check(tableReads === 1, 'table provenance observes the actual import Get once');
          check(foreignBytes[0] === 10, 'foreign indirect start writes refresh the ordinary mirror');
        `);
      }
      check(
        bytes[0] === (variant === 'late imported memory' ? 20 : 10),
        'foreign native bytes',
      );
      foreign.push(variant);
    } finally {
      foreignEngine.dispose();
    }
  }
  outcome.foreign = foreign;
  const transportBytes = new Uint8Array(
    await (await fetch('/transport.wasm')).arrayBuffer(),
  );
  const securitySource = `(async () => {
    if (typeof toString !== 'function' || toString.call({}) !== '[object Object]' ||
      !hasOwnProperty.call({sample: 1}, 'sample'))
      throw new Error('Standard global Object methods are unavailable');
    const module = new WebAssembly.Module(transportBytes);
    const instance = new WebAssembly.Instance(module, {env: window});
    let importedFetch = false;
    try { await instance.exports.request("/import-probe"); importedFetch = true; } catch {}
    let constructorFetch = false;
    try {
      await WebAssembly.Module.constructor('return fetch("/constructor-probe")')();
      constructorFetch = true;
    } catch {}
    return [importedFetch, constructorFetch];
  })()`;
  const control = await new Function('transportBytes', `return ${securitySource}`)(
    transportBytes,
  );
  const sourceURL = new URL('/app/index.html', location.href).href;
  const session = await createGuestWindow(
    {
      application: 'wasm-policy-' + 'a'.repeat(64),
      generation: 'wasm-fixture',
      sourceURL,
      documentBase: sourceURL,
      runtimeURL: new URL('/', location.href).href,
      applicationURL: new URL('/installed/wasm/', location.href).href,
      engineWasm: await (await fetch('/quickjs.wasm')).arrayBuffer(),
      workerBootstrap: {
        dedicated: new ArrayBuffer(0),
        shared: new ArrayBuffer(0),
        worklet: new ArrayBuffer(0),
      },
      resources: [],
    },
    window,
  );
  try {
    session.engine.set('transportBytes', transportBytes);
    const guest = (await session.engine.evaluate(
      securitySource,
      'wasm:policy',
    )) as boolean[];
    outcome.policy = { control, guest };
  } finally {
    session.close();
  }
  globalThis.guestWasmResults = outcome;
} catch (error) {
  globalThis.guestWasmResults = {
    isolated: crossOriginIsolated,
    native: [],
    guest: [],
    error: String(error),
  };
} finally {
  for (const worker of workers) worker.terminate();
}
