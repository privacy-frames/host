import { createGuestWindow } from '../src/guest/session.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
async function run() {
  let reads = 0;
  const key = '__unreviewedAbortFixture__';
  Object.defineProperty(AbortSignal.prototype, key, {
    configurable: true,
    get() {
      reads++;
      return 7;
    },
  });
  const catalog: GuestContextCatalog = {
    application: 'abort-fixture',
    generation: 'fixture',
    sourceURL: 'https://publisher.invalid/',
    documentBase: 'https://publisher.invalid/',
    applicationURL: location.origin + '/app/',
    runtimeURL: location.origin + '/',
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
    check(
      Reflect.get(new AbortController().signal, key) === 7 && reads === 1,
      'Native unknown getter positive control',
    );
    reads = 0;
    const controller = session.environment.host.construct(AbortController, []);
    const signal = session.environment.host.get(controller, 'signal');
    check(signal && typeof signal === 'object', 'Registered signal producer');
    let denied = false;
    try {
      session.environment.host.get(signal, key);
    } catch {
      denied = true;
    }
    check(denied && reads === 0, 'Unknown abort getter refused before execution');
    const encoded = await session.engine.evaluate(`(async () => {
      const check = (value, message) => { if (!value) throw Error(message); };
      const controller = new AbortController();
      const signal = controller.signal;
      check(Object.getPrototypeOf(signal) === AbortSignal.prototype, 'Signal prototype identity');
      check(Object.getPrototypeOf(AbortSignal.prototype) === EventTarget.prototype, 'EventTarget lineage');
      const trace = [];
      const handler = function(event) { check(this === signal && event.type === 'abort', 'Handler receiver'); trace.push('handler'); };
      signal.onabort = handler;
      check(signal.onabort === handler, 'Handler getter identity');
      const getter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'onabort').get;
      check(getter.call(signal) === handler, 'Reflected handler identity');
      check(controller.abort.name === 'abort' && controller.abort.length === 0, 'Method metadata');
      check(AbortSignal.timeout.name === 'timeout' && AbortSignal.timeout.length === 1, 'Static metadata');
      check(Object.getOwnPropertyDescriptor(AbortSignal.timeout, 'name').value === 'timeout', 'Callable descriptor');
      signal.addEventListener('abort', () => trace.push('listener'));
      const reason = () => 17;
      controller.abort(reason);
      trace.push('after');
      check(trace.join(',') === 'handler,listener,after', 'Synchronous native event ordering');
      check(signal.reason === reason, 'Delegated reason identity');
      let thrown; try { signal.throwIfAborted(); } catch (error) { thrown = error; }
      check(thrown === reason, 'Exact thrown reason');
      let illegal = false; try { new AbortSignal(); } catch { illegal = true; }
      check(illegal, 'Native constructor illegality');
      signal.onabort = 1;
      check(signal.onabort === null, 'Native handler primitive conversion');
      const abort = AbortSignal.abort;
      check(abort.call({}, 'static').reason === 'static', 'Extracted static receiver');
      let iterators = 0, next = 0;
      const source = new AbortController();
      const sequence = { [Symbol.iterator]() { iterators++; let done = false; return { next() { next++; if(done) return {done:true}; done=true; return {done:false,value:source.signal}; } }; } };
      const any = AbortSignal.any;
      const dependent = any.call(undefined, sequence);
      check(iterators === 1 && next === 2, 'Native sequence conversion once');
      const marker = {value:42}; source.abort(marker);
      check(dependent.aborted && dependent.reason === marker, 'Dependent reason identity');
      const timed = AbortSignal.timeout(1);
      await new Promise((done) => timed.addEventListener('abort', done, {once:true}));
      check(timed.aborted && timed.reason.name === 'TimeoutError', 'Native timeout producer');
      const target = new EventTarget(); let count = 0;
      const removal = new AbortController();
      target.addEventListener('local', () => count++, {signal:removal.signal});
      removal.abort(); target.dispatchEvent(new Event('local'));
      check(count === 0, 'Signal listener removal remains supported');
      return JSON.stringify({localAbort:true, staticProducers:true, delegatedReasons:true, eventLineage:true, timeout:true, signalRemoval:true});
    })()`);
    let late = 0;
    session.engine.set('recordAbortDelivery', () => {
      late++;
    });
    const callback = await session.engine.evaluate('() => recordAbortDelivery()');
    check(typeof callback === 'function', 'Guest callback obtained');
    const timeout = session.environment.host.get(AbortSignal, 'timeout');
    check(typeof timeout === 'function', 'Timeout method');
    const pending = session.environment.host.call(timeout, undefined, [20]);
    check(pending && typeof pending === 'object', 'Pending native timeout');
    session.environment.host.set(pending, 'onabort', callback);
    session.close();
    await new Promise((done) => setTimeout(done, 35));
    check(late === 0, 'Closed engine has no abort callback delivery');
    return {
      ...JSON.parse(String(encoded)),
      unknownGetterDenied: true,
      lateDeliveryDenied: true,
    };
  } finally {
    session.close();
    Reflect.deleteProperty(AbortSignal.prototype, key);
  }
}
run()
  .then((result) => Reflect.set(window, '__abortResult', result))
  .catch((error) =>
    Reflect.set(
      window,
      '__abortFailure',
      String(error) + (error instanceof Error ? '\n' + error.stack : ''),
    ),
  );
