import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';

const root = resolve(import.meta.dirname, '..');
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
async function executableHash(path: string) {
  const value = createHash('sha256');
  for await (const chunk of createReadStream(path)) value.update(chunk);
  return value.digest('hex');
}
const sources = new Map<string, string>();
const bundles = new Map<string, Uint8Array>();
for (const variant of ['production', 'omitted-get-route']) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['test/guest-abort-policy.browser.ts'],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    target: 'es2022',
    plugins:
      variant === 'production'
        ? []
        : [
            {
              name: 'omitted-owner-get-route',
              setup(builder) {
                builder.onLoad(
                  { filter: /\/src\/guest\/browser\.ts$/ },
                  async ({ path }) => {
                    let contents = await readFile(path, 'utf8');
                    const anchor = 'if (owner) return owner.get(target, key);';
                    assert.equal(contents.split(anchor).length, 2);
                    contents = contents.replace(anchor, '');
                    return { contents, loader: 'ts' };
                  },
                );
              },
            },
          ],
  });
  for (const path of Object.keys(result.metafile!.inputs))
    sources.set(path, hash(await readFile(resolve(root, path))));
  bundles.set(variant, result.outputFiles[0].contents);
}
for (const path of ['test/guest-abort-policy.ts', 'test/browser-profile.ts'])
  sources.set(path, hash(await readFile(resolve(root, path))));
const wasmPath = 'vendor/quickjs/generated/engine.wasm';
const wasm = await readFile(resolve(root, wasmPath));
sources.set(wasmPath, hash(wasm));
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://local');
  const variant = url.searchParams.get('variant') || 'production';
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
        : '<!doctype html><body><script type="module" src="/fixture.js?variant=' +
          variant +
          '"></script>',
  );
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
assert(address && typeof address !== 'string');
const observations = [];
try {
  for (const engine of [chromium, firefox]) {
    const executablePath = await realpath(engine.executablePath());
    const executableSHA256 = await executableHash(executablePath);
    const browser = await launch(engine, { executablePath });
    try {
      for (const variant of bundles.keys()) {
        const page = await browser.newPage();
        try {
          await page.goto(`http://127.0.0.1:${address.port}/?variant=${variant}`);
          await page.waitForFunction(
            () =>
              Reflect.get(window, '__abortResult') ||
              Reflect.get(window, '__abortFailure'),
            undefined,
            { timeout: 90000 },
          );
          const outcome = await page.evaluate(() => ({
            result: Reflect.get(window, '__abortResult'),
            failure: Reflect.get(window, '__abortFailure'),
          }));
          if (variant === 'production') {
            assert.equal(outcome.failure, undefined, String(outcome.failure));
            assert.deepEqual(outcome.result, {
              localAbort: true,
              staticProducers: true,
              delegatedReasons: true,
              eventLineage: true,
              timeout: true,
              signalRemoval: true,
              unknownGetterDenied: true,
              lateDeliveryDenied: true,
            });
          } else {
            assert.match(
              String(outcome.failure),
              /Unknown abort getter refused before execution/,
            );
            assert.equal(outcome.result, undefined);
          }
          observations.push({
            browser: engine.name(),
            version: browser.version(),
            executablePath,
            executableSHA256,
            variant,
            ...outcome,
          });
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
    assert.equal(await executableHash(executablePath), executableSHA256);
  }
  for (const [path, digest] of sources)
    assert.equal(
      hash(await readFile(resolve(root, path))),
      digest,
      'Changed source: ' + path,
    );
  const output = resolve(root, 'results/quickjs-confinement/abort-policy');
  await mkdir(output, { recursive: true });
  await writeFile(
    resolve(output, 'browser.json'),
    JSON.stringify(
      {
        invocation: 'node --import tsx test/guest-abort-policy.ts',
        node: process.version,
        launchProfile: 'test/browser-profile.ts with explicit executablePath',
        source: Object.fromEntries(sources),
        bundles: Object.fromEntries(
          [...bundles].map(([key, value]) => [key, hash(value)]),
        ),
        observations,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
}
