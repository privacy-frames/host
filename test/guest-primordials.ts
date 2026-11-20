import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';

const directory = new URL('../.tools/guest-primordials/', import.meta.url);
await mkdir(directory, { recursive: true });
const helperPath = new URL('../src/guest/guest-runtime.ts', import.meta.url);
const helper = await readFile(helperPath, 'utf8');
const binaryPath = new URL('../src/guest/guest-binary.ts', import.meta.url);
const binary = await readFile(binaryPath, 'utf8');
const variants = [
  { name: 'prepared' },
  {
    name: 'dynamic-object-create',
    anchor: 'const createObject = Object.create;',
    replacement:
      'const createObject = (prototype: object | null) => Object.create(prototype);',
    failed: 'capturedOperations',
    diagnostic: 'mutable operation was invoked',
  },
  {
    name: 'inherited-handler',
    anchor: 'setPrototype(handler, null);',
    replacement: '',
    failed: 'privateProxyHandler',
    diagnostic: 'inherited proxy handler',
  },
  {
    name: 'inherited-index',
    anchor: 'index: undefined,',
    replacement: '',
    failed: 'privateIndexRecord',
    diagnostic: 'inherited private index read',
  },
  {
    name: 'mutable-classifier',
    anchor:
      "if (reflectApply(ordinaryHasInstance, PromiseConstructor, [value])) return 'promise';",
    replacement: "if (value instanceof PromiseConstructor) return 'promise';",
    failed: 'classification',
    diagnostic: 'application hasInstance',
  },
  {
    name: 'inherited-binary-handler',
    file: 'guest-binary',
    anchor: 'const handler: ProxyHandler<Function> = create(null);',
    replacement: 'const handler: ProxyHandler<Function> = {};',
    failed: 'binaryConstructorHandler',
    diagnostic: 'inherited binary constructor handler',
  },
] as const;
async function compile(variant: (typeof variants)[number]): Promise<Buffer<ArrayBuffer>> {
  const file = 'file' in variant ? variant.file : 'guest-runtime';
  let source = file === 'guest-binary' ? binary : helper;
  if ('anchor' in variant) {
    assert.equal(source.split(variant.anchor).length, 2, 'Fault anchor changed');
    source = source.replace(variant.anchor, variant.replacement);
  }
  await build({
    entryPoints: [new URL('guest-primordials.browser.ts', import.meta.url).pathname],
    outfile: new URL('browser.js', directory).pathname,
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    plugins: [
      {
        name: 'private-helper-control',
        setup(build) {
          build.onLoad({ filter: new RegExp('/' + file + '\\.ts$') }, (args) => ({
            contents: source,
            loader: 'ts',
            resolveDir: dirname(args.path),
          }));
        },
      },
    ],
  });
  return readFile(new URL('browser.js', directory));
}
const wasm = await readFile(
  new URL('../vendor/quickjs/generated/engine.wasm', import.meta.url),
);
const files = new Map([['/quickjs.wasm', { bytes: wasm, type: 'application/wasm' }]]);
const server = createServer((request, response) => {
  const file = files.get(new URL(request.url || '/', 'http://local.invalid').pathname);
  response.setHeader('Content-Type', file?.type ?? 'text/html');
  response.end(
    file?.bytes ?? '<!doctype html><script type="module" src="/browser.js"></script>',
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const observations = [];
try {
  for (const variant of variants) {
    const bundle = await compile(variant);
    files.set('/browser.js', { bytes: bundle, type: 'text/javascript' });
    for (const [name, type] of [
      ['chromium', chromium],
      ['firefox', firefox],
    ] as const) {
      const browser = await type.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${address.port}/`);
        await page.waitForFunction(() => globalThis.guestPrimordialResults !== undefined);
        const result = await page.evaluate(() => globalThis.guestPrimordialResults);
        observations.push({
          variant: variant.name,
          browser: name,
          version: browser.version(),
          bundleSHA256: createHash('sha256').update(bundle).digest('hex'),
          result,
          errors,
        });
        console.log(JSON.stringify(observations.at(-1)));
        assert.deepEqual(errors, []);
        assert(result.checks && !result.error, JSON.stringify(result));
        for (const key of [
          'capturedOperations',
          'privateProxyHandler',
          'privateIndexRecord',
          'classification',
          'thrownReference',
          'binaryConstructorHandler',
        ]) {
          const value: unknown = result.checks[key];
          if ('failed' in variant && key === variant.failed) {
            assert(value && typeof value === 'object' && 'error' in value);
            assert(typeof value.error === 'string');
            assert(value.error.includes(variant.diagnostic), value.error);
          } else assert.equal(value, true, key);
        }
      } finally {
        await browser.close();
      }
    }
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const output = new URL('../results/quickjs-confinement/', import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(
    new URL('primordials.json', output),
    JSON.stringify(
      {
        helperSHA256: createHash('sha256').update(helper).digest('hex'),
        binaryHelperSHA256: createHash('sha256').update(binary).digest('hex'),
        engineSHA256: createHash('sha256').update(wasm).digest('hex'),
        observations,
      },
      null,
      2,
    ) + '\n',
  );
}
