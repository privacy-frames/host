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
const worker = 'postMessage("ready");';
const main = `
document.querySelector('#run').onclick = () => {
  if (document.querySelector('#private').value !== '1') {
    document.querySelector('#result').textContent = 'skipped';
    return;
  }
  const worker = new Worker('./worker.js');
  worker.onmessage = event => {
    document.querySelector('#result').textContent = event.data;
    worker.terminate();
  };
};`;
const html = `<!doctype html><title>Maintenance probe</title>
<link rel="icon" href="data:,">
<input id="private" aria-label="Private bit"><button id="run">Run</button>
<output id="result"></output><script src="./main.js"></script>`;
const nativeServiceWorker = `
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (new URL(event.request.url).pathname === '/worker.js')
    event.respondWith(new Response(${JSON.stringify(worker)}, {
      headers: {'Content-Type': 'text/javascript'}
    }));
});`;
const publisher = http.createServer((request, response) => {
  const path = request.url || '/';
  received.push({ path, time: Date.now() });
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Access-Control-Allow-Origin', '*');
  if (path === '/main.js' || path === '/worker.js' || path === '/sw.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(
      path === '/main.js' ? main : path === '/worker.js' ? worker : nativeServiceWorker,
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
const provenance = await testProvenance(import.meta.url);
const receipt = new URL('./service-worker-maintenance.json', import.meta.url);
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
  for (const engine of [chromium, firefox]) {
    const browser = await launch(engine);
    try {
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
              await provideResourceList(manager, [origin + '/worker.js']);
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
            await quiet(page);
            const baseline = host.traffic.length;
            const publisherBaseline = received.length;
            await page.waitForTimeout(1500);
            const idleRuntime = host.traffic.slice(baseline);
            const idlePublisher = received.slice(publisherBaseline);
            assert.equal(idleRuntime.length, 0, 'Runtime idle control was not quiet');
            assert.equal(idlePublisher.length, 0, 'Publisher idle control was not quiet');
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
                  (request) => request.port === 4211 && request.path === '/runtime/sw.js',
                )
              : publisherTraffic.filter((request) => request.path === '/sw.js');
            const row = {
              browser: engine.name(),
              version: browser.version(),
              sample,
              actionStarted,
              observationEnded: Date.now(),
              confined,
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
            if (confined) assert.equal(publisherTraffic.length, 0);
          } finally {
            await context.close();
          }
        }
        // Scheduling/coalescing can suppress an individual update check. A
        // counterexample requires an observed effect, not delivery on every run.
        groups.push({
          browser: engine.name(),
          confined,
          positiveSamples,
          workerSamples: 2,
          noWorkerSamples: 2,
        });
        assert(positiveSamples > 0, 'No worker-triggered update observed in this group');
      }
    } finally {
      await browser.close();
    }
  }
  assert.deepEqual(
    (await testProvenance(import.meta.url)).artifacts,
    provenance.artifacts,
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
            'Native and actual confined worker creation, chosen by a private input bit, compared with no-worker and idle controls. Fixed-URL service-worker maintenance is observed at independent HTTP servers. Bounded observations do not establish exhaustive browser behavior or channel capacity.',
          provenance,
          samples,
          groups,
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
