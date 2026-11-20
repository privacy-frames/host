import assert from 'node:assert/strict';
import { build, version as esbuildVersion } from 'esbuild';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';

const sources = [
  'src/guest/browser.ts',
  'src/guest/engine.ts',
  'src/guest/session.ts',
  'src/guest/event-listener-arguments.ts',
  'test/guest-eventtarget-cleanup.browser.ts',
  'test/guest-eventtarget-cleanup.ts',
];
const baseline = execFileSync('git', ['show', '48a97d6:src/guest/browser.ts'], {
  encoding: 'utf8',
});
const originalStart = baseline.indexOf(
  "    const transfer =\n      key === 'postMessage'",
);
const originalEnd = baseline.indexOf(
  '    if (this.document && isElement(result))',
  originalStart,
);
assert(originalStart >= 0 && originalEnd > originalStart);
const originalListenerBlock = baseline.slice(originalStart, originalEnd);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const inputHashes = Object.fromEntries(
  await Promise.all(
    sources.map(async (name) => [
      name,
      hash(await readFile(new URL('../' + name, import.meta.url))),
    ]),
  ),
);
const output = new URL('../.tools/eventtarget-cleanup-browser/', import.meta.url);
await mkdir(output, { recursive: true });
const bundles = new Map<string, Uint8Array>();
const bundledInputs = new Set<string>();
for (const fault of ['production', 'conversion', 'cleanup']) {
  const result = await build({
    entryPoints: [
      new URL('./guest-eventtarget-cleanup.browser.ts', import.meta.url).pathname,
    ],
    write: false,
    metafile: true,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    plugins:
      fault !== 'production'
        ? [
            {
              name: 'restore-listener-cleanup-fault',
              setup(builder) {
                builder.onLoad(
                  { filter: /\/src\/guest\/browser\.ts$/ },
                  async ({ path }) => {
                    let source = await readFile(path, 'utf8');
                    if (fault === 'conversion') {
                      const start = source.indexOf('    const listenerArguments =');
                      const end = source.indexOf(
                        '    if (this.document && isElement(result))',
                        start,
                      );
                      assert(start >= 0 && end > start);
                      source =
                        source.slice(0, start) +
                        originalListenerBlock +
                        source.slice(end);
                    } else {
                      const start = source.indexOf(
                        '    const attempt = (cleanup: () => void) => {',
                      );
                      const end = source.indexOf(
                        '    attempt(() => this.navigation?.dispose());',
                        start,
                      );
                      assert(start >= 0 && end > start);
                      source =
                        source.slice(0, start) +
                        '    const attempt = (cleanup: () => void) => cleanup();\n' +
                        source.slice(end);
                    }
                    return { loader: 'ts', contents: source };
                  },
                );
              },
            },
          ]
        : [],
  });
  for (const path of Object.keys(result.metafile.inputs)) bundledInputs.add(path);
  assert.equal(result.outputFiles.length, 1);
  bundles.set(fault, result.outputFiles[0].contents);
}
const transitiveInputHashes = Object.fromEntries(
  await Promise.all(
    [...bundledInputs].sort().map(async (path) => [path, hash(await readFile(path))]),
  ),
);
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
        ? bundles.get(address.searchParams.get('variant') ?? 'production')
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
    const executablePath = type.executablePath();
    const executableSHA256 = hash(await readFile(executablePath));
    for (const probe of ['production', 'capture', 'type', 'failure']) {
      const browser = await type.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const variant =
          probe === 'production'
            ? 'production'
            : probe === 'failure'
              ? 'cleanup'
              : 'conversion';
        const query =
          '?variant=' + variant + (probe === 'production' ? '' : '&probe=' + probe);
        await page.goto(`http://127.0.0.1:${address.port}/${query}`);
        await page.waitForFunction(
          () =>
            Reflect.get(window, '__eventtargetResult') ||
            Reflect.get(window, '__eventtargetFailure'),
          undefined,
          { timeout: 90000 },
        );
        const failure: unknown = await page.evaluate(() =>
          Reflect.get(window, '__eventtargetFailure'),
        );
        const observed: unknown = await page.evaluate(() =>
          Reflect.get(window, '__eventtargetObserved'),
        );
        const result: unknown = await page.evaluate(() =>
          Reflect.get(window, '__eventtargetResult'),
        );
        if (probe === 'production') {
          assert.equal(failure, undefined, String(failure));
          assert(result && typeof result === 'object' && 'nativeComparisons' in result);
          assert.equal(result.nativeComparisons, 14);
          receipts.push({
            browser: name,
            version: browser.version(),
            executablePath,
            executableSHA256,
            probe,
            result,
          });
        } else {
          const expected =
            probe === 'capture'
              ? 'Capture options must be consumed once before bookkeeping'
              : probe === 'type'
                ? 'Primitive listener cleanup must release every owned subsystem'
                : 'Every owned subsystem must be attempted after cleanup failure';
          assert.equal(typeof failure, 'string');
          assert(String(failure).includes(expected), String(failure));
          assert(observed && typeof observed === 'object');
          if (probe === 'capture') {
            assert('captureReads' in observed && observed.captureReads === 2);
            assert('deliveries' in observed && observed.deliveries === 1);
            assert('tracked' in observed && observed.tracked === 0);
          } else if (probe === 'type') {
            assert('removals' in observed && observed.removals === 0);
          } else {
            assert(
              'counts' in observed &&
                observed.counts &&
                typeof observed.counts === 'object',
            );
            assert('workers' in observed.counts && observed.counts.workers === 0);
            assert('resources' in observed.counts && observed.counts.resources === 0);
          }
          receipts.push({
            browser: name,
            version: browser.version(),
            executablePath,
            executableSHA256,
            probe,
            observed,
            rejected: true,
          });
        }
        console.log(name, probe, JSON.stringify(result ?? observed));
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
  'EventTarget inputs changed during the run',
);
assert.deepEqual(
  Object.fromEntries(
    await Promise.all(
      [...bundledInputs].sort().map(async (path) => [path, hash(await readFile(path))]),
    ),
  ),
  transitiveInputHashes,
  'Transitive bundled inputs changed during the run',
);
await mkdir(new URL('../results/quickjs-confinement/', import.meta.url), {
  recursive: true,
});
await writeFile(
  new URL('../results/quickjs-confinement/eventtarget-cleanup.json', import.meta.url),
  JSON.stringify(
    {
      scope:
        'Actual BrowserEnvironment and GuestEngine listener cleanup, native EventTarget conversion-trace comparison and isolated restoration of original conversion/early-abort cleanup behavior. No network escape claim.',
      baselineListenerBlockSHA256: hash(Buffer.from(originalListenerBlock)),
      sourceHashes: inputHashes,
      transitiveInputHashes,
      toolchain: { node: process.version, esbuild: esbuildVersion },
      engineSHA256: hash(wasm),
      bundleHashes: Object.fromEntries(
        [...bundles].map(([name, bytes]) => [name, hash(bytes)]),
      ),
      controls: [
        'Restore original listener conversion/bookkeeping block from48a97d6',
        'Omit BrowserEnvironment local cleanup error containment',
      ],
      receipts,
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
