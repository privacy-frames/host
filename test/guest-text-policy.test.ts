import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuestTextPolicy, type GuestTextPolicy } from '../src/guest/text-policy.ts';
import { NativePolicyError } from '../src/guest/native-policy.ts';

const fixture = () => createGuestTextPolicy({ TextEncoder, TextDecoder });
function invoke(
  policy: GuestTextPolicy,
  receiver: object,
  key: string,
  args: unknown[] = [],
) {
  const method = policy.get(receiver, key);
  assert.equal(typeof method, 'function');
  return policy.call(method as Function, receiver, args);
}

test('text constructors and native codec operations preserve conversion and buffer behavior', () => {
  const policy = fixture();
  let conversions = 0;
  const decoder = policy.construct(policy.TextDecoder, [
    {
      toString() {
        conversions++;
        return 'UTF-8';
      },
    },
    { fatal: true, ignoreBOM: true },
  ]);
  assert.equal(conversions, 1);
  assert.equal(policy.get(decoder, 'encoding'), 'utf-8');
  assert.equal(policy.get(decoder, 'fatal'), true);
  assert.equal(policy.get(decoder, 'ignoreBOM'), true);
  const encoder = policy.construct(policy.TextEncoder, []);
  conversions = 0;
  const input = {
    toString() {
      conversions++;
      return 'A🐼é';
    },
  };
  const bytes = invoke(policy, encoder, 'encode', [input]);
  assert.equal(conversions, 1);
  assert(bytes instanceof Uint8Array);
  assert.deepEqual(bytes, new TextEncoder().encode('A🐼é'));
  assert.equal(
    policy.owns!(bytes),
    false,
    'Binary producer/result is not text-domain ownership',
  );
  assert.equal(policy.owns!(bytes.buffer), false);
  assert.equal(invoke(policy, decoder, 'decode', [bytes]), 'A🐼é');
  const target = new Uint8Array(6);
  const result = invoke(policy, encoder, 'encodeInto', ['A🐼é', target]);
  assert.deepEqual(result, { read: 3, written: 5 });
  assert.deepEqual(target, new Uint8Array([65, 240, 159, 144, 188, 0]));
  assert.equal(
    policy.owns!(result as object),
    false,
    'Ordinary result record is not a codec instance',
  );
  assert.throws(() => invoke(policy, encoder, 'encode', [Symbol('text')]), TypeError);
  assert.throws(
    () => policy.construct(policy.TextDecoder, ['unregistered-encoding']),
    RangeError,
  );
  assert.throws(
    () => invoke(policy, decoder, 'decode', [new Uint8Array([255])]),
    TypeError,
  );
});

test('native streaming decode retains state and resets on a final call', () => {
  const policy = fixture();
  const decoder = policy.construct(policy.TextDecoder, []);
  assert.equal(
    invoke(policy, decoder, 'decode', [new Uint8Array([0xf0, 0x9f]), { stream: true }]),
    '',
  );
  assert.equal(
    invoke(policy, decoder, 'decode', [new Uint8Array([0x90, 0xbc]), { stream: true }]),
    '🐼',
  );
  assert.equal(invoke(policy, decoder, 'decode'), '');
  assert.equal(
    invoke(policy, decoder, 'decode', [new Uint8Array([0xef, 0xbb, 0xbf, 65])]),
    'A',
  );
  let options = 0;
  invoke(policy, decoder, 'decode', [
    undefined,
    {
      get stream() {
        options++;
        return false;
      },
    },
  ]);
  assert.equal(options, 1, 'Native options conversion executes once');
});

test('codec wrappers and descriptors preserve exact identities and guest intrinsic boundaries', () => {
  const policy = fixture();
  for (const constructor of [policy.TextEncoder, policy.TextDecoder]) {
    const value = policy.construct(constructor, []);
    assert.equal(policy.get(value, 'constructor'), constructor);
    assert.equal(policy.get(constructor, 'prototype'), constructor.prototype);
    assert.equal(policy.prototype(value), constructor.prototype);
    assert.equal(policy.prototype(constructor.prototype), Object.prototype);
    assert.equal(policy.prototype(constructor), Function.prototype);
    const attribute = policy.descriptor(constructor.prototype, 'encoding');
    assert(attribute?.get);
    assert.equal(policy.call(attribute.get, value, []), 'utf-8');
    assert.throws(() => policy.call(attribute.get!, {}, []), NativePolicyError);
    const key = constructor === policy.TextEncoder ? 'encode' : 'decode';
    const method = policy.get(value, key) as Function;
    assert.equal(policy.get(value, key), method);
    assert.equal(policy.descriptor(constructor.prototype, key)?.value, method);
    assert.equal(policy.get(method, 'name'), key);
    assert.equal(policy.prototype(method), Function.prototype);
    assert.equal(policy.get(value, 'missingTextFeature'), undefined);
    assert.throws(() => policy.call(method, {}, []), NativePolicyError);
    assert.throws(() => policy.call(constructor, undefined, []), TypeError);
    assert.throws(
      () => policy.construct(function TextEncoder() {}, []),
      NativePolicyError,
    );
  }
  assert.equal(policy.owns!(new TextEncoderStream()), false);
  assert.equal(policy.owns!(new TextDecoderStream()), false);
});

test('unreviewed native getter is rejected before execution, including reflected access', () => {
  let reads = 0;
  Object.defineProperty(TextEncoder.prototype, 'unreviewedTextFixture', {
    configurable: true,
    get() {
      reads++;
      return 'native';
    },
  });
  try {
    const policy = fixture();
    const value = new TextEncoder();
    assert.equal(Reflect.get(value, 'unreviewedTextFixture'), 'native');
    assert.equal(reads, 1, 'Native positive control actually executes getter');
    reads = 0;
    assert.throws(() => policy.get(value, 'unreviewedTextFixture'), NativePolicyError);
    assert.throws(
      () => policy.descriptor(TextEncoder.prototype, 'unreviewedTextFixture'),
      NativePolicyError,
    );
    assert.equal(reads, 0);
    assert(!policy.ownKeys(TextEncoder.prototype).includes('unreviewedTextFixture'));
    const own = new TextDecoder();
    Object.defineProperty(own, 'encoding', {
      configurable: true,
      get() {
        reads++;
        return 'bad';
      },
    });
    assert.throws(() => policy.get(own, 'encoding'), NativePolicyError);
    assert.equal(reads, 0, 'Own getter cannot shadow the reviewed native brand');
  } finally {
    Reflect.deleteProperty(TextEncoder.prototype, 'unreviewedTextFixture');
  }
});

test('real text brands with foreign prototypes are claimed and refused instead of falling through', () => {
  const policy = fixture();
  for (const value of [
    new (class Foreign extends TextEncoder {})(),
    new (class Foreign extends TextDecoder {})(),
  ]) {
    assert.equal(policy.owns!(value), true);
    assert.throws(
      () => policy.get(value, 'encoding'),
      /another native realm or prototype/,
    );
  }
  let getters = 0;
  const impostor = {
    get encoding() {
      getters++;
      return 'utf-8';
    },
    get fatal() {
      getters++;
      return false;
    },
  };
  assert.equal(policy.owns!(impostor), false);
  assert.equal(policy.admit(impostor), false);
  assert.equal(getters, 0, 'Brand recognition invokes captured native getters only');
});

test('changed reviewed native descriptors and foreign callable identities cannot acquire authority', () => {
  const policy = fixture();
  const original = Object.getOwnPropertyDescriptor(TextEncoder.prototype, 'encode')!;
  let calls = 0;
  Object.defineProperty(TextEncoder.prototype, 'encode', {
    ...original,
    value() {
      calls++;
      return new Uint8Array();
    },
  });
  try {
    assert.throws(() => policy.get(new TextEncoder(), 'encode'), NativePolicyError);
    assert.equal(calls, 0);
  } finally {
    Object.defineProperty(TextEncoder.prototype, 'encode', original);
  }
  assert.throws(
    () => policy.call(function encode() {}, new TextEncoder(), []),
    NativePolicyError,
  );
});
