import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';

const require = createRequire(import.meta.url);
const output = new URL('../.tools/guest-lifecycle-test/', import.meta.url);
await mkdir(output, { recursive: true });
await build({
  entryPoints: [new URL('./guest-lifecycle.browser.ts', import.meta.url).pathname],
  outfile: new URL('browser.js', output).pathname,
  platform: 'browser',
  format: 'esm',
  bundle: true,
  target: 'es2022',
});
const bundle = await readFile(new URL('browser.js', output));
const wasm = await readFile(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm'));
const server = createServer((request, response) => {
  const path = new URL(request.url || '/', 'http://localhost').pathname;
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
        ? bundle
        : '<!doctype html><script type="module" src="/browser.js"></script>',
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const observations = [];
try {
  for (const [name, browserType] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const) {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(`http://127.0.0.1:${address.port}`);
      await page.waitForFunction(
        () => globalThis.guestLifecycleResults !== undefined,
        undefined,
        { timeout: 30000 },
      );
      const result = await page.evaluate(() => globalThis.guestLifecycleResults);
      observations.push({ browser: name, version: browser.version(), result });
      console.log(JSON.stringify(observations.at(-1)));
      assert(result && !result.error, JSON.stringify(result));
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(result.before, {
        rendered: false,
        timeline: ['classic', 'module-start'],
      });
      const initial = [
        'classic',
        'module-start',
        'module-end',
        'module-load',
        'DOMContentLoaded:interactive',
        'window-load:complete',
      ];
      assert.deepEqual(result.initial, initial);
      assert.deepEqual(result.beforeDynamic, initial);
      assert.deepEqual(result.dynamicTimeline, [
        ...initial,
        'dynamic-end',
        'dynamic-load',
      ]);
      assert.equal(result.failure, 'module-error');
      assert.deepEqual(result.reported, ['Error: expected module failure']);
      assert.equal(result.syntheticPagehide, 42);
      assert.deepEqual(result.storedRecord, {
        text: 'stored text',
        type: 'content',
        tx: 7,
        optional: true,
        nullable: null,
        sparse: true,
        bytes: [4, 5],
        binary: 'prefix\0\ud800suffix',
      });
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
await writeFile(
  new URL('../results/guest-lifecycle.json', import.meta.url),
  JSON.stringify(observations, null, 2) + '\n',
);
