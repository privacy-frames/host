import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';

const output = new URL('../.tools/guest-window-test/', import.meta.url);
await mkdir(output, { recursive: true });
await build({
  entryPoints: [new URL('./guest-context-windows.browser.ts', import.meta.url).pathname],
  outfile: new URL('browser.js', output).pathname,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
});
const require = createRequire(import.meta.url);
const wasm = await readFile(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm'));
const bundle = await readFile(new URL('browser.js', output));
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
        : path === '/app/__guest_document__.html'
          ? '<html><body></body></html>'
          : path.startsWith('/app/')
            ? ''
            : '<!doctype html><script type="module" src="/browser.js"></script>',
  );
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
    const browser = await type.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const requests: string[] = [];
      page.on('request', (request) => requests.push(request.url()));
      page.on('pageerror', (error) => console.error(name, error));
      page.on('console', (message) => {
        if (message.type() === 'error') console.error(name, message.text());
      });
      await page.goto(`http://127.0.0.1:${address.port}/`);
      await page.waitForFunction(
        () => globalThis.guestWindowResults !== undefined,
        undefined,
        { timeout: 30000 },
      );
      const observation = await page.evaluate(() => globalThis.guestWindowResults);
      receipts.push({ browser: name, version: browser.version(), observation, requests });
      console.log(JSON.stringify(receipts.at(-1)));
      assert(observation && !observation.error, JSON.stringify(observation));
      const result = observation.result!;
      assert.deepEqual(result.finished, {
        value: 21,
        returned: false,
        cancelled: true,
        dynamicFlag: 1,
        attributeFlag: 1,
        evalFlag: 1,
        srcdoc: true,
      });
      assert.deepEqual(result.messages, {
        reply: { bytes: [10, 7], source: true, origin: true, trusted: true },
        port: true,
        detached: true,
      });
      assert.deepEqual(result.receiverRealm, { event: true, buffer: true, port: true });
      assert.equal(result.pendingWindow, true);
      assert.deepEqual(result.nativeTrust, [false]);
      assert.deepEqual(result.removed, { hidden: true, callbackClosed: true });
      assert.deepEqual(result.brands, {
        node: true,
        element: true,
        document: true,
        frame: true,
        template: true,
        attr: true,
        blob: true,
        window: true,
        port: true,
        audio: true,
        cache: true,
        fakeNode: false,
        fakeElement: false,
      });
      assert.deepEqual(result.nativeMarkers, {
        dynamic: true,
        attribute: true,
        eval: true,
      });
      assert.deepEqual(result.popup, {
        guest: 7,
        native: true,
        trustedURL: true,
        nativeContent: 'popup',
      });
      assert(requests.every((url) => new URL(url).hostname === '127.0.0.1'));
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
await writeFile(
  new URL('../results/guest-context-windows.json', import.meta.url),
  JSON.stringify(receipts, null, 2) + '\n',
);
