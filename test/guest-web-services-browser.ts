import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';

const root = new URL('../', import.meta.url).pathname;
const bundle = await build({
  entryPoints: [root + 'test/fixtures/guest-web-services.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
});
const observed: string[] = [];
const server = createServer((request, response) => {
  observed.push(request.url || '/');
  if (request.url === '/fixture.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end(bundle.outputFiles[0].contents);
  } else if (request.url === '/native.txt') {
    response.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': '10' });
    response.end('local text');
  } else {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><script type="module" src="/fixture.js"></script>');
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const receipts = [];
try {
  for (const [name, type] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const) {
    observed.length = 0;
    const browser = await type.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(`http://127.0.0.1:${address.port}/`);
      await page.waitForFunction(() => 'webServicesResult' in globalThis);
      const result = await page.evaluate(() =>
        Reflect.get(globalThis, 'webServicesResult'),
      );
      receipts.push({
        browser: name,
        version: browser.version(),
        result,
        pageErrors,
        requests: [...observed],
      });
      console.log(JSON.stringify(receipts.at(-1)));
      assert.equal(result.error, undefined);
      assert.deepEqual(result.localAsync.states, [1, 2, 3, 4]);
      assert.deepEqual(result.localAsync.events, [
        'loadstart',
        'progress',
        'load',
        'loadend',
      ]);
      assert.deepEqual(result.localAsync, {
        ...result.nativeAsync,
        url: 'https://publisher.invalid/app/value.txt',
      });
      assert.deepEqual(result.localSync, {
        ...result.nativeSync,
        url: 'https://publisher.invalid/app/value.txt',
      });
      assert.equal(result.xml, 'root');
      assert.equal(result.html, 'HTML');
      assert.equal(result.inertScript, true);
      assert.equal(result.binary, 'local text');
      assert.equal(result.syncResponseTypeError, 'InvalidAccessError');
      assert.equal(result.cameraError, 'NotAllowedError');
      assert.equal(result.cameraPermission, 'denied');
      assert.equal(result.serviceWorkerAbsent, true);
      assert.equal(result.beaconBlocked, true);
      assert.equal(result.deniedRead, true);
      assert(pageErrors.length === 0, pageErrors.join('\n'));
      assert(
        observed.every((url) =>
          ['/', '/fixture.js', '/native.txt', '/favicon.ico'].includes(url),
        ),
        JSON.stringify(observed),
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
await mkdir(root + 'results/guest-runtime', { recursive: true });
await writeFile(
  root + 'results/guest-runtime/web-services.json',
  JSON.stringify({ completed: new Date().toISOString(), receipts }, null, 2) + '\n',
);
