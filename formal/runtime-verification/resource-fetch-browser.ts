import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { build, type PluginBuild } from 'esbuild';
import { chromium, firefox, type Page } from 'playwright';
import { trustedPolicyPlugin } from '../../scripts/trusted-policy.ts';
import { launch } from '../../test/browser-profile.ts';
import { provideResourceList } from '../../test/resource-list-input.ts';
import { servers } from '../../test/server.ts';
import { testProvenance } from '../../test/provenance.ts';

const sourcePath = 'src/runtime/contexts/window-realm.ts';
const source = await readFile(sourcePath, 'utf8');
const needle = '\n      fetchResource,\n';
assert.equal(source.split(needle).length, 2);
const hash = (value: Uint8Array | string) =>
  createHash('sha256').update(value).digest('hex');
async function guard(altered: boolean) {
  let changes = 0;
  const result = await build({
    entryPoints: ['src/runtime/guard.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    banner: { js: '"use strict";' },
    plugins: [
      await trustedPolicyPlugin(process.cwd()),
      ...(altered
        ? [
            {
              name: 'test-only-native-fetch-instead-of-resource-message',
              setup(builder: PluginBuild) {
                builder.onLoad(
                  { filter: /[/\\]contexts[/\\]window-realm\.ts$/ },
                  async ({ path }) => {
                    assert.equal(await readFile(path, 'utf8'), source);
                    changes++;
                    return { contents: source.replace(needle, '\n'), loader: 'ts' };
                  },
                );
              },
            },
          ]
        : []),
    ],
  });
  assert.equal(changes, altered ? 1 : 0);
  return result.outputFiles[0].contents;
}
const normal = await guard(false),
  altered = await guard(true);
assert(Buffer.from(normal).equals(await readFile('dist-runtime/guard.js')));
assert.notEqual(hash(normal), hash(altered));
const integrity =
  'sha256-' + createHash('sha256').update('{"value":21}').digest('base64');
const script = `
document.querySelector('#run').onclick = async () => {
  try {
    if (document.querySelector('#private').value === '0') {
      document.querySelector('#result').textContent = 'skipped'; return;
    }
    const request = new Request(new URL('./data.json', document.baseURI), {
      headers: {'x-fixture': 'local-header'}, integrity: ${JSON.stringify(integrity)}
    });
    const responses = await Promise.all([fetch(request), fetch('./data.json')]);
    const clone = responses[0].clone();
    const json = await Promise.all(responses.map(value => value.json()));
    const binary = Array.from(new Uint8Array(await (await fetch('./bytes.bin')).arrayBuffer()));
    const wasm = await WebAssembly.instantiateStreaming(fetch('./empty.wasm'), {});
    let aborted = false;
    const abort = new AbortController(); abort.abort();
    try { await fetch('./data.json', {signal: abort.signal}); } catch { aborted = true; }
    let integrityRefused = false;
    try { await fetch('./data.json', {integrity:'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='}); }
    catch { integrityRefused = true; }
    document.querySelector('#result').textContent = JSON.stringify({
      sum: json[0].value + json[1].value, binary,
      clone: (await clone.json()).value,
      url: clone.url, type: clone.type, wasm: wasm.module instanceof WebAssembly.Module, aborted, integrityRefused
    });
  } catch (error) { document.querySelector('#result').textContent = 'failed:' + String(error); }
};`;
const assets = {
  '/data.json': {
    type: 'application/json',
    body: [123, 34, 118, 97, 108, 117, 101, 34, 58, 50, 49, 125],
  },
  '/bytes.bin': { type: 'application/octet-stream', body: [0, 128, 255] },
  '/empty.wasm': { type: 'application/wasm', body: [0, 97, 115, 109, 1, 0, 0, 0] },
};
const nativeWorker = `
const assets = ${JSON.stringify(assets)};
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const item = assets[new URL(event.request.url).pathname];
  if (item) event.respondWith(new Response(new Uint8Array(item.body), {headers: {'content-type':item.type}}));
});`;
const received: { path: string; time: number }[] = [];
const publisher = http.createServer((request, response) => {
  const path = request.url || '/';
  received.push({ path, time: Date.now() });
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  const asset = Object.entries(assets).find(([name]) => name === path)?.[1];
  if (asset) {
    response.setHeader('Content-Type', asset.type);
    response.end(Buffer.from(asset.body));
  } else if (path === '/main.js' || path === '/sw.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(path === '/main.js' ? script : nativeWorker);
  } else if (path === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      '<!doctype html><title>Local resource fixture</title><link rel="icon" href="data:,">' +
        '<input id="private"><button id="run">Read</button><output id="result"></output><script src="./main.js"></script>',
    );
  } else response.writeHead(404).end();
});
await new Promise<void>((resolve) => publisher.listen(0, '127.0.0.1', resolve));
const address = publisher.address();
assert(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const runtimeFiles = new Map<string, Uint8Array>();
const host = await servers({ receiver: false, runtimeFiles });
const provenance = await testProvenance(import.meta.url);
const receipt = new URL('./resource-fetch-browser.json', import.meta.url);
await rm(receipt, { force: true });
const rows: object[] = [];
async function quiet(page: Page) {
  let count = host.traffic.length + received.length,
    changed = Date.now();
  const deadline = Date.now() + 20_000;
  while (Date.now() - changed < 3000) {
    assert(Date.now() < deadline, 'Setup did not become quiet');
    await page.waitForTimeout(100);
    const current = host.traffic.length + received.length;
    if (current !== count) {
      count = current;
      changed = Date.now();
    }
  }
}
try {
  for (const profile of [
    { engine: chromium, stale: false },
    { engine: firefox, stale: false },
    { engine: firefox, stale: true },
  ]) {
    const browser = await launch(
      profile.engine,
      profile.stale
        ? {
            firefoxUserPrefs: { 'dom.serviceWorkers.testUpdateOverOneDay': true },
          }
        : {},
    );
    try {
      for (const mode of profile.stale
        ? ['native', 'normal', 'altered']
        : ['native', 'normal']) {
        runtimeFiles.clear();
        if (mode === 'altered') runtimeFiles.set('/guard.js', altered);
        for (const bit of ['0', '1']) {
          const context = await browser.newContext();
          try {
            let page: Page;
            const guardHashes: string[] = [];
            context.on('response', (response) => {
              if (
                response.url() === 'http://127.0.0.1:4211/runtime/guard.js' &&
                response.fromServiceWorker()
              )
                void response.body().then((body) => guardHashes.push(hash(body)));
            });
            if (mode === 'native') {
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
            } else {
              const manager = await context.newPage();
              await manager.goto('http://127.0.0.1:4210/privacy-frames/');
              await manager.getByText('Ready to install.', { exact: true }).waitFor();
              await manager.locator('#app-url').fill(origin + '/');
              await provideResourceList(
                manager,
                Object.keys(assets).map((path) => origin + path),
              );
              await manager.locator('#install button').click();
              const installed = manager.locator('[data-app]').first();
              await installed.waitFor();
              const opened = context.waitForEvent('page');
              await installed.click();
              page = await opened;
            }
            await page.locator('#run').waitFor();
            await quiet(page);
            if (mode !== 'native')
              assert.deepEqual(guardHashes, [
                hash(mode === 'altered' ? altered : normal),
              ]);
            await page.locator('#private').fill(bit);
            const start = host.traffic.length,
              publisherStart = received.length;
            await page.locator('#run').click();
            await page
              .locator('#result')
              .filter({ hasText: bit === '0' ? 'skipped' : '"sum"' })
              .waitFor();
            const result = await page.locator('#result').textContent();
            if (bit === '1') {
              assert(result);
              const value = JSON.parse(result);
              assert.equal(value.sum, 42);
              assert.equal(value.clone, 21);
              assert.deepEqual(value.binary, [0, 128, 255]);
              assert.equal(value.type, 'basic');
              assert.equal(value.wasm, true);
              assert.equal(value.aborted, true);
              assert.equal(value.integrityRefused, true);
            }
            await page.waitForTimeout(3000);
            const runtime = host.traffic.slice(start),
              publisherTraffic = received.slice(publisherStart);
            if (mode === 'normal' || bit === '0') {
              assert.equal(runtime.length, 0);
              assert.equal(publisherTraffic.length, 0);
            }
            if (profile.stale && bit === '1') {
              if (mode === 'native')
                assert(publisherTraffic.some((item) => item.path === '/sw.js'));
              if (mode === 'altered')
                assert(
                  runtime.some(
                    (item) => item.port === 4211 && item.path === '/runtime/sw.js',
                  ),
                );
            }
            rows.push({
              browser: profile.engine.name(),
              version: browser.version(),
              forcedStale: profile.stale,
              mode,
              bit,
              result,
              guardHashes,
              runtime,
              publisherTraffic,
            });
            console.log(
              profile.engine.name(),
              profile.stale ? 'forced-stale' : 'fresh',
              mode,
              bit,
              'passed',
            );
          } finally {
            await context.close();
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
  const final = await testProvenance(import.meta.url);
  assert.equal(final.sourceSHA256, provenance.sourceSHA256);
  assert.deepEqual(final.artifacts, provenance.artifacts);
  await writeFile(
    receipt,
    JSON.stringify(
      {
        scope:
          'Actual installed window fetch and native local-response controls, with selected GET Request/header, clone, binary, Wasm and abort behavior. The forced-stale Firefox control bypasses only the window fetch message adapter. Receiver observations are bounded; other native HTTP paths remain outside this result.',
        provenance,
        sourcePath,
        sourceSHA256: hash(source),
        normalGuardSHA256: hash(normal),
        alteredGuardSHA256: hash(altered),
        observationMilliseconds: 3000,
        rows,
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await host.close();
  await new Promise<void>((resolve) => publisher.close(() => resolve()));
}
