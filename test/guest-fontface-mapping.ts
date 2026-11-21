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
  'src/guest/native-string-mapping.ts',
  'src/guest/css.ts',
  'src/guest/resources.ts',
  'src/guest/session.ts',
  'test/fixtures/native-fontface.ts',
  'test/fixtures/native-fontface-worker.ts',
  'node_modules/@webref/idl/css-font-loading.idl',
  'node_modules/@webref/idl/cssom.idl',
  'node_modules/@webref/idl/html.idl',
  'test/guest-fontface-mapping.browser.ts',
  'test/guest-fontface-mapping.ts',
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
const output = new URL('../.tools/native-string-mapping-browser/', import.meta.url);
await mkdir(output, { recursive: true });
const bundles = new Map<boolean, Uint8Array>();
const bundledInputs = new Set<string>();
for (const fault of [false, true]) {
  const result = await build({
    entryPoints: [
      new URL('./guest-fontface-mapping.browser.ts', import.meta.url).pathname,
    ],
    write: false,
    metafile: true,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    plugins: fault
      ? [
          {
            name: 'remove-fontface-construct-mapping-control',
            setup(builder) {
              builder.onLoad(
                { filter: /\/src\/guest\/browser\.ts$/ },
                async ({ path }) => {
                  const source = await readFile(path, 'utf8');
                  const route = 'args = this.stringMapping.construct(target, args);';
                  assert.equal(
                    source.split(route).length,
                    2,
                    'Constructor mapping route changed',
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
const workerBundle = await build({
  entryPoints: ['test/fixtures/native-fontface-worker.ts'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  metafile: true,
});
for (const path of Object.keys(workerBundle.metafile.inputs)) bundledInputs.add(path);
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
    'Content-Security-Policy',
    "media-src 'none'; img-src 'none'; font-src 'none'",
  );
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
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
      : address.pathname === '/worker.js'
        ? workerBundle.outputFiles[0].contents
        : address.pathname === '/browser.js'
          ? bundles.get(address.searchParams.has('fontFaceFault'))
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
          `http://127.0.0.1:${address.port}/${fault ? '?fontFaceFault=1' : ''}`,
        );
        await page.waitForFunction(
          () =>
            Reflect.get(window, '__fontFaceResult') ||
            Reflect.get(window, '__fontFaceFailure'),
          undefined,
          { timeout: 90000 },
        );
        const failure: unknown = await page.evaluate(() =>
          Reflect.get(window, '__fontFaceFailure'),
        );
        const observed: unknown = await page.evaluate(() =>
          Reflect.get(window, '__fontFaceObserved'),
        );
        if (fault) {
          assert.equal(typeof failure, 'string');
          assert.match(String(failure), /FontFace source resource mapping omitted/);
          assert(observed && typeof observed === 'object' && 'resources' in observed);
          assert.deepEqual(
            observed.resources,
            [],
            'Omitted constructor route must bypass actual resource mapper',
          );
          receipts.push({
            browser: name,
            executablePath,
            executableSHA256,
            version: browser.version(),
            variant: 'FontFace-construct-mapping-removed',
            observed,
            rejected: true,
          });
          console.log(name, 'FontFace constructor mapping omission detected');
        } else {
          assert.equal(failure, undefined, String(failure));
          const result = await page.evaluate(() =>
            Reflect.get(window, '__fontFaceResult'),
          );
          assert(
            result &&
              typeof result === 'object' &&
              'native' in result &&
              'worker' in result,
          );
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
          console.log(
            name,
            'native Window/Worker FontFace parity and actual QuickJS mapping passed',
          );
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
  'Native string mapping inputs changed during the run',
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
await mkdir(
  new URL('../results/quickjs-confinement/native-string-mapping/', import.meta.url),
  {
    recursive: true,
  },
);
await writeFile(
  new URL(
    '../results/quickjs-confinement/native-string-mapping/fontface.json',
    import.meta.url,
  ),
  JSON.stringify(
    {
      scope:
        'Native Window and Worker FontFace source-union conversion parity, native buffers preserved, and actual QuickJS object-source resource mapping. Omitting the actual constructor mapping fails the independent resource disposition assertion. No fonts are loaded from an outside receiver; fixture CSP blocks native fonts. This is not a complete rendering proof.',
      sourceHashes: inputHashes,
      transitiveInputHashes,
      toolchain: { node: process.version, esbuild: esbuildVersion },
      engineSHA256: hash(wasm),
      workerBundleSHA256: hash(workerBundle.outputFiles[0].contents),
      bundleHashes: {
        production: hash(bundles.get(false)!),
        fontFaceMappingRemoved: hash(bundles.get(true)!),
      },
      fault:
        'Only the actual BrowserEnvironment constructor argument mapping line is omitted from a temporary esbuild bundle. Production sources are unchanged.',
      receipts,
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
