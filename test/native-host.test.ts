import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeHost } from '../src/guest/native-host.ts';
import {
  NativePolicy,
  NativePolicyError,
  type NativeContract,
} from '../src/guest/native-policy.ts';

test('reviewed receiver normalization precedes admission on codec and direct wrapper calls', async () => {
  const registry = new NativePolicy();
  const prototype = {
    method() {
      return this;
    },
  };
  const target = Object.create(prototype) as object;
  const contracts = new WeakSet<NativeContract>();
  const admitted: object[] = [];
  registry.registerPrototype(prototype, {
    name: 'Local',
    members: [
      {
        key: 'method',
        call: {
          contract: {
            id: 'Local.method',
            effect: 'local-data',
            result: 'data',
            callbacks: 'none',
          },
          call: ({ target, receiver, arguments: args }) =>
            Reflect.apply(target, receiver, args),
        },
      },
    ],
  });
  registry.admitObject(target);
  const host = createNativeHost({
    name: 'Local',
    registry,
    owns: (value) => value === target || value === prototype,
    admit(value) {
      admitted.push(value);
      return value === target || value === prototype;
    },
    result: (value) => value,
    prototype: (value) => registry.prototype(value),
    functionPrototype: Function.prototype,
    callablePublished: (_target, contract) => contracts.add(contract),
    normalizeReceiver: (receiver, contract) =>
      (receiver === null || receiver === undefined) && contracts.has(contract)
        ? target
        : receiver,
  });
  host.captureCallableShape('Local.method', prototype.method);
  const method = host.get(target, 'method');
  assert.equal(typeof method, 'function');
  assert(method instanceof Function);
  admitted.length = 0;
  for (const receiver of [undefined, null]) {
    assert.equal(host.call(method, receiver, []), target);
    assert.equal(Reflect.apply(method, receiver, []), target);
    assert.equal(
      await new Promise((resolve) =>
        queueMicrotask(() => resolve(Reflect.apply(method, receiver, []))),
      ),
      target,
    );
  }
  assert.deepEqual(admitted, Array(6).fill(target));
  const foreign = {};
  assert.throws(() => host.call(method, foreign, []), NativePolicyError);
  assert.throws(() => Reflect.apply(method, foreign, []), NativePolicyError);
  assert.equal(host.get(target, 'method'), method);
  assert.equal(Object.getOwnPropertyDescriptor(method, 'prototype'), undefined);
  assert.throws(() => Reflect.construct(Function, [], method), TypeError);
});
