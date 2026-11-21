import { createGuestWindow } from '../src/guest/session.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';

const source = `(() => {
  const rows = [];
  for (const source of ['global', 'prototype']) {
    const add = source === 'global' ? addEventListener : EventTarget.prototype.addEventListener;
    const remove = source === 'global' ? removeEventListener : EventTarget.prototype.removeEventListener;
    const dispatch = source === 'global' ? dispatchEvent : EventTarget.prototype.dispatchEvent;
    for (const [kind, receiver] of [['undefined', undefined], ['null', null],
        ['html-dda', document.all], ['plain', {}], ['window', window], ['target', new EventTarget()]]) {
      let count = 0, error, cancelled, removed;
      const callback = event => { count++; event.preventDefault(); };
      try {
        Reflect.apply(add, receiver, ['global-receiver', callback]);
        cancelled = Reflect.apply(dispatch, receiver, [new Event('global-receiver', {cancelable:true})]) === false;
        Reflect.apply(remove, receiver, ['global-receiver', callback]);
        removed = Reflect.apply(dispatch, receiver, [new Event('global-receiver', {cancelable:true})]) === true;
      } catch (failure) { error = true; }
      rows.push({source,kind,count,cancelled,removed,error});
    }
  }
  const method = addEventListener;
  let constructible = true;
  try { Reflect.construct(function(){}, [], method); } catch { constructible = false; }
  return JSON.stringify({rows,same:addEventListener === EventTarget.prototype.addEventListener,
    name:method.name,length:method.length,prototype:Object.hasOwn(method,'prototype'),constructible});
})()`;

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function run() {
  const native = window.eval(source) as string;
  const catalog: GuestContextCatalog = {
    application: 'global-event-receiver',
    generation: 'fixture',
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
  const foreignFrame = document.createElement('iframe');
  document.body.append(foreignFrame);
  try {
    const guest = await session.engine.evaluate(source);
    if (guest !== native)
      Reflect.set(window, '__globalReceiverComparison', {
        native: JSON.parse(native),
        guest: JSON.parse(String(guest)),
      });
    check(
      guest === native,
      'Guest receiver behavior differs from unrestricted native control',
    );
    await session.engine.evaluate(`
      globalThis.bareEvents = 0;
      globalThis.bareCallback = event => { bareEvents++; event.preventDefault(); };
      addEventListener('bare-global', bareCallback);
      if (dispatchEvent(new Event('bare-global', { cancelable: true })) !== false)
        throw new Error('Bare dispatch lost cancellation');
      removeEventListener('bare-global', bareCallback);
      dispatchEvent(new Event('bare-global'));
      if (bareEvents !== 1) throw new Error('Bare removal lost callback identity');
    `);
    const callback = session.engine.get('bareCallback');
    const method = session.engine.get('addEventListener');
    check(typeof method === 'function', 'Canonical global method published');
    const foreign = foreignFrame.contentWindow;
    check(foreign, 'Unprepared window exists');
    for (const receiver of [document.all, {}, foreign, foreign.document.body]) {
      let refused = false;
      try {
        session.environment.host.call(method, receiver, ['foreign', callback]);
      } catch {
        refused = true;
      }
      check(refused, 'Non-null objects and unprepared receivers remain refused');
      let directRefused = false;
      try {
        Reflect.apply(method, receiver, ['foreign-direct', callback]);
      } catch {
        directRefused = true;
      }
      check(directRefused, 'Direct wrapper preserves non-null receiver refusal');
    }
    // A native consumer can invoke the decoded canonical method directly.
    await new Promise<void>((resolve, reject) =>
      queueMicrotask(() => {
        try {
          Reflect.apply(method, undefined, ['direct-global', callback]);
          resolve();
        } catch (error) {
          reject(error);
        }
      }),
    );
    check(
      !window.dispatchEvent(new Event('direct-global', { cancelable: true })),
      'Direct canonical callback normalizes before registry admission',
    );
    check(session.engine.get('bareEvents') === 2, 'Direct native callback delivered');
    session.close();
    check(
      window.dispatchEvent(new Event('direct-global', { cancelable: true })),
      'Disposal removes direct native registration',
    );
    check(!session.engine.recognizesCallable(method), 'Closed engine revokes callable');
    let refused = false;
    try {
      session.environment.host.call(method, undefined, ['revoked', callback]);
    } catch {
      refused = true;
    }
    check(refused, 'Disposed global is not admitted by receiver normalization');
    return {
      native: JSON.parse(native),
      nativeMatch: true,
      bareGlobal: true,
      directCallback: true,
      unpreparedRefused: true,
      disposal: true,
    };
  } finally {
    session.close();
    foreignFrame.remove();
  }
}
run()
  .then((result) => Reflect.set(window, '__globalReceiverResult', result))
  .catch((error) =>
    Reflect.set(
      window,
      '__globalReceiverFailure',
      String(error) + (error.stack ? '\n' + error.stack : ''),
    ),
  );
