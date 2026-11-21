import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { build, version as esbuildVersion } from 'esbuild';
import { chromium, firefox } from 'playwright';

const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const entry = new URL('./guest-browser-policy.browser.ts', import.meta.url);
const runner = new URL('./guest-browser-policy.ts', import.meta.url);
const runnerHash = hash(await readFile(runner));
const variants = ['production', 'recovery-unavailable', 'unsupported-length'] as const;
type Variant = (typeof variants)[number];
const bundles = new Map<Variant, Uint8Array>();
const inputs = new Set<string>();
for (const variant of variants) {
  const bundle = await build({
    entryPoints: [entry.pathname],
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
              name: 'characterize-primitive-string-path',
              setup(builder) {
                builder.onLoad(
                  { filter: /\/src\/guest\/engine\.ts$/ },
                  async ({ path }) => {
                    let source = await readFile(path, 'utf8');
                    const recovery =
                      "const json = this.helper('stringifyString', [value]);";
                    assert.equal(
                      source.split(recovery).length,
                      2,
                      'String recovery anchor changed',
                    );
                    source = source.replace(
                      recovery,
                      "throw new Error('Diagnostic: string recovery unavailable');\n" +
                        recovery,
                    );
                    if (variant === 'unsupported-length') {
                      const comparison = 'result.length === length';
                      assert.equal(
                        source.split(comparison).length,
                        2,
                        'Primitive length comparison changed',
                      );
                      source = source.replace(
                        comparison,
                        'result.length === this.context.getLength(value)',
                      );
                    }
                    return { loader: 'ts', contents: source };
                  },
                );
              },
            },
          ],
  });
  assert.equal(bundle.outputFiles.length, 1);
  bundles.set(variant, bundle.outputFiles[0].contents);
  for (const input of Object.keys(bundle.metafile.inputs)) inputs.add(input);
}
const sourceHashes = Object.fromEntries(
  await Promise.all(
    [...inputs].sort().map(async (path) => [path, hash(await readFile(path))]),
  ),
);
const wasm = await readFile(
  new URL('../vendor/quickjs/generated/engine.wasm', import.meta.url),
);
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://local');
  const variant =
    variants.find((value) => value === url.searchParams.get('variant')) ?? 'production';
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader(
    'Content-Type',
    url.pathname === '/engine.wasm'
      ? 'application/wasm'
      : url.pathname === '/fixture.js'
        ? 'text/javascript'
        : 'text/html',
  );
  response.end(
    url.pathname === '/engine.wasm'
      ? wasm
      : url.pathname === '/fixture.js'
        ? bundles.get(variant)
        : '<!doctype html><body><script type="module" src="/fixture.js' +
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
      for (const variant of variants) {
        const page = await browser.newPage();
        try {
          const errors: string[] = [];
          page.on('pageerror', (error) => errors.push(String(error)));
          const query =
            '?variant=' +
            variant +
            (variant === 'production' ? '' : '&noStringRecovery=1');
          await page.goto(`http://127.0.0.1:${address.port}/${query}`);
          await page.waitForFunction(
            () =>
              Reflect.get(window, '__browserPolicyResult') ||
              Reflect.get(window, '__browserPolicyFailure'),
            undefined,
            { timeout: 90000 },
          );
          const failure = await page.evaluate(() =>
            Reflect.get(window, '__browserPolicyFailure'),
          );
          const result = await page.evaluate(() =>
            Reflect.get(window, '__browserPolicyResult'),
          );
          if (variant === 'unsupported-length') {
            assert.match(String(failure), /Diagnostic: string recovery unavailable/);
            assert.equal(result, undefined);
          } else {
            assert.equal(failure, undefined, String(failure));
            assert.deepEqual(
              result,
              variant === 'recovery-unavailable'
                ? {
                    primitiveFastPath: true,
                    opaqueStringsRequireRecovery: true,
                  }
                : {
                    localEvents: true,
                    cancellation: true,
                    customEvent: true,
                    messageEvent: true,
                    reflection: true,
                    aliasesDenied: true,
                    borrowedNodeReceiver: true,
                    nodePropertiesRemainAvailable: true,
                    unknownGetterReads: 0,
                    unpreparedReceiversDenied: true,
                    changedDescriptorDenied: true,
                    guestCallback: true,
                    publishedNativeCallback: true,
                    unknownCallbackDenied: true,
                    closedCallbackDenied: true,
                    stringFidelity: true,
                  },
            );
          }
          assert.deepEqual(errors, []);
          receipts.push({
            browser: name,
            variant,
            version: browser.version(),
            executablePath: type.executablePath(),
            executableSHA256: hash(await readFile(type.executablePath())),
            ...(variant === 'unsupported-length'
              ? { unsupportedLengthDetected: true, failure }
              : { result }),
          });
          console.log(
            name,
            variant,
            JSON.stringify(result ?? { unsupportedLengthDetected: true }),
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
for (const [path, sha256] of Object.entries(sourceHashes))
  assert.equal(hash(await readFile(path)), sha256, 'Bundled source changed: ' + path);
assert.equal(hash(await readFile(runner)), runnerHash, 'Browser runner changed');
const output = new URL('../results/quickjs-confinement/browser-policy/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(
  new URL('browser.json', output),
  JSON.stringify(
    {
      scope:
        'Actual QuickJS/BrowserEnvironment selected local EventTarget/Event/CustomEvent/MessageEvent operations, unknown getter and descriptor controls, receiver-only Node admission, existing-handle callable recognition/dispatch, and exact opaque-string fidelity. Temporary bundles make recovery unavailable to establish primitive fast-path behavior, and separately restore the unsupported primitive length comparison to ensure that control detects it. Other browser families, browser-service communication and complete confinement are not qualified.',
      sourceHashes,
      runnerHash,
      bundleHashes: Object.fromEntries(
        [...bundles].map(([variant, bytes]) => [variant, hash(bytes)]),
      ),
      engineSHA256: hash(wasm),
      toolchain: { node: process.version, esbuild: esbuildVersion },
      receipts,
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
