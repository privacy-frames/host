import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, firefox, type Page } from 'playwright';
import { servers } from './server.ts';
import { provideResourceList } from './resource-list-input.ts';

const scripts: Record<string, string> = {
  '/classic.js': 'importScripts("./dependency.js");postMessage(globalThis.ready);',
  '/dependency.js': 'globalThis.ready="ready";',
  '/dynamic.js': 'import("./module-dependency.js").then(({ready})=>postMessage(ready));',
  '/module.js':
    'import {ready} from "./module-dependency.js";await Promise.resolve();postMessage(ready);',
  '/module-dependency.js': 'export const ready="ready";',
  '/shared.js': 'onconnect=event=>event.ports[0].postMessage("ready");',
};
const main = `document.querySelector('#run').onclick=()=>{
 const output=document.querySelector('#result');output.textContent='';
 if(document.querySelector('#private').value!=='1'){output.textContent='skipped';return;}
 const kind=document.querySelector('#kind').value;
 if(kind==='shared'){
  const worker=new SharedWorker('./shared.js',{name:'maintenance'});
  worker.port.onmessage=event=>output.textContent=event.data;worker.port.start();globalThis.retained=worker;
 }else{
  const worker=new Worker('./'+kind+'.js',{type:kind==='module'?'module':'classic'});
  worker.onmessage=event=>output.textContent=event.data;globalThis.retained=worker;
 }
};document.body.dataset.fixtureReady='yes';`;
const html =
  '<!doctype html><title>Guest worker maintenance fixture</title><link rel="icon" href="data:,"><input id="private"><select id="kind"><option>classic</option><option>dynamic</option><option>module</option><option>shared</option></select><button id="run">Run</button><output id="result"></output><script src="main.js"></script>';
const nativeSW = `self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
const scripts=${JSON.stringify(scripts)};
self.addEventListener('fetch',event=>{const source=scripts[new URL(event.request.url).pathname];if(source)event.respondWith(new Response(source,{headers:{'Content-Type':'text/javascript'}}));});`;
const publisherTraffic: { path: string; time: number }[] = [];
const publisher = createServer((request, response) => {
  const path = request.url || '/';
  publisherTraffic.push({ path, time: Date.now() });
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  if (path === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end(html);
  } else if (path in scripts || path === '/main.js' || path === '/sw.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(
      path === '/main.js' ? main : path === '/sw.js' ? nativeSW : scripts[path],
    );
  } else response.writeHead(404).end();
});
await new Promise<void>((resolve) => publisher.listen(0, '127.0.0.1', resolve));
const address = publisher.address();
assert(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;
const server = await servers({ receiver: false });
const samples: object[] = [];
const groups: object[] = [];
const violations: object[] = [];
const missingControls: object[] = [];
let completed = false;
let failure: string | undefined;
const artifacts = [
  'guard.js',
  'sw.js',
  'guest-worker.js',
  'guest-shared-worker.js',
  '__guest_worker_registry__.js',
  'engine.wasm',
];
const hashArtifacts = async () =>
  Object.fromEntries(
    await Promise.all(
      artifacts.map(async (path) => [
        path,
        createHash('sha256')
          .update(await readFile(new URL('../dist-runtime/' + path, import.meta.url)))
          .digest('hex'),
      ]),
    ),
  );
let hashes: Record<string, string> | undefined;

async function quiet(page: Page): Promise<void> {
  let count = server.traffic.length + publisherTraffic.length;
  let changed = Date.now();
  const deadline = Date.now() + 20000;
  while (Date.now() - changed < 3000) {
    assert(Date.now() < deadline, 'Startup did not become quiet');
    await page.waitForTimeout(200);
    const next = server.traffic.length + publisherTraffic.length;
    if (count !== next) {
      count = next;
      changed = Date.now();
    }
  }
}

try {
  hashes = await hashArtifacts();
  for (const profile of [
    { name: 'chromium', type: chromium, forcedAge: false },
    { name: 'firefox', type: firefox, forcedAge: false },
    { name: 'firefox-forced-age', type: firefox, forcedAge: true },
  ]) {
    if (process.env.GUEST_BROWSER && profile.name !== process.env.GUEST_BROWSER) continue;
    const browser = await profile.type.launch({
      headless: true,
      ...(profile.forcedAge
        ? { firefoxUserPrefs: { 'dom.serviceWorkers.testUpdateOverOneDay': true } }
        : {}),
    });
    try {
      for (const kind of ['classic', 'dynamic', 'module', 'shared']) {
        for (const confined of [false, true]) {
          let positives = 0;
          for (const bit of ['0', '1', '1', '0']) {
            const context = await browser.newContext();
            context.setDefaultTimeout(30000);
            try {
              let app: Page;
              if (confined) {
                const manager = await context.newPage();
                await manager.goto('http://127.0.0.1:4210/privacy-frames/');
                await manager.getByText('Ready to install.', { exact: true }).waitFor();
                await manager.locator('#app-url').fill(origin + '/');
                await provideResourceList(
                  manager,
                  Object.keys(scripts).map((path) => origin + path),
                );
                await manager.locator('#install button').click();
                await manager.waitForFunction(() =>
                  /^(Installed |Installation refused:)/.test(
                    document.querySelector('#status')?.textContent || '',
                  ),
                );
                assert.match(await manager.locator('#status').innerText(), /^Installed /);
                const opened = context.waitForEvent('page');
                await manager.locator('#app-list a[data-app]').first().click();
                app = await opened;
              } else {
                app = await context.newPage();
                await app.goto(origin);
                await app.evaluate(async () => {
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
              await app.waitForFunction(
                () => document.body.dataset.fixtureReady === 'yes',
              );
              await app.locator('#kind').selectOption(kind);
              await quiet(app);
              const idleStart = server.traffic.length;
              const idlePublisherStart = publisherTraffic.length;
              await app.waitForTimeout(1000);
              assert.equal(
                server.traffic.length,
                idleStart,
                'Runtime idle control was not quiet',
              );
              assert.equal(
                publisherTraffic.length,
                idlePublisherStart,
                'Publisher idle control was not quiet',
              );
              await app.locator('#private').fill(bit);
              const runtimeStart = server.traffic.length;
              const publisherStart = publisherTraffic.length;
              await app.locator('#run').click();
              await app
                .locator('#result')
                .filter({ hasText: bit === '0' ? /^skipped$/ : /^ready$/ })
                .waitFor();
              await app.waitForTimeout(2500);
              const runtime = server.traffic.slice(runtimeStart);
              const publisherRequests = publisherTraffic.slice(publisherStart);
              const updates = confined
                ? runtime.filter(
                    (request) =>
                      request.port === 4211 && request.path === '/runtime/sw.js',
                  )
                : publisherRequests.filter((request) => request.path === '/sw.js');
              const observation = {
                profile: profile.name,
                version: browser.version(),
                kind,
                confined,
                bit,
                result: await app.locator('#result').innerText(),
                runtime,
                publisher: publisherRequests,
                updates,
              };
              samples.push(observation);
              console.log(JSON.stringify(observation));
              if (confined && (runtime.length || publisherRequests.length))
                violations.push(observation);
              if (!confined && bit === '1' && updates.length) positives++;
              if (!confined && bit === '0')
                assert.equal(
                  publisherRequests.length,
                  0,
                  'No-worker native control transmitted',
                );
            } finally {
              await context.close();
            }
          }
          groups.push({
            profile: profile.name,
            kind,
            confined,
            positiveUpdateSamples: positives,
          });
          if (!confined && positives === 0)
            missingControls.push({ profile: profile.name, kind });
        }
      }
    } finally {
      await browser.close();
    }
  }
  assert.deepEqual(
    await hashArtifacts(),
    hashes,
    'Runtime artifacts changed during measurement',
  );
  completed = true;
  assert.deepEqual(violations, [], 'Guest worker creation caused physical HTTP traffic');
  assert.deepEqual(
    missingControls,
    [],
    'Native worker update control did not demonstrate the browser behavior',
  );
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  await server.close();
  await new Promise<void>((resolve) => publisher.close(() => resolve()));
  await mkdir('results/guest-runtime', { recursive: true });
  await writeFile(
    'results/guest-runtime/worker-maintenance.json',
    JSON.stringify(
      { completed, failure, hashes, groups, samples, violations, missingControls },
      null,
      2,
    ) + '\n',
  );
}
