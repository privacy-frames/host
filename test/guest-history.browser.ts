import { createGuestWindow } from '../src/guest/session.ts';

declare global {
  var guestHistoryStep: (delta: number) => Promise<unknown>;
  var guestHistoryResult: Record<string, unknown> | undefined;
}

// Run both journeys after the document load boundary; native fragment history
// can replace loading-document entries instead of appending them.
if (document.readyState !== 'complete')
  await new Promise<void>((resolve) =>
    window.addEventListener('load', () => resolve(), { once: true }),
  );

const mode = location.pathname.startsWith('/publisher/') ? 'native' : 'guest';
const reloaded = sessionStorage.getItem('history-fixture-reloaded') === 'true';
const sourceURL = new URL('/publisher/index.html?initial=1', location.href).href;
const source = reloaded
  ? `({
  href: location.href,
  origin,
  documentURL: document.URL,
  documentURI: document.documentURI,
  state: history.state,
})`
  : `(async () => {
  window.addEventListener('popstate', event => {globalThis.historyFixturePopState=event.state;});
  const initial = location.href;
  const initialLength = history.length;
  const destination = new URL('editor?document=2#edit', location.href);
  history.replaceState({value:1}, '', destination);
  const replaced = {href:location.href, state:history.state};
  let conversions=0;
  const next={toString(){conversions++;return new URL('/publisher/alternate?document=3#route',location.href).href;}};
  history.pushState({value:2}, '', next);
  const pushed = {href:location.href, state:history.state, conversions};
  location.href = '#relative';
  location.hash = 'changed';
  await new Promise(resolve => setTimeout(resolve, 20));
  let refused=false;
  try {history.pushState({}, '', 'https://foreign.invalid/editor');} catch(error){refused=error.name==='SecurityError';}
  return {initial,replaced,pushed,refused,steps:history.length-initialLength,href:location.href,origin,documentURL:document.URL,
    documentURI:document.documentURI,state:history.state};
})()`;

const installTraversal = (read: () => unknown) => {
  globalThis.guestHistoryStep = (delta) =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Native history traversal produced no popstate')),
        5000,
      );
      window.addEventListener(
        'popstate',
        () =>
          queueMicrotask(() => {
            clearTimeout(timeout);
            resolve(read());
          }),
        {
          once: true,
        },
      );
      history.go(delta);
    });
};
const readSource = `({href:location.href,documentURL:document.URL,state:history.state,popState:globalThis.historyFixturePopState})`;
try {
  if (mode === 'native') {
    const result: unknown = await new Function('return ' + source)();
    installTraversal(() => new Function('return ' + readSource)());
    globalThis.guestHistoryResult = { mode, reloaded, result, physical: location.href };
  } else {
    const session = await createGuestWindow(
      {
        application: 'history-' + 'a'.repeat(64),
        generation: 'history-fixture',
        sourceURL,
        documentBase: sourceURL,
        runtimeURL: new URL('/', location.href).href,
        applicationURL: new URL('/installed/runtime.html', location.href).href,
        engineWasm: await (await fetch('/quickjs.wasm')).arrayBuffer(),
        workerBootstrap: {
          dedicated: new ArrayBuffer(0),
          shared: new ArrayBuffer(0),
          worklet: new ArrayBuffer(0),
        },
        resources: [],
      },
      window,
    );
    const result = await session.engine.evaluate(source, 'history:fixture');
    installTraversal(() => session.engine.evaluate(readSource, 'history:traversal'));
    globalThis.guestHistoryResult = {
      mode,
      reloaded,
      result,
      physical: location.href,
      nativeState: history.state,
    };
  }
} catch (error) {
  globalThis.guestHistoryResult = { mode, reloaded, error: String(error) };
}
