import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { publicAlias } from '../../../src/shared/runtime-url.ts';

const root = resolve(import.meta.dirname, '../../..');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const sources = new Map<string, string>();
const turn = () => new Promise<void>((done) => setImmediate(done));
type Identity = { id: string; type: string; url: string };
type Packet = { ok?: boolean; type?: string; value?: unknown; error?: string };
type Fault = 'none' | 'mutation' | 'reply' | 'recipient' | 'ready';

class Port {
  onmessage: ((event: { data: unknown; isTrusted: boolean }) => void) | null = null;
  closed = false;
  sent: Packet[] = [];
  start() {}
  close() {
    this.closed = true;
  }
  postMessage(value: Packet) {
    this.sent.push(value);
  }
}

interface Pending {
  name: string;
  release(): void;
}
class Scheduler {
  pending: Pending[] = [];
  trace: { name: string; value: unknown }[] = [];
  wait<T>(name: string, value: () => T): Promise<T> {
    return new Promise((done) => {
      this.pending.push({
        name,
        release: () => {
          const result = value();
          this.trace.push({ name, value: result });
          done(result);
        },
      });
    });
  }
}

const bundled = new Map<string, string>();
async function bundle(kind: 'worker' | 'connect', fault: Fault = 'none') {
  const key = kind + fault;
  if (bundled.has(key)) return bundled.get(key)!;
  const entry = kind === 'worker' ? 'src/runtime/worker.ts' : 'src/bridge/connect.ts';
  const result = await build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    metafile: true,
    define: { __BUILD_ID__: '"management-composition"' },
    plugins: [
      {
        name: 'controlled-native-boundaries',
        setup(builder) {
          builder.onLoad(
            { filter: /\/src\/(?:runtime\/worker|bridge\/connect)\.ts$/ },
            async ({ path }) => {
              let contents = await readFile(path, 'utf8');
              sources.set(path, hash(contents));
              const remove = (anchor: string, replacement = '') => {
                assert.equal(
                  contents.split(anchor).length,
                  2,
                  'Omission anchor must be exact',
                );
                contents = contents.replace(anchor, replacement);
              };
              if (fault === 'mutation')
                remove(
                  '        await requireManagementClient(sourceID);\n        await putApp(app);',
                  '        await putApp(app);',
                );
              if (fault === 'reply')
                remove(
                  '      await requireManagementClient(sourceID);\n      port.postMessage({ ok: true, value });',
                  '      port.postMessage({ ok: true, value });',
                );
              if (fault === 'recipient') {
                const start = contents.indexOf('        if (\n          !recipient ||');
                const end = contents.indexOf(
                  '        port.postMessage({ ok: true, value }',
                  start,
                );
                assert(start >= 0 && end > start);
                contents = contents.slice(0, start) + contents.slice(end);
              }
              if (fault === 'ready')
                remove(
                  '      if (!managementPortIsCurrent(closed, port, candidate)) {\n        candidate.close();\n        return;\n      }\n',
                );
              return { contents, loader: 'ts' };
            },
          );
          if (kind !== 'worker') return;
          builder.onLoad({ filter: /\/src\/runtime\/storage\.ts$/ }, () => ({
            loader: 'js',
            contents:
              'export const getApp=(...a)=>fixture.getApp(...a); export const listApps=()=>fixture.listApps(); export const putApp=(...a)=>fixture.putApp(...a); export const deleteApp=(...a)=>fixture.deleteApp(...a); export const getResource=()=>{throw Error("unmodeled resource read")};',
          }));
          builder.onLoad({ filter: /\/src\/runtime\/admission\.ts$/ }, () => ({
            loader: 'js',
            contents: 'export const admitInstallation=(...a)=>fixture.admit(...a);',
          }));
          builder.onLoad({ filter: /\/src\/guest\/catalog\.ts$/ }, () => ({
            loader: 'js',
            contents:
              'export const GUEST_BOOTSTRAP_REQUEST="privacy-frames:guest-bootstrap"; export const createGuestCatalog=(...a)=>fixture.catalog(...a);',
          }));
        },
      },
    ],
  });
  for (const path of Object.keys(result.metafile!.inputs)) {
    const full = resolve(root, path);
    sources.set(full, hash(await readFile(full, 'utf8')));
  }
  const code = result.outputFiles[0].text;
  bundled.set(key, code);
  return code;
}

const manager: Identity = {
  id: 'manager',
  type: 'window',
  url: 'https://runtime/connect.html',
};
const app = {
  id: 'fixture-' + 'a'.repeat(64),
  generation: 'g0',
  capture: {},
  manifest: {},
};
const application: Identity = {
  id: 'app',
  type: 'window',
  url: `https://runtime/${publicAlias(app.id)}/fixture/`,
};
class World {
  clients = new Map<string, Identity>([[manager.id, manager]]);
  generation: string | undefined = 'g0';
  writes: { operation: string; identity: Identity | undefined; fresh: boolean }[] = [];
}
async function workerFixture(world = new World(), fault: Fault = 'none') {
  const scheduler = new Scheduler();
  let receive!: (event: object) => void;
  let lastIdentity: Identity | undefined;
  const freshMutation = () => {
    const names = scheduler.trace.map((item) => item.name);
    return (
      names.findLastIndex((name) => name.startsWith('client:')) >
      names.lastIndexOf('matchAll')
    );
  };
  const write = (operation: string) => {
    const identity = lastIdentity;
    const fresh = freshMutation();
    return scheduler.wait(operation === 'install' ? 'putApp' : 'deleteApp', () => {
      world.writes.push({ operation, identity, fresh });
      world.generation = operation === 'install' ? 'g1' : undefined;
    });
  };
  const fixture = {
    getApp: () =>
      scheduler.wait('getApp', () =>
        world.generation ? { ...app, generation: world.generation } : undefined,
      ),
    listApps: () =>
      scheduler.wait('listApps', () =>
        world.generation ? [{ ...app, generation: world.generation }] : [],
      ),
    putApp: () => write('install'),
    deleteApp: () => write('remove'),
    admit: () => scheduler.wait('admit', () => app),
    catalog: () =>
      scheduler.wait('catalog', () => ({
        generation: 'g0',
        engineWasm: new ArrayBuffer(0),
        workerBootstrap: {
          dedicated: new ArrayBuffer(0),
          shared: new ArrayBuffer(0),
          worklet: new ArrayBuffer(0),
        },
        resources: [],
      })),
  };
  runInNewContext(await bundle('worker', fault), {
    self: {
      location: { href: 'https://runtime/sw.js' },
      clients: {
        get: (id: string) =>
          scheduler.wait('client:' + id, () => {
            lastIdentity = world.clients.get(id);
            return lastIdentity && { ...lastIdentity };
          }),
        matchAll: () =>
          scheduler.wait('matchAll', () =>
            [...world.clients.values()].map((item) => ({ ...item })),
          ),
      },
      addEventListener: (name: string, fn: typeof receive) => {
        if (name === 'message') receive = fn;
      },
    },
    fixture,
    URL,
    Date,
    ArrayBuffer,
    btoa,
    caches: {
      open: () =>
        scheduler.wait('cache.open', () => ({
          match: () =>
            scheduler.wait('cache.match', () => ({
              ok: true,
              arrayBuffer: () => scheduler.wait('cache.bytes', () => new ArrayBuffer(0)),
            })),
        })),
    },
  });
  function request(operation: string, sourceID = 'manager') {
    const port = new Port();
    let finished = false;
    receive({
      isTrusted: true,
      source: { id: sourceID },
      ports: [port],
      data:
        operation === 'bootstrap'
          ? { type: 'privacy-frames:guest-bootstrap' }
          : { operation, payload: operation === 'remove' ? app.id : {} },
      waitUntil: (promise: Promise<void>) => {
        void promise.then(() => {
          finished = true;
        });
      },
    });
    return { port, finished: () => finished };
  }
  return { scheduler, request, world };
}
async function drain(
  fixture: Awaited<ReturnType<typeof workerFixture>>,
  done: () => boolean,
  before?: (name: string, index: number) => void,
) {
  let index = 0;
  while (!done()) {
    await turn();
    const next = fixture.scheduler.pending.shift();
    if (!next) {
      assert(done(), 'Receiver stalled outside a modeled boundary');
      break;
    }
    assert(index < 100, 'Bounded fixture must terminate');
    before?.(next.name, index);
    index++;
    next.release();
  }
  await turn();
  return index;
}
const valid = (identity: Identity | undefined) =>
  !!identity &&
  identity.id === manager.id &&
  identity.type === 'window' &&
  identity.url === manager.url;
const cases: object[] = [];

function checkPublication(
  fixture: Awaited<ReturnType<typeof workerFixture>>,
  port: Port,
  operation: string,
) {
  for (const write of fixture.world.writes)
    assert(
      valid(write.identity) && write.fresh,
      'Mutation requires reauthorization after preparation',
    );
  if (!port.sent[0]?.ok) return;
  const trace = fixture.scheduler.trace;
  const lastIndex = trace.findLastIndex((item) => item.name.startsWith('client:'));
  const identity = trace[lastIndex]?.value as Identity | undefined;
  const producerIndex = trace.findLastIndex((item) =>
    ['getApp', 'listApps', 'putApp', 'deleteApp'].includes(item.name),
  );
  assert(
    lastIndex > producerIndex,
    'Success requires a client recheck after result preparation',
  );
  assert(
    trace.filter((item) => item.name.startsWith('client:')).length >= 2,
    'Success cannot rely only on initial client',
  );
  assert(
    operation === 'bootstrap'
      ? identity?.id === application.id &&
          identity.type === 'window' &&
          identity.url === application.url
      : valid(identity),
    'Success requires accepted recipient snapshot',
  );
}

for (const operation of ['install', 'remove', 'list', 'events', 'bootstrap']) {
  const baseline = await workerFixture();
  if (operation === 'bootstrap') baseline.world.clients.set(application.id, application);
  const initial = baseline.request(
    operation,
    operation === 'bootstrap' ? 'app' : 'manager',
  );
  const count = await drain(baseline, initial.finished);
  assert.equal(initial.port.sent[0]?.ok, true);
  for (let cut = 0; cut < count; cut++)
    for (const change of ['missing', 'id', 'type', 'url']) {
      const fixture = await workerFixture();
      const source = operation === 'bootstrap' ? application : manager;
      if (operation === 'bootstrap') fixture.world.clients.set(source.id, source);
      const request = fixture.request(operation, source.id);
      await drain(fixture, request.finished, (_name, index) => {
        if (index !== cut) return;
        if (change === 'missing') fixture.world.clients.delete(source.id);
        else
          fixture.world.clients.set(source.id, {
            ...source,
            [change]: change === 'url' ? 'https://runtime/unrelated/' : 'other',
          });
      });
      checkPublication(fixture, request.port, operation);
      cases.push({
        operation,
        cut,
        change,
        boundaries: count,
        success: request.port.sent[0]?.ok,
        mutations: fixture.world.writes.length,
      });
    }
}

// Two queued requests retain their own event source IDs, not a mutable shared role.
const queued = await workerFixture();
const first = queued.request('list');
const second = queued.request('remove', 'unrelated');
await drain(queued, () => first.finished() && second.finished());
assert.equal(first.port.sent[0]?.ok, true);
assert.equal(second.port.sent[0]?.ok, false);
assert.equal(queued.world.writes.length, 0);
assert.deepEqual(
  queued.scheduler.trace.map((item) => item.name),
  ['client:manager', 'listApps', 'client:manager', 'client:unrelated'],
);

// Independent controllers: mutation was admitted before an application appeared.
const world = new World();
const remover = await workerFixture(world);
const removal = remover.request('remove');
while (true) {
  await turn();
  const step = remover.scheduler.pending[0];
  assert(step);
  if (
    step.name === 'client:manager' &&
    remover.scheduler.trace.some((item) => item.name === 'matchAll')
  )
    break;
  remover.scheduler.pending.shift()!.release();
}
world.clients.set(application.id, application);
const bootstrapper = await workerFixture(world);
const boot = bootstrapper.request('bootstrap', 'app');
while (true) {
  await turn();
  const step = bootstrapper.scheduler.pending[0];
  assert(step);
  if (
    step.name === 'client:app' &&
    bootstrapper.scheduler.trace.some((item) => item.name === 'getApp')
  )
    break;
  bootstrapper.scheduler.pending.shift()!.release();
}
await drain(remover, removal.finished);
assert.equal(removal.port.sent[0]?.ok, true);
await drain(bootstrapper, boot.finished);
assert.equal(boot.port.sent[0]?.ok, true);
assert.equal(world.generation, undefined);
const freshnessCounterexample = {
  property: 'current-generation-at-transfer',
  established: false,
  removal: remover.scheduler.trace.map((item) => item.name),
  bootstrap: bootstrapper.scheduler.trace.map((item) => item.name),
  transferredGeneration: 'g0',
  currentGeneration: null,
};

// Recheck omission controls execute the production adapters with only that guard removed.
const controls: object[] = [];
for (const fault of ['mutation', 'reply', 'recipient'] as const) {
  const fixture = await workerFixture(new World(), fault);
  const operation =
    fault === 'mutation' ? 'install' : fault === 'reply' ? 'list' : 'bootstrap';
  if (operation === 'bootstrap') fixture.world.clients.set(application.id, application);
  const request = fixture.request(
    operation,
    operation === 'bootstrap' ? 'app' : 'manager',
  );
  await drain(fixture, request.finished, (name) => {
    if (
      name ===
      (fault === 'mutation' ? 'admit' : fault === 'reply' ? 'listApps' : 'catalog')
    )
      fixture.world.clients.delete(operation === 'bootstrap' ? 'app' : 'manager');
  });
  if (fault === 'mutation') assert.equal(fixture.world.writes.length, 1);
  else assert.equal(request.port.sent[0]?.ok, true);
  assert.throws(
    () => checkPublication(fixture, request.port, operation),
    assert.AssertionError,
  );
  controls.push({ fault, detected: true });
}

async function bridge(fault: Fault = 'none', closeAt = -1, deliveryCloseAt = -1) {
  const scheduler = new Scheduler();
  const handlers = new Map<string, (event: object) => unknown>();
  const parent = {};
  const port = new Port();
  const status = { textContent: '' };
  const channels: { port1: Port; port2: Port }[] = [];
  const dispatched: unknown[] = [];
  runInNewContext(await bundle('connect', fault), {
    window: {
      parent,
      addEventListener: (name: string, handler: (event: object) => unknown) =>
        handlers.set(name, handler),
    },
    location: { href: 'https://runtime/connect.html' },
    URL,
    document: { getElementById: () => status, documentElement: { dataset: {} } },
    localStorage: { getItem: () => null },
    sessionStorage: {},
    indexedDB: { databases: () => scheduler.wait('storage', () => []) },
    fetch: async () => ({
      ok: true,
      json: async () => ({ managerOrigins: ['https://manager'] }),
    }),
    navigator: {
      serviceWorker: {
        controller: {
          postMessage(value: unknown) {
            dispatched.push(value);
          },
        },
        register: () =>
          scheduler.wait('register', () => ({
            navigationPreload: {
              disable: () => scheduler.wait('preload.disable', () => {}),
            },
          })),
        ready: scheduler.wait('worker.ready', () => {}),
        addEventListener() {},
      },
    },
    MessageChannel: class {
      port1 = new Port();
      port2 = new Port();
      constructor() {
        channels.push(this);
      }
    },
  });
  await turn();
  let finished = false;
  const binding = handlers.get('message')!({
    isTrusted: true,
    source: parent,
    origin: 'https://manager',
    data: { type: 'pf-connect' },
    ports: [port],
  }) as Promise<void>;
  void binding.then(() => {
    finished = true;
  });
  const second = new Port();
  await handlers.get('message')!({
    isTrusted: true,
    source: parent,
    origin: 'https://manager',
    data: { type: 'pf-connect' },
    ports: [second],
  });
  assert(second.closed, 'Pending binding reserves the endpoint');
  let index = 0;
  while (!finished) {
    await turn();
    if (finished) break;
    const pending = scheduler.pending.shift();
    assert(pending);
    if (index++ === closeAt)
      handlers.get('pagehide')!({ isTrusted: true, persisted: false });
    pending.release();
  }
  const ready = port.sent.some((item) => item.type === 'pf-ready');
  if (deliveryCloseAt >= 0) {
    const close = () => handlers.get('pagehide')!({ isTrusted: true, persisted: false });
    const queuedRequest = port.onmessage!;
    if (deliveryCloseAt === 0) close();
    queuedRequest({ isTrusted: true, data: { id: 1, operation: 'list' } });
    if (deliveryCloseAt === 1) close();
    const queuedReply = channels[0]?.port1.onmessage;
    queuedReply?.({ isTrusted: true, data: { ok: true, value: [] } });
    if (deliveryCloseAt === 2) close();
    queuedRequest({ isTrusted: true, data: { id: 2, operation: 'list' } });
    queuedReply?.({ isTrusted: true, data: { ok: true, value: [] } });
    assert.equal(dispatched.length, deliveryCloseAt === 0 ? 0 : 1);
    assert.equal(port.sent.length, deliveryCloseAt === 2 ? 2 : 1);
  }
  return { count: index, ready, closed: port.closed };
}
const bridgeBaseline = await bridge();
assert(bridgeBaseline.ready);
for (let cut = 0; cut < bridgeBaseline.count; cut++) {
  const result = await bridge('none', cut);
  assert.equal(result.ready, false);
  assert(result.closed);
  cases.push({ operation: 'bridge-ready', cut, ...result });
}
assert(
  (await bridge('ready', 0)).ready,
  'Removing post-await guard permits ready publication after closure in controlled endpoint',
);
controls.push({ fault: 'ready', detected: true });
for (let closeAt = 0; closeAt < 3; closeAt++) {
  await bridge('none', -1, closeAt);
  cases.push({ operation: 'bridge-queued-delivery', closeAt });
}

for (const [path, expected] of sources)
  assert.equal(
    hash(await readFile(path, 'utf8')),
    expected,
    'Source changed during exploration: ' + path,
  );
const receipt = {
  scope: 'bounded actual-adapter schedules, not exhaustive browser proof',
  invocation: 'node --import tsx formal/quickjs/management-composition/check.ts',
  node: process.version,
  cases,
  controls,
  freshnessCounterexample,
  source: Object.fromEntries(
    [...sources].map(([path, digest]) => [path.slice(root.length + 1), digest]),
  ),
  harness: hash(await readFile(import.meta.filename, 'utf8')),
  bundles: Object.fromEntries([...bundled].map(([name, code]) => [name, hash(code)])),
};
const output = resolve(root, 'results/quickjs-confinement/management-composition');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'result.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(
  JSON.stringify({ schedules: cases.length, controls, freshnessCounterexample }, null, 2),
);
