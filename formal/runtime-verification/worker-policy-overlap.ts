import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { chromium, firefox, type Page } from 'playwright';
import { launch } from '../../test/browser-profile.ts';
import { CONTEXT_POLICY_VERSION } from '../../src/shared/context-policy.ts';

interface Identity {
  revision: number;
  instance: string;
}
type Mode = 'production' | 'omitted-policy';
const bundles: Array<{ mode: Mode; version: number; sha256: string }> = [];
async function namespaceHelper(mode: Mode, version: number) {
  const result = await build({
    stdin: {
      contents: `import { sharedWorkerKey } from './src/shared/shared-worker.ts';
import { publisherName } from './src/runtime/publisher/protocol.ts';
export function name(kind, type, url) {
  return kind === 'shared'
    ? sharedWorkerKey({application:'application', installationGeneration:'generation'},
        {source:url, type, name:'app'})
    : publisherName('application', 'generation', 'executor');
}`,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'namespaceFixture',
    target: 'es2022',
    plugins: [
      {
        name: 'policy-overlap-fixture',
        setup(builder) {
          builder.onLoad({ filter: /context-policy\.ts$/ }, async ({ path }) => {
            assert.equal(path, resolve('src/shared/context-policy.ts'));
            const source = await readFile(path, 'utf8');
            const target = 'CONTEXT_POLICY_VERSION = ' + CONTEXT_POLICY_VERSION;
            assert.equal(source.split(target).length, 2);
            return {
              contents: source.replace(target, 'CONTEXT_POLICY_VERSION = ' + version),
              loader: 'ts',
            };
          });
          if (mode === 'omitted-policy')
            builder.onLoad(
              { filter: /(?:shared-worker|protocol)\.ts$/ },
              async ({ path }) => {
                if (
                  path !== resolve('src/shared/shared-worker.ts') &&
                  path !== resolve('src/runtime/publisher/protocol.ts')
                )
                  return;
                const source = await readFile(path, 'utf8');
                const target = " + CONTEXT_POLICY_VERSION + ':'";
                assert.equal(source.split(target).length, 2);
                return { contents: source.replace(target, " + ':'"), loader: 'ts' };
              },
            );
        },
      },
    ],
  });
  const source = result.outputFiles[0].text;
  bundles.push({
    mode,
    version,
    sha256: createHash('sha256').update(source).digest('hex'),
  });
  const exports: unknown = runInNewContext(source + '\nnamespaceFixture');
  assert(exports && typeof exports === 'object');
  const operation: unknown = Reflect.get(exports, 'name');
  assert.equal(typeof operation, 'function');
  assert(typeof operation === 'function');
  return (kind: string, type: string, url: string): string => {
    const value: unknown = Reflect.apply(operation, undefined, [kind, type, url]);
    assert.equal(typeof value, 'string');
    assert(typeof value === 'string');
    return value;
  };
}
const helpers = new Map<
  Mode,
  {
    previous: ReturnType<typeof namespaceHelper>;
    current: ReturnType<typeof namespaceHelper>;
  }
>();
for (const mode of ['production', 'omitted-policy'] as const)
  helpers.set(mode, {
    previous: namespaceHelper(mode, CONTEXT_POLICY_VERSION - 1),
    current: namespaceHelper(mode, CONTEXT_POLICY_VERSION),
  });
// Finish builds before serving browser requests; no production source is changed.
for (const helper of helpers.values()) {
  await helper.previous;
  await helper.current;
}
const requests: string[] = [];
let revision = 1;
const server = http.createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.url?.endsWith('.js')) {
    requests.push(request.url);
    response.setHeader('Content-Type', 'text/javascript');
    response.end(`const identity = { revision: ${revision}, instance: crypto.randomUUID() };
self.onconnect = event => event.ports[0].postMessage(identity);`);
    return;
  }
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><link rel="icon" href="data:,">Worker policy overlap');
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const origin = 'http://127.0.0.1:' + address.port;
const receipt = new URL('./worker-policy-overlap.json', import.meta.url);
await rm(receipt, { force: true });
const rows: object[] = [];
let completed = false;
let failure: string | undefined;
async function connect(page: Page, url: string, name: string, type: WorkerType) {
  return page.evaluate<Identity, { url: string; name: string; type: WorkerType }>(
    ({ url, name, type }) =>
      new Promise((resolve, reject) => {
        const worker = new SharedWorker(url, { name, type, credentials: 'omit' });
        // Retain native ports until both launch documents have been observed.
        Reflect.set(window, name, worker);
        const timer = setTimeout(() => reject(new Error('Worker timed out')), 10000);
        worker.onerror = () => {
          clearTimeout(timer);
          reject(new Error('Worker failed'));
        };
        worker.port.onmessage = (event: MessageEvent<Identity>) => {
          clearTimeout(timer);
          resolve(event.data);
        };
      }),
    { url, name, type },
  );
}
try {
  for (const [browserName, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      for (const [mode, pending] of helpers) {
        const previousName = await pending.previous;
        const currentName = await pending.current;
        for (const kind of ['shared', 'publisher'] as const) {
          for (const type of ['classic', 'module'] as const) {
            const context = await browser.newContext();
            try {
              const first = await context.newPage();
              const next = await context.newPage();
              await first.goto(origin);
              await next.goto(origin);
              const path = `/${browserName}-${mode}-${kind}-${type}.js`;
              const name = previousName(kind, type, origin + path);
              const newName = currentName(kind, type, origin + path);
              assert.equal(name === newName, mode === 'omitted-policy');
              revision = 1;
              const before = requests.filter((request) => request === path).length;
              const original = await connect(first, origin + path, name, type);
              assert.equal(original.revision, 1);
              const afterFirst = requests.filter((request) => request === path).length;
              assert.equal(afterFirst - before, 1);
              revision = 2;
              const reused = await connect(next, origin + path, name, type);
              assert.deepEqual(reused, original);
              const afterReuse = requests.filter((request) => request === path).length;
              assert.equal(afterReuse, afterFirst);
              const partitioned = await connect(next, origin + path, newName, type);
              if (mode === 'production') {
                assert.equal(partitioned.revision, 2);
                assert.notEqual(partitioned.instance, original.instance);
              } else {
                assert.deepEqual(partitioned, original);
                assert.throws(
                  () => assert.notEqual(partitioned.instance, original.instance),
                  {
                    code: 'ERR_ASSERTION',
                    actual: original.instance,
                    expected: original.instance,
                  },
                );
              }
              const sharedCurrent = await connect(first, origin + path, newName, type);
              assert.deepEqual(sharedCurrent, partitioned);
              const afterPartition = requests.filter(
                (request) => request === path,
              ).length;
              assert.equal(afterPartition - afterReuse, mode === 'production' ? 1 : 0);
              rows.push({
                mode,
                browser: browserName,
                version: browser.version(),
                kind,
                type,
                original,
                reused,
                partitioned,
                fetches: {
                  initial: afterFirst - before,
                  reused: afterReuse - afterFirst,
                  partitioned: afterPartition - afterReuse,
                },
              });
              console.log(
                browserName,
                kind,
                type,
                mode,
                mode === 'production'
                  ? 'fresh policy global; current-policy sharing retained'
                  : 'detected reuse after policy partition removal',
              );
            } finally {
              await context.close();
            }
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
  assert.equal(rows.length, 16);
  completed = true;
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const hashes: Record<string, string> = {};
  for (const path of [
    'formal/runtime-verification/worker-policy-overlap.ts',
    'src/shared/shared-worker.ts',
    'src/shared/context-policy.ts',
    'src/shared/primordials.ts',
    'src/runtime/publisher/protocol.ts',
    'test/browser-profile.ts',
    'package-lock.json',
  ])
    hashes[path] = createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
  await writeFile(
    receipt,
    JSON.stringify(
      {
        scope:
          'Native SharedWorker policy partition using bundled production namespace helpers at current and preceding policy constants, plus a test-only partition-removal fault. Changed server script represents a later bootstrap deployment. Checks instance sharing and fresh script fetches; does not exercise complete production admission, revoke old globals, or establish no remote effects.',
        policyVersion: CONTEXT_POLICY_VERSION,
        bundles,
        completed,
        failure,
        sourceSHA256: hashes,
        rows,
      },
      null,
      2,
    ) + '\n',
  );
}
