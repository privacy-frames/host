import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserPolicy } from '../src/guest/browser-policy.ts';
import { NativePolicyError } from '../src/guest/native-policy.ts';

function fixture() {
  const guests = new WeakSet<object>();
  const receivers = new WeakSet<object>();
  const nativeCallables = new WeakSet<object>();
  const cleanups: (() => void)[] = [];
  const policy = createBrowserPolicy({
    global: globalThis,
    isGuestValue: (value) => guests.has(value),
    recognizesCallable: (value): value is Function =>
      typeof value === 'function' && (guests.has(value) || nativeCallables.has(value)),
    call: (callback, receiver, args) => Reflect.apply(callback, receiver, args),
    property: (value, key) => Reflect.get(value, key),
    isTargetReceiver: (value) => receivers.has(value),
    addCleanup: (cleanup) => cleanups.push(cleanup),
    dispatch: (target, receiver, args) => Reflect.apply(target, receiver, args),
    isWindowMessage: () => false,
  });
  const target = () => policy.host.construct(EventTarget, []);
  const guest = <T extends object>(value: T): T => {
    guests.add(value);
    return value;
  };
  function invoke(receiver: object, key: PropertyKey, args: unknown[] = []) {
    const callable = policy.host.get(receiver, key);
    assert.equal(typeof callable, 'function');
    return policy.host.call(callable as Function, receiver, args);
  }
  return { policy, guests, receivers, nativeCallables, cleanups, target, guest, invoke };
}

test('selected native event constructors preserve identity, conversion and cancellation', () => {
  const { policy, invoke } = fixture();
  let typeConversions = 0;
  let optionReads = 0;
  const event = policy.host.construct(Event, [
    {
      toString: () => {
        typeConversions++;
        return 'local';
      },
    },
    {
      get cancelable() {
        optionReads++;
        return true;
      },
    },
  ]);
  assert.equal(typeConversions, 1);
  assert.equal(optionReads, 1);
  assert(policy.host.owns!(event));
  assert.equal(policy.host.prototype(event), Event.prototype);
  assert.equal(policy.host.get(event, 'type'), 'local');
  assert.equal(policy.host.get(event, 'isTrusted'), false);
  invoke(event, 'preventDefault');
  assert.equal(policy.host.get(event, 'defaultPrevented'), true);
  assert.equal(policy.host.get(event, 'constructor'), Event);
  assert.equal(policy.host.get(Event, 'prototype'), Event.prototype);
  assert.equal(policy.host.prototype(Event.prototype), Object.prototype);
  assert.throws(() => policy.host.call(Event, undefined, ['local']), TypeError);

  const detail = { value: 42 };
  const custom = policy.host.construct(CustomEvent, ['custom', { detail }]);
  const message = policy.host.construct(MessageEvent, ['message', { data: detail }]);
  assert.equal(policy.host.get(custom, 'detail'), detail);
  assert.equal(policy.host.get(message, 'data'), detail);
  assert.equal(policy.host.get(message, 'origin'), '');
  assert.deepEqual(policy.host.get(message, 'ports'), []);
  assert.equal(policy.host.prototype(custom), CustomEvent.prototype);
  assert.equal(policy.host.prototype(CustomEvent.prototype), Event.prototype);
  assert.equal(policy.host.get(Event, 'NONE'), Event.NONE);
});

test('native dispatch and cleanup retain guest callback and object-listener semantics', () => {
  const { policy, target, guest, invoke, cleanups } = fixture();
  const receiver = target();
  const seen: unknown[] = [];
  const callback = guest(function (this: unknown, event: Event) {
    seen.push(this, policy.host.get(event, 'target'), policy.host.get(event, 'type'));
    invoke(event, 'preventDefault');
  });
  invoke(receiver, 'addEventListener', ['local', callback]);
  const event = policy.host.construct(Event, ['local', { cancelable: true }]);
  assert.equal(invoke(receiver, 'dispatchEvent', [event]), false);
  assert.deepEqual(seen, [receiver, receiver, 'local']);
  assert.equal(policy.host.get(event, 'defaultPrevented'), true);
  assert.equal(cleanups.length, 1);
  cleanups[0]();
  invoke(receiver, 'dispatchEvent', [policy.host.construct(Event, ['local'])]);
  assert.equal(seen.length, 3, 'Cleanup removes the actual native wrapper');

  let handles = 0;
  const objectListener = guest({
    get handleEvent() {
      handles++;
      return guest(function (this: unknown, native: Event) {
        assert.equal(this, objectListener);
        assert.equal(policy.host.get(native, 'type'), 'object');
      });
    },
  });
  invoke(receiver, 'addEventListener', ['object', objectListener]);
  assert.equal(handles, 0);
  invoke(receiver, 'dispatchEvent', [policy.host.construct(Event, ['object'])]);
  assert.equal(handles, 1);
  invoke(receiver, 'removeEventListener', ['object', objectListener]);
  invoke(receiver, 'dispatchEvent', [policy.host.construct(Event, ['object'])]);
  assert.equal(handles, 1);
});

test('listener conversions match native order and failures do not register cleanup', () => {
  const { policy, target, guest, invoke, cleanups } = fixture();
  const nativeReads: string[] = [];
  const policyReads: string[] = [];
  function argumentsFor(reads: string[], callback: Function): unknown[] {
    const options = {
      get capture() {
        assert.equal(this, options);
        reads.push('capture');
        return true;
      },
      get once() {
        assert.equal(this, options);
        reads.push('once');
        return false;
      },
      get passive() {
        assert.equal(this, options);
        reads.push('passive');
        return false;
      },
      get signal() {
        assert.equal(this, options);
        reads.push('signal');
        return undefined;
      },
    };
    return [
      {
        toString() {
          reads.push('type');
          return 'local';
        },
      },
      callback,
      options,
    ];
  }
  const callback = guest(() => {});
  Reflect.apply(
    EventTarget.prototype.addEventListener,
    new EventTarget(),
    argumentsFor(nativeReads, callback),
  );
  invoke(target(), 'addEventListener', argumentsFor(policyReads, callback));
  assert.deepEqual(policyReads, nativeReads);
  assert.equal(cleanups.length, 1);
  const receiver = target();
  let calls = 0;
  const failed = guest(() => {
    calls++;
  });
  assert.throws(
    () => invoke(receiver, 'addEventListener', ['local', failed, { signal: {} }]),
    TypeError,
  );
  assert.equal(cleanups.length, 1);
  invoke(receiver, 'dispatchEvent', [policy.host.construct(Event, ['local'])]);
  assert.equal(calls, 0);
});

test('callback ownership is checked before registration and again on delivery', () => {
  const { policy, target, guest, guests, invoke } = fixture();
  const receiver = target();
  let calls = 0;
  const callback = () => {
    calls++;
  };
  assert.throws(
    () => invoke(receiver, 'addEventListener', ['local', callback]),
    /callback owner/,
  );
  guest(callback);
  invoke(receiver, 'addEventListener', ['local', callback]);
  guests.delete(callback);
  invoke(receiver, 'dispatchEvent', [policy.host.construct(Event, ['local'])]);
  assert.equal(calls, 0);
});

test('registered native callables use the provided invocation route as listeners', () => {
  const { policy, nativeCallables, target, guest, invoke } = fixture();
  const receiver = target();
  let calls = 0;
  const callback = () => {
    calls++;
  };
  nativeCallables.add(callback);
  invoke(receiver, 'addEventListener', ['local', callback]);
  const objectListener = guest({ handleEvent: callback });
  invoke(receiver, 'addEventListener', ['local', objectListener]);
  invoke(receiver, 'dispatchEvent', [policy.host.construct(Event, ['local'])]);
  assert.equal(calls, 2);
  nativeCallables.delete(callback);
  invoke(receiver, 'removeEventListener', ['local', objectListener]);
  invoke(receiver, 'dispatchEvent', [policy.host.construct(Event, ['local'])]);
  assert.equal(calls, 2);
});

test('native delivery rechecks receiver provenance without revoking detached local targets', () => {
  const { policy, receivers, guest } = fixture();
  const receiver = new EventTarget();
  receivers.add(receiver);
  const add = policy.host.get(EventTarget.prototype, 'addEventListener') as Function;
  let calls = 0;
  policy.host.call(add, receiver, [
    'local',
    guest(() => {
      calls++;
    }),
  ]);
  receiver.dispatchEvent(new Event('local'));
  assert.equal(calls, 1);
  receivers.delete(receiver);
  receiver.dispatchEvent(new Event('local'));
  assert.equal(calls, 1);
});

test('unknown getters and reflected access are denied before execution', () => {
  const early = '__pf_browser_early__';
  const late = '__pf_browser_late__';
  let reads = 0;
  const getter = {
    configurable: true,
    get() {
      reads++;
      return 'native';
    },
  };
  Object.defineProperty(EventTarget.prototype, early, getter);
  try {
    const { policy, target } = fixture();
    const receiver = target();
    Object.defineProperty(EventTarget.prototype, late, getter);
    assert.equal(Reflect.get(receiver, early), 'native');
    assert.equal(reads, 1, 'Unrestricted control executes the actual getter');
    reads = 0;
    for (const key of [early, late]) {
      assert.throws(() => policy.host.get(receiver, key), NativePolicyError);
      assert.throws(
        () => policy.host.descriptor(EventTarget.prototype, key),
        NativePolicyError,
      );
      assert(!policy.host.ownKeys(EventTarget.prototype).includes(key));
    }
    const event = policy.host.construct(Event, ['local']);
    Object.defineProperty(event, 'type', getter);
    assert.throws(() => policy.host.get(event, 'type'), /shadows/);
    assert.equal(reads, 0);
  } finally {
    Reflect.deleteProperty(EventTarget.prototype, early);
    Reflect.deleteProperty(EventTarget.prototype, late);
  }
});

test('native descriptor changes invalidate cached callable and accessor authority', () => {
  const { policy, target } = fixture();
  const receiver = target();
  const dispatch = policy.host.get(receiver, 'dispatchEvent') as Function;
  const native = Object.getOwnPropertyDescriptor(EventTarget.prototype, 'dispatchEvent')!;
  let calls = 0;
  Object.defineProperty(EventTarget.prototype, 'dispatchEvent', {
    ...native,
    value() {
      calls++;
      return true;
    },
  });
  try {
    assert.throws(
      () => policy.host.get(receiver, 'dispatchEvent'),
      /descriptor identity changed/,
    );
    assert.throws(
      () => policy.host.call(dispatch, receiver, [new Event('local')]),
      /descriptor identity changed/,
    );
    assert.equal(calls, 0);
  } finally {
    Object.defineProperty(EventTarget.prototype, 'dispatchEvent', native);
  }
  const event = policy.host.construct(Event, ['local']);
  const type = Object.getOwnPropertyDescriptor(Event.prototype, 'type')!;
  Object.defineProperty(Event.prototype, 'type', {
    ...type,
    get() {
      calls++;
      return 'changed';
    },
  });
  try {
    assert.throws(() => policy.host.get(event, 'type'), /descriptor identity changed/);
    assert.equal(calls, 0);
  } finally {
    Object.defineProperty(Event.prototype, 'type', type);
  }
});

test('canonical methods and borrowed receivers do not claim unrelated whole objects', () => {
  const { policy, receivers, guest } = fixture();
  const external = new EventTarget();
  receivers.add(external);
  const add = policy.host.get(EventTarget.prototype, 'addEventListener') as Function;
  assert.equal(policy.callable(EventTarget.prototype.addEventListener), add);
  assert.equal(
    policy.host.descriptor(EventTarget.prototype, 'addEventListener')?.value,
    add,
  );
  let calls = 0;
  policy.host.call(add, external, [
    'local',
    guest(() => {
      calls++;
    }),
  ]);
  external.dispatchEvent(new Event('local'));
  assert.equal(calls, 1);
  assert.equal(
    policy.host.owns!(external),
    false,
    'Receiver-only admission cannot claim object ownership',
  );
  assert.throws(
    () => policy.host.call(add, new EventTarget(), ['local', guest(() => {})]),
    NativePolicyError,
  );
  assert.throws(
    () =>
      policy.host.call(add, Object.create(EventTarget.prototype), [
        'local',
        guest(() => {}),
      ]),
    NativePolicyError,
  );

  class OtherEvent extends Event {}
  const other = new OtherEvent('other');
  assert.equal(policy.admitEvent(other), false);
  assert.equal(policy.host.owns!(other), false);
  const type = policy.host.descriptor(Event.prototype, 'type')!.get!;
  assert.equal(policy.host.call(type, other, []), 'other');
  assert.equal(
    policy.host.owns!(other),
    false,
    'Borrowed Event getter leaves subclass unclaimed',
  );
});

test('unreviewed aliases do not become local-family members', () => {
  Object.defineProperty(EventTarget.prototype, '__pf_add_alias__', {
    value: EventTarget.prototype.addEventListener,
    configurable: true,
  });
  try {
    const { policy, target } = fixture();
    const receiver = target();
    assert.throws(() => policy.host.get(receiver, '__pf_add_alias__'), NativePolicyError);
    const first = policy.callable(EventTarget.prototype.addEventListener);
    assert.equal(first, policy.host.get(receiver, 'addEventListener'));
    assert.equal(policy.host.get(receiver, 'absentEventFeature'), undefined);
  } finally {
    Reflect.deleteProperty(EventTarget.prototype, '__pf_add_alias__');
  }
});

test('method publication does not capture unclaimed native target families', () => {
  const { policy, target } = fixture();
  class UnclaimedTarget extends EventTarget {}
  const unclaimed = new UnclaimedTarget();
  assert.equal(
    policy.callable(EventTarget.prototype.addEventListener, unclaimed),
    undefined,
  );
  assert.equal(policy.host.owns!(unclaimed), false);
  assert.equal(
    policy.callable(EventTarget.prototype.addEventListener, target()),
    policy.host.get(EventTarget.prototype, 'addEventListener'),
  );
});
