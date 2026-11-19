import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';

const output = new URL('../.tools/guest-custom-elements.js', import.meta.url);
await build({
  entryPoints: [new URL('./guest-custom-elements.browser.ts', import.meta.url).pathname],
  outfile: output.pathname,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
});
const source = await readFile(output);
const require = createRequire(import.meta.url);
const wasm = await readFile(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm'));
const server = createServer((request, response) => {
  const path = new URL(request.url || '/', 'http://fixture').pathname;
  response.setHeader(
    'Content-Type',
    path === '/engine.wasm'
      ? 'application/wasm'
      : path === '/browser.js'
        ? 'text/javascript'
        : 'text/html',
  );
  response.end(
    path === '/engine.wasm'
      ? wasm
      : path === '/browser.js'
        ? source
        : '<!doctype html><script type="module" src="/browser.js"></script>',
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const receipts: object[] = [];
try {
  for (const [name, type] of Object.entries({ chromium, firefox })) {
    const browser = await type.launch({ headless: true });
    try {
      const page = await browser.newPage();
      page.on('pageerror', (error) => console.error(name, error));
      await page.goto(`http://127.0.0.1:${address.port}/`);
      await page.waitForFunction(
        () => globalThis.customElementResults !== undefined,
        undefined,
        {
          timeout: 60000,
        },
      );
      const observation = await page.evaluate(() => ({
        ...customElementResults,
        nativeCallback: nativeCustomCallback,
        nativeControl: nativeCustomControl,
      }));
      console.log(name, JSON.stringify(observation));
      assert.equal(observation.error, undefined);
      assert.equal(observation.nativeControl, true);
      assert.equal(
        observation.nativeCallback,
        false,
        'Guest callback executed in native global',
      );
      const result = observation.result as {
        error?: string;
        events: unknown[];
        constructorAttributes: number[];
        automaticHardening: boolean;
        observations: number;
        resolved: boolean;
        registered: boolean;
        prototypes: boolean[];
        synchronousCancellation: boolean;
        late: boolean;
        customized: boolean;
        invalid: string;
      };
      assert.equal(result.error, undefined);
      assert.equal(result.observations, 1);
      assert.equal(result.automaticHardening, true);
      assert.equal(result.constructorAttributes[1], 0);
      assert.equal(result.resolved, true);
      assert.equal(result.registered, true);
      assert.deepEqual(result.prototypes, [true, true, true]);
      assert.equal(result.synchronousCancellation, true);
      assert.equal(result.late, true);
      assert.equal(result.customized, true);
      assert.equal(result.invalid, 'SyntaxError');
      assert.deepEqual(result.events, [
        'construct',
        'connected',
        'construct',
        'construct',
        'connected',
        'connected',
        ['title', null, 'private'],
        'cancel',
        'disconnected',
      ]);
      receipts.push({ browser: name, version: browser.version(), observation });
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
await mkdir('results/guest-runtime', { recursive: true });
await writeFile(
  'results/guest-runtime/custom-elements.json',
  JSON.stringify(receipts, null, 2) + '\n',
);
