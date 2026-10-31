import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';
import { servers } from './server.ts';
import { testProvenance } from './provenance.ts';
const publisherOrigin = 'http://127.0.0.1:4350';
const receiverOrigin = 'http://127.0.0.1:4351';
const main = `
localStorage.setItem('document-shared', 'same-app-value');
const retained = new Map();
const originalArray = Array;
let guardedMessageObservations = 0;
const arrayReplacement = function() {};
arrayReplacement.isArray = value => {
  guardedMessageObservations++;
  return originalArray.isArray(value);
};
let bindingDefineRejected = false;
try { Object.defineProperty(globalThis, 'Array', {value:arrayReplacement}); }
catch { bindingDefineRejected = true; }
let bindingAssignmentRejected = false;
try { bindingAssignmentRejected = !Reflect.set(globalThis, 'Array', arrayReplacement); }
catch { bindingAssignmentRejected = true; }
globalThis.fixtureBindingProbe = () => ({bindingDefineRejected,bindingAssignmentRejected,guardedMessageObservations});
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60" onload="setup(evt)"><script>function setup(evt){globalThis.fixtureKind="svg";globalThis.setupTarget=evt.currentTarget.localName;const box=evt.currentTarget.querySelector("rect").getBBox();globalThis.setupBBox={width:box.width,height:box.height};setTimeout(()=>document.querySelector("rect").setAttribute("transform","translate(3 4)"),20)}</script><rect width="10" height="12"/></svg>';
function collect(node) {
  const doc = node.contentDocument;
  const win = doc && doc.defaultView;
  const shape = doc && doc.querySelector('rect');
  const box = shape && shape.getBBox();
  return {
    document: !!doc,
    window: !!win,
    host: win && win.privacyHost,
    shared: win && win.localStorage.getItem('document-shared'),
    kind: win && win.fixtureKind,
    module: win && win.fixtureModule,
    contentType: doc && doc.contentType,
    locationHash:win&&win.location.hash,
    svgDocument: shape ? node.getSVGDocument() === doc : null,
    bbox: box ? { width: box.width, height: box.height } : null,
    transform: shape && shape.getAttribute('transform'),
    setupTarget: win && win.setupTarget,
    setupBBox: win && win.setupBBox,
    nestedReady: win && win.nestedReady,
    nestedHost: win && win.nestedHost,
  };
}
async function openFixture(kind) {
  const node = document.createElement(kind === 'object-svg' ? 'object' : 'iframe');
  globalThis.lastPendingDocument = node;
  node.style.cssText = 'width:180px;height:140px';
  let blob;
  let source;
  if (kind === 'installed') source = 'child.html#initial-section';
  else if (kind === 'nested') source = 'nested-parent.html';
  else if (kind === 'srcdoc')
    node.srcdoc =
      '<p>Srcdoc</p><script>globalThis.fixtureKind="srcdoc"</script><script type="module">await Promise.resolve();globalThis.fixtureModule="module-done"</script>';
  else if (kind === 'data-svg' || kind === 'object-svg')
    source = 'data:image/svg+xml,' + encodeURIComponent(svg);
  else if (kind === 'blob-html') {
    blob = URL.createObjectURL(
      new Blob(['<p>Blob HTML</p><script>globalThis.fixtureKind="blob"</script>'], {
        type: 'text/html',
      }),
    );
    source = blob;
  } else throw new Error('Unknown fixture');
  if (source) {
    if (kind === 'object-svg') {
      node.type = 'image/svg+xml';
      node.data = source;
    } else node.src = source;
  }
  let pending;
  const pendingStates = [];
  let pendingTimer;
  const loaded = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(kind + ' document load timed out')),
      20000,
    );
    node.onerror = () => {
      clearTimeout(timer);
      reject(new Error(kind + ' document error'));
    };
    node.onload = async () => {
      clearTimeout(timer);
      try {
        const atLoad = collect(node);
        await new Promise((resolve) => setTimeout(resolve, 70));
        resolve({ ...collect(node), atLoad });
      } catch (error) {
        reject(error);
      }
    };
  });
  document.body.append(node);
  const root = node.getRootNode();
  pending = {
    documentNull: node.contentDocument === null,
    svgDocumentNull: node.getSVGDocument() === null,
    windowNull: kind === 'object-svg' ? true : node.contentWindow === null,
    rootWindowHidden:
      root === document ||
      !root.querySelector('iframe') ||
      root.querySelector('iframe').contentWindow === null,
  };
  pendingTimer = setInterval(() => {
    if (node.contentDocument !== null) return;
    const currentRoot = node.getRootNode();
    const candidate = currentRoot.querySelector('iframe');
    pendingStates.push({
      privateRoot: !!currentRoot.host,
      documentNull: node.contentDocument === null,
      windowNull: kind === 'object-svg' || node.contentWindow === null,
      svgDocumentNull: node.getSVGDocument() === null,
      rootWindowHidden: !candidate || candidate.contentWindow === null,
    });
  }, 0);
  try {
    const result = await loaded;
    retained.set(kind, node);
    return { pending, pendingStates, result };
  } finally {
    clearInterval(pendingTimer);
    if (blob) URL.revokeObjectURL(blob);
  }
}
async function settledNested() {
  const node = retained.get('nested');
  for (let i = 0; i < 100 && !node.contentDocument.defaultView.nestedReady; i++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  return collect(node);
}
async function networkFixture() {
  const marker = crypto.randomUUID();
  let fetchDenied = false,
    websocketDenied = false;
  try {
    await fetch(${JSON.stringify(receiverOrigin)} + '/dummy-app-' + marker);
  } catch {
    fetchDenied = true;
  }
  try {
    new WebSocket(${JSON.stringify(receiverOrigin.replace('http:', 'ws:') + '/dummy-socket')});
  } catch {
    websocketDenied = true;
  }
  const children = [];
  const inspect = async (win, label) => {
    let fetchDenied = false,
      websocketDenied = false;
    try {
      await win.fetch(${JSON.stringify(receiverOrigin)} + '/dummy-child-' + label + '-' + marker);
    } catch {
      fetchDenied = true;
    }
    try {
      new win.WebSocket(${JSON.stringify(receiverOrigin.replace('http:', 'ws:'))} + '/dummy-child-' + label + '-' + marker);
    } catch {
      websocketDenied = true;
    }
    children.push({ label, fetchDenied, websocketDenied });
    for (const nested of win.document.querySelectorAll('iframe'))
      if (nested.contentWindow) await inspect(nested.contentWindow, label + '-nested');
  };
  for (const [label, node] of retained)
    await inspect(node.contentDocument.defaultView, label);
  return { fetchDenied, websocketDenied, children };
}
async function closeFixture() {
  const node = document.createElement('iframe');
  node.srcdoc = '<p>Unused document</p>';
  document.body.append(node);
  node.remove();
  await new Promise((resolve) => setTimeout(resolve, 100));
  return {
    disconnected: !node.isConnected,
    windowNull: node.contentWindow === null,
    documentNull: node.contentDocument === null,
    svgDocumentNull: node.getSVGDocument() === null,
  };
}
async function replaceFixture() {
  const node = retained.get('installed');
  const loaded = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Source replacement timed out')),
      12000,
    );
    node.onload = () => {
      clearTimeout(timer);
      resolve(collect(node));
    };
    node.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Source replacement failed'));
    };
  });
  node.srcdoc = '<p>Replacement</p><script>globalThis.fixtureKind="replacement"</script>';
  return await loaded;
}
async function refusedFixture() {
  const node = document.createElement('iframe');
  node.src = 'missing-document.html';
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Missing document refusal timed out')),
      20000,
    );
    node.onload = () => {
      clearTimeout(timer);
      resolve({ refused: false });
    };
    node.onerror = () => {
      clearTimeout(timer);
      resolve({ refused: true });
    };
  });
  document.body.append(node);
  try {
    return await result;
  } finally {
    node.remove();
  }
}
globalThis.documentFixture = {
  open: openFixture,
  nested: settledNested,
  network: networkFixture,
  close: closeFixture,
  replace: replaceFixture,
  refused: refusedFixture,
};
globalThis.documentFixtureReady = true;

`;
const files: Record<string, [string, string]> = {
  '/documents/': [
    'text/html',
    '<!doctype html><title>Documents</title><link rel="preload" href="child.html" as="fetch"><link rel="preload" href="child.js" as="script"><link rel="preload" href="nested-parent.html" as="fetch"><link rel="preload" href="nested.html" as="fetch"><script src="main.js"></script><main>Document fixture</main>',
  ],
  '/documents/main.js': ['text/javascript', main],
  '/documents/child.html': [
    'text/html',
    '<!doctype html><title>Installed child</title><script src="child.js"></script><p>Installed child</p>',
  ],
  '/documents/child.js': ['text/javascript', 'globalThis.fixtureKind="installed";'],
  '/documents/nested-parent.html': [
    'text/html',
    '<!doctype html><p>Nested parent</p><script>const nested=document.createElement("iframe");nested.src="nested.html";nested.onload=()=>{globalThis.nestedReady=true;globalThis.nestedHost=nested.contentWindow.privacyHost};document.body.append(nested);globalThis.fixtureKind="nested-parent";</script>',
  ],
  '/documents/nested.html': [
    'text/html',
    '<!doctype html><p>Nested child</p><script>globalThis.fixtureKind="nested-leaf";</script>',
  ],
};
const staticSource =
  '<p>Static inline document</p><script>globalThis.fixtureKind="static-srcdoc"</script>';
const staticSVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="10" height="12"/></svg>';
const attribute = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
files['/static-documents/'] = [
  'text/html',
  '<!doctype html><title>Static documents</title><link rel="preload" href="child.html" as="fetch"><link rel="preload" href="child.js" as="script"><script>globalThis.staticEvents=[];window.addEventListener("load",()=>globalThis.staticLoadCount=globalThis.staticEvents.length);function staticFrameLoaded(event){const node=event.currentTarget;const doc=node.contentDocument;const win=doc.defaultView;globalThis.staticEvents.push({id:node.id,host:win.privacyHost,shared:win.localStorage.getItem("document-shared"),contentType:doc.contentType,svg:doc.contentType==="image/svg+xml"?node.getSVGDocument()===doc:null,kind:win.fixtureKind});}</script><script src="main.js"></script><iframe id="static-inline" srcdoc="' +
    attribute(staticSource) +
    '" onload="staticFrameLoaded(event)"></iframe><iframe id="static-installed" src="child.html" onload="staticFrameLoaded(event)"></iframe><object id="static-svg" type="image/svg+xml" data="' +
    attribute('data:image/svg+xml,' + encodeURIComponent(staticSVG)) +
    '" onload="staticFrameLoaded(event)"></object>',
];
const publisherTraffic: string[] = [];
const requests: string[] = [];
const connections: number[] = [];
const publisher = http.createServer((request, response) => {
  const originalPath = new URL(request.url || '/', publisherOrigin).pathname;
  const path =
    originalPath === '/static-documents/'
      ? originalPath
      : originalPath.replace('/static-documents/', '/documents/');
  publisherTraffic.push(path);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  const file = files[path];
  if (!file) {
    response.writeHead(404).end('Missing fixture');
    return;
  }
  response.setHeader('Content-Type', file[0]);
  response.end(file[1]);
});
const receiver = http.createServer((request, response) => {
  requests.push(request.url || '/');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.end('Dummy receiver control');
});
receiver.on('connection', () => connections.push(Date.now()));
await Promise.all([
  new Promise<void>((resolve) => publisher.listen(4350, '127.0.0.1', resolve)),
  new Promise<void>((resolve) => receiver.listen(4351, '127.0.0.1', resolve)),
]);
const server = await servers({ receiver: false });
const evidence = {
  provenance: await testProvenance(import.meta.url),
  browsers: [] as unknown[],
};
let failure: unknown;
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    if (
      process.env.DOCUMENT_CONTEXT_BROWSER &&
      process.env.DOCUMENT_CONTEXT_BROWSER !== name
    )
      continue;
    const browser = await launch(engine);
    const logs: string[] = [];
    let appPage: import('playwright').Page | undefined;
    const checks: unknown[] = [];
    try {
      const context = await browser.newContext();
      context.setDefaultTimeout(20000);
      await context.addInitScript(() => {
        const audit = { seen: false, removed: 0, connected: false };
        let manifest: Element | null = null;
        Object.defineProperty(window, '__manifestAudit', { value: audit });
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              if (node.nodeType !== 1) continue;
              const candidate =
                node instanceof Element
                  ? node.matches('link[rel~="manifest"]')
                    ? node
                    : node.querySelector('link[rel~="manifest"]')
                  : null;
              if (candidate && !manifest) {
                manifest = candidate;
                audit.seen = true;
              }
            }
            for (const node of record.removedNodes)
              if (manifest && (node === manifest || node.contains(manifest)))
                audit.removed++;
          }
          audit.connected = !!manifest?.isConnected;
        });
        observer.observe(document, { childList: true, subtree: true });
      });
      if (process.env.DOCUMENT_CONTEXT_FIRST_ONLY)
        await context.addInitScript(() => {
          window.addEventListener(
            'message',
            (event) => {
              const data: unknown = event.data;
              if (!data || typeof data !== 'object') return;
              const type = Reflect.get(data, 'type');
              if (typeof type === 'string' && type.startsWith('privacy-document'))
                console.log(
                  'DOCUMENT MESSAGE ' +
                    JSON.stringify({
                      type,
                      origin: event.origin,
                      trusted: event.isTrusted,
                      sourceParent: event.source === window.parent,
                      ports: event.ports.length,
                    }),
                );
            },
            true,
          );
        });
      context.on('console', (message) => {
        logs.push('CONSOLE ' + message.type() + ' ' + message.text());
      });
      context.on('page', (page) =>
        page.on('pageerror', (error) => logs.push(error.stack || error.message)),
      );
      context.on('serviceworker', (worker) =>
        worker.on('console', (message) => logs.push('controller ' + message.text())),
      );
      context.on('request', (request) => {
        if (
          request.url().includes('__contexts') ||
          request.url().includes('document-guard')
        ) {
          logs.push('REQUEST ' + request.method() + ' ' + request.url());
        }
      });
      context.on('response', async (response) => {
        if (
          response.url().includes('__contexts') ||
          response.url().includes('document-guard')
        ) {
          logs.push('RESPONSE ' + response.status() + ' ' + response.url());
          if (response.status() >= 400)
            try {
              logs.push('ERROR BODY ' + (await response.text()));
            } catch {}
        }
      });
      context.on('requestfailed', (request) =>
        logs.push('requestfailed ' + request.url() + ' ' + request.failure()?.errorText),
      );
      const control = await context.newPage();
      await control.goto(receiverOrigin + '/standalone-control');
      assert(requests.includes('/standalone-control'));
      const nativeBindingControl = await control.evaluate(() => {
        const original = Object.getOwnPropertyDescriptor(globalThis, 'Array')!;
        const nativeArray = Array;
        let calls = 0;
        function replacement() {}
        Object.defineProperty(replacement, 'isArray', {
          value(value: unknown) {
            calls++;
            return nativeArray.isArray(value);
          },
        });
        try {
          Object.defineProperty(globalThis, 'Array', { value: replacement });
          const assignmentAccepted = Reflect.set(globalThis, 'Array', replacement);
          const retained = Reflect.get(globalThis, 'Array') === replacement;
          const roundTrip = Reflect.get(globalThis, 'Array').isArray([]);
          return { assignmentAccepted, retained, roundTrip, calls };
        } finally {
          Object.defineProperty(globalThis, 'Array', original);
        }
      });
      assert.deepEqual(nativeBindingControl, {
        assignmentAccepted: true,
        retained: true,
        roundTrip: true,
        calls: 1,
      });
      checks.push({ kind: 'native-binding-control', value: nativeBindingControl });
      await control.close();
      requests.length = 0;
      connections.length = 0;
      const manager = await context.newPage();
      await manager.goto('http://127.0.0.1:4210/privacy-frames/');
      await manager.getByText('Ready to install.', { exact: true }).waitFor();
      await manager.locator('#app-url').fill(publisherOrigin + '/documents/');
      await manager.locator('#install button').click();
      await manager.waitForFunction(() =>
        /^(Installed |Installation refused:)/.test(
          document.querySelector('#status')?.textContent || '',
        ),
      );
      assert.match((await manager.locator('#status').textContent()) || '', /^Installed /);
      const opened = context.waitForEvent('page');
      await manager.locator('[data-app="documents"]').click();
      const app = await opened;
      appPage = app;
      await app.waitForFunction(() => Reflect.get(globalThis, 'documentFixtureReady'));
      for (const kind of [
        'installed',
        'srcdoc',
        'data-svg',
        'blob-html',
        'object-svg',
        'nested',
      ]) {
        if (process.env.DOCUMENT_CONTEXT_FIRST_ONLY && kind !== 'installed') continue;
        console.log(name, 'document case', kind);
        const opening = app
          .evaluate((kind) => Reflect.get(globalThis, 'documentFixture').open(kind), kind)
          .then(
            (value) => ({ ok: true, value }),
            (error) => ({ ok: false, error }),
          );
        if (process.env.DOCUMENT_CONTEXT_FIRST_ONLY) {
          await new Promise((resolve) => setTimeout(resolve, 700));
          for (const frame of app.frames())
            try {
              logs.push(
                'PENDING FRAME ' +
                  JSON.stringify({
                    url: frame.url(),
                    state: await frame.evaluate(() => ({
                      readyState: document.readyState,
                      startup:
                        document.documentElement.getAttribute('data-privacy-startup'),
                      contentType: document.contentType,
                      namespace: document.documentElement.namespaceURI,
                      hostPresent:
                        typeof Reflect.get(globalThis, 'privacyHost') === 'object',
                      entries: Reflect.get(globalThis, 'navigation')?.entries().length,
                    })),
                  }),
              );
            } catch (error) {
              logs.push('PENDING FRAME ERROR ' + String(error));
            }
        }
        const openedDocument = await opening;
        if (!openedDocument.ok || !('value' in openedDocument))
          throw 'error' in openedDocument
            ? openedDocument.error
            : new Error('Missing document result');
        const value = openedDocument.value;
        const bindings = await app.evaluate(() =>
          Reflect.get(globalThis, 'fixtureBindingProbe')(),
        );
        assert.equal(bindings.bindingDefineRejected, true);
        assert.equal(bindings.bindingAssignmentRejected, true);
        assert.equal(bindings.guardedMessageObservations, 0);
        checks.push({ kind, value });
        console.log(name, kind, JSON.stringify(value));
        assert.equal(value.pending.documentNull, true);
        assert.equal(value.pending.windowNull, true);
        assert.equal(value.pending.svgDocumentNull, true);
        for (const state of value.pendingStates) {
          assert.equal(state.documentNull, true);
          assert.equal(state.windowNull, true);
          assert.equal(state.svgDocumentNull, true);
          assert.equal(state.rootWindowHidden, true);
        }
        assert.equal(value.pending.rootWindowHidden, true);
        assert.equal(value.result.atLoad.document, true);
        assert.equal(value.result.atLoad.window, true);
        assert.equal(value.result.atLoad.host.mode, 'network-isolated');
        assert.equal(value.result.atLoad.shared, 'same-app-value');
        assert.equal(value.result.host.mode, 'network-isolated');
        assert.equal(value.result.shared, 'same-app-value');
        if (kind === 'installed')
          assert.equal(value.result.locationHash, '#initial-section');
        if (kind === 'srcdoc') assert.equal(value.result.module, 'module-done');
        if (kind.includes('svg')) {
          assert.equal(value.result.contentType, 'image/svg+xml');
          assert.equal(value.result.svgDocument, true);
          assert.deepEqual(value.result.bbox, { width: 10, height: 12 });
          assert.equal(value.result.setupTarget, 'svg');
          assert.deepEqual(value.result.setupBBox, { width: 10, height: 12 });
          assert.equal(value.result.transform, 'translate(3 4)');
        }
      }
      if (process.env.DOCUMENT_CONTEXT_FIRST_ONLY) {
        evidence.browsers.push({ name, version: browser.version(), checks, logs });
        await context.close();
        continue;
      }
      const nested = await app.evaluate(() =>
        Reflect.get(globalThis, 'documentFixture').nested(),
      );
      assert.equal(nested.nestedReady, true);
      assert.equal(nested.nestedHost.application, nested.host.application);
      checks.push({ kind: 'nested-ready', value: nested });
      const network = await app.evaluate(() =>
        Reflect.get(globalThis, 'documentFixture').network(),
      );
      assert.equal(network.fetchDenied, true);
      assert.equal(network.websocketDenied, true);
      assert(network.children.length >= 7);
      assert(
        network.children.every(
          (child: { fetchDenied: boolean; websocketDenied: boolean }) =>
            child.fetchDenied && child.websocketDenied,
        ),
      );
      assert.deepEqual(requests, []);
      assert.deepEqual(connections, []);
      checks.push({ kind: 'network', value: network });
      const refused = await app.evaluate(() =>
        Reflect.get(globalThis, 'documentFixture').refused(),
      );
      assert.deepEqual(refused, { refused: true });
      assert(!publisherTraffic.includes('/documents/missing-document.html'));
      checks.push({ kind: 'missing-document-refused', value: refused });
      const replaced = await app.evaluate(() =>
        Reflect.get(globalThis, 'documentFixture').replace(),
      );
      assert.equal(replaced.kind, 'replacement');
      checks.push({ kind: 'replacement', value: replaced });
      const closed = await app.evaluate(() =>
        Reflect.get(globalThis, 'documentFixture').close(),
      );
      assert.deepEqual(closed, {
        disconnected: true,
        windowNull: true,
        documentNull: true,
        svgDocumentNull: true,
      });
      checks.push({ kind: 'close', value: closed });
      await context.setOffline(true);
      for (const kind of ['srcdoc', 'installed']) {
        const offline = await app.evaluate(
          (kind) => Reflect.get(globalThis, 'documentFixture').open(kind),
          kind,
        );
        assert.equal(offline.result.atLoad.host.mode, 'network-isolated');
        if (kind === 'installed')
          assert.equal(offline.result.locationHash, '#initial-section');
        if (kind === 'srcdoc') assert.equal(offline.result.module, 'module-done');
        else assert.equal(offline.result.kind, 'installed');
        checks.push({ kind: 'offline-' + kind, value: offline });
      }
      await context.setOffline(false);
      assert.deepEqual(requests, []);
      const dynamicManifest = await app.evaluate(() =>
        Reflect.get(globalThis, '__manifestAudit'),
      );
      assert.deepEqual(dynamicManifest, { seen: true, removed: 0, connected: true });
      checks.push({ kind: 'manifest', value: dynamicManifest });
      await manager.locator('#app-url').fill(publisherOrigin + '/static-documents/');
      await manager.locator('#install button').click();
      await manager.locator('[data-app="static-documents"]').waitFor();
      const staticOpened = context.waitForEvent('page');
      await manager.locator('[data-app="static-documents"]').click();
      const staticApp = await staticOpened;
      appPage = staticApp;
      await staticApp.waitForFunction(
        () =>
          Reflect.get(globalThis, 'staticEvents')?.length === 3 &&
          Reflect.get(globalThis, 'staticLoadCount') === 3,
      );
      const staticResult = await staticApp.evaluate(() => ({
        events: Reflect.get(globalThis, 'staticEvents'),
        windowLoadCount: Reflect.get(globalThis, 'staticLoadCount'),
        manifest: Reflect.get(globalThis, '__manifestAudit'),
      }));
      assert.deepEqual(staticResult.manifest, {
        seen: true,
        removed: 0,
        connected: true,
      });
      assert.equal(staticResult.events.length, 3);
      assert.equal(staticResult.windowLoadCount, 3);
      for (const event of staticResult.events) {
        assert.equal(event.host.mode, 'network-isolated');
        assert.equal(event.shared, 'same-app-value');
      }
      assert.equal(
        staticResult.events.find((event: { id: string }) => event.id === 'static-inline')
          .kind,
        'static-srcdoc',
      );
      assert.equal(
        staticResult.events.find(
          (event: { id: string }) => event.id === 'static-installed',
        ).kind,
        'installed',
      );
      assert.equal(
        staticResult.events.find((event: { id: string }) => event.id === 'static-svg')
          .contentType,
        'image/svg+xml',
      );
      assert.equal(
        staticResult.events.find((event: { id: string }) => event.id === 'static-svg')
          .svg,
        true,
      );
      checks.push({ kind: 'static-contexts', value: staticResult });
      await context.close();
      evidence.browsers.push({
        name,
        version: browser.version(),
        checks,
        logs,
        requests: [...requests],
        connections: [...connections],
        publisherTraffic: [...publisherTraffic],
      });
    } catch (error) {
      evidence.browsers.push({
        name,
        version: browser.version(),
        checks,
        logs,
        failure: String(error),
        requests: [...requests],
        connections: [...connections],
      });
      if (appPage)
        for (const child of appPage.frames())
          try {
            logs.push(
              'FRAME ' +
                JSON.stringify({
                  url: child.url(),
                  state: await child.evaluate(() => ({
                    readyState: document.readyState,
                    startup:
                      document.documentElement.getAttribute('data-privacy-startup'),
                    contentType: document.contentType,
                    namespace: document.documentElement.namespaceURI,
                    hostPresent:
                      typeof Reflect.get(globalThis, 'privacyHost') === 'object',
                    entries: Reflect.get(globalThis, 'navigation')?.entries().length,
                  })),
                }),
            );
          } catch (debugError) {
            logs.push('FRAME ERROR ' + String(debugError));
          }
      if (appPage)
        try {
          const pending = await appPage.evaluate(() => {
            const node = Reflect.get(globalThis, 'lastPendingDocument');
            const root = node?.getRootNode();
            return {
              body: document.body.innerHTML,
              staticEvents: Reflect.get(globalThis, 'staticEvents'),
              staticLoadCount: Reflect.get(globalThis, 'staticLoadCount'),
              node: node?.outerHTML,
              connected: node?.isConnected,
              parent: node?.parentNode?.nodeName,
              root: root?.nodeName,
              window: !!node?.contentWindow,
              document: !!node?.contentDocument,
              host: root?.host?.outerHTML,
            };
          });
          logs.push('PENDING ' + JSON.stringify(pending));
        } catch (debugError) {
          logs.push('PENDING ERROR ' + String(debugError));
        }
      console.error(name, 'DOCUMENT FAILURE', error, JSON.stringify(logs, null, 2));
      throw error;
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  failure = error;
} finally {
  await server.close();
  await Promise.all(
    [publisher, receiver].map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    'results/contexts/document-contexts.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
}
for (const entry of evidence.browsers) {
  assert(entry !== null && typeof entry === 'object');
  const name = Reflect.get(entry, 'name');
  assert(typeof name === 'string');
  await writeFile(
    'results/contexts/document-contexts-' + name + '.json',
    JSON.stringify({ provenance: evidence.provenance, browsers: [entry] }, null, 2) +
      '\n',
  );
}
if (failure) throw failure;
