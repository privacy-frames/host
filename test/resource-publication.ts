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
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sources = new Map<string, string>();
const bundles = new Map<string, Uint8Array>();
for (const fault of ['none', 'cleanup', 'generation']) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['test/resource-publication.browser.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    metafile: true,
    plugins: [
      {
        name: 'resource-publication-controls',
        setup(builder) {
          builder.onLoad({ filter: /\/src\/runtime\/storage\.ts$/ }, async ({ path }) => {
            let contents = await readFile(path, 'utf8');
            const anchor =
              fault === 'cleanup'
                ? "IDBKeyRange.bound([id, ''], [id, []], false, true)"
                : 'if (installation?.generation !== expectedGeneration)';
            if (fault !== 'none') {
              assert.equal(contents.split(anchor).length, 2);
              contents = contents.replace(
                anchor,
                fault === 'cleanup'
                  ? "IDBKeyRange.bound([id, ''], [id, '\\uffff'])"
                  : 'if (false)',
              );
            }
            return { contents, loader: 'ts' };
          });
        },
      },
    ],
  });
  for (const path of Object.keys(result.metafile!.inputs))
    sources.set(path, hash(await readFile(resolve(root, path))));
  bundles.set(fault, result.outputFiles[0].contents);
}
for (const path of ['test/resource-publication.ts', 'test/browser-profile.ts'])
  sources.set(path, hash(await readFile(resolve(root, path))));
const server = createServer((request, response) => {
  const key = new URL(request.url || '/', 'http://local').pathname.slice(1);
  const code = bundles.get(key);
  response.setHeader('Content-Type', code ? 'text/javascript' : 'text/html');
  response.end(code || '<!doctype html><title>Local IndexedDB fixture</title>');
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
assert(address && typeof address !== 'string');
async function executableHash(path: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}
const observations = [];
const executables: Record<string, { path: string; sha256: string }> = {};
try {
  for (const engine of [chromium, firefox]) {
    // Select the exact executable rather than infer the headless-shell path.
    const executablePath = await realpath(engine.executablePath());
    const sha256 = await executableHash(executablePath);
    executables[engine.name()] = { path: executablePath, sha256 };
    for (const fault of bundles.keys()) {
      const browser = await launch(engine, { executablePath });
      try {
        const page = await browser.newPage();
        const remote: string[] = [];
        await page.route('**/*', (route) =>
          new URL(route.request().url()).hostname === '127.0.0.1'
            ? route.continue()
            : (remote.push(route.request().url()), route.abort()),
        );
        await page.goto(`http://127.0.0.1:${address.port}/`);
        await page.addScriptTag({ url: '/' + fault });
        const checks = await page.evaluate(async () => {
          const run: unknown = Reflect.get(globalThis, 'runResourcePublication');
          if (typeof run !== 'function') throw new Error('Missing fixture');
          return (await run()) as Record<string, boolean>;
        });
        const failed = Object.keys(checks)
          .filter((key) => !checks[key])
          .sort();
        assert.deepEqual(
          failed,
          fault === 'cleanup'
            ? ['cleanupRemove', 'cleanupReplace', 'removedBodyRefused']
            : fault === 'generation'
              ? ['staleGenerationRefused']
              : [],
        );
        assert.deepEqual(remote, []);
        observations.push({
          browser: engine.name(),
          version: browser.version(),
          fault,
          checks,
        });
      } finally {
        await browser.close();
      }
    }
    assert.equal(
      await executableHash(executablePath),
      sha256,
      'Browser executable changed',
    );
  }
  for (const [path, digest] of sources)
    assert.equal(
      hash(await readFile(resolve(root, path))),
      digest,
      'Source changed: ' + path,
    );
  const output = resolve(root, 'results/quickjs-confinement/resource-publication');
  await mkdir(output, { recursive: true });
  await writeFile(
    resolve(output, 'browser.json'),
    JSON.stringify(
      {
        invocation: 'node --import tsx test/resource-publication.ts',
        completed: new Date().toISOString(),
        node: process.version,
        launchProfile: 'test/browser-profile.ts with explicit executablePath',
        executables,
        sources: Object.fromEntries(sources),
        bundles: Object.fromEntries(
          [...bundles].map(([key, bytes]) => [key, hash(bytes)]),
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
