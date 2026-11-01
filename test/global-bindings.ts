import { SCRIPT_URL_CSP } from '../src/shared/script-url-policy.ts';
import http from 'node:http';
import assert from 'node:assert/strict';
import { build } from './build.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';
import { testProvenance } from './provenance.ts';
import type {} from './fixtures/global-bindings/window.ts';
import type {} from './fixtures/global-bindings/hazards.ts';
function field(value: unknown, key: string): unknown {
  assert(value && typeof value === 'object');
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}
function checkResult(result: unknown, guarded: boolean) {
  assert.equal(field(result, 'error'), undefined);
  const report = field(result, 'bindings');
  assert.equal(field(report, 'ordinaryGlobalWorks'), true);
  assert.equal(field(report, 'webSocketDenied'), guarded);
  const entries = field(report, 'bindings');
  assert(Array.isArray(entries));
  for (const item of entries) {
    const entry: unknown = item;
    if (field(entry, 'protectedAccessor')) continue;
    assert.equal(field(entry, 'retained'), true);
    if (guarded)
      for (const mode of ['assigned', 'defined', 'classicAssigned'])
        assert.equal(
          field(entry, mode),
          false,
          String(field(entry, 'name')) + ' ' + mode,
        );
  }
  for (const name of ['Array', 'Object', 'Proxy', 'globalThis', 'String']) {
    const entry = entries.find((item) => field(item, 'name') === name);
    assert(entry);
    assert.equal(field(entry, 'defined'), !guarded, name);
  }
  for (const name of ['Array', 'IDBDatabase', 'IDBTransaction']) {
    const entry = entries.find((item) => field(item, 'name') === name);
    assert(entry, name + ' must be present in Window and Worker controls');
    assert.equal(field(entry, 'identicalAssignment'), true, name + ' self-assignment');
  }
  assert.equal(field(field(result, 'cache'), 'replacementRejected'), guarded);
  assert.deepEqual(field(field(result, 'cache'), 'calls'), []);
}
const outputs = await build({
  entryPoints: [
    'test/fixtures/global-bindings/window.ts',
    'test/fixtures/global-bindings/worker.ts',
    'test/fixtures/global-bindings/hazards.ts',
    'test/fixtures/global-bindings/control-window.ts',
    'test/fixtures/global-bindings/control-worker.ts',
  ],
  outdir: 'fixture',
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  banner: { js: '"use strict";' },
});
const server = http.createServer((request, response) => {
  if (request.url === '/window' || request.url === '/worker.js')
    response.setHeader('Content-Security-Policy', SCRIPT_URL_CSP);
  const file = outputs.outputFiles.find(
    (file) => request.url === '/' + file.path.split('/').pop(),
  );
  if (file) {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(file.contents);
    return;
  }
  response.setHeader('Content-Type', 'text/html');
  response.end(
    '<!doctype html><title>Global binding analysis</title>' +
      (request.url === '/window'
        ? '<script src="/window.js"></script>'
        : request.url === '/control-window'
          ? '<script src="/control-window.js"></script>'
          : request.url === '/hazards'
            ? '<script src="/hazards.js"></script>'
            : ''),
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const origin = 'http://127.0.0.1:' + address.port;
const receipt = {
  provenance: await testProvenance(import.meta.url),
  results: [] as unknown[],
};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      const page = await browser.newPage();
      const environments = [];
      for (const guarded of [false, true]) {
        await page.goto(origin + (guarded ? '/window' : '/control-window'));
        const windowResult = await page.evaluate(() => window.runGlobalBindingProbe());
        await page.goto(origin + '/worker');
        const workerResult = await page.evaluate(
          (path) =>
            new Promise((resolve) => {
              const worker = new Worker(path);
              worker.onmessage = (event) => {
                resolve(event.data);
                worker.terminate();
              };
              worker.onerror = (event) => {
                resolve({ error: event.message });
                worker.terminate();
              };
            }),
          guarded ? '/worker.js' : '/control-worker.js',
        );
        for (const result of [windowResult, workerResult]) checkResult(result, guarded);
        if (guarded) {
          assert.deepEqual(field(field(windowResult, 'webStorage'), 'observedKeys'), []);
          assert.equal(
            field(field(windowResult, 'webStorage'), 'replacementRejected'),
            true,
          );
        }
        environments.push({ guarded, window: windowResult, worker: workerResult });
      }
      await page.goto(origin + '/hazards');
      const hazards = await page.evaluate(() => window.runPrototypeHazards());
      receipt.results.push({
        hazards,
        browser: name,
        version: browser.version(),
        environments,
      });
      console.log(name, JSON.stringify({ environments, hazards }));
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    'results/contexts/global-bindings.json',
    JSON.stringify(receipt, null, 2) + '\n',
  );
}
