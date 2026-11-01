import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';
import { testProvenance } from './provenance.ts';
import { servers } from './server.ts';

// Own the listeners: an independently running server cannot provide the
// in-process upgrade observations required by this fixture.
const hostServer = await servers({ receiver: false, acceptWebSockets: true });

const requests: { path: string; upgrade: boolean }[] = [];
let publisher = '';
const script = () => `
const define = Object.defineProperty;
const own = Object.getOwnPropertyDescriptor;
let leakedRecord = null;
let recordSocket = 'unavailable';
let recordMicrotaskSocket = 'unavailable';
let observedArrays = 0;
let numericWrites = 0;
let completed = false;
const socketMarker = crypto.randomUUID();
function sameOriginSocket(target, context) {
  if (!target) return 'unavailable';
  try {
    const socket = new target.WebSocket('ws://127.0.0.1:4211/runtime/__prototype-upgrade?marker=' + socketMarker + '&context=' + context);
    socket.onerror = () => {};
    socket.onopen = () => socket.close();
    return 'constructed';
  } catch { return 'rejected'; }
}
function observeRecord(item) {
  if (item && typeof item === 'object' && own(item, 'frame') && own(item, 'placeholder') && own(item, 'generation')) {
    leakedRecord = item;
    recordSocket = sameOriginSocket(item.window, 'record-immediate');
    queueMicrotask(() => { recordMicrotaskSocket = sameOriginSocket(item.window, 'record-microtask'); });
  }
}
function observe(value) {
  observedArrays++;
  for (let i = 0; i < value.length; i++) {
    const field = own(value, String(i));
    const item = field && 'value' in field ? field.value : null;
    observeRecord(item);
  }
}
let noOpPreservedDescriptor = false;
let differentWriteDenied = false;
if (window.privacyHost) {
  const before = own(Array.prototype, 'toJSON');
  Array.prototype.toJSON = undefined;
  const after = own(Array.prototype, 'toJSON');
  noOpPreservedDescriptor = !!before && !!after && before.get === after.get && before.set === after.set && before.configurable === after.configurable;
  try { Array.prototype.toJSON = function () { return 'replaced'; }; } catch { differentWriteDenied = true; }
}
Array.prototype.prototypeCompatibilityProbe = function () { return this.length; };
String.prototype.prototypeCompatibilityProbe = function () { return this.length; };
Function.prototype.toString = function () { return 'application diagnostic hook'; };
let thenHookAllowed = false;
let jsonHookAllowed = false;
try { define(Array.prototype, 'then', { configurable: true, get() { observe(this); return undefined; } }); thenHookAllowed = true; } catch {}
try { define(Array.prototype, 'toJSON', { configurable: true, get() { observe(this); return undefined; } }); jsonHookAllowed = true; } catch {}
define(Array.prototype, '0', { configurable: true, get() { return undefined; }, set(value) {
  numericWrites++;
  observeRecord(value);
  observe(this);
  define(this, '0', { value, writable: true, configurable: true, enumerable: true });
} });
const frame = document.createElement('iframe');
// Keep the native initial document alive while its socket controls connect.
// A srcdoc commit can destroy that document before a constructed socket sends.
const childStarted = performance.now();
let childLoadDelay = null;
const childReady = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Prepared child load timed out')), 10000);
  frame.addEventListener('load', () => {
    clearTimeout(timer);
    childLoadDelay = performance.now() - childStarted;
    resolve();
  }, { once: true });
  frame.addEventListener('error', () => {
    clearTimeout(timer);
    reject(new Error('Prepared child failed'));
  }, { once: true });
});
document.body.append(frame);
const pending = frame.contentWindow;
const indexed = window.frames[0];
const pendingSocket = sameOriginSocket(pending, 'pending');
const indexedSocket = sameOriginSocket(indexed, 'indexed');
const mainSocket = sameOriginSocket(window, 'main');
if (!window.privacyHost) {
  const positiveControl = [];
  positiveControl.push({ frame, placeholder: frame, generation: 0, window: frame.contentWindow });
}
setTimeout(async () => {
  await childReady;
  const frameWindow = frame.contentWindow;
  const childSocket = sameOriginSocket(frameWindow, 'prepared-child');
  let childMode = null;
  try { childMode = frameWindow && frameWindow.privacyHost && frameWindow.privacyHost.mode; } catch {}
  let fetchResult = '';
  try { await fetch('${publisher}/collect/fetch?attempt=' + crypto.randomUUID()); fetchResult = 'resolved'; } catch { fetchResult = 'rejected'; }
  let websocket = '';
  try { const socket = new WebSocket('${publisher.replace('http:', 'ws:')}/collect/websocket?attempt=' + crypto.randomUUID()); websocket = 'constructed'; socket.onerror = () => {}; } catch { websocket = 'rejected'; }
  let childFetch = '';
  try { if (frameWindow) { await frameWindow.fetch('${publisher}/collect/child-fetch?attempt=' + crypto.randomUUID()); childFetch = 'resolved'; } } catch { childFetch = 'rejected'; }
  // Native-returned arrays deliberately exercise paths outside source-literal protection.
  let cacheNames = null;
  try { cacheNames = await caches.keys(); } catch {}
  const report = { childLoadDelay, observedArrays, numericWrites, noOpPreservedDescriptor, differentWriteDenied, thenHookAllowed, jsonHookAllowed, leakedRecord: !!leakedRecord, pendingAccessible: !!pending, indexedAccessible: !!indexed, pendingMode: pending && pending.privacyHost && pending.privacyHost.mode || null, indexedMode: indexed && indexed.privacyHost && indexed.privacyHost.mode || null, childMode, fetchResult, websocket, childFetch, cacheNames, socketMarker, sameOriginSockets:{ main:mainSocket, preparedChild:childSocket, pending:pendingSocket, indexed:indexedSocket, record:recordSocket, recordMicrotask:recordMicrotaskSocket }, extensions: [1].prototypeCompatibilityProbe() === 1 && 'x'.prototypeCompatibilityProbe() === 1, functionDiagnostic: (function () {}).toString() };
  completed = true;
  document.querySelector('#result').textContent = JSON.stringify(report);
}, 1200);
setTimeout(() => { if (!completed) document.querySelector('#result').textContent = 'fixture timed out'; }, 10000);
`;
const server = http.createServer((request, response) => {
  const path = request.url || '/';
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  if (path.startsWith('/collect/')) {
    requests.push({ path, upgrade: false });
    response.end('receiver');
  } else if (path === '/app.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(script());
  } else if (path === '/sw.js') {
    response.statusCode = 404;
    response.end('no publisher worker');
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      '<!doctype html><title>Prototype confinement fixture</title><pre id="result">running</pre><script src="./app.js"></script>',
    );
  }
});
server.on('upgrade', (request, socket) => {
  requests.push({ path: request.url || '/', upgrade: true });
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
publisher = `http://127.0.0.1:${address.port}`;
const receipt = {
  provenance: await testProvenance(import.meta.url),
  sameOriginControls: [] as unknown[],
  results: [] as unknown[],
};
try {
  for (const [browserName, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      const calibration = await browser.newContext();
      try {
        const page = await calibration.newPage();
        await page.goto('http://127.0.0.1:4211/runtime/');
        const marker = crypto.randomUUID();
        const outcome = await page.evaluate(
          (marker) =>
            new Promise<string>((resolve) => {
              const policy = document.createElement('meta');
              policy.httpEquiv = 'Content-Security-Policy';
              policy.content = "connect-src 'self'";
              document.head.append(policy);
              try {
                const socket = new WebSocket(
                  'ws://127.0.0.1:4211/runtime/__prototype-upgrade?marker=' + marker,
                );
                socket.onerror = () => resolve('receiver-or-handshake-error');
                socket.onopen = () => {
                  socket.close();
                  resolve('receiver-open');
                };
                setTimeout(() => resolve('timed-out'), 5000);
              } catch {
                resolve('constructor-rejected');
              }
            }),
          marker,
        );
        const upgrades = hostServer.upgrades.filter(
          (entry) => entry.port === 4211 && entry.path.includes(marker),
        );
        receipt.sameOriginControls.push({
          browser: browserName,
          version: browser.version(),
          policy: "connect-src 'self'",
          outcome,
          upgrades,
        });
        assert.equal(outcome, 'receiver-open', 'Native socket control must open');
        assert.equal(
          upgrades.length,
          1,
          'CSP self control must reach the runtime upgrade receiver',
        );
        assert.equal(upgrades[0].origin, 'http://127.0.0.1:4211');
      } finally {
        await calibration.close();
      }
      for (const confined of [false, true]) {
        const context = await browser.newContext();
        try {
          let page = await context.newPage();
          const errors: string[] = [];
          context.on('page', (newPage) =>
            newPage.on('pageerror', (error) => errors.push(error.message)),
          );
          page.on('pageerror', (error) => errors.push(error.message));
          let before = requests.length;
          if (!confined) await page.goto(publisher + '/');
          else {
            await page.goto('http://127.0.0.1:4210/privacy-frames/');
            await page.getByText('Ready to install.', { exact: true }).waitFor();
            await page.locator('#app-url').fill(publisher + '/');
            await page.locator('#install button').click();
            await page
              .getByText('Installed Prototype confinement fixture.', { exact: true })
              .waitFor({ timeout: 150000 });
            before = requests.length;
            const opened = context.waitForEvent('page');
            await page.getByRole('link', { name: 'Open', exact: true }).click();
            page = await opened;
          }
          await page.waitForFunction(
            () => document.querySelector('#result')?.textContent?.startsWith('{'),
            null,
            { timeout: 20000 },
          );
          assert.deepEqual(
            await page.evaluate(() => ({ object: { value: 42 }, array: [1, 2, 3] })),
            { object: { value: 42 }, array: [1, 2, 3] },
          );
          const result: unknown = JSON.parse(await page.locator('#result').innerText());
          assert(result && typeof result === 'object');
          const field = (name: string) =>
            Object.getOwnPropertyDescriptor(result, name)?.value;
          assert.equal(field('extensions'), true);
          assert.equal(field('thenHookAllowed'), !confined);
          assert.equal(field('jsonHookAllowed'), !confined);
          assert.equal(field('functionDiagnostic'), 'application diagnostic hook');
          const marker = field('socketMarker');
          assert.equal(typeof marker, 'string');
          const socketContexts = [
            'main',
            'prepared-child',
            'pending',
            'indexed',
            'record-immediate',
            'record-microtask',
          ];
          if (confined) await delay(250);
          else {
            const deadline = Date.now() + 5000;
            while (
              Date.now() < deadline &&
              (!requests.slice(before).some((entry) => entry.upgrade) ||
                !socketContexts.every((name) =>
                  hostServer.upgrades.some(
                    (entry) =>
                      entry.port === 4211 &&
                      entry.path.includes(String(marker)) &&
                      entry.path.includes('&context=' + name),
                  ),
                ))
            )
              await delay(25);
          }
          const attempts = requests.slice(before);
          const runtimeUpgrades = hostServer.upgrades.filter(
            (entry) => entry.port === 4211 && entry.path.includes(String(marker)),
          );
          receipt.results.push({
            browser: browserName,
            version: browser.version(),
            confined,
            result,
            attempts,
            runtimeUpgrades,
            errors,
          });
          if (confined) {
            assert.equal(field('noOpPreservedDescriptor'), true);
            assert.equal(field('differentWriteDenied'), true);
            assert.equal(field('leakedRecord'), false);
            assert.equal(field('pendingAccessible'), false);
            assert.equal(field('indexedAccessible'), false);
            assert.equal(field('pendingMode'), null);
            assert.equal(field('indexedMode'), null);
            assert.equal(field('childMode'), 'network-isolated');
            assert.equal(field('fetchResult'), 'rejected');
            assert.equal(field('websocket'), 'rejected');
            assert.equal(field('childFetch'), 'rejected');
            assert.deepEqual(field('sameOriginSockets'), {
              main: 'rejected',
              preparedChild: 'rejected',
              pending: 'unavailable',
              indexed: 'unavailable',
              record: 'unavailable',
              recordMicrotask: 'unavailable',
            });
            assert.deepEqual(runtimeUpgrades, []);
            assert.deepEqual(attempts, []);
          } else {
            assert.equal(
              field('leakedRecord'),
              true,
              'Native numeric setter control must intercept a private-shaped record',
            );
            assert.equal(field('pendingAccessible'), true);
            assert.equal(field('indexedAccessible'), true);
            assert.equal(field('fetchResult'), 'resolved');
            assert(
              field('observedArrays') > 0,
              'Native Promise/cache arrays must reach the attacker hook',
            );
            assert(
              attempts.some((attempt) => attempt.path.startsWith('/collect/fetch?')),
            );
            assert(
              attempts.some((attempt) =>
                attempt.path.startsWith('/collect/child-fetch?'),
              ),
            );
            assert(attempts.some((attempt) => attempt.upgrade));
            assert.deepEqual(field('sameOriginSockets'), {
              main: 'constructed',
              preparedChild: 'constructed',
              pending: 'constructed',
              indexed: 'constructed',
              record: 'constructed',
              recordMicrotask: 'constructed',
            });
            for (const name of socketContexts)
              assert(
                runtimeUpgrades.some((entry) => entry.path.includes('&context=' + name)),
                `${browserName}: native socket receiver missing context ${name}`,
              );
          }
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await hostServer.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    'results/contexts/prototype-confinement.json',
    JSON.stringify(receipt, null, 2) + '\n',
  );
}
console.log(
  'Prototype confinement: Chromium and Firefox native controls and confined tasks passed',
);
