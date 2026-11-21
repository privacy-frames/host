import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { build, version as esbuildVersion } from 'esbuild';
import { chromium, firefox } from 'playwright';
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const variants = process.env.PF_DATA_BASELINE
  ? ['production']
  : ['production', 'module-instanceof'];
const bundles = new Map<string, Uint8Array>();
const inputs = new Set<string>();
for (const variant of variants) {
  const bundle = await build({
    entryPoints: ['test/guest-cross-realm-data.browser.ts'],
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
              name: 'restore-module-instanceof',
              setup(builder) {
                builder.onLoad(
                  { filter: /\/src\/guest\/engine\.ts$/ },
                  async ({ path }) => {
                    let source = await readFile(path, 'utf8');
                    for (const name of ['Map', 'Set', 'Date', 'RegExp']) {
                      const anchor = `isNative${name}(value)`;
                      assert.equal(source.split(anchor).length, 2);
                      source = source.replace(anchor, `value instanceof ${name}`);
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
const driverHash = hash(await readFile('test/guest-cross-realm-data.ts'));
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
const failures: string[] = [];
try {
  for (const [name, type] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const) {
    const browser = await type.launch({ headless: true });
    try {
      for (const variant of variants) {
        const page = await browser.newPage();
        try {
          const errors: string[] = [];
          page.on('pageerror', (error) => errors.push(String(error)));
          await page.goto(`http://127.0.0.1:${address.port}/?variant=${variant}`);
          await page.waitForFunction(
            () =>
              Reflect.get(window, '__crossDataResult') ||
              Reflect.get(window, '__crossDataFailure'),
            undefined,
            { timeout: 90000 },
          );
          const observation = await page.evaluate(() => ({
            result: Reflect.get(window, '__crossDataResult'),
            failure: Reflect.get(window, '__crossDataFailure'),
            observed: Reflect.get(window, '__crossDataObserved'),
          }));
          const receipt = {
            browser: name,
            version: browser.version(),
            executablePath: type.executablePath(),
            executableSHA256: hash(await readFile(type.executablePath())),
            variant,
            ...observation,
          };
          receipts.push(receipt);
          console.log(JSON.stringify(receipt));
          try {
            if (variant === 'production') {
              assert.equal(observation.failure, undefined, String(observation.failure));
              assert.equal(observation.result?.ownGraphIdentity, true);
            } else {
              assert.equal(observation.result, undefined);
              assert.match(String(observation.failure), /Cross-realm data methods/);
            }
            assert.deepEqual(errors, []);
          } catch (error) {
            failures.push(name + ' ' + variant + ': ' + String(error));
          }
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
assert.equal(hash(await readFile('test/guest-cross-realm-data.ts')), driverHash);
await mkdir('results/quickjs-confinement/cross-realm-data', { recursive: true });
await writeFile(
  'results/quickjs-confinement/cross-realm-data/result.json',
  JSON.stringify(
    {
      scope:
        'Native prepared-child ordinary data instances and graph identity; no code generation, outside connections or full confinement claim',
      sourceHashes,
      driverHash,
      engineSHA256: hash(wasm),
      bundleHashes: Object.fromEntries(
        [...bundles].map(([name, bytes]) => [name, hash(bytes)]),
      ),
      toolchain: { node: process.version, esbuild: esbuildVersion },
      receipts,
      failures,
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
assert.deepEqual(failures, []);
