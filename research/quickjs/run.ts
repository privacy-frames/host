import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const directory = fileURLToPath(new URL('.', import.meta.url));
await mkdir(directory + 'output', { recursive: true });
await build({
  entryPoints: [directory + 'browser.ts'],
  bundle: true,
  format: 'esm',
  outfile: directory + 'output/browser.js',
  platform: 'browser',
});
const wasmPath =
  directory +
  'node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm';
const wasm = await readFile(wasmPath);
const bundle = await readFile(directory + 'output/browser.js');
const appPath = process.env.STUDY_APP_SOURCE;
const appSource = appPath ? await readFile(appPath) : Buffer.from('void 0');
const server = createServer((request, response) => {
  if (request.url === '/app-source.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(appSource);
  } else if (request.url?.endsWith('.wasm')) {
    response.setHeader('Content-Type', 'application/wasm');
    response.end(wasm);
  } else if (request.url === '/browser.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(bundle);
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      '<button id="button">go</button><input id="input"><output id="output"></output><canvas id="canvas" width="1" height="1"></canvas><script type="module" src="/browser.js"></script>',
    );
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('missing address');
try {
  for (const [name, browserType] of Object.entries({ chromium, firefox })) {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      const requests: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => requests.push(request.url()));
      await page.goto(`http://127.0.0.1:${address.port}/`);
      await page.waitForFunction(() => 'study' in globalThis);
      const result =
        await page.evaluate<Awaited<ReturnType<typeof import('./browser.ts').run>>>(
          'globalThis.study',
        );
      const receipt = {
        date: new Date().toISOString(),
        unchangedApp: {
          sha256: createHash('sha256').update(appSource).digest('hex'),
          bytes: appSource.length,
        },
        browser: browser.version(),
        node: process.version,
        packages: {
          quickjsEmscripten: '0.32.0',
          playwright: '1.63.0',
          esbuild: '0.28.2',
        },
        sizes: { wasm: (await stat(wasmPath)).size, bundledJavaScript: bundle.length },
        errors,
        requests,
        result,
      };
      await writeFile(
        directory + `receipt-${name}.json`,
        JSON.stringify(receipt, null, 2) + '\n',
      );
      assert.ok(typeof result.state === 'string');
      const state = JSON.parse(result.state);
      assert.equal(state.identity, true);
      assert.equal(state.expando, true);
      assert.equal(state.dispatched, false);
      assert.deepEqual(result.events, [
        { type: 'inner', returned: false, defaultPrevented: true },
        { type: 'outer', returned: false, defaultPrevented: true },
      ]);
      assert.deepEqual(result.native, {
        input: 'nested',
        text: 'nested',
        storage: 'nested',
        pixel: [12, 34, 56, 255],
      });
      assert.equal(result.beforeJobs, false);
      assert.equal(result.afterJobs, true);
      assert.equal(result.moduleAnswer, 42);
      assert.equal(result.dynamicAnswer, 42);
      assert.equal(result.moduleDenied, true);
      assert.equal(result.controls.deniedOperation, true);
      assert.equal(result.controls.controlReturn, true);
      assert.equal(result.controls.prototypeControl, false);
      assert.equal(result.errors.length, 1);
      assert.equal(result.recovered, 42);
      assert.deepEqual(result.buffers, {
        initialGuestByte: 1,
        hostOriginal: [99, 2, 3, 4],
        guestBytes: [1, 77, 3, 4],
      });
      assert.equal(result.tlaValue, 43);
      assert.equal(result.intrinsicIntl, 'undefined');
      assert.ok(typeof result.intlFixture === 'string');
      assert.equal(JSON.parse(result.intlFixture).formatted, '1 Jan 1970, 00:00');
      assert.equal(
        requests.every((url) => url.startsWith(`http://127.0.0.1:${address.port}/`)),
        true,
      );
      console.log(name, browser.version(), JSON.stringify(result));
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
}
