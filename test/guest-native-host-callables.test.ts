import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeHost } from '../src/guest/native-host.ts';
import {
  NativePolicy,
  type NativeContract,
  NativePolicyError,
} from '../src/guest/native-policy.ts';
const contract = (
  id: string,
  result: NativeContract['result'] = 'data',
): NativeContract => ({ id, result, effect: 'local-data', callbacks: 'none' });
function fixture() {
  const registry = new NativePolicy();
  const owned = new WeakSet<object>();
  const published: { target: Function; contract: NativeContract }[] = [];
  const host = createNativeHost({
    registry,
    name: 'Fixture',
    owns: (value) => owned.has(value),
    admit: (value) => owned.has(value),
    result: (value) => value,
    prototype: (value) => registry.prototype(value),
    functionPrototype: Function.prototype,
    callablePublished: (target, contract) => published.push({ target, contract }),
  });
  return { registry, owned, published, host };
}
test('only an explicit native call contract permits a registered constructor without new', () => {
  const { registry, owned, host, published } = fixture();
  const ctor = WebAssembly.CompileError;
  host.registerConstructor(
    ctor,
    registry.registerConstructor(ctor, {
      contract: contract('error.new', 'reference'),
      construct: (target, args) => Reflect.construct(target, args),
    }),
  );
  const namespace = { ctor };
  registry.registerFacade(namespace, {
    name: 'Namespace',
    members: [
      {
        key: 'ctor',
        call: {
          contract: contract('error.call', 'reference'),
          receiver: 'ignored',
          call: ({ target, arguments: args }) => Reflect.apply(target, undefined, args),
        },
      },
    ],
  });
  registry.registerFacade(ctor, {
    name: 'Error constructor',
    members: [
      {
        key: 'prototype',
        read: {
          contract: contract('error.prototype', 'reference'),
          read: ({ descriptor }) => descriptor.value,
        },
      },
    ],
  });
  owned.add(namespace);
  owned.add(ctor);
  assert.throws(() => host.call(ctor, undefined, []), /require new/);
  assert.equal(host.get(namespace, 'ctor'), ctor);
  assert.equal(host.descriptor(namespace, 'ctor')?.value, ctor);
  assert.equal(host.get(ctor, 'prototype'), ctor.prototype);
  const called = host.call(ctor, undefined, ['called', { cause: 19 }]);
  assert(called instanceof ctor);
  assert.equal(called.message, 'called');
  assert.equal(called.cause, 19);
  const built = host.construct(ctor, ['constructed']);
  assert(built instanceof ctor);
  assert.equal(built.message, 'constructed');
  assert.equal(published.length, 1);
  assert.equal(published[0].target, ctor);
});
test('published wrapper identity is stable and usable for private argument-decoding metadata', () => {
  const { registry, owned, host, published } = fixture();
  const namespace = { invoke: (value: number) => value + 1 };
  registry.registerFacade(namespace, {
    name: 'Namespace',
    members: [
      {
        key: 'invoke',
        call: {
          contract: contract('invoke'),
          receiver: 'ignored',
          call: ({ target, arguments: args }) => Reflect.apply(target, undefined, args),
        },
      },
    ],
  });
  owned.add(namespace);
  host.captureCallableShape('invoke', namespace.invoke);
  const fn = host.get(namespace, 'invoke') as Function;
  assert.notEqual(fn, namespace.invoke);
  assert.equal(host.get(namespace, 'invoke'), fn);
  assert.equal(published.length, 1);
  assert.equal(published[0].target, fn);
  assert.equal(published[0].contract.id, 'invoke');
  assert.equal(host.call(fn, undefined, [3]), 4);
});
test('trusted native callable producer retains the original funcref identity', () => {
  const { registry, owned, host } = fixture();
  const module = new WebAssembly.Module(
    new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 127, 3, 2, 1, 0, 7, 5, 1, 1, 102, 0,
      0, 10, 6, 1, 4, 0, 65, 7, 11,
    ]),
  );
  const fn = new WebAssembly.Instance(module).exports.f as Function;
  const producer = { fn };
  registry.registerFacade(producer, {
    name: 'Native producer',
    members: [
      {
        key: 'fn',
        call: {
          contract: contract('funcref'),
          receiver: 'ignored',
          call: ({ target, arguments: args }) => Reflect.apply(target, undefined, args),
        },
      },
    ],
  });
  owned.add(producer);
  const result = registry.read(producer, 'fn');
  assert.equal(result.kind, 'callable');
  if (result.kind !== 'callable') assert.fail();
  host.registerCallable(fn, result.callable);
  assert.equal(host.get(producer, 'fn'), fn);
  assert.equal(host.call(fn, undefined, []), 7);
  const table = new WebAssembly.Table({ element: 'anyfunc', initial: 1 });
  table.set(0, fn);
  assert.equal(table.get(0), fn);
  assert.equal(host.get(fn, 'length'), 0);
  assert.throws(() => host.call(function f() {}, undefined, []), NativePolicyError);
  assert.throws(() => host.construct(fn, []), NativePolicyError);
});

test('exact callable publication refuses metadata accessors without executing them', () => {
  const { registry, host } = fixture();
  function fn() {
    return 1;
  }
  const producer = { fn };
  registry.registerFacade(producer, {
    name: 'Producer',
    members: [
      {
        key: 'fn',
        call: { contract: contract('metadata'), receiver: 'ignored', call: () => 1 },
      },
    ],
  });
  const result = registry.read(producer, 'fn');
  if (result.kind !== 'callable') assert.fail();
  let reads = 0;
  Object.defineProperty(fn, 'name', {
    configurable: true,
    get() {
      reads++;
      return 'unsafe';
    },
  });
  assert.throws(
    () => host.registerCallable(fn, result.callable),
    /native data descriptor/,
  );
  assert.equal(reads, 0);
  assert.equal(host.owns!(fn), false);
});
