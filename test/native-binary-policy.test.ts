import assert from 'node:assert/strict';
import test from 'node:test';
import { NativeBinary } from '../src/guest/native-binary.ts';
import { NativePolicyError } from '../src/guest/native-policy.ts';

const typed = Object.getPrototypeOf(Uint8Array.prototype);
function view(binary: NativeBinary) {
  const buffer = new ArrayBuffer(16);
  binary.retainBuffer(buffer);
  return new Uint8Array(buffer, 0, 4);
}
function invoke(
  binary: NativeBinary,
  receiver: object,
  key: PropertyKey,
  ...args: unknown[]
) {
  const fn = binary.get(receiver, key);
  assert.equal(typeof fn, 'function');
  return binary.call(fn as Function, receiver, args);
}

test('reviewed binary bindings preserve native identity, geometry and mixed local set', () => {
  const binary = new NativeBinary(),
    target = view(binary);
  assert.equal(binary.get(target, 'copyWithin'), typed.copyWithin);
  assert.equal(binary.get(binary.bindings, 'invoke'), binary.bindings.invoke);
  assert.equal(binary.get(target, 'length'), 4);
  assert.equal(binary.get(target, 'buffer'), target.buffer);
  binary.bindings.invoke('TypedArray', 'set', 'value', target, [[1, 2, 3, 4]]);
  assert.equal(invoke(binary, target, 'copyWithin', 0, 1, 3), target);
  assert.deepEqual([...target], [2, 3, 3, 4]);
  const local = new Uint8Array(4);
  assert.equal(binary.view(local), false);
  binary.bindings.invoke('TypedArray', 'set', 'value', local, [target]);
  assert.deepEqual([...local], [...target]);
  assert.equal(
    binary.view(local),
    false,
    'Temporary branded admission does not retain local mirror ownership',
  );
  assert.equal(
    binary.copyWithinBuffer(binary.bindings.invoke, undefined, [
      'TypedArray',
      'copyWithin',
      'value',
      target,
      [0, 1],
    ]),
    target.buffer,
  );
});

test('unknown getters and changed native callable descriptors are rejected before access', () => {
  let calls = 0;
  Object.defineProperty(typed, 'unreviewedBinaryFixture', {
    configurable: true,
    get() {
      calls++;
      return 5;
    },
  });
  const copy = Object.getOwnPropertyDescriptor(typed, 'copyWithin')!;
  try {
    const binary = new NativeBinary(),
      target = view(binary);
    assert.throws(() => binary.get(target, 'unreviewedBinaryFixture'), NativePolicyError);
    assert.equal(calls, 0);
    assert.equal(Reflect.get(target, 'unreviewedBinaryFixture'), 5);
    assert.equal(calls, 1);
    Object.defineProperty(target, 'length', {
      get() {
        calls++;
        return 9;
      },
    });
    assert.throws(() => binary.get(target, 'length'), NativePolicyError);
    assert.equal(calls, 1);
    Object.defineProperty(typed, 'copyWithin', {
      configurable: true,
      get() {
        calls++;
        return copy.value;
      },
    });
    assert.throws(() => binary.get(view(binary), 'copyWithin'), NativePolicyError);
    assert.equal(calls, 1);
    assert.throws(
      () => binary.call(function copyWithin() {}, target, []),
      NativePolicyError,
    );
  } finally {
    Reflect.deleteProperty(typed, 'unreviewedBinaryFixture');
    Object.defineProperty(typed, 'copyWithin', copy);
  }
});

test('reviewed iteration owns produced iterators without claiming shared iterator declarations', () => {
  const binary = new NativeBinary(),
    target = view(binary);
  target.set([1, 2, 3, 4]);
  assert.equal(binary.get(target, 'values'), binary.get(target, Symbol.iterator));
  const iterator = invoke(binary, target, 'values') as object;
  assert.equal(binary.owns(iterator), true);
  const rawPrototype = Object.getPrototypeOf(iterator);
  assert.equal(binary.owns(rawPrototype), false);
  assert.equal(binary.owns(rawPrototype.next), false);
  assert.equal(invoke(binary, iterator, Symbol.iterator), iterator);
  const values = [];
  for (let i = 0; i < 5; i++) values.push(invoke(binary, iterator, 'next'));
  assert.deepEqual(values, [
    { value: 1, done: false },
    { value: 2, done: false },
    { value: 3, done: false },
    { value: 4, done: false },
    { value: undefined, done: true },
  ]);
  const next = binary.get(iterator, 'next') as Function;
  assert.throws(() => binary.call(next, [8].values(), []), NativePolicyError);
  let reads = 0;
  Object.defineProperty(rawPrototype, 'unreviewedIteratorFixture', {
    configurable: true,
    get() {
      reads++;
      return 'unknown';
    },
  });
  try {
    assert.throws(
      () => binary.get(iterator, 'unreviewedIteratorFixture'),
      NativePolicyError,
    );
    assert.equal(reads, 0);
  } finally {
    Reflect.deleteProperty(rawPrototype, 'unreviewedIteratorFixture');
  }
});

test('private constructor hooks retain inherited native operations and species behavior', () => {
  const binary = new NativeBinary(),
    target = view(binary);
  let constructorReads = 0,
    speciesReads = 0;
  class Derived extends Uint8Array {}
  binary.bindConstructor(
    target,
    () => {
      constructorReads++;
      return Derived;
    },
    () => {
      speciesReads++;
      return Derived;
    },
  );
  assert.equal(binary.get(target, 'length'), 4);
  assert.equal(binary.descriptor(target, 'constructor'), undefined);
  assert.equal(binary.ownKeys(target).includes('constructor'), false);
  assert.equal(binary.delete(target, 'constructor'), true);
  const result = invoke(binary, target, 'slice', 0, 2);
  assert(result instanceof Derived);
  assert.equal(constructorReads, 1);
  assert.equal(speciesReads, 1);
  assert.equal(binary.view(result), true);
});

test('canonical typed indices and DataView numeric properties preserve distinct semantics', () => {
  const binary = new NativeBinary(),
    target = view(binary);
  assert.equal(binary.define(target, '0', { value: 7 }), true);
  assert.equal(binary.get(target, '0'), 7);
  assert.equal(binary.define(target, '99', { value: 1 }), false);
  assert.equal(binary.get(target, '-0'), undefined);
  assert.equal(binary.delete(target, '0'), false);
  assert.equal(binary.define(target, 'notAnIndex', { value: 1 }), false);
  const data = new DataView(target.buffer);
  let reads = 0;
  const getter = () => {
    reads++;
    return 19;
  };
  assert.equal(
    binary.define(data, '0', { get: getter, configurable: true, enumerable: true }),
    true,
  );
  assert.equal(binary.descriptor(data, '0')?.get, getter);
  assert.equal(reads, 0, 'Descriptor reflection does not invoke a DataView accessor');
  assert.equal(binary.get(data, '0'), 19);
  assert.equal(reads, 1);
  assert.equal(binary.delete(data, '0'), true);
  assert.equal(binary.get(data, '0'), undefined);
  assert.equal(binary.set(data, '1', 21), true);
  assert.equal(binary.get(data, '1'), 21);
  assert.deepEqual(binary.ownKeys(data), ['1']);
  Object.defineProperty(data, '2', {
    get() {
      reads++;
      return 'unknown';
    },
  });
  assert.throws(() => binary.get(data, '2'), NativePolicyError);
  assert.equal(
    reads,
    1,
    'Unregistered numeric accessors do not acquire expando authority',
  );
});

test('native constructors, generic static receivers, reducers and atomics retain compatibility', () => {
  const binary = new NativeBinary();
  const native = binary.bindings.construct('Uint16Array', [[3, 4]]) as Uint16Array;
  assert(native instanceof Uint16Array);
  class Derived extends Uint16Array {}
  const from = binary.bindings.staticInvoke('Uint16Array', 'from', Derived, [
    [5, 6],
  ]) as Uint16Array;
  assert(from instanceof Derived);
  const marker = () => 3;
  assert.equal(
    binary.bindings.invoke('TypedArray', 'reduce', 'value', native, [
      () => marker,
      undefined,
    ]),
    marker,
  );
  assert.throws(
    () => binary.bindings.invoke('TypedArray', 'unreviewed', 'value', native, []),
    /unavailable/,
  );
  assert.throws(
    () => binary.bindings.staticInvoke('Uint16Array', 'unreviewed', Derived, []),
    /unavailable/,
  );
  const shared = binary.bindings.construct('SharedArrayBuffer', [8]) as SharedArrayBuffer;
  const words = new Int32Array(shared);
  binary.bindings.atomic('store', [words, 0, 17]);
  assert.equal(binary.bindings.atomic('load', [words, 0]), 17);
  assert.throws(() => binary.bindings.atomic('unreviewed', []), /unavailable/);
});

test('immutable brand memoization retains live geometry and ignores foreign prototype getters', () => {
  const binary = new NativeBinary();
  const buffer: ArrayBuffer = Reflect.construct(ArrayBuffer, [8, { maxByteLength: 32 }]);
  binary.retainBuffer(buffer);
  const target = new Uint8Array(buffer);
  assert.equal(binary.get(target, 'length'), 8);
  binary.bindings.invoke('ArrayBuffer', 'resize', 'value', buffer, [16]);
  assert.equal(binary.get(buffer, 'byteLength'), 16);
  assert.equal(binary.get(target, 'length'), 16);
  let reads = 0;
  Object.setPrototypeOf(
    target,
    Object.create(null, {
      length: {
        get() {
          reads++;
          return 999;
        },
      },
    }),
  );
  assert.equal(binary.get(target, 'length'), 16);
  assert.equal(reads, 0);
  assert.equal(binary.prototype(target), Uint8Array.prototype);
  structuredClone(buffer, { transfer: [buffer] });
  assert.equal(binary.get(buffer, 'byteLength'), 0);
  assert.equal(binary.get(target, 'length'), 0);
  const shared: SharedArrayBuffer = Reflect.construct(SharedArrayBuffer, [
    8,
    { maxByteLength: 32 },
  ]);
  const sharedView = new Uint8Array(shared);
  assert.equal(binary.get(sharedView, 'length'), 8);
  binary.bindings.invoke('SharedArrayBuffer', 'grow', 'value', shared, [16]);
  assert.equal(binary.get(sharedView, 'length'), 16);
});

test('own primitive data shadows remain live without authorizing own getters or functions', () => {
  const binary = new NativeBinary(),
    target = view(binary);
  Object.defineProperty(target, 'length', { value: 19, configurable: true });
  assert.equal(binary.get(target, 'length'), 19);
  assert.equal(binary.descriptor(target, 'length')?.value, 19);
  assert(binary.ownKeys(target).includes('length'));
  structuredClone(target.buffer, { transfer: [target.buffer] });
  assert.equal(binary.get(target, 'length'), 19);
  assert.equal(binary.get(target, '0'), undefined);
  Object.defineProperty(target, 'function', { value: () => 1, configurable: true });
  assert.throws(() => binary.get(target, 'function'), NativePolicyError);
});

test('constructor metadata snapshots avoid late getters and unreviewed statics fail before access', () => {
  const binary = new NativeBinary();
  const length = Object.getOwnPropertyDescriptor(ArrayBuffer, 'length')!;
  let reads = 0;
  try {
    Object.defineProperty(ArrayBuffer, 'length', {
      configurable: true,
      get() {
        reads++;
        return 99;
      },
    });
    assert.equal(
      binary.bindings.descriptions().find(({ name }) => name === 'ArrayBuffer')?.length,
      length.value,
    );
    assert.equal(reads, 0);
  } finally {
    Object.defineProperty(ArrayBuffer, 'length', length);
  }
  Object.defineProperty(Uint16Array, 'from', {
    configurable: true,
    get() {
      reads++;
      return () => {};
    },
  });
  try {
    assert.throws(() => new NativeBinary(), NativePolicyError);
    assert.equal(reads, 0);
  } finally {
    Reflect.deleteProperty(Uint16Array, 'from');
  }
});
