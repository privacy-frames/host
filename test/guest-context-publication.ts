import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';

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
const inputHashes = Object.fromEntries(
  await Promise.all(
    sources.map(async (name) => [
      name,
      hash(await readFile(new URL('../' + name, import.meta.url))),
    ]),
  ),
);
const output = new URL('../.tools/context-publication-browser/', import.meta.url);
await mkdir(output, { recursive: true });
const bundles = new Map<boolean, Uint8Array>();
for (const fault of [false, true]) {
  const result = await build({
    entryPoints: [
      new URL('./guest-context-publication.browser.ts', import.meta.url).pathname,
    ],
    write: false,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    plugins: fault
      ? [
          {
            name: 'remove-session-cancellation-control',
            setup(builder) {
              builder.onLoad(
                { filter: /\/src\/guest\/session\.ts$/ },
                async ({ path }) => {
                  const source = await readFile(path, 'utf8');
                  const forward =
                    'createGuestWindow(childCatalog, childWindow, preparation)';
                  const guard = 'preparation.throwIfAborted();';
                  assert.equal(
                    source.split(forward).length,
                    2,
                    'Signal forwarding control changed',
                  );
                  assert.equal(
                    source.split(guard).length,
                    3,
                    'Caller cancellation controls changed',
                  );
                  return {
                    loader: 'ts',
                    contents: source
                      .replace(forward, 'createGuestWindow(childCatalog, childWindow)')
                      .replaceAll(guard, ''),
                  };
                },
              );
            },
          },
        ]
      : [],
  });
  assert.equal(result.outputFiles.length, 1);
  bundles.set(fault, result.outputFiles[0].contents);
}
const wasm = await readFile(
  new URL('../vendor/quickjs/generated/engine.wasm', import.meta.url),
);
const server = createServer((request, response) => {
  const address = new URL(request.url || '/', 'http://localhost');
  response.setHeader(
    'Content-Type',
    address.pathname.endsWith('.wasm')
      ? 'application/wasm'
      : address.pathname.endsWith('.js')
        ? 'text/javascript'
        : 'text/html',
  );
  response.end(
    address.pathname === '/engine.wasm'
      ? wasm
      : address.pathname === '/browser.js'
        ? bundles.get(address.searchParams.has('cancelFault'))
        : '<!doctype html><script type="module" src="/browser.js' +
          address.search +
          '"></script>',
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
    for (const fault of [false, true]) {
      const browser = await type.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.goto(
          `http://127.0.0.1:${address.port}/${fault ? '?cancelFault=1' : ''}`,
        );
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
        const observed: unknown = await page.evaluate(() =>
          Reflect.get(window, '__publicationObserved'),
        );
        if (fault) {
          assert.equal(typeof failure, 'string');
          assert.match(
            String(failure),
            /Cancelled real child must not execute its first script/,
          );
          assert.deepEqual(
            observed,
            [1],
            'Removing real cancellation must execute stale guest source',
          );
          receipts.push({
            browser: name,
            version: browser.version(),
            variant: 'session-cancellation-removed',
            observed,
            rejected: true,
          });
          console.log(name, 'session cancellation removal detected');
        } else {
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
          assert.deepEqual(observed, []);
          assert.deepEqual(errors, []);
          receipts.push({
            browser: name,
            version: browser.version(),
            variant: 'production',
            result,
          });
          console.log(name, JSON.stringify(result));
        }
      } finally {
        await browser.close();
      }
    }
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
assert.deepEqual(
  Object.fromEntries(
    await Promise.all(
      sources.map(async (name) => [
        name,
        hash(await readFile(new URL('../' + name, import.meta.url))),
      ]),
    ),
  ),
  inputHashes,
  'Publication test inputs changed during the run',
);
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
        'Independent preparation/cancellation/reentry/queued-message controls and real QuickJS child-session replacement with actual cancellation-removal controls. This is not a complete browser confinement proof.',
      sourceHashes: inputHashes,
      engineSHA256: hash(wasm),
      bundleHashes: {
        production: hash(bundles.get(false)!),
        sessionCancellationRemoved: hash(bundles.get(true)!),
      },
      fault:
        'Only the actual session caller signal forwarding and its before/after-render abort checks are removed from a temporary bundle; frame factory postchecks remain.',
      receipts,
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
