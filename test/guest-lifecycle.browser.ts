import { createGuestWindow } from '../src/guest/session.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';

declare global {
  var guestLifecycleResults: Record<string, unknown> | undefined;
}

try {
  const wasm = await (await fetch('/quickjs.wasm')).arrayBuffer();
  const sourceURL = 'https://fixture.invalid/index.html';
  const sources = new Map([
    [
      'initial.js',
      `timeline.push('module-start'); await moduleGate(); timeline.push('module-end');`,
    ],
    ['dynamic.js', `await dynamicGate(); timeline.push('dynamic-end');`],
    [
      'failure.js',
      `await Promise.resolve(); throw new Error('expected module failure');`,
    ],
  ]);
  const catalog: GuestContextCatalog = {
    application: 'lifecycle-' + 'a'.repeat(64),
    generation: 'lifecycle',
    sourceURL,
    documentBase: sourceURL,
    runtimeURL: new URL('/runtime/', location.href).href,
    applicationURL: new URL('/app/', location.href).href,
    engineWasm: wasm,
    workerBootstrap: {
      dedicated: new ArrayBuffer(0),
      shared: new ArrayBuffer(0),
      worklet: new ArrayBuffer(0),
    },
    resources: [...sources].map(([path, source]) => ({
      path,
      url: new URL(path, sourceURL).href,
      contentType: 'text/javascript',
      bytes: new TextEncoder().encode(source).buffer,
    })),
  };
  const session = await createGuestWindow(catalog, window);
  const reported: string[] = [];
  session.environment.options.onError = (error) => reported.push(String(error));
  let releaseModule = () => {};
  let releaseDynamic = () => {};
  session.engine.set(
    'moduleGate',
    () =>
      new Promise<void>((resolve) => {
        releaseModule = resolve;
      }),
  );
  session.engine.set(
    'dynamicGate',
    () =>
      new Promise<void>((resolve) => {
        releaseDynamic = resolve;
      }),
  );
  let rendered = false;
  const rendering = session
    .render(
      `<!doctype html><html><head>
    <script id="initial-module" type="module" src="initial.js"></script>
    <script>
      globalThis.timeline = ['classic'];
      document.addEventListener('DOMContentLoaded', () => timeline.push('DOMContentLoaded:' + document.readyState));
      window.addEventListener('load', () => timeline.push('window-load:' + document.readyState));
      document.getElementById('initial-module').addEventListener('load', () => timeline.push('module-load'));
      new Promise(() => {});
    </script>
    </head><body></body></html>`,
    )
    .then(() => {
      rendered = true;
    });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const before = { rendered, timeline: session.engine.evaluate('timeline.slice()') };
  releaseModule();
  await rendering;
  const initial = session.engine.evaluate('timeline.slice()');
  const dynamic = session.engine.evaluate(`new Promise(resolve => {
    const script = document.createElement('script'); script.type = 'module'; script.src = 'dynamic.js';
    script.onload = () => { timeline.push('dynamic-load'); resolve(timeline.slice()); };
    document.body.appendChild(script);
  })`);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const beforeDynamic = session.engine.evaluate('timeline.slice()');
  releaseDynamic();
  const dynamicTimeline = await dynamic;
  const failure = await session.engine.evaluate(`new Promise(resolve => {
    const script = document.createElement('script'); script.type = 'module'; script.src = 'failure.js';
    script.onload = () => resolve('unexpected-load'); script.onerror = () => resolve('module-error');
    document.body.appendChild(script);
  })`);
  const storedRecord = await session.engine.evaluate(`new Promise((resolve, reject) => {
    const request = indexedDB.open('records', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records', {keyPath: 'id'});
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const record = Object.assign({}, {id: 'document', type: 'content', hash: 42, text: 'stored text'},
        {tx: 7, optional: undefined, nullable: null, sparse: Array(3), bytes: new Uint8Array([4, 5]), binary: 'prefix\\u0000\\ud800suffix'});
      Object.defineProperty(record, 'hiddenObserver', { get() { throw new Error('Hidden property should not be read by storage'); } });
      const transaction = database.transaction('records', 'readwrite');
      try { transaction.objectStore('records').put(record); }
      catch (error) { database.close(); reject(error); return; }
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        const read = database.transaction('records').objectStore('records').get('document');
        read.onerror = () => reject(read.error);
        read.onsuccess = () => {
          const value = read.result;
          resolve({text: value.text, type: value.type, tx: value.tx,
            optional: Object.hasOwn(value, 'optional') && value.optional === undefined,
            nullable: value.nullable, sparse: value.sparse.length === 3 && !(0 in value.sparse),
            bytes: Array.from(value.bytes), binary: value.binary});
          database.close();
        };
      };
    };
  })`);
  window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
  window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
  const syntheticPagehide = session.engine.evaluate(
    'dispatchEvent(new Event("pagehide")); 42',
  );
  session.close();
  globalThis.guestLifecycleResults = {
    before,
    initial,
    beforeDynamic,
    dynamicTimeline,
    failure,
    reported,
    syntheticPagehide,
    storedRecord,
  };
} catch (error) {
  globalThis.guestLifecycleResults = {
    error: String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
}
