import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { chromium, firefox, type Page } from 'playwright';
import { launch } from '../../test/browser-profile.ts';

const workerScript = `
const identity = { instance: crypto.randomUUID(), href: location.href,
  serviceWorkerContainer: typeof navigator.serviceWorker };
self.onmessage = event => {
  if(event.ports.length === 1) {
    event.ports[0].postMessage(identity);
    event.ports[0].close();
  }
};
postMessage(identity);`;
const serviceScript = `
const fetches = [];
const describe = client => client ? {id:client.id, url:client.url, type:client.type} : null;
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  fetches.push({url:event.request.url, clientId:event.clientId,
    resultingClientId:event.resultingClientId, destination:event.request.destination});
  if(new URL(event.request.url).pathname === '/app/http.js')
    event.respondWith(new Response(${JSON.stringify(workerScript)}, {
      headers:{'content-type':'text/javascript'}
    }));
});
self.addEventListener('message', event => event.waitUntil((async () => {
  const port = event.ports[0];
  if(!port) return;
  try {
    const source = event.source && 'id' in event.source
      ? await clients.get(event.source.id) : null;
    const lists = {};
    for(const type of ['all', 'worker', 'sharedworker'])
      lists[type] = (await clients.matchAll({type, includeUncontrolled:true})).map(describe);
    const http = fetches.find(item => new URL(item.url).pathname === '/app/http.js');
    const knownId = event.data?.id || http?.resultingClientId;
    port.postMessage({source:describe(source), lists, fetches:[...fetches],
      known:knownId ? describe(await clients.get(knownId)) : null});
  } catch(error) { port.postMessage({error:String(error)}); }
  finally { port.close(); }
})()));`;
const traffic: Array<{ path: string; at: number }> = [];
const server = http.createServer((request, response) => {
  const path = request.url || '/';
  traffic.push({ path, at: Date.now() });
  response.setHeader('Cache-Control', 'no-store');
  if (path === '/app/sw.js' || path === '/app/http.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(path.endsWith('sw.js') ? serviceScript : workerScript);
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      '<!doctype html><link rel="icon" href="data:,"><title>Native worker identity</title>',
    );
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const origin = 'http://127.0.0.1:' + address.port;
interface ClientIdentity {
  id: string;
  url: string;
  type: string;
}
interface FetchIdentity {
  url: string;
  clientId: string;
  resultingClientId: string;
  destination: string;
}
interface Snapshot {
  source: ClientIdentity;
  lists: {
    all: ClientIdentity[];
    worker: ClientIdentity[];
    sharedworker: ClientIdentity[];
  };
  fetches: FetchIdentity[];
  known: ClientIdentity | null;
}
function client(value: unknown): ClientIdentity {
  assert(
    value &&
      typeof value === 'object' &&
      'id' in value &&
      typeof value.id === 'string' &&
      'url' in value &&
      typeof value.url === 'string' &&
      'type' in value &&
      typeof value.type === 'string',
  );
  return { id: value.id, url: value.url, type: value.type };
}
async function snapshot(page: Page, id?: string): Promise<Snapshot> {
  const raw: unknown = await page.evaluate(
    (id) =>
      new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => reject(new Error('Snapshot timed out')), 10000);
        channel.port1.onmessage = (event) => {
          clearTimeout(timer);
          channel.port1.close();
          resolve(event.data);
        };
        if (!navigator.serviceWorker.controller)
          throw new Error('Retained controller missing');
        navigator.serviceWorker.controller.postMessage({ id }, [channel.port2]);
      }),
    id,
  );
  assert(
    raw &&
      typeof raw === 'object' &&
      'source' in raw &&
      'lists' in raw &&
      raw.lists &&
      typeof raw.lists === 'object' &&
      'fetches' in raw &&
      Array.isArray(raw.fetches) &&
      'known' in raw,
  );
  const source = client(raw.source);
  const lists = {
    all: [] as ClientIdentity[],
    worker: [] as ClientIdentity[],
    sharedworker: [] as ClientIdentity[],
  };
  for (const key of ['all', 'worker', 'sharedworker'] as const) {
    const entries: unknown = Reflect.get(raw.lists, key);
    assert(Array.isArray(entries));
    lists[key] = entries.map(client);
  }
  const fetches = raw.fetches.map((value: unknown): FetchIdentity => {
    assert(
      value &&
        typeof value === 'object' &&
        'url' in value &&
        typeof value.url === 'string' &&
        'clientId' in value &&
        typeof value.clientId === 'string' &&
        'resultingClientId' in value &&
        typeof value.resultingClientId === 'string' &&
        'destination' in value &&
        typeof value.destination === 'string',
    );
    return {
      url: value.url,
      clientId: value.clientId,
      resultingClientId: value.resultingClientId,
      destination: value.destination,
    };
  });
  return { source, lists, fetches, known: raw.known === null ? null : client(raw.known) };
}
async function start(page: Page, type: WorkerType, blob: boolean) {
  return page.evaluate(
    async ({ type, blob, script }) => {
      const url = blob
        ? URL.createObjectURL(new Blob([script], { type: 'text/javascript' }))
        : new URL('./http.js', location.href).href;
      const worker = new Worker(url, { type });
      const ready = await new Promise<{
        instance: string;
        href: string;
        serviceWorkerContainer: string;
      }>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Worker ready timed out')),
          10000,
        );
        worker.onmessage = (event) => {
          clearTimeout(timer);
          if (event.currentTarget !== worker || !event.isTrusted)
            return reject(new Error('Native worker target differs'));
          resolve(event.data);
        };
        worker.onerror = (event) => {
          clearTimeout(timer);
          reject(new Error(event.message));
        };
      });
      const channel = new MessageChannel();
      const proof = await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Private worker port timed out')),
          10000,
        );
        channel.port1.onmessage = (event) => {
          clearTimeout(timer);
          channel.port1.close();
          resolve(event.data);
        };
        worker.postMessage('connect', [channel.port2]);
      });
      const handles: unknown = Reflect.get(window, 'identityProbeHandles');
      const retained = Array.isArray(handles) ? handles : [];
      retained.push({ worker, url, blob });
      Reflect.set(window, 'identityProbeHandles', retained);
      return { url, ready, proof };
    },
    { type, blob, script: workerScript },
  );
}
async function quiet(page: Page) {
  const deadline = Date.now() + 20000;
  let count = traffic.length,
    changed = Date.now();
  while (Date.now() - changed < 3000) {
    assert(Date.now() < deadline, 'Setup did not become quiet');
    await page.waitForTimeout(50);
    if (traffic.length !== count) {
      count = traffic.length;
      changed = Date.now();
    }
  }
}
const receipt = new URL('./blob-worker-identity.json', import.meta.url);
await rm(receipt, { force: true });
const rows: object[] = [];
let completed = false;
let failure: string | undefined;
try {
  for (const profile of [
    { engine: chromium, stale: false },
    { engine: firefox, stale: false },
    { engine: firefox, stale: true },
  ]) {
    const browser = await launch(
      profile.engine,
      profile.stale
        ? { firefoxUserPrefs: { 'dom.serviceWorkers.testUpdateOverOneDay': true } }
        : {},
    );
    try {
      for (const unregister of [false, true])
        for (const type of ['classic', 'module'] as const) {
          const context = await browser.newContext();
          try {
            const page = await context.newPage();
            await page.goto(origin + '/app/');
            await page.evaluate(async () => {
              await navigator.serviceWorker.register('./sw.js', {
                updateViaCache: 'none',
              });
              await navigator.serviceWorker.ready;
              if (!navigator.serviceWorker.controller)
                await new Promise<void>((resolve) =>
                  navigator.serviceWorker.addEventListener(
                    'controllerchange',
                    () => resolve(),
                    { once: true },
                  ),
                );
            });
            const httpWorker = await start(page, type, false);
            assert.equal(httpWorker.ready.href, httpWorker.url);
            assert.deepEqual(httpWorker.proof, httpWorker.ready);
            const before = await snapshot(page);
            assert.equal(before.source.type, 'window');
            assert.equal(before.source.url, page.url());
            assert(
              before.lists.all.some((item) => item.id === before.source.id),
              'Window enumeration control missing',
            );
            const bootstrap = before.fetches.find((item) => item.url === httpWorker.url);
            assert(
              bootstrap &&
                bootstrap.resultingClientId &&
                bootstrap.destination === 'worker',
            );
            assert.equal(bootstrap.clientId, before.source.id);
            if (unregister)
              assert(
                await page.evaluate(async () => {
                  const registration = await navigator.serviceWorker.getRegistration();
                  if (!registration) throw new Error('Registration missing');
                  return registration.unregister();
                }),
              );
            await quiet(page);
            const startTraffic = traffic.length;
            const blobWorker = await start(page, type, true);
            assert.equal(blobWorker.ready.href, blobWorker.url);
            assert.deepEqual(blobWorker.proof, blobWorker.ready);
            let after = await snapshot(page);
            const observations: Snapshot[] = [after];
            // A bounded observation, not a proof that an absent client can never appear.
            for (
              let attempt = 0;
              attempt < 10 &&
              !after.lists.all.some((item) => item.url === blobWorker.url);
              attempt++
            ) {
              await page.waitForTimeout(100);
              after = await snapshot(page);
              observations.push(after);
            }
            assert.equal(
              after.fetches.length,
              before.fetches.length,
              'Blob created a fetch event',
            );
            const candidates = after.lists.all.filter(
              (item) => item.url === blobWorker.url,
            );
            assert.equal(candidates.length, 1, 'Blob enumeration contract changed');
            assert.equal(candidates[0].type, 'worker');
            assert.notEqual(candidates[0].id, bootstrap.resultingClientId);
            const resolved = [];
            for (const candidate of candidates)
              resolved.push((await snapshot(page, candidate.id)).known);
            assert.deepEqual(resolved, candidates, 'Blob client did not resolve');
            assert(
              before.known &&
                before.known.id === bootstrap.resultingClientId &&
                before.known.url === httpWorker.url,
            );
            assert(after.lists.worker.some((item) => item.id === candidates[0].id));
            await page.waitForTimeout(3000);
            const outgoing = traffic.slice(startTraffic);
            assert.deepEqual(outgoing, []);
            rows.push({
              browser: profile.engine.name(),
              version: browser.version(),
              forcedStale: profile.stale,
              unregister,
              type,
              httpWorker,
              before,
              blobWorker,
              observations,
              candidates,
              resolved,
              observationMilliseconds: 3000,
              outgoing,
            });
            console.log(
              profile.engine.name(),
              profile.stale ? 'forced-stale' : 'fresh',
              unregister ? 'unregistered' : 'registered',
              type,
              'HTTP get:',
              Boolean(before.known),
              'Blob candidates:',
              candidates.length,
            );
          } finally {
            await context.close();
          }
        }
    } finally {
      await browser.close();
    }
  }
  assert.equal(rows.length, 12);
  completed = true;
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  try {
    const hashes: Record<string, string> = {};
    for (const path of [
      'formal/runtime-verification/blob-worker-identity.ts',
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
            'Native worker identity and private-port association prerequisite. Uses a controlled metadata-only script, not production admission, guard preparation, or full confinement. Missing enumeration is bounded observation.',
          completed,
          failure,
          sourceSHA256: hashes,
          rows,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
