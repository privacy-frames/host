import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, extname } from 'node:path';
import { build } from '../../test/build.ts';
import { chromium, firefox, type Frame } from 'playwright';
import { launch } from '../../test/browser-profile.ts';
import { testProvenance } from '../../test/provenance.ts';

const root = resolve(import.meta.dirname, '../..');
const observer = resolve(import.meta.dirname, 'observer.ts');
const original = await readFile(resolve(root, 'src/runtime/worker.ts'), 'utf8');
const patch = (source: string, from: string, to: string) => {
  assert.equal(source.split(from).length, 2, 'Instrumentation anchor changed: ' + from);
  return source.replace(from, to);
};
let instrumented =
  `import {registry as observedRegistry,fetched as observedFetch,command as observedCommand,trace as observedTrace} from ${JSON.stringify(observer)};\n` +
  original;
instrumented = patch(
  instrumented,
  'const contexts = new ContextRegistry(controllerContextStorage(BASE));',
  'const contexts = observedRegistry(new ContextRegistry(controllerContextStorage(BASE)));\nworker.addEventListener("fetch", observedFetch);\nworker.addEventListener("activate", event => event.waitUntil(observedTrace({kind:"controller-activate"})));',
);
instrumented = patch(
  instrumented,
  "worker.addEventListener('message', (event) => {",
  `worker.addEventListener('message', (event) => {
 if(event.data?.type==='pf-correspondence-command'){
  event.waitUntil((async()=>{const source=event.source&&'id'in event.source?await worker.clients.get(event.source.id):undefined;await observedCommand(event,!!source&&isManagerURL(source.url)&&await hasManagement(source.id));})());return;
 }`,
);

instrumented = patch(
  instrumented,
  '      const documentResponse = await documents.respond(event);',
  '      const documentResponse = await documents.respond(event);\n      if (documentResponse) await observedTrace({kind:"document-response",url:event.request.url,client:event.clientId,resulting:event.resultingClientId,status:documentResponse.status});',
);
const bundles: Record<string, string> = {};
for (const version of ['A', 'B']) {
  const result = await build({
    entryPoints: [resolve(root, 'src/runtime/worker.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    define: { __BUILD_ID__: JSON.stringify('correspondence-' + version) },
    plugins: [
      {
        name: 'correspondence-only',
        setup(builder) {
          builder.onLoad({ filter: /\/src\/runtime\/worker\.ts$/ }, () => ({
            contents: instrumented,
            loader: 'ts',
            resolveDir: resolve(root, 'src/runtime'),
          }));
        },
      },
    ],
  });
  bundles[version] = result.outputFiles[0].text;
}
const guardPath = resolve(root, 'src/runtime/contexts/document-main.ts');
const guardOriginal = await readFile(guardPath, 'utf8');
const guardInstrumented =
  `import {pauseBeforePublication} from ${JSON.stringify(resolve(import.meta.dirname, 'local-guard.ts'))};\n` +
  patch(
    guardOriginal,
    '  await waitForShell();',
    '  await waitForShell();\n  await pauseBeforePublication(id);',
  );
const guardBundle = await build({
  entryPoints: [resolve(root, 'src/runtime/contexts/document-guard.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  define: { __BUILD_ID__: JSON.stringify('local-correspondence') },
  plugins: [
    {
      name: 'local-guard-only',
      setup(builder) {
        builder.onLoad(
          { filter: /\/src\/runtime\/contexts\/document-main\.ts$/ },
          () => ({
            contents: guardInstrumented,
            loader: 'ts',
            resolveDir: resolve(root, 'src/runtime/contexts'),
          }),
        );
      },
    },
  ],
});
const guardCode = guardBundle.outputFiles[0].text;
let version = 'A';
const received: string[] = [];
const receiver = http.createServer((request, response) => {
  received.push(request.url || '/');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.end('independent receiver');
});
await new Promise<void>((done) => receiver.listen(0, '127.0.0.1', done));
const receiveAddress = receiver.address();
if (!receiveAddress || typeof receiveAddress === 'string')
  throw new Error('Receiver not bound');
const receiverURL = 'http://127.0.0.1:' + receiveAddress.port;
const publisher = http.createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/startup-lab/' || request.url === '/startup-lab/index.html') {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      '<!doctype html><title>Startup lab</title><script src="./main.js"></script>',
    );
  } else if (request.url === '/startup-lab/main.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(`
 globalThis.startupMarkers=[]; globalThis.startupChildren=new Map();
 addEventListener('message',event=>{if(event.data?.type==='startup-marker')startupMarkers.push(event.data);});
 globalThis.startChild=label=>{const frame=document.createElement('iframe');frame.id=label;startupChildren.set(label,frame);frame.srcdoc='<!doctype html><script>'+${JSON.stringify(`const startedAt=Date.now();const published=!!parent.document.getElementById(LABEL).contentWindow;let denied=false;try{new WebSocket(${JSON.stringify(receiverURL.replace('http:', 'ws:') + '/dummy')});}catch(error){denied=error.name==='SecurityError';}parent.postMessage({type:'startup-marker',label:LABEL,startedAt,gateMarker:document.documentElement.hasAttribute('data-pf-test-local-guard'),published,prepared:globalThis.privacyHost?.mode==='network-isolated'&&denied,hiddenAuthority:('__pfCorrespondence' in globalThis)},location.origin);fetch(${JSON.stringify(receiverURL + '/private-child-marker')}).catch(()=>{});`)}.replaceAll('LABEL',JSON.stringify(label))+'</'+'script>';document.body.append(frame);return frame.contentWindow===null;};
 globalThis.cancelChild=label=>document.getElementById(label).remove();
 globalThis.startupReady=true;
 `);
  } else {
    response.writeHead(404);
    response.end('absent');
  }
});
await new Promise<void>((done) => publisher.listen(0, '127.0.0.1', done));
const publisherAddress = publisher.address();
if (!publisherAddress || typeof publisherAddress === 'string')
  throw new Error('Publisher not bound');
const publisherURL = 'http://127.0.0.1:' + publisherAddress.port + '/startup-lab/';
const config = JSON.parse(
  await readFile(resolve(root, 'dist-manager/config.json'), 'utf8'),
);
Object.assign(config, {
  managerURL: 'http://127.0.0.1:4210/privacy-frames/',
  runtimeURL: 'http://127.0.0.1:4211/runtime/',
  installationURL: 'http://127.0.0.1:4219/installation/',
  managerOrigins: ['http://127.0.0.1:4210'],
  examples: [],
});
const mime: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const servers: http.Server[] = [];
for (const [port, role, prefix] of [
  [4210, 'manager', '/privacy-frames'],
  [4211, 'runtime', '/runtime'],
  [4219, 'installation', '/installation'],
] as const) {
  const server = http.createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cache-Control', 'no-store');
    try {
      const url = new URL(request.url || '/', 'http://local');
      if (url.pathname === prefix) {
        response.writeHead(301, { Location: prefix + '/' });
        response.end();
        return;
      }
      if (!url.pathname.startsWith(prefix + '/')) throw new Error('Outside profile');
      let relative = decodeURIComponent(url.pathname.slice(prefix.length));
      if (relative === '/') relative = '/index.html';
      if (relative.includes('..')) throw new Error('Invalid path');
      response.setHeader(
        'Content-Type',
        mime[extname(relative)] || 'application/octet-stream',
      );
      if (relative === '/config.json') response.end(JSON.stringify(config));
      else if (role === 'runtime' && relative === '/document-guard.js')
        response.end(guardCode);
      else if (role === 'runtime' && relative === '/sw.js')
        response.end(bundles[version]);
      else response.end(await readFile(resolve(root, 'dist-' + role, '.' + relative)));
    } catch {
      response.writeHead(404);
      response.end('not found');
    }
  });
  await new Promise<void>((done) => server.listen(port, '127.0.0.1', done));
  servers.push(server);
}
async function rpc(bridge: Frame, command: string) {
  return bridge.evaluate(async (command) => {
    const channel = new MessageChannel();
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Observer command timeout')),
        15000,
      );
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        channel.port1.close();
        resolve(event.data);
      };
      navigator.serviceWorker.controller!.postMessage(
        { type: 'pf-correspondence-command', command },
        [channel.port2],
      );
    });
  }, command);
}
async function trace(bridge: Frame) {
  const result = await rpc(bridge, 'trace');
  assert.equal(result.ok, true);
  return result.rows as Record<string, unknown>[];
}
async function heldFrame(app: import('playwright').Page) {
  for (let index = 0; index < 200; index++) {
    for (const frame of app.frames()) {
      if (!frame.url().includes('/__contexts/')) continue;
      const marker = await frame
        .evaluate(() =>
          document.documentElement?.getAttribute('data-pf-test-local-guard'),
        )
        .catch(() => null);
      if (marker) return { frame, marker };
    }
    await new Promise((done) => setTimeout(done, 25));
  }
  throw new Error('No trusted local guard pause observed');
}
async function release(frame: Frame) {
  return frame.evaluate(() => {
    const time = Date.now();
    window.dispatchEvent(new Event('__pf_local_guard_release__'));
    return time;
  });
}
async function upgrade(bridge: Frame) {
  version = 'B';
  const changedAt = await bridge.evaluate(async () => {
    const before = navigator.serviceWorker.controller;
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) throw new Error('No native registration');
    const changed = new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Controller did not change at same URL')),
        5000,
      );
      const check = () => {
        if (navigator.serviceWorker.controller !== before) {
          clearTimeout(timer);
          navigator.serviceWorker.removeEventListener('controllerchange', check);
          resolve(Date.now());
        }
      };
      navigator.serviceWorker.addEventListener('controllerchange', check);
      check();
    });
    await registration.update();
    return changed;
  });
  assert.equal((await rpc(bridge, 'trace')).build, 'correspondence-B');
  return changedAt;
}
function ordered(value: {
  pausedAt: number;
  changedAt: number;
  releasedAt: number;
  startedAt: number;
}) {
  return (
    value.pausedAt <= value.changedAt &&
    value.changedAt <= value.releasedAt &&
    value.releasedAt <= value.startedAt
  );
}

const evidence = {
  date: new Date().toISOString(),
  provenance: await testProvenance(import.meta.url),
  scope:
    'Test-only child guard pause after completed HTTP shell and preparation, before private guarded notification; same-URL native update and actual early-release control. Fixed application probes witness publication/prepared features, not every guard postcondition.',
  instrumentedSourceSHA256: createHash('sha256').update(instrumented).digest('hex'),
  guardSourceSHA256: createHash('sha256').update(guardInstrumented).digest('hex'),
  guardBundleSHA256: createHash('sha256').update(guardCode).digest('hex'),
  localGateSHA256: createHash('sha256')
    .update(await readFile(resolve(import.meta.dirname, 'local-guard.ts')))
    .digest('hex'),
  observerSHA256: createHash('sha256')
    .update(await readFile(observer))
    .digest('hex'),
  bundles: Object.fromEntries(
    Object.entries(bundles).map(([name, source]) => [
      name,
      createHash('sha256').update(source).digest('hex'),
    ]),
  ),
  browsers: [] as unknown[],
};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    for (const schedule of ['upgrade-before-release', 'early-release-control']) {
      version = 'A';
      const browser = await launch(engine);
      const logs: string[] = [];
      let activeBridge: Frame | undefined;
      try {
        const context = await browser.newContext();
        const control = await context.newPage();
        await control.goto(receiverURL + '/positive');
        assert(received.includes('/positive'));
        await control.close();
        received.length = 0;
        const manager = await context.newPage();
        await manager.goto('http://127.0.0.1:4210/privacy-frames/');
        await manager.getByText('Ready to install.', { exact: true }).waitFor();
        await manager.locator('#app-url').fill(publisherURL);
        await manager.locator('#install button').click();
        await manager.locator('[data-app="startup-lab"]').waitFor();
        const opened = context.waitForEvent('page');
        await manager.locator('[data-app="startup-lab"]').click();
        const app = await opened;
        app.on('pageerror', (error) => logs.push(error.message));
        await app.waitForFunction(() => Reflect.get(window, 'startupReady') === true);
        const bridge = manager
          .frames()
          .find((frame) => frame.url().endsWith('/connect.html'));
        assert(bridge);
        activeBridge = bridge;
        assert.equal(
          await app.evaluate(() => Reflect.get(window, 'startChild')('local')),
          true,
        );
        const held = await heldFrame(app);
        const contextId = held.marker.slice(0, held.marker.lastIndexOf(':'));
        const pausedAt = Number(held.marker.slice(held.marker.lastIndexOf(':') + 1));
        assert.equal(
          await app.evaluate(() => Reflect.get(window, 'startupMarkers').length),
          0,
        );
        assert.equal(
          await app.evaluate(
            () =>
              Reflect.get(window, 'startupChildren').get('local').contentWindow === null,
          ),
          true,
        );
        let changedAt: number, releasedAt: number;
        if (schedule === 'upgrade-before-release') {
          changedAt = await upgrade(bridge);
          assert.equal(
            await app.evaluate(() => Reflect.get(window, 'startupMarkers').length),
            0,
          );
          assert.equal(
            await app.evaluate(
              () =>
                Reflect.get(window, 'startupChildren').get('local').contentWindow ===
                null,
            ),
            true,
          );
          releasedAt = await release(held.frame);
        } else releasedAt = await release(held.frame);
        await app.waitForFunction(
          () => Reflect.get(window, 'startupMarkers').length === 1,
          {},
          { timeout: 10000 },
        );
        const probe = await app.evaluate(() => Reflect.get(window, 'startupMarkers')[0]);
        assert.equal(probe.prepared, true);
        assert.equal(probe.published, true);
        assert.equal(probe.hiddenAuthority, false);
        assert.equal(probe.gateMarker, false);
        if (schedule === 'early-release-control') changedAt = await upgrade(bridge);
        const ordering = {
          pausedAt,
          changedAt: changedAt!,
          releasedAt,
          startedAt: probe.startedAt,
        };
        assert.equal(
          ordered(ordering),
          schedule === 'upgrade-before-release',
          'Ordering detector did not distinguish actual schedules',
        );
        const rows = await trace(bridge);
        const bindings = rows.filter((row) => row.kind === 'bind-success');
        assert.equal(new Set(bindings.map((row) => row.client)).size, bindings.length);
        for (const binding of bindings)
          assert(
            rows.some(
              (row) =>
                row.kind === 'native-fetch' &&
                row.trusted === true &&
                row.resulting === binding.client &&
                row.url === binding.url,
            ),
            'Binding did not match a real reserved-client FetchEvent',
          );
        assert(
          rows.some(
            (row) =>
              row.kind === 'document-response' &&
              String(row.url).includes('document-guard.js?context=' + contextId) &&
              row.status === 200,
          ),
          'Missing completed guard-response trace',
        );
        assert.deepEqual(received, []);
        evidence.browsers.push({
          name,
          version: browser.version(),
          schedule,
          contextId,
          ordering,
          orderingAccepted: ordered(ordering),
          probe,
          receiverRequests: [...received],
          trace: rows,
          logs,
        });
        console.log(
          name +
            ' ' +
            schedule +
            ': native upgrade/local prepared pause/publication/ordering control passed',
        );
      } catch (error) {
        evidence.browsers.push({
          name,
          schedule,
          failure: String(error),
          logs,
          receiverRequests: [...received],
          trace: activeBridge
            ? await trace(activeBridge).catch((error) => [{ error: String(error) }])
            : [],
        });
        throw error;
      } finally {
        await browser.close();
      }
    }
  }
} finally {
  for (const server of [...servers, publisher, receiver]) {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
  await writeFile(
    resolve(import.meta.dirname, 'local-results.json'),
    JSON.stringify(evidence, null, 2) + '\n',
  );
}
