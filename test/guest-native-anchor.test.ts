import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  NativePolicy,
  NativePolicyError,
  type NativeContract,
} from '../src/guest/native-policy.ts';
const rule = (result: NativeContract['result'] = 'data'): NativeContract => ({
  id: 'fixture',
  result,
  callbacks: 'none',
  effect: 'local-data',
});

test('semantic anchoring requires a registered brand and rejects wrong brands or changed families', () => {
  const policy = new NativePolicy();
  const unguarded = {};
  policy.registerPrototype(unguarded, { name: 'Unguarded', members: [] });
  assert.throws(() => policy.admitObject({}, unguarded), /registered native brand/);
  const getter = Object.getOwnPropertyDescriptor(
    WebAssembly.Memory.prototype,
    'buffer',
  )!.get!;
  const accepts = (value: object) => {
    try {
      Reflect.apply(getter, value, []);
      return true;
    } catch {
      return false;
    }
  };
  policy.registerPrototype(WebAssembly.Memory.prototype, {
    name: 'Memory',
    accepts,
    members: [
      {
        key: 'buffer',
        read: {
          contract: rule(),
          read: ({ receiver, descriptor }) =>
            Reflect.apply(descriptor.get!, receiver, []),
        },
      },
    ],
  });
  assert.throws(
    () => policy.admitObject({}, WebAssembly.Memory.prototype),
    NativePolicyError,
  );
  const memory = runInNewContext(
    'new WebAssembly.Memory({initial:1})',
  ) as WebAssembly.Memory;
  policy.admitObject(memory, WebAssembly.Memory.prototype);
  assert.equal(policy.prototype(memory), WebAssembly.Memory.prototype);
  assert.equal(policy.read(memory, 'buffer').kind, 'value');
  const other = {};
  policy.registerPrototype(other, { name: 'Other', accepts, members: [] });
  assert.throws(() => policy.admitObject(memory, other), /another family/);
});
test('delegated function results do not mint callable or constructor tokens', () => {
  const policy = new NativePolicy();
  function Foreign() {
    return 17;
  }
  const source = { value: Foreign };
  policy.registerFacade(source, {
    name: 'Externref producer',
    members: [
      {
        key: 'value',
        read: { contract: rule('delegated'), read: ({ descriptor }) => descriptor.value },
      },
    ],
  });
  const result = policy.read(source, 'value');
  assert.equal(result.kind, 'value');
  if (result.kind !== 'value') assert.fail();
  assert.equal(result.value, Foreign);
  const other = new NativePolicy();
  other.registerFacade(source, {
    name: 'Nondelegated producer',
    members: [
      {
        key: 'value',
        read: { contract: rule(), read: ({ descriptor }) => descriptor.value },
      },
    ],
  });
  assert.throws(() => other.read(source, 'value'), /no registered contract/);
});

test('an exact own-field facade composes only reviewed anchored lineage', () => {
  const policy = new NativePolicy();
  const prototype = {
    get reviewed() {
      return 13;
    },
    get unrelated() {
      throw new Error('must not execute');
    },
  };
  const owned = new WeakSet<object>();
  policy.registerPrototype(prototype, {
    name: 'Branded fixture',
    accepts: (value) => owned.has(value),
    members: [
      {
        key: 'reviewed',
        read: {
          contract: rule(),
          read: ({ receiver, descriptor }) =>
            Reflect.apply(descriptor.get!, receiver, []),
        },
      },
    ],
  });
  const target = Object.create(prototype) as object;
  owned.add(target);
  Object.defineProperty(target, 'field', { value: 17, configurable: true });
  policy.admitObject(target, prototype);
  policy.registerFacade(target, {
    name: 'Own native producer',
    members: [
      {
        key: 'field',
        read: { contract: rule(), read: ({ descriptor }) => descriptor.value },
      },
    ],
  });
  policy.admitObject(target, prototype);
  assert.equal(policy.prototype(target), prototype);
  const own = policy.read(target, 'field');
  assert.equal(own.kind, 'value');
  if (own.kind === 'value') assert.equal(own.value, 17);
  const inherited = policy.read(target, 'reviewed');
  assert.equal(inherited.kind, 'value');
  if (inherited.kind === 'value') assert.equal(inherited.value, 13);
  assert.throws(() => policy.read(target, 'unrelated'), NativePolicyError);
  assert.throws(
    () => policy.registerFacade(target, { name: 'Duplicate', members: [] }),
    /already registered/,
  );
});
