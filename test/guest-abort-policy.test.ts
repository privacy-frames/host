import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserPolicy } from '../src/guest/browser-policy.ts';
import { NativePolicyError } from '../src/guest/native-policy.ts';

function fixture() {
  let live = true;
  const callbacks = new WeakSet<object>();
  const cleanups: (() => void)[] = [];
  const policy = createBrowserPolicy({
    global: globalThis,
    isGuestValue: (value) => live && callbacks.has(value),
    recognizesCallable: (value): value is Function =>
      live && typeof value === 'function' && callbacks.has(value),
    call: (callback, receiver, args) => Reflect.apply(callback, receiver, args),
    property: (value, key) => Reflect.get(value, key),
    isTargetReceiver: () => false,
    addCleanup: (cleanup) => cleanups.push(cleanup),
    dispatch: (target, receiver, args) => Reflect.apply(target, receiver, args),
    isWindowMessage: () => false,
  });
  const invoke = (receiver: object, key: PropertyKey, args: unknown[] = []) => {
    const fn = policy.host.get(receiver, key);
    assert.equal(typeof fn, 'function');
    return policy.host.call(fn as Function, receiver, args);
  };
  const guest = <T extends Function>(fn: T) => {
    callbacks.add(fn);
    return fn;
  };
  const controller = () => policy.host.construct(AbortController, []);
  const signal = (controller: object) => policy.host.get(controller, 'signal') as object;
  return {
    policy,
    invoke,
    guest,
    controller,
    signal,
    close() {
      live = false;
      for (const cleanup of cleanups) cleanup();
    },
  };
}

test('abort constructors, native state and delegated reason/throw identity', () => {
  const f = fixture(),
    c = f.controller(),
    signal = f.signal(c);
  assert(f.policy.host.owns!(signal));
  assert.equal(f.policy.host.prototype(signal), AbortSignal.prototype);
  assert.equal(f.policy.host.prototype(AbortSignal.prototype), EventTarget.prototype);
  assert.equal(f.policy.host.get(signal, 'aborted'), false);
  assert.throws(() => f.policy.host.construct(AbortSignal, []), TypeError);
  assert.throws(() => f.policy.host.call(AbortController, undefined, []), TypeError);
  const reason = f.guest(() => 42);
  f.invoke(c, 'abort', [reason]);
  assert.equal(f.policy.host.get(signal, 'reason'), reason);
  assert.throws(
    () => f.invoke(signal, 'throwIfAborted'),
    (value) => value === reason,
  );
  f.invoke(c, 'abort', ['replacement']);
  assert.equal(f.policy.host.get(signal, 'reason'), reason);
});

test('abort events preserve native synchronous ordering, handler identity and cleanup', () => {
  const f = fixture(),
    c = f.controller(),
    signal = f.signal(c);
  const order: string[] = [];
  const handler = f.guest(function (this: unknown, event: Event) {
    assert.equal(this, signal);
    assert.equal(event.type, 'abort');
    order.push('handler');
  });
  f.policy.host.set(signal, 'onabort', handler);
  assert.equal(f.policy.host.get(signal, 'onabort'), handler);
  f.invoke(signal, 'addEventListener', ['abort', f.guest(() => order.push('listener'))]);
  f.invoke(c, 'abort');
  order.push('after');
  assert.deepEqual(order, ['handler', 'listener', 'after']);
  f.policy.host.set(signal, 'onabort', 1);
  const native = new AbortController().signal;
  Reflect.set(native, 'onabort', 1);
  assert.equal(f.policy.host.get(signal, 'onabort'), native.onabort);
  assert.throws(
    () => f.policy.host.set(signal, 'onabort', () => {}),
    /recorded callback/,
  );
  f.close();
  assert.equal(f.policy.host.get(signal, 'onabort'), null);
});

test('unknown abort getters and borrowed mismatched receivers fail before execution', () => {
  const f = fixture(),
    c = f.controller(),
    signal = f.signal(c);
  let reads = 0;
  Object.defineProperty(AbortSignal.prototype, 'unreviewedAbortFixture', {
    configurable: true,
    get() {
      reads++;
      return 1;
    },
  });
  try {
    assert.equal(Reflect.get(signal, 'unreviewedAbortFixture'), 1);
    assert.throws(
      () => f.policy.host.get(signal, 'unreviewedAbortFixture'),
      NativePolicyError,
    );
    assert.equal(reads, 1);
    assert.throws(
      () => f.policy.host.descriptor(AbortSignal.prototype, 'unreviewedAbortFixture'),
      NativePolicyError,
    );
    const get = f.policy.host.descriptor(AbortSignal.prototype, 'aborted')!.get!;
    assert.throws(() => f.policy.host.call(get, c, []), NativePolicyError);
  } finally {
    Reflect.deleteProperty(AbortSignal.prototype, 'unreviewedAbortFixture');
  }
});

test('static abort/any use exact native algorithms, extracted calls and one sequence conversion', () => {
  const f = fixture();
  const native = AbortSignal.abort.call(undefined, 'reason');
  const fn = f.policy.host.get(AbortSignal, 'abort') as Function;
  const signal = f.policy.host.call(fn, { arbitrary: true }, ['reason']) as object;
  assert.equal(f.policy.host.get(signal, 'reason'), native.reason);
  const c = f.controller(),
    source = f.signal(c);
  let iterators = 0,
    next = 0;
  const sequence = {
    [Symbol.iterator]() {
      iterators++;
      let done = false;
      return {
        next() {
          next++;
          if (done) return { done: true };
          done = true;
          return { done: false, value: source };
        },
      };
    },
  };
  const combined = f.invoke(AbortSignal, 'any', [sequence]) as object;
  assert.equal(iterators, 1);
  assert.equal(next, 2);
  const reason = { marker: 1 };
  f.invoke(c, 'abort', [reason]);
  assert.equal(f.policy.host.get(combined, 'reason'), reason);
  assert.equal(f.policy.host.get(combined, 'aborted'), true);
  assert.equal(
    f.policy.host.owns!(new Request('https://local.invalid/').signal),
    false,
    'Unreviewed Request producer is not implicitly enrolled',
  );
});

test('native timeout produces owned signals and late deliveries cannot enter closed guest', async () => {
  const f = fixture();
  const signal = f.invoke(AbortSignal, 'timeout', [5]) as object;
  let deliveries = 0;
  f.policy.host.set(
    signal,
    'onabort',
    f.guest(() => deliveries++),
  );
  f.invoke(signal, 'addEventListener', ['abort', f.guest(() => deliveries++)]);
  f.close();
  await new Promise((done) => setTimeout(done, 25));
  assert.equal(f.policy.host.get(signal, 'aborted'), true);
  assert.equal(deliveries, 0);
});

test('abort callable shapes and reflected getter shapes retain exact native metadata', () => {
  const f = fixture(),
    controller = f.controller(),
    signal = f.signal(controller);
  for (const [receiver, nativeOwner, key] of [
    [controller, AbortController.prototype, 'abort'],
    [signal, AbortSignal.prototype, 'throwIfAborted'],
    [AbortSignal, AbortSignal, 'abort'],
    [AbortSignal, AbortSignal, 'timeout'],
    [AbortSignal, AbortSignal, 'any'],
  ] as const) {
    const method = f.policy.host.get(receiver, key);
    assert.equal(typeof method, 'function');
    const native = Reflect.get(nativeOwner, key) as Function;
    assert.equal(f.policy.host.get(method as Function, 'name'), native.name);
    assert.equal(f.policy.host.get(method as Function, 'length'), native.length);
    assert.equal(
      f.policy.host.descriptor(method as Function, 'name')?.value,
      native.name,
    );
    assert.throws(
      () => f.policy.host.construct(method as Function, []),
      NativePolicyError,
    );
  }
  const getter = f.policy.host.descriptor(AbortSignal.prototype, 'aborted')!.get!;
  const nativeGetter = Object.getOwnPropertyDescriptor(
    AbortSignal.prototype,
    'aborted',
  )!.get!;
  assert.equal(f.policy.host.get(getter, 'name'), nativeGetter.name);
  assert.equal(f.policy.host.get(getter, 'length'), nativeGetter.length);
  assert.equal(f.policy.host.call(getter, signal, []), false);
  assert.equal(f.policy.host.get(AbortSignal, 'prototype'), AbortSignal.prototype);
});
