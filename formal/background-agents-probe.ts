import { fixtureControllerMessages } from './fixtures/controller-messages.ts';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';
import { trustedPolicyPlugin } from '../scripts/trusted-policy.ts';
import { response } from '../src/runtime/response-policy.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = await build({
  absWorkingDir: root,
  stdin: {
    resolveDir: root,
    loader: 'ts',
    contents: `
      import { prepareWindowRealm } from './src/runtime/contexts/window-realm.ts';
      const applicationURL = location.origin + location.pathname;
      const realm = prepareWindowRealm({
        application: 'background-probe', applicationURL,
        scriptNonce: 'fixture', enableDocumentContexts: true,
      });
      realm.admitContent({installationGeneration:'generation', aliases:[], source:applicationURL});
      globalThis.prepared = true;
    `,
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  plugins: [await trustedPolicyPlugin(root)],
});
const sw = `
${fixtureControllerMessages()}
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
  self.addEventListener('sync', event => {
    event.waitUntil(fetch('/receiver?sync=' + encodeURIComponent(event.tag)));
  });
  const setup = new Set(['/', '/native', '/prepared/', '/fixture.js']);
  self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    const allowed = setup.has(url.pathname) && !url.search && event.request.method === 'GET';
    event.respondWith(allowed ? fetch(event.request) : new Response('SW blocked', {status:403}));
  });
`;
const traffic = [];
let origin;
const server = http.createServer(async (request, reply) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  traffic.push({ url: request.url, method: request.method, body });
  reply.setHeader('Cache-Control', 'no-store');
  if (request.url === '/sw.js') {
    reply.setHeader('Content-Type', 'text/javascript');
    reply.end(sw);
    return;
  }
  if (request.url === '/fixture.js') {
    reply.setHeader('Content-Type', 'text/javascript');
    reply.end(fixture.outputFiles[0].text);
    return;
  }
  if (request.url === '/prepared/') {
    for (const [name, value] of response('', 'text/html', 200, {
      scriptNonce: 'fixture',
      controllerSource: origin + '/sw.js',
      workerSource: origin + '/__contexts/',
      frameSource: origin + '/__contexts/',
    }).headers)
      reply.setHeader(name, value);
    reply.end('<!doctype html><script nonce="fixture" src="/fixture.js"></script>');
    return;
  }
  reply.setHeader('Content-Type', 'text/html');
  reply.end('<!doctype html><title>Native registration observer</title>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
origin = 'http://127.0.0.1:' + server.address().port;
const receipt = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  testedAt: new Date().toISOString(),
  origin,
  scope:
    'Actual prepareWindowRealm after seeding an active native origin-wide registration. Native acquisition, prototype/brand recovery, sync scheduling and background fetch are distinguished. Missing/failed positive controls are unverified, not contained.',
  runnerSHA256: createHash('sha256')
    .update(await readFile(fileURLToPath(import.meta.url)))
    .digest('hex'),
  fixtureSHA256: createHash('sha256')
    .update(fixture.outputFiles[0].contents)
    .digest('hex'),
  sourceHashes: Object.fromEntries(
    await Promise.all(
      [
        'formal/fixtures/controller-messages.ts',
        'src/runtime/enforcement/effects.ts',
        'src/runtime/publisher/client.ts',
        'src/runtime/contexts/window-realm.ts',
      ].map(async (path) => [
        path,
        createHash('sha256')
          .update(await readFile(join(root, path)))
          .digest('hex'),
      ]),
    ),
  ),
  rows: [],
  traffic,
};
try {
  for (const [name, engine] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ]) {
    const browser = await engine.launch(
      name === 'chromium'
        ? {
            executablePath: chromium.executablePath(),
            args: ['--enable-automation'],
            ignoreDefaultArgs: ['--disable-background-networking'],
          }
        : {},
    );
    try {
      const context = await browser.newContext();
      const observer = await context.newPage();
      await observer.goto(origin + '/native');
      await observer.evaluate(async () => {
        await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
      });
      const controlMarker = 'native-' + randomUUID();
      const native = await observer.evaluate(async (marker) => {
        const registration = await navigator.serviceWorker.ready;
        const result = {
          nativeBrand: registration instanceof ServiceWorkerRegistration,
          nativeList: (await navigator.serviceWorker.getRegistrations()).length,
          backgroundFetchPresent: 'backgroundFetch' in registration,
          syncPresent: 'sync' in registration,
          periodicSyncPresent: 'periodicSync' in registration,
          sync: null,
          backgroundFetch: null,
          periodicSync: null,
        };
        if (registration.sync) {
          try {
            await registration.sync.register(marker);
            result.sync = 'registered';
          } catch (error) {
            result.sync = error.name + ': ' + error.message;
          }
        }
        if (registration.backgroundFetch) {
          try {
            await registration.backgroundFetch.fetch(
              marker,
              [location.origin + '/receiver?background=' + marker],
              { title: 'Native background receiver control', downloadTotal: 100 },
            );
            result.backgroundFetch = 'registered';
          } catch (error) {
            result.backgroundFetch = error.name + ': ' + error.message;
          }
        }
        if (registration.periodicSync) {
          try {
            await registration.periodicSync.register(marker, { minInterval: 86400000 });
            result.periodicSync = 'registered';
          } catch (error) {
            result.periodicSync = error.name + ': ' + error.message;
          }
        }
        return result;
      }, controlMarker);
      if (name === 'chromium') {
        const deadline = Date.now() + 10000;
        for (const key of ['sync', 'background']) {
          while (
            !traffic.some((item) => item.url === '/receiver?' + key + '=' + controlMarker)
          ) {
            assert(Date.now() < deadline, 'Native receiver control inactive: ' + key);
            await observer.waitForTimeout(100);
          }
        }
      }
      const page = await context.newPage();
      const navigation = await page.goto(origin + '/prepared/');
      await page.waitForFunction(() => globalThis.prepared);
      const marker = 'private-' + randomUUID();
      const start = traffic.length;
      const prepared = await page.evaluate(async (marker) => {
        const results = {};
        async function attempt(name, action) {
          try {
            results[name] = { outcome: 'returned', value: await action() };
          } catch (error) {
            results[name] = { outcome: error.name, message: error.message };
          }
        }
        const container = navigator.serviceWorker;
        await attempt('list', async () => (await container.getRegistrations()).length);
        await attempt('lookup', async () =>
          Boolean(await container.getRegistration('/')),
        );
        await attempt(
          'navigatorGetter',
          () =>
            Object.getOwnPropertyDescriptor(
              Navigator.prototype,
              'serviceWorker',
            ).get.call(navigator) === container,
        );
        await attempt('containerConstructor', () => new ServiceWorkerContainer());
        await attempt('registrationConstructor', () => new ServiceWorkerRegistration());
        await attempt('prototypeList', () =>
          ServiceWorkerContainer.prototype.getRegistrations.call(container),
        );
        await attempt('prototypeLookup', () =>
          ServiceWorkerContainer.prototype.getRegistration.call(container, '/'),
        );
        await attempt('prototypeReady', () =>
          Object.getOwnPropertyDescriptor(
            ServiceWorkerContainer.prototype,
            'ready',
          ).get.call(container),
        );
        await attempt('prototypeController', () =>
          Object.getOwnPropertyDescriptor(
            ServiceWorkerContainer.prototype,
            'controller',
          ).get.call(container),
        );
        for (const key of ['backgroundFetch', 'sync', 'periodicSync']) {
          if (!(key in ServiceWorkerRegistration.prototype)) {
            results[key] = { outcome: 'not-exposed' };
            continue;
          }
          await attempt(key, () =>
            Object.getOwnPropertyDescriptor(
              ServiceWorkerRegistration.prototype,
              key,
            ).get.call(Object.create(ServiceWorkerRegistration.prototype)),
          );
        }
        await attempt('register', () => container.register('/sw.js?' + marker));
        await attempt('ordinaryFetch', async () =>
          (await fetch('/receiver?' + marker)).text(),
        );
        return results;
      }, marker);
      assert.deepEqual(prepared.list, { outcome: 'returned', value: 0 });
      assert.deepEqual(prepared.lookup, { outcome: 'returned', value: false });
      assert.equal(prepared.navigatorGetter.value, true);
      for (const key of [
        'containerConstructor',
        'registrationConstructor',
        'prototypeReady',
        'prototypeController',
      ])
        assert.equal(prepared[key].outcome, 'TypeError', key);
      for (const key of ['prototypeList', 'prototypeLookup', 'register'])
        assert.equal(prepared[key].outcome, 'SecurityError', key);
      assert.equal(prepared.ordinaryFetch.outcome, 'TypeError');
      for (const key of ['backgroundFetch', 'sync', 'periodicSync'])
        assert(['TypeError', 'not-exposed'].includes(prepared[key].outcome), key);
      await page.waitForTimeout(1500);
      const after = await observer.evaluate(async (marker) => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const registration = registrations[0];
        return {
          nativeList: registrations.length,
          privateSyncTagPresent: registration.sync
            ? (await registration.sync.getTags()).includes(marker)
            : null,
          privateBackgroundPresent: registration.backgroundFetch
            ? Boolean(await registration.backgroundFetch.get(marker))
            : null,
        };
      }, marker);
      assert.equal(after.nativeList, 1);
      assert.notEqual(after.privateSyncTagPresent, true);
      assert.notEqual(after.privateBackgroundPresent, true);
      const privateTraffic = traffic
        .slice(start)
        .filter((item) => JSON.stringify(item).includes(marker));
      assert.equal(privateTraffic.length, 0);
      let actualArguments;
      if (name === 'chromium') {
        const session = await context.newCDPSession(observer);
        actualArguments = (await session.send('Browser.getBrowserCommandLine')).arguments;
        assert(actualArguments[0].endsWith('/chrome'));
      }
      const row = {
        name,
        actualArguments,
        version: browser.version(),
        headers: await navigation.allHeaders(),
        native,
        nativeReceiverTraffic: traffic.filter((item) =>
          JSON.stringify(item).includes(controlMarker),
        ),
        prepared,
        after,
        privateTraffic,
      };
      receipt.rows.push(row);
      console.log(JSON.stringify(row));
    } finally {
      await browser.close();
    }
  }
  receipt.completed = true;
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await writeFile(
    new URL('evidence/background-agents.json', import.meta.url),
    JSON.stringify(receipt, null, 2) + '\n',
  );
}
