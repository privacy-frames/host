import http from 'node:http';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from './build.ts';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';
import { testProvenance } from './provenance.ts';

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    sourcefile: 'popup-receivers-fixture.js',
    contents: `
import { createPolicyTools } from './src/runtime/enforcement/native.ts';
import { createPopupFactory } from './src/runtime/contexts/popup-factory.ts';
// Explicit fixture transport; production uses the private controller channel.
const fixtureFetch = fetch;
const documentControl = async (operation, payload) => {
  const response = await fixtureFetch('/fixture/' + operation, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Fixture command refused');
  return response.json();
};
const nativeOpen = window.open;
const apply = Reflect.apply;
let privateWindow;
window.open = function(...args) {
  privateWindow = apply(nativeOpen, window, args);
  if (privateWindow) {
    Object.defineProperty(privateWindow.Object.prototype, '__popupInheritedGetter', {
      configurable: true, get() { return this; },
    });
    Object.defineProperty(privateWindow.Object.prototype, '__popupInheritedMethod', {
      configurable: true, value: function() { return this; },
    });
  }
  return privateWindow;
};
const open = createPopupFactory(createPolicyTools(), {
  documentControl,
  applicationURL: location.origin + '/app/',
  baseURL: () => location.href,
  resources: { mapURL: String, isInstalledURL: () => false, sourceURL: () => undefined },
});
window.runPopupReceivers = async () => {
  const facade = open('about:blank');
  if (!facade || !privateWindow) throw new Error('Native popup unavailable');
  const pending = {
    rawGetterControl: Reflect.get(privateWindow, '__popupInheritedGetter', privateWindow) === privateWindow,
    documentUnavailable: facade.document === null,
    inheritedGetterUnavailable: facade.__popupInheritedGetter === undefined,
    inheritedMethodUnavailable: facade.__popupInheritedMethod === undefined,
  };
  // Exercise the captured native postMessage while the popup is still pending.
  const echoed = new Promise(resolve => addEventListener('message', function reply(event) {
    if (event.source !== privateWindow || event.data?.type !== 'fixture-echo') return;
    removeEventListener('message', reply);
    resolve(event.data.value);
  }));
  facade.postMessage({ type: 'fixture-echo', value: 'queued-native-message' }, location.origin);
  await new Promise((resolve, reject) => {
    facade.onload = resolve;
    facade.onerror = () => reject(new Error('Popup protocol failed'));
  });
  // Both deliberately unsafe controls and the real factory use this same child.
  const rawGetter = Reflect.get(privateWindow, '__popupInheritedGetter', privateWindow);
  const rawMethod = Reflect.get(privateWindow, '__popupInheritedMethod', privateWindow);
  const rawMethodResult = Reflect.apply(rawMethod, privateWindow, []);
  Reflect.set(privateWindow, '__popupInheritedSetter', 1, privateWindow);
  const rawSetterResult = privateWindow.readSetterReceiver();
  const safeGetter = facade.__popupInheritedGetter;
  const safeMethodResult = facade.__popupInheritedMethod();
  facade.__popupInheritedSetter = 2;
  const safeSetterResult = facade.readSetterReceiver();
  facade.focus();
  const result = {
    pending,
    unsafeControl: {
      getterRaw: rawGetter === privateWindow,
      methodRaw: rawMethodResult === privateWindow,
      setterRaw: rawSetterResult === privateWindow,
    },
    guarded: {
      getterFacade: safeGetter === facade,
      methodFacade: safeMethodResult === facade,
      setterFacade: safeSetterResult === facade,
      noRawReference: [safeGetter, safeMethodResult, safeSetterResult].every(value => value !== privateWindow),
      nativeDocument: facade.document === privateWindow.document,
      queuedNativeMessage: await echoed,
      openState: facade.closed === false,
    },
  };
  facade.close();
  result.guarded.closedState = facade.closed === true;
  return result;
};`,
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
});
const script = bundle.outputFiles[0].text;
const registrations = new Map<string, Record<string, unknown>>();
let origin = '';
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', origin);
  if (url.pathname === '/fixture.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end(script);
    return;
  }
  if (url.pathname === '/fixture/close') {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const registration = registrations.get(body.id);
    assert(registration);
    assert.equal(body.parentToken, registration.parentToken);
    registration.closed = true;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ closed: true }));
    return;
  }
  if (url.pathname === '/fixture/create') {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(input.carrier, 'popup');
    const id = randomUUID();
    const registration = {
      id,
      nonce: randomUUID(),
      parentToken: randomUUID(),
      carrier: 'popup',
      popup: input.popup,
      kind: 'html',
      url: `${origin}/app/__contexts/${id}/document.html`,
    };
    registrations.set(id, registration);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(registration));
    return;
  }
  const child = url.pathname.match(/^\/app\/__contexts\/([^/]+)\/document.html$/);
  if (child) {
    const registration = registrations.get(child[1]);
    assert(registration);
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(`<!doctype html><title>Prepared popup protocol fixture</title><script>
const config = ${JSON.stringify(registration)};
const parentWindow = opener;
let setterReceiver;
Object.defineProperty(Object.prototype, '__popupInheritedGetter', { configurable: true, get() { return this; } });
Object.defineProperty(Object.prototype, '__popupInheritedMethod', { configurable: true, value: function() { return this; } });
Object.defineProperty(Object.prototype, '__popupInheritedSetter', { configurable: true, set(value) { setterReceiver = this; } });
window.readSetterReceiver = () => setterReceiver;
addEventListener('message', event => {
  if (event.source !== parentWindow || event.origin !== location.origin) return;
  const value = event.data;
  if (value?.type === 'fixture-echo') {
    parentWindow.postMessage(value, location.origin);
    return;
  }
  if (value?.type !== 'privacy-document-port' || value.id !== config.id || value.parentToken !== config.parentToken) return;
  const port = event.ports[0];
  port.onmessage = event => { if (event.data?.type === 'published') port.postMessage({ type: 'loaded' }); };
  port.start();
});
parentWindow.postMessage({ type: 'privacy-document-guarded', id: config.id, parentToken: config.parentToken }, location.origin);
</script>`);
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(
    '<!doctype html><title>Popup receiver test</title><script src="/fixture.js"></script>',
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
origin = `http://127.0.0.1:${address.port}`;
const receipt = {
  provenance: await testProvenance(import.meta.url),
  fixtureSHA256: createHash('sha256').update(script).digest('hex'),
  scope:
    'Actual popup factory and native child Window with trusted protocol stub; no full confinement or controller admission claim',
  browsers: [] as unknown[],
};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      const page = await browser.newPage();
      await page.goto(origin);
      const result = await page.evaluate(() =>
        Reflect.get(window, 'runPopupReceivers')(),
      );
      assert.deepEqual(result.pending, {
        rawGetterControl: true,
        documentUnavailable: true,
        inheritedGetterUnavailable: true,
        inheritedMethodUnavailable: true,
      });
      assert.deepEqual(result.unsafeControl, {
        getterRaw: true,
        methodRaw: true,
        setterRaw: true,
      });
      assert.deepEqual(result.guarded, {
        getterFacade: true,
        methodFacade: true,
        setterFacade: true,
        noRawReference: true,
        nativeDocument: true,
        queuedNativeMessage: 'queued-native-message',
        openState: true,
        closedState: true,
      });
      receipt.browsers.push({ name, version: browser.version(), result });
      console.log(name, 'prepared popup receiver checks passed');
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    'results/contexts/popup-receivers.json',
    JSON.stringify(receipt, null, 2) + '\n',
  );
}
