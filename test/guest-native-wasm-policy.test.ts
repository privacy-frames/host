import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createNativeWasm } from '../src/guest/native-wasm.ts';
import { NativePolicyError } from '../src/guest/native-policy.ts';
const bytes = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 127, 3, 2, 1, 0, 7, 5, 1, 1, 102, 0, 0,
  10, 6, 1, 4, 0, 65, 7, 11,
]);
function fixture() {
  const buffers: ArrayBufferLike[] = [];
  const imports: unknown[] = [];
  const runs: boolean[] = [];
  const domain = createNativeWasm({
    retainBuffer: (buffer) => buffers.push(buffer),
    runWasm(action, deferred) {
      runs.push(deferred);
      return action();
    },
    captureImports(value, descriptors) {
      imports.push({ value, descriptors });
      return value && typeof value === 'object' ? value : {};
    },
  });
  const constructor = (key: string) => domain.get(domain.namespace, key) as Function;
  const invoke = (receiver: object, key: PropertyKey, ...args: unknown[]) =>
    domain.call(domain.get(receiver, key) as Function, receiver, args);
  return { domain, buffers, imports, runs, constructor, invoke };
}
test('native constructors, exports, funcref tables/globals and retained buffers preserve identity', () => {
  const { domain, buffers, runs, constructor, invoke } = fixture();
  const module = domain.construct(constructor('Module'), [bytes]);
  const instance = domain.construct(constructor('Instance'), [module, {}]);
  const exports = domain.get(instance, 'exports') as object;
  const fn = domain.get(exports, 'f') as Function;
  assert.equal(domain.call(fn, undefined, []), 7);
  assert.equal(
    fn,
    (instance as WebAssembly.Instance).exports.f,
    'Actual native funcref identity',
  );
  const table = domain.construct(constructor('Table'), [
    { element: 'anyfunc', initial: 1 },
  ]);
  invoke(table, 'set', 0, fn);
  assert.equal(invoke(table, 'get', 0), fn);
  const global = domain.construct(constructor('Global'), [
    { value: 'anyfunc', mutable: true },
    fn,
  ]);
  assert.equal(domain.get(global, 'value'), fn);
  assert(domain.set(global, 'value', null));
  assert.equal(invoke(global, 'valueOf'), null);
  const memory = domain.construct(constructor('Memory'), [{ initial: 1, maximum: 2 }]);
  const before = domain.get(memory, 'buffer');
  assert.equal(before, (memory as WebAssembly.Memory).buffer);
  assert.equal(invoke(memory, 'grow', 1), 1);
  assert.equal(domain.get(memory, 'buffer'), (memory as WebAssembly.Memory).buffer);
  assert.notEqual(before, domain.get(memory, 'buffer'));
  assert(buffers.includes((memory as WebAssembly.Memory).buffer));
  assert(runs.every((value) => value === true));
});
test('native static wrappers publish import decoder identity, while brand validation precedes capture', async () => {
  const { domain, imports, constructor, invoke } = fixture();
  const instantiate = domain.get(domain.namespace, 'instantiate') as Function;
  assert.equal(domain.importsArgument(instantiate), 1);
  assert.equal(domain.importsArgument(constructor('Instance')), 1);
  const module = domain.construct(constructor('Module'), [bytes]);
  const statics = domain.get(constructor('Module'), 'imports') as Function;
  assert.deepEqual(domain.call(statics, undefined, [module]), []);
  const instance = await domain.call(instantiate, undefined, [module, { env: {} }]);
  assert(instance instanceof WebAssembly.Instance);
  assert.equal(imports.length, 1);
  assert.throws(() => domain.construct(constructor('Instance'), [{}, {}]), TypeError);
  assert.equal(imports.length, 1);
  const result = await invoke(domain.namespace, 'instantiate', bytes, {});
  assert(
    result && typeof result === 'object' && 'module' in result && 'instance' in result,
  );
});
test('Wasm error constructors preserve native no-new semantics and prototype aliases', () => {
  const { domain, constructor } = fixture();
  for (const name of ['CompileError', 'LinkError', 'RuntimeError']) {
    const ctor = constructor(name);
    let reads = 0;
    const error = domain.call(ctor, undefined, [
      {
        toString() {
          reads++;
          return 'marker';
        },
      },
      { cause: 17 },
    ]);
    assert(error instanceof Error);
    assert.equal(error.message, 'marker');
    assert.equal(error.cause, 17);
    assert.equal(reads, 1);
    assert.equal(domain.get(ctor.prototype, 'constructor'), ctor);
    assert(domain.construct(ctor, ['new']) instanceof Error);
  }
  assert.throws(
    () => domain.call(constructor('Memory'), undefined, [{ initial: 1 }]),
    TypeError,
  );
});
test('externref functions retain their original owner and never gain Wasm call/construct authority', () => {
  const { domain, constructor, invoke } = fixture();
  function ForeignConstructor() {
    return 19;
  }
  const table = domain.construct(constructor('Table'), [
    { element: 'externref', initial: 1 },
  ]);
  invoke(table, 'set', 0, ForeignConstructor);
  assert.equal(invoke(table, 'get', 0), ForeignConstructor);
  assert.equal(domain.owns(ForeignConstructor), false);
  assert.throws(() => domain.call(ForeignConstructor, undefined, []), NativePolicyError);
  assert.throws(() => domain.construct(ForeignConstructor, []), NativePolicyError);
  const global = domain.construct(constructor('Global'), [
    { value: 'externref' },
    ForeignConstructor,
  ]);
  assert.equal(domain.get(global, 'value'), ForeignConstructor);
});
test('branded cross-realm values use local semantic anchors without foreign getters or has traps', () => {
  const { domain, invoke } = fixture();
  const foreign = runInNewContext(
    `({ memory: new WebAssembly.Memory({initial:1,maximum:2}), module:new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0])), table:new WebAssembly.Table({element:'externref',initial:1}) })`,
  ) as {
    memory: WebAssembly.Memory;
    module: WebAssembly.Module;
    table: WebAssembly.Table;
  };
  let getters = 0,
    traps = 0;
  const foreignPrototype = Object.getPrototypeOf(foreign.memory);
  Object.defineProperty(foreignPrototype, 'unreviewedWasmFixture', {
    get() {
      getters++;
      return 'native';
    },
  });
  assert.equal(Reflect.get(foreign.memory, 'unreviewedWasmFixture'), 'native');
  assert.equal(getters, 1);
  getters = 0;
  Object.setPrototypeOf(
    foreign.memory,
    new Proxy(foreignPrototype, {
      has(target, key) {
        traps++;
        return Reflect.has(target, key);
      },
    }),
  );
  assert(domain.owns(foreign.memory));
  assert(
    domain.get(foreign.memory, 'buffer') instanceof ArrayBuffer ||
      Object.prototype.toString.call(domain.get(foreign.memory, 'buffer')) ===
        '[object ArrayBuffer]',
  );
  assert.equal(domain.prototype(foreign.memory), WebAssembly.Memory.prototype);
  assert.equal(invoke(foreign.memory, 'grow', 1), 1);
  assert.equal(domain.get(foreign.memory, 'unreviewedWasmFixture'), undefined);
  assert.equal(getters, 0);
  assert.equal(traps, 0);
  assert(domain.owns(foreign.module));
  assert.equal(domain.prototype(foreign.module), WebAssembly.Module.prototype);
  assert(domain.owns(foreign.table));
  invoke(foreign.table, 'set', 0, 9);
  assert.equal(invoke(foreign.table, 'get', 0), 9);
  assert.equal(domain.prototype(foreign.table), WebAssembly.Table.prototype);
  Object.defineProperty(foreign.memory, 'buffer', {
    get() {
      getters++;
      return 'bad';
    },
  });
  assert.throws(() => domain.get(foreign.memory, 'buffer'), NativePolicyError);
  assert.equal(getters, 0);
});
test('unknown getters and descriptor replacements cannot enter the reviewed native Wasm surface', () => {
  let reads = 0;
  Object.defineProperty(WebAssembly.Memory.prototype, 'unreviewedWasmFixture', {
    configurable: true,
    get() {
      reads++;
      return 1;
    },
  });
  try {
    const { domain, constructor } = fixture();
    const memory = domain.construct(constructor('Memory'), [{ initial: 1 }]);
    assert.equal(Reflect.get(memory, 'unreviewedWasmFixture'), 1);
    reads = 0;
    assert.throws(() => domain.get(memory, 'unreviewedWasmFixture'), NativePolicyError);
    assert.equal(reads, 0);
    assert(
      !domain.ownKeys(WebAssembly.Memory.prototype).includes('unreviewedWasmFixture'),
    );
    if (!Object.hasOwn(WebAssembly.Memory.prototype, 'toFixedLengthBuffer'))
      assert.equal(domain.get(memory, 'toFixedLengthBuffer'), undefined);
  } finally {
    Reflect.deleteProperty(WebAssembly.Memory.prototype, 'unreviewedWasmFixture');
  }
});

test('optional Exception stack uses reviewed native own descriptors without losing family methods', () => {
  if (
    typeof WebAssembly.Tag !== 'function' ||
    typeof WebAssembly.Exception !== 'function'
  )
    return;
  const { domain, constructor, invoke } = fixture();
  const tag = domain.construct(constructor('Tag'), [{ parameters: [] }]);
  const exception = domain.construct(constructor('Exception'), [
    tag,
    [],
    { traceStack: true },
  ]);
  assert.equal(typeof domain.get(exception, 'stack'), 'string');
  assert.equal(invoke(exception, 'is', tag), true);
  const own = Object.getOwnPropertyDescriptor(exception, 'stack');
  if (own) {
    const reflected = domain.descriptor(exception, 'stack');
    assert(reflected);
    if (own.get) assert.equal(typeof reflected.get, 'function');
  }
});

test('Exception methods survive own stack composition while custom fields remain unreviewed', () => {
  if (
    typeof WebAssembly.Tag !== 'function' ||
    typeof WebAssembly.Exception !== 'function'
  )
    return;
  const { domain, constructor, invoke } = fixture();
  const tag = domain.construct(constructor('Tag'), [{ parameters: ['externref'] }]);
  const value = { marker: 1 };
  for (const traceStack of [false, true]) {
    const exception = domain.construct(constructor('Exception'), [
      tag,
      [value],
      { traceStack },
    ]);
    assert.equal(invoke(exception, 'is', tag), true);
    assert.equal(invoke(exception, 'getArg', tag, 0), value);
    assert.equal(domain.prototype(exception), WebAssembly.Exception.prototype);
    let reads = 0;
    const symbol = Symbol('custom');
    Object.defineProperty(exception, symbol, {
      get() {
        reads++;
        return 19;
      },
    });
    assert.equal(domain.get(exception, symbol), undefined);
    assert.equal(reads, 0);
  }
});

test('repeated Exception traceStack producers share adapters while retaining exact receivers', () => {
  if (
    typeof WebAssembly.Tag !== 'function' ||
    typeof WebAssembly.Exception !== 'function'
  )
    return;
  const { domain, constructor, invoke } = fixture();
  const nativeTag = new WebAssembly.Tag({ parameters: ['externref'] });
  const tag = domain.construct(constructor('Tag'), [{ parameters: ['externref'] }]);
  const payload = { marker: 29 };
  let previousGetter: Function | undefined;
  for (const traceStack of [true, true, false, true, false, true]) {
    const native = new WebAssembly.Exception(nativeTag, [payload], { traceStack });
    const exception = domain.construct(constructor('Exception'), [
      tag,
      [payload],
      { traceStack },
    ]);
    assert.equal(typeof domain.get(exception, 'stack'), typeof native.stack);
    assert.equal(invoke(exception, 'is', tag), true);
    assert.equal(invoke(exception, 'getArg', tag, 0), payload);
    assert.equal(domain.prototype(exception), WebAssembly.Exception.prototype);
    const nativeDescriptor = Object.getOwnPropertyDescriptor(native, 'stack');
    if (nativeDescriptor?.get) {
      const getter = domain.descriptor(exception, 'stack')?.get;
      assert(getter);
      if (previousGetter) assert.equal(getter, previousGetter);
      previousGetter = getter;
      assert.equal(typeof domain.call(getter, exception, []), typeof native.stack);
      assert.throws(() => domain.call(getter, {}, []), NativePolicyError);
      assert.throws(
        () => domain.call(getter, new Error('unowned'), []),
        NativePolicyError,
      );
    }
  }
});
