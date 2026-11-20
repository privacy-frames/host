import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';

const root = new URL('../', import.meta.url);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const inputs = new Set<string>();
const bundles = new Map<boolean, Uint8Array>();
for (const fault of [false, true]) {
  const result = await build({
    entryPoints: [new URL('test/guest-message-transfer.browser.ts', root).pathname],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    plugins: fault
      ? [
          {
            name: 'restore-postmessage-reread-control',
            setup(builder) {
              builder.onLoad(
                { filter: /\/src\/guest\/browser\.ts$/ },
                async ({ path }) => {
                  const source = await readFile(path, 'utf8');
                  const before =
                    /    const transfer =\n      key === 'postMessage'[\s\S]+?    const result: unknown = Reflect.apply\(target, receiver, invocation\);/;
                  const after =
                    '    if (transfer !== undefined) this.requireEngine().detachTransferred(transfer);';
                  assert.equal(source.match(new RegExp(before.source, 'g'))?.length, 1);
                  assert.equal(source.split(after).length, 2);
                  return {
                    loader: 'ts',
                    contents: source
                      .replace(
                        before,
                        '    const result: unknown = Reflect.apply(target, receiver, args);',
                      )
                      .replace(
                        after,
                        `
    if (key === 'postMessage' && args.length > 1) {
      const options = args[1];
      const transfer = Array.isArray(options) ? options : options && typeof options === 'object' && 'transfer' in options && Array.isArray(options.transfer) ? options.transfer : [];
      this.requireEngine().detachTransferred(transfer);
    }`,
                      ),
                  };
                },
              );
            },
          },
        ]
      : [],
  });
  for (const path of Object.keys(result.metafile.inputs)) inputs.add(path);
  bundles.set(fault, result.outputFiles[0].contents);
}
inputs.add('test/guest-message-transfer.ts');
const inputHashes = Object.fromEntries(
  await Promise.all(
    [...inputs].sort().map(async (path) => [path, hash(await readFile(path))]),
  ),
);
const wasm = await readFile(new URL('vendor/quickjs/generated/engine.wasm', root));
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://local');
  response.setHeader(
    'Content-Type',
    url.pathname.endsWith('.wasm')
      ? 'application/wasm'
      : url.pathname.endsWith('.js')
        ? 'text/javascript'
        : 'text/html',
  );
  response.end(
    url.pathname === '/engine.wasm'
      ? wasm
      : url.pathname === '/browser.js'
        ? bundles.get(url.searchParams.has('fault'))
        : '<!doctype html><script type="module" src="/browser.js' +
          url.search +
          '"></script>',
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const results = [];
try {
  for (const [name, engine] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const fault of [false, true]) {
        const page = await browser.newPage();
        try {
          await page.goto(`http://127.0.0.1:${address.port}/${fault ? '?fault' : ''}`);
          await page.waitForFunction(
            () =>
              Reflect.has(window, '__transferResult') ||
              Reflect.has(window, '__transferFailure'),
            undefined,
            { timeout: 60000 },
          );
          const failure: unknown = await page.evaluate(() =>
            Reflect.get(window, '__transferFailure'),
          );
          const result: unknown = await page.evaluate(() =>
            Reflect.get(window, '__transferResult'),
          );
          const direct = await page.evaluate(() =>
            Reflect.get(window, '__transferDirectObserved'),
          );
          assert.deepEqual(
            direct,
            fault
              ? { directGetters: 2, directIterators: 1, commits: 2 }
              : { directGetters: 1, directIterators: 1, commits: 1 },
          );
          if (fault) {
            assert.equal(typeof failure, 'string');
            assert.match(
              String(failure),
              /Native adapter transfer conversion must run once/,
            );
          } else {
            assert.equal(failure, undefined, String(failure));
            assert.deepEqual(result, {
              result: {
                workerGetters: 1,
                workerIterators: 1,
                portGetters: 1,
                portIterators: 1,
              },
              commits: 2,
              failedSendPreserved: true,
              nativePositive: true,
            });
          }
          results.push({
            browser: name,
            version: browser.version(),
            direct,
            variant: fault ? 'old-reread-restored' : 'production',
            result,
            faultRejected: fault,
            failure,
          });
          console.log(
            name,
            fault
              ? 'Old transfer reread detected'
              : 'One-time transfer conversion and native failed-send preservation passed',
          );
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
for (const [path, expected] of Object.entries(inputHashes))
  assert.equal(
    hash(await readFile(path)),
    expected,
    'Transfer test source changed during run',
  );
await mkdir(new URL('results/quickjs-confinement/', root), { recursive: true });
await writeFile(
  new URL('results/quickjs-confinement/message-transfer.json', root),
  JSON.stringify(
    {
      scope:
        'Actual QuickJS/BrowserEnvironment/ConfinedWorker and MessagePort sends through native browsers, with native worker echo bootstrap controlled by this fixture. Verifies guest transfer conversion and detachment accounting, not worker bootstrap confinement.',
      inputHashes,
      engineSHA256: hash(wasm),
      bundleHashes: {
        production: hash(bundles.get(false)!),
        oldRereadRestored: hash(bundles.get(true)!),
      },
      results,
    },
    null,
    2,
  ) + '\n',
);
