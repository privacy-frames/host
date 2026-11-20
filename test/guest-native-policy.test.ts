import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NativePolicy,
  NativePolicyError,
  type NativeCallOperation,
  type NativeContract,
  type NativeReadOperation,
  type NativeResult,
  type NativeWriteOperation,
} from '../src/guest/native-policy.ts';

const contract = (id: string): NativeContract => ({
  id,
  effect: 'local-data',
  result: 'data',
  callbacks: 'none',
});
const readNative = ({ receiver, descriptor }: NativeReadOperation): unknown =>
  descriptor.get ? Reflect.apply(descriptor.get, receiver, []) : descriptor.value;
const writeNative = ({
  receiver,
  key,
  value,
  descriptor,
}: NativeWriteOperation): boolean => {
  if (descriptor.set) {
    Reflect.apply(descriptor.set, receiver, [value]);
    return true;
  }
  return Reflect.set(receiver, key, value);
};
const callNative = ({
  target,
  receiver,
  arguments: args,
}: NativeCallOperation): unknown => Reflect.apply(target, receiver, args);
const data = (result: NativeResult): unknown => {
  assert.equal(result.kind, 'value');
  return result.kind === 'value' ? result.value : undefined;
};
const method = (result: NativeResult) => {
  assert.equal(result.kind, 'callable');
  assert(result.kind === 'callable');
  return result.callable;
};

function fixture() {
  let reads = 0;
  let writes = 0;
  let calls = 0;
  class Local {
    current = 2;
    get value() {
      reads++;
      return this.current;
    }
    set value(next: number) {
      writes++;
      this.current = next;
    }
    add(amount: number) {
      calls++;
      return this.current + amount;
    }
  }
  const policy = new NativePolicy();
  policy.registerPrototype(Local.prototype, {
    name: 'Local',
    accepts: (value) => value instanceof Local,
    members: [
      {
        key: 'value',
        read: { contract: contract('Local.value.get'), read: readNative },
        write: { contract: contract('Local.value.set'), write: writeNative },
      },
      { key: 'add', call: { contract: contract('Local.add'), call: callNative } },
    ],
  });
  const instance = new Local();
  policy.admitObject(instance);
  return { Local, policy, instance, counts: () => ({ reads, writes, calls }) };
}

test('unreviewed native getters never execute, including additions before and after setup', () => {
  let invoked = 0;
  const proto = {
    get early() {
      invoked++;
      return 1;
    },
  };
  const instance = Object.create(proto);
  const policy = new NativePolicy();
  policy.registerPrototype(proto, { name: 'Empty', members: [] });
  policy.admitObject(instance);
  Object.defineProperty(proto, 'late', {
    configurable: true,
    get() {
      invoked++;
      return 2;
    },
  });
  for (const key of ['early', 'late']) {
    assert.throws(() => policy.read(instance, key), NativePolicyError);
    assert.throws(() => policy.descriptor(proto, key), NativePolicyError);
  }
  assert.deepEqual(policy.keys(proto), []);
  assert.equal(invoked, 0);
  assert.equal(Reflect.get(instance, 'early'), 1);
  assert.equal(invoked, 1, 'Unrestricted control exercises the native getter');
});

test('reviewed getters, setters and methods execute after receiver admission', () => {
  const { policy, instance, counts } = fixture();
  assert.equal(data(policy.read(instance, 'value')), 2);
  assert(policy.write(instance, 'value', 7));
  assert.equal(
    data(policy.call(method(policy.read(instance, 'add')), instance, [3])),
    10,
  );
  assert.deepEqual(counts(), { reads: 1, writes: 1, calls: 1 });
  assert.throws(
    () => policy.call(method(policy.read(instance, 'add')), {}, [3]),
    /another family/,
  );
  assert.deepEqual(counts(), { reads: 1, writes: 1, calls: 1 });
});

test('borrowed accessor tokens retain their declaring contract on a derived receiver', () => {
  const { Local, policy, counts } = fixture();
  class Derived extends Local {}
  policy.registerPrototype(Derived.prototype, { name: 'Derived', members: [] });
  const child = new Derived();
  policy.admitObject(child);
  const descriptor = policy.descriptor(Local.prototype, 'value');
  assert(descriptor?.get && descriptor.set);
  assert.equal(data(policy.call(descriptor.get, child, [])), 2);
  policy.call(descriptor.set, child, [8]);
  assert.equal(data(policy.call(descriptor.get, child, [])), 8);
  assert.throws(() => policy.call(descriptor.get!, {}, []), NativePolicyError);
  assert.deepEqual(counts(), { reads: 2, writes: 1, calls: 0 });
});

test('canonical function aliases share a token; differing contracts or adapters refuse registration', () => {
  const native = function (this: { current: number }, amount: number) {
    return this.current + amount;
  };
  const proto = { alpha: native, beta: native };
  const instance = Object.assign(Object.create(proto), { current: 4 });
  const policy = new NativePolicy();
  assert.throws(
    () =>
      policy.registerPrototype(proto, {
        name: 'Aliases',
        members: [
          { key: 'alpha', call: { contract: contract('alpha'), call: callNative } },
          { key: 'beta', call: { contract: contract('beta'), call: callNative } },
        ],
      }),
    /different canonical contract/,
  );
  // Failed registration must not leave a stale callable owner behind.
  policy.registerPrototype(proto, {
    name: 'Aliases',
    members: ['alpha', 'beta'].map((key) => ({
      key,
      call: { contract: contract('Aliases.add'), call: callNative },
    })),
  });
  policy.admitObject(instance);
  const alpha = method(policy.read(instance, 'alpha'));
  const beta = method(policy.read(instance, 'beta'));
  assert.equal(alpha, beta);
  assert.equal(data(policy.call(beta, instance, [2])), 6);
  Object.defineProperty(proto, 'unreviewed', { value: native });
  assert.throws(() => policy.read(instance, 'unreviewed'), NativePolicyError);
  const other = { second: native };
  assert.throws(
    () =>
      policy.registerPrototype(other, {
        name: 'DifferentAdapter',
        members: [
          { key: 'second', call: { contract: contract('Aliases.add'), call: () => 99 } },
        ],
      }),
    /different canonical contract or adapter/,
  );
});

test('the same canonical callable supports each explicitly registered receiver family', () => {
  const shared = function (this: { current: number }) {
    return this.current;
  };
  const policy = new NativePolicy();
  const first = { read: shared };
  const second = { read: shared };
  for (const prototype of [first, second])
    policy.registerPrototype(prototype, {
      name: 'Reader',
      members: [
        { key: 'read', call: { contract: contract('Reader.read'), call: callNative } },
      ],
    });
  const left = Object.assign(Object.create(first), { current: 1 });
  const right = Object.assign(Object.create(second), { current: 2 });
  policy.admitObject(left);
  policy.admitObject(right);
  const callable = method(policy.read(left, 'read'));
  assert.equal(callable, method(policy.read(right, 'read')));
  assert.equal(data(policy.call(callable, right, [])), 2);
});

test('changed getter and callable identities are refused before their replacement runs', () => {
  const { Local, policy, instance, counts } = fixture();
  let replacement = 0;
  const callable = method(policy.read(instance, 'add'));
  Object.defineProperty(Local.prototype, 'value', {
    configurable: true,
    get() {
      replacement++;
      return 99;
    },
  });
  Object.defineProperty(Local.prototype, 'add', {
    configurable: true,
    writable: true,
    value() {
      replacement++;
      return 99;
    },
  });
  assert.throws(() => policy.read(instance, 'value'), /descriptor identity changed/);
  assert.throws(() => policy.call(callable, instance, []), /descriptor identity changed/);
  assert.equal(replacement, 0);
  assert.deepEqual(counts(), { reads: 0, writes: 0, calls: 0 });
});

test('an unreviewed shadow descriptor cannot replace a reviewed inherited operation', () => {
  const { Local, policy } = fixture();
  let reads = 0;
  const derived = Object.create(Local.prototype);
  Object.defineProperty(derived, 'value', {
    get() {
      reads++;
      return 9;
    },
  });
  policy.registerPrototype(derived, { name: 'Derived', members: [] });
  const instance = Object.create(derived);
  policy.admitObject(instance);
  assert.throws(() => policy.read(instance, 'value'), /shadows native member/);
  assert.equal(reads, 0);
});

test('facade schemas accept only the registered instance and preserve writable data changes', () => {
  const policy = new NativePolicy();
  const facade = { value: 1 };
  policy.registerFacade(facade, {
    name: 'Facade',
    members: [
      {
        key: 'value',
        read: { contract: contract('Facade.value.get'), read: readNative },
        write: { contract: contract('Facade.value.set'), write: writeNative },
      },
    ],
  });
  assert(policy.write(facade, 'value', 12));
  assert.equal(data(policy.read(facade, 'value')), 12);
  assert.equal(data(policy.descriptor(facade, 'value')!.value!), 12);
  assert.throws(() => policy.read({ value: 12 }, 'value'), /has not been admitted/);
  assert.equal(policy.prototype(facade), null);
});

test('explicit named families support reviewed data without a generic getter fallback', () => {
  let reads = 0;
  const facade: Record<string, unknown> = { public_value: 3 };
  Object.defineProperty(facade, 'public_getter', {
    get() {
      reads++;
      return 8;
    },
  });
  const policy = new NativePolicy();
  policy.registerFacade(facade, {
    name: 'Named',
    members: [],
    named: [
      {
        contract: contract('Named.publicData'),
        matches: (key) => typeof key === 'string' && key.startsWith('public_'),
        read: (receiver, key) => {
          const descriptor = Object.getOwnPropertyDescriptor(receiver, key);
          if (descriptor && !('value' in descriptor))
            throw new TypeError('Data properties only');
          return descriptor?.value;
        },
        write: (receiver, key, value) =>
          Reflect.defineProperty(receiver, key, {
            value,
            writable: true,
            configurable: true,
            enumerable: true,
          }),
      },
    ],
  });
  assert.equal(data(policy.read(facade, 'public_value')), 3);
  assert(policy.write(facade, 'public_other', 4));
  assert.equal(data(policy.read(facade, 'public_other')), 4);
  assert.throws(() => policy.read(facade, 'public_getter'), /Data properties only/);
  assert.throws(() => policy.read(facade, 'private_value'), NativePolicyError);
  assert.equal(reads, 0);
});

test('returned native functions and forged tokens never gain implicit call authority', () => {
  const native = () => 42;
  const facade = {
    get function() {
      return native;
    },
  };
  const policy = new NativePolicy();
  policy.registerFacade(facade, {
    name: 'Return',
    members: [
      {
        key: 'function',
        read: { contract: contract('Return.function'), read: readNative },
      },
    ],
  });
  assert.throws(() => policy.read(facade, 'function'), /no registered contract/);
  assert.throws(
    () =>
      policy.call({ kind: 'native-callable', contract: contract('forged') }, facade, []),
    /token belongs to no operation/,
  );
});

test('free-function contracts discard guest receivers and constructors require explicit tokens', () => {
  let observed: unknown = 'not called';
  const facade = {
    free() {
      return 3;
    },
  };
  const policy = new NativePolicy();
  policy.registerFacade(facade, {
    name: 'Globals',
    members: [
      {
        key: 'free',
        call: {
          contract: contract('Globals.free'),
          receiver: 'ignored',
          call(operation) {
            observed = operation.receiver;
            return Reflect.apply(operation.target, undefined, operation.arguments);
          },
        },
      },
    ],
  });
  const callable = method(policy.read(facade, 'free'));
  assert.equal(data(policy.call(callable, { secret: 1 }, [])), 3);
  assert.equal(observed, undefined);

  let created = 0;
  class Native {
    constructor(readonly value: number) {
      created++;
    }
  }
  const token = policy.registerConstructor(Native, {
    contract: { ...contract('Native.constructor'), result: 'reference' },
    construct: (target, args) => Reflect.construct(target, args),
  });
  const result = data(policy.construct(token, [12]));
  assert(result instanceof Native);
  assert.equal(result.value, 12);
  assert.equal(created, 1);
  assert.throws(() => new NativePolicy().construct(token, []), /no constructor/);
  const unadmitted = {
    kind: 'native-constructor',
    contract: contract('forged'),
  } as const;
  assert.throws(() => policy.construct(unadmitted, []), /no constructor/);
  assert.equal(created, 1);
});

test('constructor function identity and prototype are captured independently of names', () => {
  let count = 0;
  function Native(this: object) {
    count++;
  }
  const policy = new NativePolicy();
  const construct = (target: Function, args: readonly unknown[]): object =>
    Reflect.construct(target, args);
  const rule = {
    contract: { ...contract('Native.new'), result: 'reference' as const },
    construct,
  };
  const token = policy.registerConstructor(Native, rule);
  assert.equal(policy.registerConstructor(Native, rule), token);
  assert.throws(
    () =>
      policy.registerConstructor(Native, {
        ...rule,
        contract: { ...rule.contract, id: 'different' },
      }),
    /different canonical contract/,
  );
  Native.prototype = {};
  assert.throws(() => policy.construct(token, []), /prototype changed/);
  assert.equal(count, 0);
});
