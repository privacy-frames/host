import assert from 'node:assert/strict';
import http from 'node:http';
import { rm, writeFile } from 'node:fs/promises';
import { chromium, firefox, type Page } from 'playwright';
import { launch } from '../../test/browser-profile.ts';
import { servers } from '../../test/server.ts';
import { testProvenance } from '../../test/provenance.ts';
import { provideResourceList } from '../../test/resource-list-input.ts';

// This receiver records all HTTP requests, including fixed trusted script URLs.
// The application never chooses a destination or transmits a marker payload.
const received: Array<{ path: string; time: number }> = [];
const workerScripts: Record<string, string> = {
  '/worker.js':
    'importScripts("classic-dependency.js");postMessage(globalThis.classicReady);',
  '/classic-dependency.js': 'globalThis.classicReady="ready";',
  '/dynamic-worker.js':
    'import("./module-dependency.js").then(({ready})=>postMessage(ready));',
  '/module-worker.js': 'import {ready} from "./module-dependency.js";postMessage(ready);',
  '/module-dependency.js': 'export const ready="ready";',
};
const main = `
document.querySelector('#run').onclick = () => {
  if (document.querySelector('#private').value !== '1') {
    document.querySelector('#result').textContent = 'skipped';
    return;
  }
  const type = document.querySelector('#worker-type').value;
  const source = type === 'module' ? './module-worker.js'
    : type === 'classic-dynamic' ? './dynamic-worker.js' : './worker.js';
  const worker = new Worker(source, {type:type === 'module' ? 'module' : 'classic'});
  globalThis.maintenanceWorker = worker;
  worker.onmessage = event => {
    document.querySelector('#result').textContent = event.data;
    if (!document.querySelector('#keep-worker').checked) worker.terminate();
  };
};
globalThis.maintenanceProbeReady = true;`;
const html = `<!doctype html><title>Maintenance probe</title>
<link rel="icon" href="data:,">
<input id="private" aria-label="Private bit"><button id="run">Run</button>
<input id="keep-worker" type="checkbox" aria-label="Keep worker alive">
<select id="worker-type"><option value="classic">Classic</option><option value="classic-dynamic">Classic dynamic import</option><option value="module">Module</option></select>
<output id="result"></output><script src="./main.js"></script>`;
const nativeServiceWorker = `
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
const scripts = ${JSON.stringify(workerScripts)};
self.addEventListener('fetch', event => {
  const script = scripts[new URL(event.request.url).pathname];
  if (script)
    event.respondWith(new Response(script, {
      headers: {'Content-Type': 'text/javascript'}
    }));
});`;
const publisher = http.createServer((request, response) => {
  const path = request.url || '/';
  received.push({ path, time: Date.now() });
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Access-Control-Allow-Origin', '*');
  if (path === '/main.js' || path in workerScripts || path === '/sw.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(
      path === '/main.js'
        ? main
        : path === '/sw.js'
          ? nativeServiceWorker
          : workerScripts[path],
    );
  } else if (path === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end(html);
  } else {
    response.writeHead(404).end();
  }
});
await new Promise<void>((resolve) => publisher.listen(0, '127.0.0.1', resolve));
const address = publisher.address();
assert(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const host = await servers({ receiver: false });
const samples: object[] = [];
const groups: object[] = [];
const violations: object[] = [];
const missingNativeControls: object[] = [];
const provenance = await testProvenance(import.meta.url);
const forcedStaleAgeCheck = process.env.PF_STARTUP_STALE === '1';
const receipt = new URL(
  forcedStaleAgeCheck
    ? './service-worker-startup-stale.json'
    : './service-worker-maintenance.json',
  import.meta.url,
);
await rm(receipt, { force: true });
let completedAt: string | null = null;
let failure: string | undefined;

async function quiet(page: Page) {
  // Require a measured quiet interval after delayed startup checks. This remains
  // a bounded observation, not proof that all browser jobs have terminated.
  let count = host.traffic.length + received.length;
  let changed = Date.now();
  const deadline = Date.now() + 20_000;
  while (Date.now() - changed < 3000) {
    assert(Date.now() < deadline, 'Setup did not become quiet');
    await page.waitForTimeout(250);
    const next = host.traffic.length + received.length;
    if (next !== count) {
      count = next;
      changed = Date.now();
    }
  }
}

try {
  for (const engine of forcedStaleAgeCheck ? [firefox] : [chromium, firefox]) {
    const browser = await launch(
      engine,
      forcedStaleAgeCheck
        ? {
            firefoxUserPrefs: { 'dom.serviceWorkers.testUpdateOverOneDay': true },
          }
        : {},
    );
    try {
      for (const workerType of ['classic', 'classic-dynamic', 'module']) {
        for (const confined of [false, true]) {
          let positiveSamples = 0;
          // Reverse the order in a second round, using a fresh browser context for
          // every sample so registration state is never shared across bit cases.
          for (const [sample, bit] of ['0', '1', '1', '0'].entries()) {
            const context = await browser.newContext();
            context.setDefaultTimeout(15_000);
            try {
              let page: Page;
              if (confined) {
                const manager = await context.newPage();
                await manager.goto('http://127.0.0.1:4210/privacy-frames/');
                await manager.getByText('Ready to install.', { exact: true }).waitFor();
                await manager.locator('#app-url').fill(origin + '/');
                await provideResourceList(
                  manager,
                  Object.keys(workerScripts).map((path) => origin + path),
                );
                await manager.locator('#install button').click();
                const installed = manager.locator('[data-app]').first();
                await installed.waitFor();
                const opened = context.waitForEvent('page');
                await installed.click();
                page = await opened;
                await page.locator('#run').waitFor();
              } else {
                page = await context.newPage();
                await page.goto(origin);
                await page.evaluate(async () => {
                  await navigator.serviceWorker.register('/sw.js', {
                    updateViaCache: 'none',
                  });
                  await navigator.serviceWorker.ready;
                  if (!navigator.serviceWorker.controller)
                    await new Promise<void>((resolve) =>
                      navigator.serviceWorker.addEventListener(
                        'controllerchange',
                        () => resolve(),
                        { once: true },
                      ),
                    );
                });
              }
              await page.waitForFunction(
                () => Reflect.get(window, 'maintenanceProbeReady') === true,
              );
              await page.locator('#worker-type').selectOption(workerType);
              const retained = sample === 2;
              await page.locator('#keep-worker').setChecked(retained);
              await quiet(page);
              const baseline = host.traffic.length;
              const publisherBaseline = received.length;
              await page.waitForTimeout(1500);
              const idleRuntime = host.traffic.slice(baseline);
              const idlePublisher = received.slice(publisherBaseline);
              assert.equal(idleRuntime.length, 0, 'Runtime idle control was not quiet');
              assert.equal(
                idlePublisher.length,
                0,
                'Publisher idle control was not quiet',
              );
              await page.locator('#private').fill(bit);
              const start = host.traffic.length;
              const publisherStart = received.length;
              const actionStarted = Date.now();
              await page.locator('#run').click();
              await page
                .locator('#result')
                .filter({ hasText: bit === '1' ? 'ready' : 'skipped' })
                .waitFor();
              await page.waitForTimeout(3000);
              const runtime = host.traffic.slice(start);
              const publisherTraffic = received.slice(publisherStart);
              const updateRequests = confined
                ? runtime.filter(
                    (request) =>
                      request.port === 4211 && request.path === '/runtime/sw.js',
                  )
                : publisherTraffic.filter((request) => request.path === '/sw.js');
              const row = {
                browser: engine.name(),
                version: browser.version(),
                sample,
                actionStarted,
                observationEnded: Date.now(),
                confined,
                forcedStaleAgeCheck,
                workerLifetime:
                  bit === '0'
                    ? 'not-created'
                    : retained
                      ? 'retained-through-observation'
                      : 'terminated-after-ready',
                workerType,
                bit,
                idleRuntime,
                idlePublisher,
                runtime,
                publisherTraffic,
                updateRequests,
              };
              samples.push(row);
              console.log(
                engine.name(),
                confined ? 'confined' : 'native',
                bit,
                JSON.stringify(row),
              );
              if (bit === '0') assert.equal(updateRequests.length, 0);
              else if (updateRequests.length > 0) positiveSamples++;
              if (confined && (runtime.length > 0 || publisherTraffic.length > 0))
                violations.push({
                  browser: engine.name(),
                  workerType,
                  sample,
                  bit,
                  runtime,
                  publisherTraffic,
                });
            } finally {
              await context.close();
            }
          }
          // Native scheduling may suppress one update. Require a working control
          // for each worker type, while every confined observation must stay quiet.
          groups.push({
            browser: engine.name(),
            confined,
            forcedStaleAgeCheck,
            workerType,
            positiveSamples,
            workerSamples: 2,
            noWorkerSamples: 2,
          });
          if (!confined && positiveSamples === 0)
            missingNativeControls.push({ browser: engine.name(), workerType });
        }
      }
    } finally {
      await browser.close();
    }
  }
  const after = await testProvenance(import.meta.url);
  assert.deepEqual(after.artifacts, provenance.artifacts);
  assert.equal(after.sourceSHA256, provenance.sourceSHA256);
  assert.equal(after.runnerSHA256, provenance.runnerSHA256);
  assert.deepEqual(
    { missingNativeControls, violations },
    { missingNativeControls: [], violations: [] },
    'Worker maintenance comparison failed',
  );
  completedAt = new Date().toISOString();
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  try {
    await writeFile(
      receipt,
      JSON.stringify(
        {
          scope:
            'Classic importScripts, classic dynamic import and module-worker startup with dependencies, chosen by a private input bit. Native groups must demonstrate worker-triggered maintenance; every confined sample must produce zero HTTP requests. No-worker and idle controls use separate fresh contexts. All completed samples are retained before the zero-HTTP assertion. These bounded observations do not establish exhaustive browser behavior or complete confinement.',
          provenance,
          forcedStaleAgeCheck,
          samples,
          groups,
          violations,
          missingNativeControls,
          observationMilliseconds: 3000,
          completed: completedAt !== null,
          completedAt,
          ...(failure ? { failure } : {}),
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await host.close();
    await new Promise<void>((resolve) => publisher.close(() => resolve()));
  }
}
