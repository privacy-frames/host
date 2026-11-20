import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeHost } from '../src/guest/native-host.ts';
import {
  NativePolicy,
  NativePolicyError,
  type NativeContract,
} from '../src/guest/native-policy.ts';

const contract = (
  id: string,
  result: NativeContract['result'] = 'data',
): NativeContract => ({ id, result, effect: 'local-data', callbacks: 'none' });

function fixture() {
  const registry = new NativePolicy();
  const prototype = {
    get value() {
      return 11;
    },
    method(value: number) {
      return value + 1;
    },
  };
  const target = Object.create(prototype) as object;
  let unknownReads = 0;
  Object.defineProperty(prototype, 'unknown', {
    configurable: true,
    get() {
      unknownReads++;
      return 'unreviewed';
    },
  });
  const invoke = ({
    target,
    receiver,
    arguments: args,
  }: {
    target: Function;
    receiver: unknown;
    arguments: readonly unknown[];
  }) => Reflect.apply(target, receiver, args);
  registry.registerPrototype(prototype, {
    name: 'Local',
    members: [
      {
        key: 'value',
        read: {
          contract: contract('Local.value'),
          read: ({ receiver, descriptor }) =>
            Reflect.apply(descriptor.get!, receiver, []),
        },
      },
      { key: 'method', call: { contract: contract('Local.method'), call: invoke } },
    ],
  });
  registry.admitObject(target);
  const admitted = new WeakSet<object>([prototype, target]);
  const observed: string[] = [];
  const host = createNativeHost({
    name: 'Local',
    registry,
    owns: (target) => admitted.has(target),
    admit: (target) => admitted.has(target),
    result(value, contract) {
      observed.push(contract.id);
      return value;
    },
    functionPrototype: Function.prototype,
    prototype: (target) =>
      target === prototype ? Object.prototype : registry.prototype(target),
  });
  host.captureCallableShape('Local.method', prototype.method);
  host.captureCallableShape(
    'Local.value',
    Object.getOwnPropertyDescriptor(prototype, 'value')!.get!,
  );
  return {
    registry,
    host,
    target,
    prototype,
    admitted,
    observed,
    reads: () => unknownReads,
  };
}

test('codec preserves stable callable and descriptor identity without exposing native functions', () => {
  const { host, target, prototype, observed } = fixture();
  const method = host.get(target, 'method');
  assert.equal(typeof method, 'function');
  assert.notEqual(method, prototype.method);
  assert.equal(host.get(target, 'method'), method);
  assert.equal(host.descriptor(prototype, 'method')?.value, method);
  assert.equal(host.get(method as Function, 'name'), 'method');
  assert.equal(host.get(method as Function, 'length'), 1);
  assert.equal(host.prototype(method as Function), Function.prototype);
  assert.deepEqual(host.ownKeys(method as Function), ['length', 'name']);
  assert.equal(host.call(method as Function, target, [3]), 4);
  assert.equal(Reflect.apply(method as Function, target, [6]), 7);
  assert(observed.includes('Local.method'));
  assert.throws(() => host.call(prototype.method, target, [3]), NativePolicyError);
  assert.throws(() => host.construct(method as Function, []), NativePolicyError);
});

test('codec rejects unknown getters and foreign receivers before invoking them', () => {
  const { host, target, prototype, reads } = fixture();
  assert.throws(() => host.get(target, 'unknown'), NativePolicyError);
  assert.equal(reads(), 0);
  assert.equal(Reflect.get(target, 'unknown'), 'unreviewed');
  assert.equal(reads(), 1);
  const getter = host.descriptor(prototype, 'value')?.get;
  assert(getter);
  assert.equal(host.call(getter, target, []), 11);
  assert.throws(() => host.call(getter, {}, []), NativePolicyError);
  assert.throws(() => host.get({}, 'value'), NativePolicyError);
  Object.defineProperty(target, 'late', {
    get() {
      throw new Error('must not run');
    },
  });
  assert.throws(() => host.get(target, 'late'), NativePolicyError);
});

test('codec keeps wrapper shape immutable and refuses inherited callable authority', () => {
  const { host, target } = fixture();
  const method = host.get(target, 'method') as Function;
  Object.defineProperty(method, 'name', { value: 'changed outside codec' });
  assert.equal(host.get(method, 'name'), 'method');
  assert.equal(host.descriptor(method, 'name')?.value, 'method');
  assert.equal(host.set(method, 'name', 'guest'), false);
  assert.throws(() => host.get(method, 'constructor'), NativePolicyError);
  assert.equal(host.descriptor(method, 'constructor'), undefined);
  assert.equal(host.get(method, Symbol.toPrimitive), undefined);
  assert.equal(host.delete!(target, 'method'), false);
  assert.equal(host.settable!(target, 'new'), false);
});

test('codec maps only registered constructor tokens and forwards results through admission', () => {
  const { registry, host, prototype, admitted, observed } = fixture();
  function Local() {
    return Object.create(prototype) as object;
  }
  const token = registry.registerConstructor(Local, {
    contract: contract('Local.constructor', 'reference'),
    construct: (target, args) => Reflect.construct(target, args),
  });
  host.registerConstructor(Local, token);
  const holder = { constructor: Local };
  registry.registerFacade(holder, {
    name: 'Constructor holder',
    members: [
      {
        key: 'constructor',
        read: {
          contract: contract('Local.constructor.read', 'callable'),
          read: ({ descriptor }) => descriptor.value,
        },
      },
    ],
  });
  admitted.add(holder);
  assert.equal(host.get(holder, 'constructor'), Local);
  assert.equal(host.owns!(Local), true);
  assert.equal(Object.getPrototypeOf(host.construct(Local, [])), prototype);
  assert(observed.includes('Local.constructor'));
  assert.throws(() => host.call(Local, undefined, []), /require new/);
  assert.throws(() => host.registerConstructor(Local, token), /already belongs/);
  assert.throws(() => host.construct(function Local() {}, []), NativePolicyError);
});
