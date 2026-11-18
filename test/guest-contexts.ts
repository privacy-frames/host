import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';
import { guestWorkletLoaderPlugin } from '../src/guest/contexts/worklet-build.ts';

const root = new URL('../', import.meta.url).pathname;
const output = new URL('../.tools/guest-context-test/', import.meta.url);
await mkdir(output, { recursive: true });
const entries = {
  browser: new URL('./guest-contexts.browser.ts', import.meta.url).pathname,
  worker: new URL('./guest-contexts.worker.ts', import.meta.url).pathname,
  worklet: new URL('../src/guest/contexts/worklet-entry.ts', import.meta.url).pathname,
};
for (const [name, entry] of Object.entries(entries))
  await build({
    entryPoints: [entry],
    outfile: new URL(`${name}.js`, output).pathname,
    bundle: true,
    format: name === 'worker' ? 'iife' : 'esm',
    platform: 'browser',
    target: 'es2022',
    plugins: name === 'worklet' ? [guestWorkletLoaderPlugin(root)] : [],
  });
const require = createRequire(import.meta.url);
const wasm = await readFile(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm'));
const bundles = new Map(
  await Promise.all(
    Object.keys(entries).map(
      async (name) => [name, await readFile(new URL(`${name}.js`, output))] as const,
    ),
  ),
);
const requests: string[] = [];
const server = createServer((request, response) => {
  const path = new URL(request.url || '/', 'http://localhost').pathname;
  requests.push(path);
  response.setHeader(
    'Content-Type',
    path.endsWith('.wasm')
      ? 'application/wasm'
      : path.endsWith('.js')
        ? 'text/javascript'
        : 'text/html',
  );
  response.end(
    path === '/quickjs.wasm'
      ? wasm
      : path === '/browser.js'
        ? bundles.get('browser')
        : path === '/app/__guest_worker__.js' ||
            path === '/app/__guest_shared_worker__.js'
          ? bundles.get('worker')
          : path === '/guest-worklet.js'
            ? bundles.get('worklet')
            : path === '/blank.html'
              ? '<!doctype html><body></body>'
              : '<!doctype html><script type="module" src="/browser.js"></script>',
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const receipts = [];
try {
  for (const [name, browserType] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const) {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage();
      page.on('pageerror', (error) => console.error(name, error));
      await page.goto(`http://127.0.0.1:${address.port}/`);
      await page.waitForFunction(
        () => globalThis.guestContextResults !== undefined,
        undefined,
        { timeout: 60000 },
      );
      const observation = await page.evaluate(() => globalThis.guestContextResults);
      receipts.push({ browser: name, version: browser.version(), observation });
      console.log(JSON.stringify(receipts.at(-1)));
      assert(observation && !observation.error, JSON.stringify(observation));
      const result = observation.result!;
      assert.deepEqual(result.worker, {
        count: 1,
        same: true,
        bytes: [1, 7, 3, 4],
        denied: 'undefined',
        buffer: {},
        detached: true,
        persistentCount: 2,
      });
      assert.equal(result.nested, 9);
      assert.equal(result.moduleWorker, 11);
      assert.deepEqual(result.failedTransfer, { rejected: true, retained: true });
      assert.equal(result.denied, true);
      assert.deepEqual(result.shared, [1, 2]);
      assert.equal(result.sample, 0.25);
      assert.deepEqual(result.workletMessages, [
        { bytes: [4, 4] },
        { detached: true, wasm: 'undefined' },
      ]);
      assert.equal(result.nativePortDetached, true);
      assert.equal(result.prepared, 1);
      assert.equal(result.closed, 1);
      assert.equal(result.stripped, true);
      assert.equal(result.childText, 'prepared child');
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
await writeFile(
  new URL('../results/guest-contexts.json', import.meta.url),
  JSON.stringify({ receipts, requests }, null, 2) + '\n',
);
