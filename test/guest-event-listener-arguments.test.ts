import assert from 'node:assert/strict';
import test from 'node:test';
import { captureEventListenerArguments } from '../src/guest/event-listener-arguments.ts';

function run(tracked: boolean, mode: string) {
  const trace: string[] = [];
  const type = {
    [Symbol.toPrimitive](hint: string) {
      trace.push('type:' + hint);
      return 'fixture';
    },
  };
  const controller = new AbortController();
  let options: unknown;
  const dictionary = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of Object.entries({
    capture: true,
    once: false,
    passive: false,
    signal: controller.signal,
  }))
    Object.defineProperty(dictionary, key, {
      configurable: true,
      get() {
        assert.equal(this, dictionary);
        trace.push('get:' + key);
        return value;
      },
    });
  options = (
    {
      dictionary,
      null: null,
      false: false,
      true: true,
      zero: 0,
      one: 1,
      text: 'truthy',
      symbol: Symbol('options'),
      function: () => {},
    } as Record<string, unknown>
  )[mode];
  const target = new EventTarget();
  let delivered = 0;
  const listener = () => {
    delivered++;
  };
  const args = [type, listener, options];
  const capture = tracked ? captureEventListenerArguments(args) : undefined;
  let error: string | undefined;
  try {
    Reflect.apply(
      EventTarget.prototype.addEventListener,
      target,
      capture?.arguments ?? args,
    );
  } catch (failure) {
    error = failure instanceof Error ? failure.name : String(failure);
  }
  const afterCall = [...trace];
  if (!error) {
    target.dispatchEvent(new Event('fixture'));
    const cleanup = capture?.cleanup() ?? [
      'fixture',
      listener,
      mode === 'dictionary' ||
        (typeof options !== 'object' &&
          typeof options !== 'function' &&
          Boolean(options)),
    ];
    Reflect.apply(EventTarget.prototype.removeEventListener, target, [
      cleanup[0],
      cleanup[1],
      { capture: cleanup[2] },
    ]);
    target.dispatchEvent(new Event('fixture'));
    assert.equal(delivered, 1, 'Captured cleanup matches native listener: ' + mode);
    assert.deepEqual(trace, afterCall, 'Cleanup does not read the original type/options');
  }
  return { trace, error, delivered };
}

test('private conversion tracking preserves native getters, receivers and primitive options', () => {
  for (const mode of [
    'dictionary',
    'null',
    'false',
    'true',
    'zero',
    'one',
    'text',
    'symbol',
    'function',
  ])
    assert.deepEqual(run(true, mode), run(false, mode), mode);
});

test('a frozen options object retains proxy invariants and capture identity', () => {
  const target = new EventTarget();
  const listener = () => {};
  const options = Object.freeze({ capture: true });
  const capture = captureEventListenerArguments(['fixture', listener, options]);
  Reflect.apply(EventTarget.prototype.addEventListener, target, capture.arguments);
  assert.deepEqual(capture.cleanup(), ['fixture', listener, true]);
  Reflect.apply(EventTarget.prototype.removeEventListener, target, capture.cleanup());
});

test('native failed conversion does not install a listener or permit cleanup rereads', () => {
  const target = new EventTarget();
  let delivered = 0;
  const failure = { reason: 'capture failed' };
  const options = {
    get capture() {
      throw failure;
    },
  };
  const capture = captureEventListenerArguments([
    'fixture',
    () => {
      delivered++;
    },
    options,
  ]);
  assert.throws(
    () =>
      Reflect.apply(EventTarget.prototype.addEventListener, target, capture.arguments),
    (error) => error === failure,
  );
  target.dispatchEvent(new Event('fixture'));
  assert.equal(delivered, 0);
});

test('missing arguments and symbol types preserve native rejection before effect', () => {
  for (const args of [[], ['fixture'], [Symbol('type'), () => {}]]) {
    const target = new EventTarget();
    const capture = captureEventListenerArguments(args);
    let native: unknown, wrapped: unknown;
    try {
      Reflect.apply(EventTarget.prototype.addEventListener, target, args);
    } catch (error) {
      native = error;
    }
    try {
      Reflect.apply(EventTarget.prototype.addEventListener, target, capture.arguments);
    } catch (error) {
      wrapped = error;
    }
    assert(native instanceof TypeError);
    assert(wrapped instanceof TypeError);
  }
});
