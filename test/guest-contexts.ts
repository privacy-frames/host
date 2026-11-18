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
  registry: new URL('../src/guest/contexts/worker-registry-entry.ts', import.meta.url)
    .pathname,
};
for (const [name, entry] of Object.entries(entries))
  await build({
    entryPoints: [entry],
    outfile: new URL(`${name}.js`, output).pathname,
    bundle: true,
    format: name === 'worker' || name === 'registry' ? 'iife' : 'esm',
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
        : path === '/worker.js'
          ? bundles.get('worker')
          : path === '/__guest_worker_registry__.js'
            ? bundles.get('registry')
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
      const context = await browser.newContext();
      const requestURLs: string[] = [];
      context.on('request', (request) => requestURLs.push(request.url()));
      const page = await context.newPage();
      page.on('pageerror', (error) => console.error(name, error));
      await page.goto(`http://127.0.0.1:${address.port}/`);
      await page.waitForFunction(
        () => globalThis.guestContextResults !== undefined,
        undefined,
        { timeout: 60000 },
      );
      const observation = await page.evaluate(() => globalThis.guestContextResults);
      receipts.push({
        browser: name,
        version: browser.version(),
        observation,
        requestURLs,
        withoutNativeSharedWorker: undefined as
          | { dedicated: boolean; nested: boolean; module: boolean; registryHTTP: number }
          | undefined,
        crossRootShared: undefined as
          { second: unknown; afterFirstRootClose: unknown } | undefined,
      });
      console.log(JSON.stringify(receipts.at(-1)));
      assert(observation && !observation.error, JSON.stringify(observation));
      const result = observation.result!;
      assert.deepEqual(result.worker, {
        count: 1,
        same: true,
        bytes: [1, 7, 3, 4],
        denied: true,
        buffer: {},
        detached: true,
        persistentCount: 2,
        binaryText: String.fromCharCode(0, 255, 0xd800, 90),
        keyed: 'correct',
        normal: 'decoy',
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
      const second = await context.newPage();
      await second.goto(`http://127.0.0.1:${address.port}/`);
      await second.waitForFunction(
        () => globalThis.guestContextResults !== undefined,
        undefined,
        { timeout: 60000 },
      );
      const secondObservation = await second.evaluate(
        () => globalThis.guestContextResults,
      );
      assert(
        secondObservation && !secondObservation.error,
        JSON.stringify(secondObservation),
      );
      assert.deepEqual(secondObservation.result!.shared, [3, 4]);
      await page.close();
      const survivingShared = await second.evaluate(() =>
        globalThis.guestSharedProbe?.(),
      );
      assert.equal(
        survivingShared,
        5,
        'Closing the first root revoked another root shared worker bootstrap',
      );
      receipts.at(-1)!.crossRootShared = {
        second: secondObservation.result!.shared,
        afterFirstRootClose: survivingShared,
      };
      const withoutShared = await context.newPage();
      await withoutShared.addInitScript(() =>
        Object.defineProperty(globalThis, 'SharedWorker', {
          configurable: true,
          value: undefined,
        }),
      );
      const registrationsBeforeFallback = requests.filter(
        (path) => path === '/__guest_worker_registry__.js',
      ).length;
      await withoutShared.goto(`http://127.0.0.1:${address.port}/`);
      await withoutShared.waitForFunction(
        () => globalThis.guestContextResults !== undefined,
        undefined,
        { timeout: 60000 },
      );
      const fallback = await withoutShared.evaluate(() => globalThis.guestContextResults);
      assert(fallback && !fallback.error, JSON.stringify(fallback));
      assert.equal(fallback.result!.shared, 'unavailable');
      assert.equal(fallback.result!.nested, 9);
      assert.equal(fallback.result!.moduleWorker, 11);
      assert.equal(
        requests.filter((path) => path === '/__guest_worker_registry__.js').length,
        registrationsBeforeFallback,
      );
      receipts.at(-1)!.withoutNativeSharedWorker = {
        dedicated: true,
        nested: true,
        module: true,
        registryHTTP: 0,
      };

      assert(
        requestURLs.every(
          (url) =>
            new URL(url).hostname === '127.0.0.1' ||
            (new URL(url).protocol === 'blob:' &&
              new URL(new URL(url).origin).hostname === '127.0.0.1'),
        ),
      );
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
