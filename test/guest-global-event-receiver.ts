import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { build, version as esbuildVersion } from 'esbuild';
import { chromium, firefox } from 'playwright';

const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const bundles = new Map<string, Uint8Array>();
const inputs = new Set<string>();
for (const variant of ['production', 'no-normalization', 'no-direct-normalization']) {
  const bundle = await build({
    entryPoints: ['test/guest-global-event-receiver.browser.ts'],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    plugins:
      variant === 'production'
        ? []
        : [
            {
              name: 'omit-reviewed-receiver-normalization',
              setup(builder) {
                builder.onLoad(
                  {
                    filter:
                      variant === 'no-normalization'
                        ? /\/src\/guest\/browser-policy\.ts$/
                        : /\/src\/guest\/native-host\.ts$/,
                  },
                  async ({ path }) => {
                    let source = await readFile(path, 'utf8');
                    if (variant === 'no-normalization') {
                      const start = source.indexOf(
                        '    normalizeReceiver(receiver, contract) {',
                      );
                      const end = source.indexOf('    },', start);
                      assert(start >= 0 && end > start);
                      source =
                        source.slice(0, start) + source.slice(end + '    },'.length);
                    } else {
                      const anchor = '          return invoke(token, this, args);';
                      assert.equal(source.split(anchor).length, 2);
                      source = source.replace(
                        anchor,
                        `          if (object(this)) options.admit(this);
          return unwrap(registry.call(token, this, args));`,
                      );
                    }
                    return { loader: 'ts', contents: source };
                  },
                );
              },
            },
          ],
  });
  bundles.set(variant, bundle.outputFiles[0].contents);
  for (const input of Object.keys(bundle.metafile.inputs)) inputs.add(input);
}
const sourceHashes = Object.fromEntries(
  await Promise.all(
    [...inputs].sort().map(async (path) => [path, hash(await readFile(path))]),
  ),
);
const driverHash = hash(await readFile('test/guest-global-event-receiver.ts'));
const wasm = await readFile('vendor/quickjs/generated/engine.wasm');
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
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
        ? bundles.get(url.searchParams.get('variant') || 'production')
        : '<!doctype html><script type="module" src="/browser.js' +
          url.search +
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
    const browser = await type.launch({ headless: true });
    try {
      for (const variant of bundles.keys()) {
        const page = await browser.newPage();
        try {
          const errors: string[] = [];
          page.on('pageerror', (error) => errors.push(String(error)));
          await page.goto(`http://127.0.0.1:${address.port}/?variant=${variant}`);
          await page.waitForFunction(
            () =>
              Reflect.get(window, '__globalReceiverResult') ||
              Reflect.get(window, '__globalReceiverFailure'),
            undefined,
            { timeout: 90000 },
          );
          const observation = await page.evaluate(() => ({
            result: Reflect.get(window, '__globalReceiverResult'),
            failure: Reflect.get(window, '__globalReceiverFailure'),
            comparison: Reflect.get(window, '__globalReceiverComparison'),
          }));
          console.log(name, variant, JSON.stringify(observation));
          receipts.push({
            browser: name,
            variant,
            version: browser.version(),
            executablePath: type.executablePath(),
            executableSHA256: hash(await readFile(type.executablePath())),
            ...observation,
          });
          if (variant === 'production') {
            assert.equal(observation.failure, undefined, String(observation.failure));
            assert.equal(observation.result?.nativeMatch, true);
            assert.equal(observation.result?.disposal, true);
          } else {
            assert.equal(observation.result, undefined);
            if (variant === 'no-normalization') {
              assert.match(
                String(observation.failure),
                /differs from unrestricted native control/,
              );
              assert(observation.comparison);
              assert.notDeepEqual(
                observation.comparison.guest,
                observation.comparison.native,
              );
            } else {
              assert.match(
                String(observation.failure),
                /receiver belongs to another family or registry/,
              );
            }
          }
          assert.deepEqual(errors, []);
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
assert.deepEqual(
  Object.fromEntries(
    await Promise.all(
      [...inputs].sort().map(async (path) => [path, hash(await readFile(path))]),
    ),
  ),
  sourceHashes,
);
assert.equal(hash(await readFile('test/guest-global-event-receiver.ts')), driverHash);
await mkdir('results/quickjs-confinement/global-event-receiver', { recursive: true });
await writeFile(
  'results/quickjs-confinement/global-event-receiver/result.json',
  JSON.stringify(
    {
      scope:
        'Exact EventTarget null/undefined receiver convention for prepared browser globals, canonical direct calls, native comparisons and omission controls; no full BrowserEnvironment or confinement proof',
      sourceHashes,
      driverHash,
      engineSHA256: hash(wasm),
      bundleHashes: Object.fromEntries(
        [...bundles].map(([name, bytes]) => [name, hash(bytes)]),
      ),
      toolchain: { node: process.version, esbuild: esbuildVersion },
      receipts,
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
