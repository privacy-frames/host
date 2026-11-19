import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';

const require = createRequire(import.meta.url);
const directory = new URL('../.tools/guest-wasm-test/', import.meta.url);
await mkdir(directory, { recursive: true });
await build({
  entryPoints: [new URL('guest-wasm.browser.ts', import.meta.url).pathname],
  outfile: new URL('browser.js', directory).pathname,
  platform: 'browser',
  format: 'esm',
  bundle: true,
  target: 'es2022',
});
const files = new Map([
  ['/browser.js', await readFile(new URL('browser.js', directory))],
  [
    '/mixed-import.wasm',
    await readFile(new URL('fixtures/wasm/mixed-import.wasm', import.meta.url)),
  ],
  [
    '/quickjs.wasm',
    await readFile(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm')),
  ],
  ['/memory.wasm', await readFile(new URL('fixtures/wasm/memory.wasm', import.meta.url))],
  [
    '/transport.wasm',
    await readFile(new URL('fixtures/wasm/transport.wasm', import.meta.url)),
  ],
  ['/shared.wasm', await readFile(new URL('fixtures/wasm/shared.wasm', import.meta.url))],
  [
    '/table-start.wasm',
    await readFile(new URL('fixtures/wasm/table-start.wasm', import.meta.url)),
  ],
]);
const requests: string[] = [];
const server = createServer((request, response) => {
  const path = new URL(request.url || '/', 'http://localhost').pathname;
  if (path === '/import-probe' || path === '/constructor-probe') requests.push(path);
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  response.setHeader(
    'Content-Type',
    path.endsWith('.wasm')
      ? 'application/wasm'
      : path.endsWith('.js')
        ? 'text/javascript'
        : 'text/html',
  );
  response.end(
    files.get(path) ?? '<!doctype html><script type="module" src="/browser.js"></script>',
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const observations = [];
try {
  for (const [name, type] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const) {
    // The bundled headless shell crashes on native Wasm memory traps; the full
    // Chromium binary correctly delivers the JavaScript RuntimeError control.
    const browser = await type.launch({
      headless: true,
      ...(name === 'chromium' ? { executablePath: chromium.executablePath() } : {}),
    });
    try {
      const initialRequests = requests.length;
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('console', (message) =>
        console.log(`[${name}] ${message.type()}: ${message.text()}`),
      );
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${address.port}`);
      await page.waitForFunction(
        () => globalThis.guestWasmResults !== undefined,
        undefined,
        { timeout: 45000 },
      );
      const result = await page.evaluate(() => globalThis.guestWasmResults);
      observations.push({
        browser: name,
        version: browser.version(),
        errors,
        result,
        requests: requests.slice(initialRequests),
      });
      console.log(JSON.stringify(observations.at(-1)));
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mkdir(new URL('../results/', import.meta.url), { recursive: true });
  await writeFile(
    new URL('../results/guest-wasm.json', import.meta.url),
    JSON.stringify(
      {
        revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        bundleHash: createHash('sha256').update(files.get('/browser.js')!).digest('hex'),
        fixtures: Object.fromEntries(
          [...files]
            .filter(([name]) => name.endsWith('.wasm'))
            .map(([name, bytes]) => [
              name,
              createHash('sha256').update(bytes).digest('hex'),
            ]),
        ),
        observations,
      },
      null,
      2,
    ) + '\n',
  );
}
for (const observation of observations) {
  assert.deepEqual(observation.errors, []);
  const result = observation.result;
  assert(result && !result.error, JSON.stringify(result));
  assert.equal(result.isolated, true);
  assert.deepEqual(result.policy?.control, [true, true]);
  assert.deepEqual(result.policy?.guest, [false, false]);
  assert.deepEqual(observation.requests, ['/import-probe', '/constructor-probe']);
  assert.equal(result.native.length, 9);
  assert.equal(result.guest.length, 9);
  assert.deepEqual(result.foreign, [
    'raw export',
    'late imported memory',
    'late imported table start',
  ]);
  for (const test of [...result.native, ...result.guest])
    assert(test.passed, JSON.stringify(test));
}
