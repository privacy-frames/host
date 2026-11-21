import { createGuestWindow } from '../src/guest/session.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function run() {
  let unknownReads = 0;
  const early = '__pf_unreviewed_event_early__';
  const late = '__pf_unreviewed_event_late__';
  const getter = {
    configurable: true,
    get() {
      unknownReads++;
      return 'native positive';
    },
  };
  Object.defineProperty(EventTarget.prototype, early, getter);
  const foreignFrame = document.createElement('iframe');
  document.body.append(foreignFrame);
  const foreignWindow = foreignFrame.contentWindow;
  check(foreignWindow, 'Unprepared native window exists');
  const catalog: GuestContextCatalog = {
    application: 'browser-policy-fixture',
    generation: 'fixture-generation',
    sourceURL: 'https://fixture.invalid/',
    documentBase: 'https://fixture.invalid/',
    runtimeURL: location.origin + '/',
    applicationURL: location.origin + '/app/',
    engineWasm: await (await fetch('/engine.wasm')).arrayBuffer(),
    workerBootstrap: {
      dedicated: new ArrayBuffer(0),
      shared: new ArrayBuffer(0),
      worklet: new ArrayBuffer(0),
    },
    resources: [],
  };
  const session = await createGuestWindow(catalog, window);
  try {
    if (new URL(location.href).searchParams.has('noStringRecovery')) {
      for (const input of ['hello', 'A🐼é'])
        check(
          (await session.engine.evaluate(JSON.stringify(input))) === input,
          'Ordinary primitive string does not require JSON recovery',
        );
      for (const input of ['before\0after', 'before\ud800after', 'before\udc00after']) {
        let required = false;
        try {
          await session.engine.evaluate(JSON.stringify(input));
        } catch (error) {
          required = String(error).includes('Diagnostic: string recovery unavailable');
        }
        check(required, 'Opaque string retains the explicit recovery path');
      }
      return { primitiveFastPath: true, opaqueStringsRequireRecovery: true };
    }
    Object.defineProperty(EventTarget.prototype, late, getter);
    Object.defineProperty(EventTarget.prototype, '__pf_event_alias__', {
      configurable: true,
      value: EventTarget.prototype.addEventListener,
    });
    check(
      Reflect.get(new EventTarget(), early) === 'native positive',
      'Native getter control',
    );
    check(unknownReads === 1, 'Unrestricted control executes the getter');
    unknownReads = 0;
    const ownedTarget = session.environment.host.construct(EventTarget, []);
    for (const key of [early, late]) {
      let denied = false;
      try {
        session.environment.host.get(ownedTarget, key);
      } catch {
        denied = true;
      }
      check(denied, 'Actual BrowserEnvironment unknown-getter route rejects');
    }
    check(unknownReads === 0, 'Native host route does not execute unknown getters');
    const result = await session.engine.evaluate(
      `(() => {
      function check(value, message) { if (!value) throw new Error(message); }
      const target = new EventTarget();
      const callback = function (event) {
        check(this === target && event.target === target, 'Native callback receiver/target');
        check(event.type === 'local' && event.isTrusted === false, 'Selected Event fields');
        event.preventDefault();
      };
      const add = EventTarget.prototype.addEventListener;
      check(target.addEventListener === add, 'Canonical method identity');
      check(Object.getOwnPropertyDescriptor(EventTarget.prototype, 'addEventListener').value === add,
        'Reflected method identity');
      EventTarget.prototype.localAlias = add;
      check(target.localAlias === add, 'Application prototype aliases remain available');
      add.call(target, 'local', callback);
      const event = new Event('local', { cancelable: true });
      check(target.dispatchEvent(event) === false && event.defaultPrevented,
        'Synchronous native cancellation');
      target.removeEventListener('local', callback);
      for (const name of ['${early}', '${late}', '__pf_event_alias__']) {
        let denied = false;
        try { target[name]; } catch { denied = true; }
        check(denied, 'Unknown local-family member rejected: ' + name);
      }
      const detail = { local: 42 };
      const custom = new CustomEvent('custom', { detail });
      check(custom.detail === detail && custom instanceof Event, 'CustomEvent data/inheritance');
      const getType = Object.getOwnPropertyDescriptor(Event.prototype, 'type').get;
      check(getType.call(custom) === 'custom', 'Borrowed getter retains Event operation');
      const message = new MessageEvent('message', { data: detail });
      check(message.data === detail && message.origin === '' && message.ports.length === 0,
        'MessageEvent local data');

      const node = document.createElement('button');
      node.textContent = 'Before listener';
      document.body.appendChild(node);
      let nodeEvents = 0;
      const nodeCallback = function (native) {
        nodeEvents++;
        check(this === node && native.type === 'node', 'Borrowed Node listener delivery');
      };
      add.call(node, 'node', nodeCallback);
      node.dispatchEvent(new Event('node'));
      node.textContent = 'After listener';
      check(nodeEvents === 1 && node.textContent === 'After listener' && node.tagName === 'BUTTON',
        'EventTarget receiver admission leaves ordinary Node operations available');
      check(node.addEventListener === add, 'DOM method uses canonical EventTarget identity');
      node.remove();
      node.dispatchEvent(new Event('node'));
      check(nodeEvents === 2, 'Detached local Node retains its prepared document provenance');
      node.removeEventListener('node', nodeCallback);
      globalThis.fixtureCallback = value => {
        globalThis.fixtureCallbackCalls = (globalThis.fixtureCallbackCalls || 0) + 1;
        return value * 2;
      };
      return JSON.stringify({ localEvents: true, cancellation: true, customEvent: true,
        messageEvent: true, reflection: true, aliasesDenied: true,
        borrowedNodeReceiver: true, nodePropertiesRemainAvailable: true });
    })()`,
      'browser:policy-fixture',
    );
    check(unknownReads === 0, 'Unknown native event getters never execute');

    const childFrame = document.createElement('iframe');
    document.body.append(childFrame);
    const childWindow = childFrame.contentWindow;
    check(childWindow, 'Prepared child native window exists');
    const child = await createGuestWindow(catalog, childWindow);
    try {
      await child.engine.evaluate(
        `
        if (parent.addEventListener !== parent.addEventListener ||
            parent.removeEventListener !== parent.removeEventListener)
          throw new Error('Cross-context method identity');
        for (const key of ['addEventListener', 'removeEventListener']) {
          const method = parent[key];
          const local = EventTarget.prototype[key];
          for (const field of ['name', 'length']) {
            const actual = Object.getOwnPropertyDescriptor(method, field);
            const expected = Object.getOwnPropertyDescriptor(local, field);
            if (JSON.stringify(actual) !== JSON.stringify(expected))
              throw new Error('Cross-context method metadata: ' + key + '.' + field);
          }
          if (Object.getOwnPropertyDescriptor(method, 'prototype') !== undefined)
            throw new Error('Cross-context method has own prototype');
          let refused = false;
          try { Reflect.construct(function () {}, [], method); } catch (error) {
            refused = error instanceof TypeError;
          }
          if (!refused) throw new Error('Cross-context method became constructible');
        }
        globalThis.parentEvents = 0;
        globalThis.parentCallback = function (event) {
          if (this !== parent || event.type !== 'prepared-parent')
            throw new Error('Cross-context receiver/event identity');
          globalThis.parentEvents++;
          event.preventDefault();
        };
        parent.addEventListener('prepared-parent', parentCallback);
      `,
        'browser:child-listener',
      );
      check(
        !window.dispatchEvent(new Event('prepared-parent', { cancelable: true })),
        'Child listener synchronously cancels parent event',
      );
      check(
        child.engine.get('parentEvents') === 1,
        'Child callback receives parent event',
      );
      await child.engine.evaluate(
        "parent.removeEventListener('prepared-parent', parentCallback)",
        'browser:child-listener-remove',
      );
      check(
        window.dispatchEvent(new Event('prepared-parent', { cancelable: true })),
        'Removed child listener no longer cancels parent event',
      );
      check(
        child.engine.get('parentEvents') === 1,
        'Child listener removal retains identity',
      );
    } finally {
      child.close();
      childFrame.remove();
    }

    const add = session.environment.host.get(EventTarget.prototype, 'addEventListener');
    check(typeof add === 'function', 'Registered event method available');
    const callback = session.engine.get('fixtureCallback');
    check(typeof callback === 'function', 'Guest-owned callback available');
    check(
      session.engine.recognizesCallable(callback),
      'Decoded guest callable is recognized',
    );
    check(
      session.engine.call(callback, [21]) === 42,
      'Known guest callback executes through its wrapper',
    );
    check(
      session.engine.get('fixtureCallbackCalls') === 1,
      'Guest callback executes once',
    );
    for (const receiver of [foreignWindow, foreignWindow.document.body]) {
      let denied = false;
      try {
        session.environment.host.call(add, receiver, ['local', callback]);
      } catch {
        denied = true;
      }
      check(denied, 'Unprepared window/document cannot become a borrowed event receiver');
    }
    const selected = session.environment.host.construct(Event, [
      'reflected',
      { cancelable: true },
    ]);
    const nativeCallback = session.environment.host.get(selected, 'preventDefault');
    check(typeof nativeCallback === 'function', 'Registered native callback available');
    session.engine.set('registeredNativeCallback', nativeCallback);
    check(
      session.engine.recognizesCallable(nativeCallback),
      'Published native callable is recognized',
    );
    session.engine.call(nativeCallback, [], selected);
    check(
      session.environment.host.get(selected, 'defaultPrevented') === true,
      'Published native callback uses its mediated operation',
    );
    let unknownCalls = 0;
    const unknownCallback = () => {
      unknownCalls++;
    };
    check(
      !session.engine.recognizesCallable(unknownCallback),
      'Unknown native function is not recognized',
    );
    let unknownDenied = false;
    try {
      session.engine.call(unknownCallback);
    } catch {
      unknownDenied = true;
    }
    check(
      unknownDenied &&
        unknownCalls === 0 &&
        !session.engine.recognizesCallable(unknownCallback),
      'Calling an unknown function neither executes nor publishes it',
    );
    for (const input of [
      'hello',
      'A🐼é',
      'before\0after',
      'before\ud800after',
      'before\udc00after',
      'before\ufffdafter',
    ]) {
      check(
        (await session.engine.evaluate(JSON.stringify(input))) === input,
        'Guest-produced string retains exact UTF-16 code units',
      );
      session.engine.set('nativeStringInput', input);
      check(
        (await session.engine.evaluate('nativeStringInput')) === input,
        'Host string round trip retains exact UTF-16 code units',
      );
    }
    const native = Object.getOwnPropertyDescriptor(Event.prototype, 'type');
    check(native?.get, 'Native Event type descriptor exists');
    let replacementReads = 0;
    Object.defineProperty(Event.prototype, 'type', {
      ...native,
      get() {
        replacementReads++;
        return 'replacement';
      },
    });
    try {
      let denied = false;
      try {
        session.environment.host.get(selected, 'type');
      } catch {
        denied = true;
      }
      check(
        denied && replacementReads === 0,
        'Changed descriptor rejected before invocation',
      );
    } finally {
      Object.defineProperty(Event.prototype, 'type', native);
    }
    session.close();
    check(
      !session.engine.recognizesCallable(callback) &&
        !session.engine.recognizesCallable(nativeCallback),
      'Closed engine recognizes no callable',
    );
    let closedDenied = false;
    try {
      session.engine.call(callback, [21]);
    } catch {
      closedDenied = true;
    }
    check(closedDenied, 'Closed engine cannot invoke a former callback');
    return {
      ...JSON.parse(String(result)),
      unknownGetterReads: unknownReads,
      unpreparedReceiversDenied: true,
      changedDescriptorDenied: true,
      guestCallback: true,
      publishedNativeCallback: true,
      unknownCallbackDenied: true,
      closedCallbackDenied: true,
      stringFidelity: true,
      preparedParentListener: true,
    };
  } finally {
    session.close();
    foreignFrame.remove();
    for (const name of [early, late, '__pf_event_alias__'])
      Reflect.deleteProperty(EventTarget.prototype, name);
  }
}

run()
  .then((result) => Reflect.set(window, '__browserPolicyResult', result))
  .catch((error) =>
    Reflect.set(
      window,
      '__browserPolicyFailure',
      String(error) + (error instanceof Error && error.stack ? '\n' + error.stack : ''),
    ),
  );
