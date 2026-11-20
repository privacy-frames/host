import assert from 'node:assert/strict';
import { build, version as esbuildVersion } from 'esbuild';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';

const sources = [
  'src/guest/browser.ts',
  'src/guest/engine.ts',
  'src/guest/guest-runtime.ts',
  'src/guest/native-policy.ts',
  'src/guest/text-policy.ts',
  'src/guest/native-host.ts',
  'src/guest/resources.ts',
  'src/guest/session.ts',
  'test/guest-text-bridge.browser.ts',
  'test/guest-text-bridge.ts',
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
const output = new URL('../.tools/text-bridge-browser/', import.meta.url);
await mkdir(output, { recursive: true });
const bundles = new Map<boolean, Uint8Array>();
const bundledInputs = new Set<string>();
for (const fault of [false, true]) {
  const result = await build({
    entryPoints: [new URL('./guest-text-bridge.browser.ts', import.meta.url).pathname],
    write: false,
    metafile: true,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    plugins: fault
      ? [
          {
            name: 'remove-text-get-route-control',
            setup(builder) {
              builder.onLoad(
                { filter: /\/src\/guest\/browser\.ts$/ },
                async ({ path }) => {
                  const source = await readFile(path, 'utf8');
                  const route = 'if (owner) return owner.get(target, key);';
                  assert.equal(
                    source.split(route).length,
                    2,
                    'Text getter route changed',
                  );
                  return { loader: 'ts', contents: source.replace(route, '') };
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
        ? bundles.get(address.searchParams.has('getRouteFault'))
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
    for (const fault of [false, true]) {
      const browser = await type.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.goto(
          `http://127.0.0.1:${address.port}/${fault ? '?getRouteFault=1' : ''}`,
        );
        await page.waitForFunction(
          () =>
            Reflect.get(window, '__textBridgeResult') ||
            Reflect.get(window, '__textBridgeFailure'),
          undefined,
          { timeout: 90000 },
        );
        const failure: unknown = await page.evaluate(() =>
          Reflect.get(window, '__textBridgeFailure'),
        );
        const observed: unknown = await page.evaluate(() =>
          Reflect.get(window, '__textBridgeObserved'),
        );
        if (fault) {
          assert.equal(typeof failure, 'string');
          assert.match(
            String(failure),
            /Unreviewed native text getter must be denied before execution/,
          );
          assert(observed && typeof observed === 'object' && 'unknownReads' in observed);
          assert.equal(
            observed.unknownReads,
            1,
            'Omitted get route must execute the actual unreviewed native getter',
          );
          receipts.push({
            browser: name,
            executablePath,
            executableSHA256,
            version: browser.version(),
            variant: 'Text-get-route-removed',
            observed,
            rejected: true,
          });
          console.log(name, 'Text getter route removal detected');
        } else {
          assert.equal(failure, undefined, String(failure));
          const result = await page.evaluate(() =>
            Reflect.get(window, '__textBridgeResult'),
          );
          assert.deepEqual(result, {
            construction: true,
            conversion: true,
            encoding: true,
            encodeInto: true,
            streamingDecode: true,
            fatalDecode: true,
            reflection: true,
            binaryHandoff: true,
            foreignBrandsDenied: true,
            unknownGetterDenied: true,
          });
          assert.deepEqual(errors, []);
          receipts.push({
            browser: name,
            executablePath,
            executableSHA256,
            version: browser.version(),
            variant: 'production',
            result,
            observed,
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
  'Text bridge inputs changed during the run',
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
  new URL('../results/quickjs-confinement/text-bridge.json', import.meta.url),
  JSON.stringify(
    {
      scope:
        'Actual BrowserEnvironment and QuickJS TextEncoder/TextDecoder bridge: native conversions, buffer handoff/encodeInto, stateful/fatal decoding, reflection and unknown getter/foreign brand rejection. Temporary shared nativeOwner get-route removal must execute the real unknown getter and fail the fixture. This does not verify NativeBinary ownership or other native families.',
      sourceHashes: inputHashes,
      transitiveInputHashes,
      toolchain: { node: process.version, esbuild: esbuildVersion },
      engineSHA256: hash(wasm),
      bundleHashes: {
        production: hash(bundles.get(false)!),
        textGetRouteRemoved: hash(bundles.get(true)!),
      },
      fault:
        'Only the actual BrowserEnvironment private get shared nativeOwner routing line is omitted from a temporary esbuild bundle. Production sources are unchanged.',
      receipts,
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
