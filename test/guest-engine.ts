import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';

const require = createRequire(import.meta.url);
const output = new URL('../.tools/guest-engine-test/', import.meta.url);
await mkdir(output, { recursive: true });
await build({
  entryPoints: [new URL('./guest-engine.browser.ts', import.meta.url).pathname],
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
        () => globalThis.guestEngineResults !== undefined,
        undefined,
        { timeout: 30000 },
      );
      const result = await page.evaluate(() => globalThis.guestEngineResults);
      observations.push({ browser: name, version: browser.version(), result });
      console.log(JSON.stringify(observations.at(-1)));
      assert(result && !result.error, JSON.stringify(result));
      assert.deepEqual(pageErrors, []);
      const values = result.result as Record<string, unknown>;
      const additional = result.additional as Record<string, unknown>;
      const advanced = result.advanced as Record<string, unknown>;
      const disposal = result.disposal as Record<string, unknown>;
      assert.equal(values.globalIdentity, true);
      assert.equal(values.ownGlobal, true);
      assert.equal(values.globalPrototype, true);
      assert.equal(values.identity, true);
      assert.equal(values.cancellation, false);
      assert.deepEqual(values.trace, ['outer', 'inner', false]);
      assert.equal(values.prototype, 'BUTTON');
      assert.equal(values.expando, 7);
      assert.deepEqual(values.list, [true]);
      assert.deepEqual(values.bytes, [9, 9, 9]);
      assert.deepEqual(values.nativeBuffer, [8, 2, 3, 4]);
      assert.equal(values.constructor, 'undefined');
      assert.equal(values.url, 'https://example.test/hello');
      assert.equal(values.error, 'native failure');
      assert.equal(additional.promise, 42);
      assert.equal(additional.asyncCompilerRealm, 'undefined');
      assert.equal(additional.generatorCompilerRealm, 'undefined');
      assert.equal(additional.module, 42);
      assert.equal(additional.nativePrototype, false);
      assert.deepEqual(additional.errors, []);
      assert.equal(advanced.sameError, true);
      assert.equal(advanced.capturedViewConstructor, true);
      assert.deepEqual(advanced.domException, [true, 'SecurityError', 'denied', 18]);
      assert.deepEqual(advanced.nativeException, [true, 'SecurityError', 18]);
      assert.equal(advanced.map, true);
      assert.equal(advanced.symbol, 'symbol data');
      assert.deepEqual(advanced.dataset, [false, 'value', false]);
      assert.equal(advanced.detailIdentity, true);
      assert.deepEqual(advanced.binaryBrand, [9, 9]);
      assert.deepEqual(advanced.nestedBytes, [3, 4, 3, 4, 5]);
      assert.equal(advanced.throwingWrite, 8);
      assert.equal(advanced.sender, true);
      assert.equal(advanced.receiver, true);
      assert.deepEqual(advanced.bytes, [1, 2, 3, 4]);
      assert.match(String(disposal.rejectedMessage), /expected rejection/);
      assert.match(String(disposal.closedMessage), /context is closed/);
      assert.deepEqual(disposal.lateErrors, []);
      assert.equal(disposal.capturedNativeSymbol, true);
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
await writeFile(
  new URL('../results/guest-engine.json', import.meta.url),
  JSON.stringify(observations, null, 2) + '\n',
);
