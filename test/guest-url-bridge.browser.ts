import { createGuestWindow } from '../src/guest/session.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function run() {
  let unknownReads = 0;
  Object.defineProperty(URL.prototype, 'unreviewedURLFixture', {
    configurable: true,
    get() {
      unknownReads++;
      return 'native positive';
    },
  });
  check(
    Reflect.get(new URL('https://fixture.invalid/'), 'unreviewedURLFixture') ===
      'native positive',
    'Native getter positive control',
  );
  check(unknownReads === 1, 'Native positive must execute getter once');
  unknownReads = 0;
  const catalog: GuestContextCatalog = {
    application: 'url-bridge-fixture',
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
    let unknownGetterDenied = false;
    try {
      session.environment.host.get(
        new URL('https://fixture.invalid/'),
        'unreviewedURLFixture',
      );
    } catch {
      unknownGetterDenied = true;
    }
    Reflect.set(window, '__urlBridgeObserved', { unknownReads, unknownGetterDenied });
    check(unknownReads === 0, 'Unreviewed native getter must be denied before execution');
    check(unknownGetterDenied, 'Unreviewed native getter must reject');
    check(
      session.engine.evaluate(
        `(() => {
      try { new URL('https://fixture.invalid/').unreviewedURLFixture; return false; }
      catch (error) { return true; }
    })()`,
        'url:guest-unknown-getter',
      ),
      'Guest unknown getter must reject',
    );
    const result = await session.engine.evaluate(
      `(async () => {
      function check(value, message) { if (!value) throw new Error(message); }
      let conversions = 0;
      const input = { toString() { conversions++; return '/path?a=1&a=2'; } };
      const url = new URL(input, 'https://fixture.invalid/base/');
      check(conversions === 1 && url.href === 'https://fixture.invalid/path?a=1&a=2',
        'URL constructor conversion must occur once');
      conversions = 0;
      url.hash = { toString() { conversions++; return 'anchor'; } };
      check(conversions === 1 && url.hash === '#anchor', 'Setter conversion once');
      const params = url.searchParams;
      params.append('b', '3');
      check(url.search === '?a=1&a=2&b=3', 'Linked params update URL');
      const seen = [], context = { marker: 17 };
      params.forEach(function(value, key, source) {
        check(this === context && source === params, 'Guest callback identity');
        seen.push([key, value]);
      }, context);
      check(JSON.stringify(seen) === JSON.stringify([['a','1'],['a','2'],['b','3']]),
        'URL callback values');
      check(JSON.stringify(Array.from(params)) === JSON.stringify(seen),
        'Ordinary iterator protocol');
      check(params.entries === params[Symbol.iterator], 'Canonical iterator alias');
      check(params.get === params.get, 'Stable method identity');
      const prototype = Object.getPrototypeOf(params);
      const getDescriptor = Object.getOwnPropertyDescriptor(prototype, 'get');
      check(getDescriptor.value === params.get, 'Reflected method identity');
      const other = new URLSearchParams('x=7');
      check(getDescriptor.value.call(other, 'x') === '7', 'Borrowed method');
      const href = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(url), 'href');
      check(href.get.call(url) === url.href, 'Borrowed accessor');
      check(Object.getPrototypeOf(url) === URL.prototype, 'Constructor prototype identity');
      check(Object.getPrototypeOf(params.get) === Function.prototype,
        'Callable prototype stays guest intrinsic');
      const blob = new Blob(['owned local bytes'], { type: 'text/plain' });
      const local = URL.createObjectURL(blob);
      globalThis.localURLFixture = local;
      const text = await (await fetch(local)).text();
      check(text === 'owned local bytes', 'Object URL uses resource owner');
      URL.revokeObjectURL(local);
      let revoked = false;
      try { await fetch(local); } catch (error) { revoked = true; }
      check(revoked, 'Revocation removes owner resource');
      return JSON.stringify({ construction: true, coercion: true, linkedParams: true,
        callbacks: true, iterators: true, borrowedDescriptors: true,
        stableAliases: true, reflection: true, objectURLOwner: true,
        unknownGetterDenied: true });
    })()`,
      'url:bridge-fixture',
    );
    const parsed: unknown = JSON.parse(String(result));
    return parsed;
  } finally {
    session.close();
    Reflect.deleteProperty(URL.prototype, 'unreviewedURLFixture');
  }
}

run()
  .then((result) => Reflect.set(window, '__urlBridgeResult', result))
  .catch((error) =>
    Reflect.set(
      window,
      '__urlBridgeFailure',
      String(error) + (error instanceof Error && error.stack ? '\n' + error.stack : ''),
    ),
  );
