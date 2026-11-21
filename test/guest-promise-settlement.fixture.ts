import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GuestEngine } from '../src/guest/engine.ts';
import type { GuestHost } from '../src/guest/protocol.ts';

const project = process.env.PF_PROMISE_PROJECT;
assert(project);
const wasmModule = await WebAssembly.compile(
  await readFile(project + '/vendor/quickjs/generated/engine.wasm'),
);
const host: GuestHost = {
  get: Reflect.get,
  set: Reflect.set,
  delete: Reflect.deleteProperty,
  call: Reflect.apply,
  construct: Reflect.construct,
  ownKeys: Reflect.ownKeys,
  descriptor: Object.getOwnPropertyDescriptor,
  prototype: Object.getPrototypeOf,
};
const observations: string[] = [];
const unhandled: unknown[] = [];
process.on('unhandledRejection', (error) => unhandled.push(error));
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

async function fixture(reporter?: (error: Error) => void) {
  const reports: Error[] = [];
  const engine = await GuestEngine.create({
    host,
    wasmModule,
    onError(error) {
      reports.push(error);
      reporter?.(error);
    },
  });
  let settleNative: (value: unknown) => void = () => {};
  const native = new Promise<unknown>((resolve) => {
    settleNative = resolve;
  });
  engine.set('settleNative', settleNative);
  engine.set('nativePromise', native);
  engine.evaluate(`globalThis.settlements = [];
    nativePromise.then(
      value => settlements.push(['fulfilled', value]),
      error => settlements.push(['rejected', String(error)]),
    ); void 0;`);
  return { engine, reports, settleNative };
}

// A conversion fault is injected at the actual encode call, after the source
// promise has settled. No native browser service or outside destination is used.
for (const rejected of [false, true]) {
  const reports: Error[] = [];
  const engine = await GuestEngine.create({
    host,
    wasmModule,
    onError: (error) => reports.push(error),
  });
  let complete: (value: unknown) => void = () => {};
  const native = new Promise<unknown>((resolve, reject) => {
    complete = rejected ? reject : resolve;
  });
  engine.set('nativePromise', native);
  engine.evaluate(`globalThis.settlements = [];
    nativePromise.then(
      value => settlements.push(['fulfilled', value]),
      error => settlements.push(['rejected', error.message]),
    ); void 0;`);
  const marker = {};
  const primary = new Error('controlled native conversion');
  const encode: (value: unknown) => unknown = Reflect.get(engine, 'encode');
  Reflect.set(engine, 'encode', function (value: unknown, ...args: unknown[]) {
    if (value === marker) throw primary;
    return Reflect.apply(encode, engine, [value, ...args]);
  });
  complete(marker);
  await turn();
  engine.drainJobs();
  assert.deepEqual(
    engine.get('settlements'),
    [['rejected', primary.message]],
    'native conversion failure must reject the guest promise once',
  );
  assert.equal(reports.length, 0, reports.map(String).join('\n'));
  assert.equal(Reflect.get(engine, 'promises').size, 0);
  engine.dispose();
  observations.push(
    rejected ? 'native-rejection-conversion' : 'native-resolution-conversion',
  );
}

// Host-object tests are separate from mutable guest prototypes. The bridge
// adopts native promises privately: source metadata errors reject asynchronously.
{
  const engine = await GuestEngine.create({ host, wasmModule, onError() {} });
  const refused = Promise.resolve(1);
  const primary = new Error('controlled promise constructor lookup');
  Object.defineProperty(refused, 'constructor', {
    get() {
      throw primary;
    },
  });
  assert.doesNotThrow(
    () => engine.set('refused', refused),
    'host constructor failure must be adopted as rejection',
  );
  const handled = engine.evaluate('refused.catch(error => error.message)');
  assert(handled instanceof Promise);
  assert.equal(await handled, primary.message);
  assert.equal(Reflect.get(engine, 'promises').size, 0);
  let reads = 0;
  const reentrant = Promise.resolve(17);
  const then = Promise.prototype.then;
  Object.defineProperty(reentrant, 'then', {
    get() {
      reads++;
      engine.set('innerPromise', reentrant);
      return then;
    },
  });
  engine.set('outerPromise', reentrant);
  assert.equal(reads, 1);
  assert.equal(engine.evaluate('innerPromise === outerPromise'), true);
  assert.equal(Reflect.get(engine, 'promises').size, 1);
  await turn();
  assert.equal(Reflect.get(engine, 'promises').size, 0);
  engine.dispose();
  observations.push('host-adoption-rejection-and-reentrant-identity');
}
{
  const engine = await GuestEngine.create({ host, wasmModule, onError() {} });
  const promise = Promise.resolve(1);
  Object.defineProperty(promise, 'then', {
    get() {
      engine.dispose();
      assert.equal(engine.context.alive, true);
      return Promise.prototype.then;
    },
  });
  engine.set('closedDuringLookup', promise);
  assert.equal(engine.context.alive, false);
  await turn();
  observations.push('adoption-reentrant-close');
}

// Guest Promise species lookup can fail before its observer is installed.
// The private native waiter is rejected/observed before the same error escapes.
{
  const { engine, reports } = await fixture();
  engine.evaluate(`globalThis.setupFailure = new Error('controlled guest species');
    globalThis.badPromise = Promise.resolve(1);
    Object.defineProperty(badPromise, 'constructor', {get() { throw setupFailure; }});
    void 0;`);
  let primary: unknown;
  try {
    engine.get('badPromise');
  } catch (error) {
    primary = error;
  }
  assert(primary instanceof Error);
  assert.match(primary.message, /controlled guest species/);
  assert.equal(
    Reflect.get(engine, 'pendingPromises').size,
    0,
    'failed observer setup must remove its native waiter',
  );
  await turn();
  assert(reports.includes(primary));
  engine.set('rethrowSetupFailure', () => {
    throw primary;
  });
  assert.equal(
    engine.evaluate(
      'try { rethrowSetupFailure(); } catch (error) { error === setupFailure; }',
    ),
    true,
  );
  engine.dispose();
  await turn();
  assert.equal(unhandled.length, 0);
  observations.push('guest-observer-setup-failure');
}

// Native rejection objects already owned by this guest retain their identity.
{
  const { engine } = await fixture();
  engine.evaluate(`globalThis.reason = {local: true};
    globalThis.rejected = Promise.reject(reason);`);
  const promise = engine.get('rejected');
  assert(promise instanceof Promise);
  const failure = await promise.catch((error: unknown) => error);
  engine.set('roundtrip', () => {
    throw failure;
  });
  assert.equal(
    engine.evaluate('try { roundtrip(); } catch (error) { error === reason; }'),
    true,
  );
  engine.set('normalRejection', Promise.reject(new Error('normal native rejection')));
  const handled = engine.evaluate('normalRejection.catch(error => error.message)');
  assert(handled instanceof Promise);
  assert.equal(await handled, 'normal native rejection');
  engine.evaluate('settleNative(42); settleNative(99);');
  await turn();
  assert.deepEqual(engine.get('settlements'), [['fulfilled', 42]]);
  engine.dispose();
  observations.push('normal-settlement-and-rejection-identity');
}

for (const rejected of [false, true]) {
  const { engine, reports } = await fixture();
  engine.evaluate('globalThis.marker = {local: true};');
  const primary = new Error('controlled guest conversion');
  if (rejected) {
    Reflect.set(engine, 'guestError', () => {
      throw primary;
    });
  } else {
    const decode: (value: unknown) => unknown = Reflect.get(engine, 'decode');
    const marker = engine.context.getProp(engine.context.global, 'marker');
    Reflect.set(
      engine,
      'decode',
      function (value: Parameters<typeof engine.context.eq>[0]) {
        if (engine.context.eq(value, marker)) throw primary;
        return Reflect.apply(decode, engine, [value]);
      },
    );
    engine.onDispose(() => marker.dispose());
  }
  const promise = engine.evaluate(
    rejected ? 'Promise.reject(marker)' : 'Promise.resolve(marker)',
  );
  assert(promise instanceof Promise);
  let settled: unknown;
  void promise.then(
    () => {
      settled = 'unexpected fulfillment';
    },
    (error: unknown) => {
      settled = error;
    },
  );
  engine.drainJobs();
  await turn();
  assert.equal(
    settled,
    primary,
    'guest conversion failure must reject the native promise',
  );
  assert.equal(Reflect.get(engine, 'pendingPromises').size, 0);
  assert.equal(reports.filter((error) => error === primary).length, 1);
  engine.dispose();
  observations.push(
    rejected ? 'guest-rejection-conversion' : 'guest-resolution-conversion',
  );
}

// Entry failure cannot authorize an SDK operation outside the entry barrier.
// The async observer reports the primary error even if cleanup/reporting fail.
{
  const { engine, reports, settleNative } = await fixture(() => {
    throw new Error('reporter cleanup');
  });
  const primary = new Error('controlled entry failure');
  const enter = Reflect.get(engine, 'enter');
  const deferred = [...Reflect.get(engine, 'promises')][0];
  const dispose = deferred.dispose;
  let disposalCalls = 0;
  deferred.dispose = () => {
    disposalCalls++;
    dispose();
    throw new Error('deferred cleanup');
  };
  let settleCalls = 0;
  deferred.resolve = () => {
    settleCalls++;
  };
  deferred.reject = () => {
    settleCalls++;
  };
  Reflect.set(engine, 'enter', () => {
    throw primary;
  });
  settleNative(1);
  await turn();
  assert.equal(settleCalls, 0);
  assert.equal(disposalCalls, 0, 'failed entry retains deferred until close');
  assert.equal(Reflect.get(engine, 'promises').size, 1);
  assert.deepEqual(
    reports,
    [primary],
    'entry failure remains primary over cleanup failure',
  );
  assert.equal(unhandled.length, 0, 'settlement/reporting failures must be observed');
  Reflect.set(engine, 'enter', enter);
  deferred.dispose = () => {
    disposalCalls++;
    dispose();
  };
  engine.dispose();
  assert.equal(disposalCalls, 1);
  observations.push('entry-reporting-failure-and-retained-close');
}

{
  const { engine } = await fixture();
  let settle: (value: unknown) => void = () => {};
  engine.set(
    'late',
    new Promise((resolve) => {
      settle = resolve;
    }),
  );
  const pending = engine.evaluate('new Promise(() => {})');
  assert(pending instanceof Promise);
  let closed: unknown;
  void pending.catch((error: unknown) => {
    closed = error;
  });
  engine.dispose();
  settle({ local: true });
  await turn();
  assert.match(String(closed), /context is closed/);
  assert.equal(engine.context.alive, false);
  observations.push('late-settlement-and-close');
}
// A settlement failure and deferred cleanup failure keep the primary diagnostic.
{
  const { engine, reports, settleNative } = await fixture();
  const primary = new Error('controlled settlement failure');
  const deferred = [...Reflect.get(engine, 'promises')][0];
  const dispose = deferred.dispose;
  deferred.resolve = () => {
    throw primary;
  };
  deferred.dispose = () => {
    dispose();
    throw new Error('controlled cleanup failure');
  };
  settleNative(42);
  await turn();
  assert.deepEqual(
    reports,
    [primary],
    'settlement failure remains primary over cleanup failure',
  );
  assert.equal(Reflect.get(engine, 'promises').size, 0);
  engine.dispose();
  observations.push('settlement-cleanup-primary-error');
}

// Conversion can synchronously close the engine. Its entry owns all SDK roots
// until the getter and encoder unwind; no late settlement may reenter the guest.
{
  const { engine, reports, settleNative } = await fixture();
  let conversions = 0;
  const value = Object.defineProperty({}, Symbol.toStringTag, {
    get() {
      conversions++;
      engine.dispose();
      assert.equal(engine.context.alive, true, 'reentrant close retains active roots');
      return 'LocalFixture';
    },
  });
  const indexed: { dispose(): void } = Reflect.get(engine, 'indexed');
  const dispose = indexed.dispose.bind(indexed);
  let releases = 0;
  indexed.dispose = () => {
    assert.equal(Reflect.get(engine, 'depth'), 0);
    releases++;
    dispose();
  };
  settleNative(value);
  await turn();
  assert.equal(conversions, 1);
  assert.equal(releases, 1);
  assert.equal(engine.context.alive, false);
  assert.equal(reports.length, 0);
  observations.push('reentrant-conversion-close');
}
assert.equal(unhandled.length, 0, 'all native continuation rejections are observed');
console.log(JSON.stringify({ observations }));
