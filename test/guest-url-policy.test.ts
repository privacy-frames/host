import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuestURLPolicy, type GuestURLPolicy } from '../src/guest/url-policy.ts';
import { NativePolicyError } from '../src/guest/native-policy.ts';

test('URL membership is cached while URL attributes and descriptor checks remain live', () => {
  const original = Object.getOwnPropertyDescriptor(URL.prototype, 'href')!;
  let probes = 0;
  Object.defineProperty(URL.prototype, 'href', {
    ...original,
    get() {
      probes++;
      return Reflect.apply(original.get!, this, []);
    },
  });
  try {
    const { policy } = fixture();
    const url = fresh(policy);
    const afterAdmission = probes;
    for (let index = 0; index < 1000; index++)
      assert.equal(typeof policy.get(url, 'toString'), 'function');
    assert.equal(probes, afterAdmission, 'Membership must not re-read native getters');
    policy.set(url, 'href', 'https://publisher.invalid/changed');
    assert.equal(policy.get(url, 'href'), 'https://publisher.invalid/changed');
    assert.equal(probes, afterAdmission + 1, 'Attribute values must not be cached');

    Object.defineProperty(URL.prototype, 'href', original);
    assert.throws(() => policy.get(url, 'href'), NativePolicyError);
  } finally {
    Object.defineProperty(URL.prototype, 'href', original);
  }
});

function fixture() {
  const created: unknown[] = [];
  const revoked: string[] = [];
  const policy = createGuestURLPolicy({
    URL,
    URLSearchParams,
    createObjectURL(value) {
      created.push(value);
      return 'blob:trusted-local';
    },
    revokeObjectURL(value) {
      revoked.push(value);
    },
  });
  return { policy, created, revoked };
}
function invoke(
  policy: GuestURLPolicy,
  receiver: object,
  key: PropertyKey,
  ...args: unknown[]
): unknown {
  const method = policy.get(receiver, key);
  assert.equal(typeof method, 'function');
  return policy.call(method as Function, receiver, args);
}
function fresh(policy: GuestURLPolicy, input = '/a?first=1&first=2#hash') {
  return policy.construct(policy.URL, [input, 'https://publisher.invalid/base/']);
}

function iteratorValues(policy: GuestURLPolicy, iterator: unknown): unknown[] {
  assert(iterator && typeof iterator === 'object');
  assert.equal(invoke(policy, iterator, Symbol.iterator), iterator);
  const values: unknown[] = [];
  for (let count = 0; count < 20; count++) {
    const result = invoke(policy, iterator, 'next');
    assert(result && typeof result === 'object' && 'done' in result && 'value' in result);
    if (result.done) return values;
    values.push(result.value);
  }
  assert.fail('Finite URLSearchParams iterator did not finish');
}

test('standalone URL constructors, attributes and serialization retain native behavior', () => {
  const { policy } = fixture();
  const url = fresh(policy);
  const native = new URL('/a?first=1&first=2#hash', 'https://publisher.invalid/base/');
  for (const key of [
    'href',
    'origin',
    'protocol',
    'username',
    'password',
    'host',
    'hostname',
    'port',
    'pathname',
    'search',
    'hash',
  ] as const)
    assert.equal(policy.get(url, key), native[key]);
  assert.equal(invoke(policy, url, 'toString'), native.toString());
  assert.equal(invoke(policy, url, 'toJSON'), native.toJSON());
  assert.equal(policy.get(url, 'constructor'), policy.URL);
  assert.equal(policy.get(policy.URL.prototype, 'constructor'), policy.URL);
  assert.equal(policy.get(policy.URL, 'prototype'), policy.URL.prototype);
  assert.equal(policy.prototype(url), policy.URL.prototype);
  assert.equal(policy.prototype(policy.URL.prototype), Object.prototype);
  assert.equal(policy.prototype(policy.URL), Function.prototype);
  assert.equal(policy.get(url, Symbol.toPrimitive), undefined);
  assert.equal(policy.get(url, 'futureMissingFeature'), undefined);
});

test('URL setters and constructors perform application conversion once', () => {
  const { policy } = fixture();
  let constructors = 0;
  const url = policy.construct(policy.URL, [
    {
      toString() {
        constructors++;
        return '/x';
      },
    },
    'https://publisher.invalid/',
  ]);
  assert.equal(constructors, 1);
  let setters = 0;
  assert(
    policy.set(url, 'pathname', {
      toString() {
        setters++;
        return '/changed';
      },
    }),
  );
  assert.equal(setters, 1);
  assert.equal(policy.get(url, 'pathname'), '/changed');
  assert.throws(() => policy.construct(policy.URL, [Symbol('url')]), TypeError);
  assert.throws(() => policy.set(url, 'href', Symbol('url')), TypeError);
});

test('linked URLSearchParams mutation is local and supports native methods and callbacks', () => {
  const { policy } = fixture();
  const url = fresh(policy);
  const params = policy.get(url, 'searchParams');
  assert(params && typeof params === 'object');
  assert(policy.owns!(params));
  assert.equal(policy.get(params, 'constructor'), policy.URLSearchParams);
  assert.equal(invoke(policy, params, 'get', 'first'), '1');
  assert.deepEqual(invoke(policy, params, 'getAll', 'first'), ['1', '2']);
  invoke(policy, params, 'set', 'next', '3');
  invoke(policy, params, 'append', 'next', '4');
  assert.equal(invoke(policy, params, 'has', 'next', '4'), true);
  invoke(policy, params, 'delete', 'next', '3');
  invoke(policy, params, 'sort');
  assert.equal(policy.get(url, 'search'), '?first=1&first=2&next=4');
  if ('size' in URLSearchParams.prototype) assert.equal(policy.get(params, 'size'), 3);
  const observed: unknown[][] = [];
  const callbackThis = {};
  invoke(
    policy,
    params,
    'forEach',
    function (this: object, value: string, key: string, source: object) {
      assert.equal(this, callbackThis);
      assert.equal(source, params);
      observed.push([key, value]);
    },
    callbackThis,
  );
  assert.deepEqual(observed, [
    ['first', '1'],
    ['first', '2'],
    ['next', '4'],
  ]);
});

test('reviewed iterator methods preserve aliases and ordinary iterator results', () => {
  const { policy } = fixture();
  const params = policy.construct(policy.URLSearchParams, ['a=1&b=2']);
  assert.equal(policy.get(params, 'entries'), policy.get(params, Symbol.iterator));
  assert.deepEqual(iteratorValues(policy, invoke(policy, params, 'entries')), [
    ['a', '1'],
    ['b', '2'],
  ]);
  assert.deepEqual(iteratorValues(policy, invoke(policy, params, 'keys')), ['a', 'b']);
  assert.deepEqual(iteratorValues(policy, invoke(policy, params, 'values')), ['1', '2']);
  const next = policy.get(invoke(policy, params, 'entries') as object, 'next');
  assert.equal(typeof next, 'function');
  assert.equal(policy.get(next as object, 'name'), 'next');
  assert.equal(policy.get(next as object, 'length'), 0);
  assert.throws(() => policy.call(next as Function, {}, []), NativePolicyError);
});

test('borrowed descriptors and methods retain their native receiver checks', () => {
  const { policy } = fixture();
  const url = fresh(policy);
  const descriptor = policy.descriptor(policy.URL.prototype, 'href');
  assert(descriptor?.get && descriptor.set);
  assert.equal(policy.call(descriptor.get, url, []), policy.get(url, 'href'));
  assert.equal(
    policy.call(descriptor.set, url, ['https://another.invalid/new']),
    undefined,
  );
  assert.equal(policy.get(url, 'href'), 'https://another.invalid/new');
  const standalone = new URL('https://external-native.invalid/');
  assert.equal(policy.call(descriptor.get, standalone, []), standalone.href);
  assert.throws(() => policy.call(descriptor.get!, {}, []), NativePolicyError);
  const params = policy.construct(policy.URLSearchParams, ['a=1']);
  const append = policy.descriptor(policy.URLSearchParams.prototype, 'append')?.value;
  assert.equal(typeof append, 'function');
  policy.call(append, params, ['b', '2']);
  assert.equal(invoke(policy, params, 'toString'), 'a=1&b=2');
  assert.throws(() => policy.call(append, url, ['b', '2']), NativePolicyError);
});

test('unreviewed native getters are denied before execution at setup, late and own shadows', () => {
  let calls = 0;
  const early = '__pf_url_early__';
  const late = '__pf_url_late__';
  Object.defineProperty(URL.prototype, early, {
    configurable: true,
    get() {
      calls++;
      return 1;
    },
  });
  try {
    const { policy } = fixture();
    const url = fresh(policy);
    Object.defineProperty(URL.prototype, late, {
      configurable: true,
      get() {
        calls++;
        return 2;
      },
    });
    for (const key of [early, late]) {
      assert.throws(() => policy.get(url, key), NativePolicyError);
      assert.throws(() => policy.descriptor(URL.prototype, key), NativePolicyError);
      assert(!policy.ownKeys(URL.prototype).includes(key));
    }
    Object.defineProperty(url, 'href', {
      configurable: true,
      get() {
        calls++;
        return 'https://unsafe.invalid/';
      },
    });
    assert.throws(() => policy.get(url, 'href'), /shadows native member/);
    assert.equal(calls, 0);
    assert.equal(Reflect.get(url, early), 1);
    assert.equal(calls, 1, 'Native control reaches the getter');
  } finally {
    Reflect.deleteProperty(URL.prototype, early);
    Reflect.deleteProperty(URL.prototype, late);
  }
});

test('static parsing is local and object URL effects use only the supplied resource adapters', () => {
  const { policy, created, revoked } = fixture();
  let conversions = 0;
  const input = {
    toString() {
      conversions++;
      return '/parsed';
    },
  };
  if (typeof URL.canParse === 'function') {
    assert.equal(
      invoke(policy, policy.URL, 'canParse', input, 'https://publisher.invalid/'),
      true,
    );
    assert.equal(conversions, 1);
  }
  conversions = 0;
  if (typeof URL.parse === 'function') {
    const result = invoke(
      policy,
      policy.URL,
      'parse',
      input,
      'https://publisher.invalid/',
    );
    assert(result && typeof result === 'object');
    assert.equal(policy.get(result, 'href'), 'https://publisher.invalid/parsed');
    assert.equal(conversions, 1);
    assert.equal(invoke(policy, policy.URL, 'parse', 'not a valid absolute URL'), null);
  }
  const blob = new Blob(['local']);
  assert.equal(invoke(policy, policy.URL, 'createObjectURL', blob), 'blob:trusted-local');
  assert.deepEqual(created, [blob]);
  conversions = 0;
  invoke(policy, policy.URL, 'revokeObjectURL', {
    toString() {
      conversions++;
      return 'blob:trusted-local';
    },
  });
  assert.equal(conversions, 1);
  assert.deepEqual(revoked, ['blob:trusted-local']);
  assert.throws(
    () => invoke(policy, policy.URL, 'revokeObjectURL', Symbol('url')),
    TypeError,
  );
  assert.throws(() => invoke(policy, policy.URL, 'createObjectURL'), TypeError);
});

test('constructor and wrapper authority cannot be acquired from names or unreviewed functions', () => {
  const { policy } = fixture();
  const url = fresh(policy);
  assert.throws(
    () => policy.construct(function URL() {}, ['https://publisher.invalid/']),
    NativePolicyError,
  );
  assert.throws(() => policy.call(() => 1, url, []), NativePolicyError);
  const method = policy.get(url, 'toString');
  assert.equal(typeof method, 'function');
  assert.equal(policy.prototype(method as object), Function.prototype);
  assert.equal(policy.descriptor(method as object, 'name')?.value, 'toString');
  assert.equal(policy.descriptor(method as object, 'secret'), undefined);
  assert.equal(policy.get(policy.URL, 'name'), 'URL');
});

test('URL iterator boundaries do not claim the shared native Iterator prototype', () => {
  const { policy } = fixture();
  const params = policy.construct(policy.URLSearchParams, ['a=1']);
  const iterator = invoke(policy, params, 'entries') as object;
  const iteratorPrototype = policy.prototype(iterator)!;
  const boundary = policy.prototype(iteratorPrototype)!;
  const nativeBase = Object.getPrototypeOf(
    Object.getPrototypeOf(new URLSearchParams().entries()),
  );
  assert.notEqual(boundary, nativeBase);
  assert.equal(policy.owns!(nativeBase), false);
  assert.equal(policy.owns!(boundary), true);
  assert.equal(invoke(policy, boundary, Symbol.iterator), boundary);
  assert.deepEqual(policy.ownKeys(boundary), [Symbol.iterator]);
  assert.equal(policy.prototype(boundary), Object.prototype);
  assert.throws(() => policy.get(nativeBase, Symbol.iterator), NativePolicyError);
});

test('optional static API absence is captured without enabling a later native addition', () => {
  const previous = Object.getOwnPropertyDescriptor(URL, 'parse');
  if (!previous?.configurable) return;
  Reflect.deleteProperty(URL, 'parse');
  let policy: GuestURLPolicy;
  try {
    policy = fixture().policy;
  } finally {
    Object.defineProperty(URL, 'parse', previous);
  }
  assert.equal(policy.get(policy.URL, 'parse'), undefined);
  assert(!policy.ownKeys(policy.URL).includes('parse'));
});

test('valid URL brands with an unreviewed prototype cannot fall through to another native host', () => {
  const { policy } = fixture();
  class Foreign extends URL {}
  const url = new Foreign('https://publisher.invalid/');
  assert.equal(policy.owns!(url), true);
  assert.throws(() => policy.get(url, 'href'), /another native realm or prototype/);
  assert.equal(
    policy.owns!({
      get href() {
        throw new Error('must not read');
      },
    }),
    false,
  );
});
