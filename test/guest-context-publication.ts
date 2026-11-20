import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';

const output = new URL('../.tools/context-publication-browser/', import.meta.url);
await mkdir(output, { recursive: true });
await build({
  entryPoints: [
    new URL('./guest-context-publication.browser.ts', import.meta.url).pathname,
  ],
  outfile: new URL('browser.js', output).pathname,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
});
const wasm = await readFile(
  new URL('../vendor/quickjs/generated/engine.wasm', import.meta.url),
);
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
    path === '/engine.wasm'
      ? wasm
      : path === '/browser.js'
        ? bundle
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
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      await page.goto(`http://127.0.0.1:${address.port}/`);
      await page.waitForFunction(
        () =>
          Reflect.get(window, '__publicationResult') ||
          Reflect.get(window, '__publicationFailure'),
        undefined,
        { timeout: 90000 },
      );
      const failure: unknown = await page.evaluate(() =>
        Reflect.get(window, '__publicationFailure'),
      );
      assert.equal(failure, undefined, String(failure));
      const result = await page.evaluate(() =>
        Reflect.get(window, '__publicationResult'),
      );
      assert.deepEqual(result, {
        staleClosed: 1,
        publishedClosed: 1,
        logicalLoads: 1,
        pendingClosed: 1,
        pendingLoads: 0,
        reentrantSources: ['', 'inner'],
        queuedDeliveries: 1,
        cancelledRealChildExecutions: 0,
        liveRealChildExecutions: 1,
        popupFirstClosed: 1,
        popupSecondClosed: 1,
        cleanupCalls: 2,
        cleanupErrors: 1,
      });
      assert.deepEqual(errors, []);
      receipts.push({ browser: name, version: browser.version(), result });
      console.log(name, JSON.stringify(result));
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
const sources = [
  'src/guest/contexts/lifecycle-kernel.ts',
  'src/guest/contexts/documents.ts',
  'src/guest/contexts/window-contexts.ts',
  'src/guest/session.ts',
  'src/guest/browser.ts',
  'test/guest-context-publication.browser.ts',
  'test/guest-context-publication.ts',
];
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
await mkdir(new URL('../results/quickjs-confinement/', import.meta.url), {
  recursive: true,
});
await writeFile(
  new URL(
    '../results/quickjs-confinement/context-publication-browser.json',
    import.meta.url,
  ),
  JSON.stringify(
    {
      scope:
        'Independent preparation/cancellation/reentry/queued-message controls and real QuickJS child-session cancellation in native browser documents. This is not a complete browser confinement proof.',
      sourceHashes: Object.fromEntries(
        await Promise.all(
          sources.map(async (name) => [
            name,
            hash(await readFile(new URL('../' + name, import.meta.url))),
          ]),
        ),
      ),
      engineSHA256: hash(wasm),
      receipts,
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
