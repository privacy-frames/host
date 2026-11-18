import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium, firefox } from 'playwright';
import type { BindingObservation } from './types.ts';

await import('./build.ts');
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('.', import.meta.url));
const sources = new Map([
  [
    '/',
    {
      type: 'text/html',
      bytes: Buffer.from(
        '<!doctype html><script nonce="fixture-bootstrap" type="module" src="/browser.js"></script>',
      ),
    },
  ],
  [
    '/browser.js',
    { type: 'text/javascript', bytes: await readFile(root + 'build/browser.js') },
  ],
  [
    '/guest.js',
    { type: 'text/javascript', bytes: await readFile(root + 'build/guest.js') },
  ],
  [
    '/engine.wasm',
    {
      type: 'application/wasm',
      bytes: await readFile(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm')),
    },
  ],
]);

const server = createServer((request, response) => {
  const path = new URL(request.url || '/', 'http://localhost').pathname;
  const source = sources.get(path);
  if (request.url?.includes('restricted')) {
    response.setHeader(
      'Content-Security-Policy',
      "script-src 'nonce-fixture-bootstrap' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'none'",
    );
  }
  response.writeHead(source ? 200 : 404, {
    'Content-Type': source?.type || 'text/plain',
  });
  response.end(source?.bytes || 'Not found');
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address === 'object');

const observations: {
  browser: string;
  version: string;
  result: BindingObservation;
  errors: string[];
  restricted: boolean;
}[] = [];
try {
  for (const [name, browserType] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const) {
    const browser = await browserType.launch({ headless: true });
    try {
      for (const restricted of [false, true]) {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error: Error) => errors.push(error.message));
        await page.goto(
          `http://127.0.0.1:${address.port}/${restricted ? '?restricted' : ''}`,
        );
        await page.waitForFunction(
          () => globalThis.probeResult !== undefined,
          undefined,
          { timeout: 30000 },
        );
        const result = await page.evaluate(() => globalThis.probeResult);
        assert(result);
        observations.push({
          browser: name,
          version: browser.version(),
          result,
          errors,
          restricted,
        });
        console.log(JSON.stringify(observations.at(-1)));
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
await writeFile(
  root + 'results.json',
  JSON.stringify(
    {
      date: new Date().toISOString(),
      versions: {
        quickjsEmscripten: '0.32.0',
        webidl2js: '21.2.0',
        playwright: '1.63.0',
        esbuild: '0.28.2',
      },
      resources: Object.fromEntries(
        [...sources].map(([path, { bytes }]) => [
          path,
          {
            bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          },
        ]),
      ),
      observations,
    },
    null,
    2,
  ) + '\n',
);
for (const { result, errors, restricted } of observations) {
  assert.deepEqual(errors, []);
  assert(result.status === 'passed', JSON.stringify(result));
  for (const field of [
    'identity',
    'appendIdentity',
    'instance',
    'forgedReceiverRejected',
    'wrongArgumentRejected',
    'illegalConstructorRejected',
  ] as const) {
    assert.equal(result.guest[field], true, field);
  }
  assert.equal(result.guest.conversion, 'converted guest text');
  assert.equal(result.guest.branding, '[object StudyNode]');
  assert.equal(result.guest.guestConstructor, 'undefined');
  assert.equal(result.nativeMutation, 'native mutation');
  assert.equal(result.nodeCount, 1);
  assert.equal(result.nativeScriptExecuted, !restricted);
}
