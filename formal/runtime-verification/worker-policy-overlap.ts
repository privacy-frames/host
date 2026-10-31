import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { chromium, firefox, type Page } from 'playwright';
import { launch } from '../../test/browser-profile.ts';
import { sharedWorkerKey } from '../../src/shared/shared-worker.ts';
import { publisherName } from '../../src/runtime/publisher/protocol.ts';

interface Identity {
  revision: number;
  instance: string;
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
      for (const kind of ['shared', 'publisher'] as const) {
        for (const type of ['classic', 'module'] as const) {
          const context = await browser.newContext();
          try {
            const first = await context.newPage();
            const next = await context.newPage();
            await first.goto(origin);
            await next.goto(origin);
            const path = `/${browserName}-${kind}-${type}.js`;
            const owner = {
              application: 'application',
              installationGeneration: 'generation',
            };
            const name =
              kind === 'shared'
                ? sharedWorkerKey(owner, { source: origin + path, name: 'app', type })
                : publisherName(
                    owner.application,
                    owner.installationGeneration,
                    'executor',
                  );
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
            // Candidate namespace partition only: this is not production admission.
            const partitioned = await connect(
              next,
              origin + path,
              name + ':policy-2',
              type,
            );
            assert.equal(partitioned.revision, 2);
            assert.notEqual(partitioned.instance, original.instance);
            const afterPartition = requests.filter((request) => request === path).length;
            assert.equal(afterPartition - afterReuse, 1);
            rows.push({
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
              'reused old global; partition created fresh global',
            );
          } finally {
            await context.close();
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
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
          'Native SharedWorker reuse using production namespace helpers. Changed server script represents a later bootstrap deployment. Does not exercise production admission, prove an escape, or establish a production repair.',
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
