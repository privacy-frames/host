import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { publicAlias } from '../src/shared/runtime-url.ts';
import {
  acceptsManagerSender,
  clientCanManage,
  managementPortIsCurrent,
} from '../src/runtime/authority.ts';

test('manager sender requires every native observation and a live unbound receiver', () => {
  for (let mask = 0; mask < 64; mask++) {
    const values = Array.from({ length: 6 }, (_, bit) => Boolean(mask & (1 << bit)));
    const [closed, bound, trusted, embedded, parentSource, allowedOrigin] = values;
    assert.equal(
      acceptsManagerSender({
        closed,
        bound,
        trusted,
        embedded,
        parentSource,
        allowedOrigin,
      }),
      mask === 60,
    );
  }
  for (const id of ['source', 'other'])
    for (const type of ['window', 'worker'])
      for (const url of ['https://runtime/connect.html', 'https://runtime/app/'])
        assert.equal(
          clientCanManage({ id, type, url }, 'source', 'https://runtime/connect.html'),
          id === 'source' && type === 'window' && url.endsWith('/connect.html'),
        );
  const current = {};
  for (const closed of [false, true])
    for (const candidate of [current, {}])
      for (const endpoint of [current, null])
        assert.equal(
          managementPortIsCurrent(closed, endpoint, candidate),
          !closed && endpoint === candidate,
        );
});

/** An adapter fixture supplies browser observations; it does not prove browser authenticity. */
class Port {
  onmessage: ((event: { data: unknown; isTrusted: boolean }) => void) | null = null;
  closed = false;
  sent: unknown[] = [];
  start(): void {}
  close(): void {
    this.closed = true;
  }
  postMessage(value: unknown): void {
    this.sent.push(value);
  }
}
class Channel {
  port1 = new Port();
  port2 = new Port();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
const root = new URL('../', import.meta.url);
const fileText = (path: string) => readFile(new URL(path, root), 'utf8');
const bundles: Record<string, string> = {};
async function bundle(kind: 'worker' | 'connect', fault = false): Promise<string> {
  const key = kind + fault;
  if (bundles[key]) return bundles[key];
  const entry = kind === 'worker' ? 'src/runtime/worker.ts' : 'src/bridge/connect.ts';
  const result = await build({
    entryPoints: [new URL(entry, root).pathname],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    define: { __BUILD_ID__: '"authority-fixture"' },
    plugins: [
      {
        name: 'authority-adapter-dependencies',
        setup(builder) {
          builder.onLoad(
            { filter: /\/src\/runtime\/authority\.ts$/ },
            async ({ path }) => {
              let contents = await readFile(path, 'utf8');
              if (fault) {
                const anchor =
                  kind === 'worker'
                    ? ' && client.url === controlURL'
                    : ' &&\n    claims.allowedOrigin';
                assert.equal(
                  contents.split(anchor).length,
                  2,
                  'Removal control anchor changed',
                );
                contents = contents.replace(anchor, '');
              }
              return { contents, loader: 'ts' };
            },
          );
          if (kind !== 'worker') return;
          builder.onLoad({ filter: /\/src\/runtime\/storage\.ts$/ }, () => ({
            contents: `
        export const getApp=(...args)=>globalThis.fixture.getApp(...args);
        export const listApps=(...args)=>globalThis.fixture.listApps(...args);
        export const putApp=(...args)=>globalThis.fixture.putApp(...args);
        export const deleteApp=(...args)=>globalThis.fixture.deleteApp(...args);
        export const getResource=()=>undefined;`,
            loader: 'js',
          }));
          builder.onLoad({ filter: /\/src\/runtime\/admission\.ts$/ }, () => ({
            contents:
              'export const admitInstallation=(...args)=>globalThis.fixture.admit(...args);',
            loader: 'js',
          }));
          builder.onLoad({ filter: /\/src\/guest\/catalog\.ts$/ }, () => ({
            contents: `
        export const GUEST_BOOTSTRAP_REQUEST='pf-guest-bootstrap';
        export const createGuestCatalog=(...args)=>globalThis.fixture.catalog(...args);`,
            loader: 'js',
          }));
        },
      },
    ],
  });
  bundles[key] = result.outputFiles[0].text;
  return bundles[key];
}

async function workerFixture(fault = false) {
  let listener!: (event: object) => void;
  let client: { id: string; type: string; url: string } | undefined = {
    id: 'source',
    type: 'window',
    url: 'https://runtime/connect.html',
  };
  let lookup = async (_id: string) => client;
  const writes: unknown[] = [];
  const app = {
    id: 'fixture-' + 'a'.repeat(64),
    generation: 'generation',
    capture: {},
    manifest: {},
  };
  const fixture = {
    getApp: async (_id: string) => app,
    listApps: async (): Promise<(typeof app)[]> => [],
    putApp: async (value: unknown) => {
      writes.push(value);
    },
    deleteApp: async (value: unknown) => {
      writes.push(value);
    },
    admit: async (_input: unknown) => app,
    catalog: async () => ({
      engineWasm: new ArrayBuffer(0),
      workerBootstrap: {
        dedicated: new ArrayBuffer(0),
        shared: new ArrayBuffer(0),
        worklet: new ArrayBuffer(0),
      },
      resources: [],
    }),
  };
  runInNewContext(await bundle('worker', fault), {
    self: {
      location: { href: 'https://runtime/sw.js' },
      clients: { get: (id: string) => lookup(id), matchAll: async () => [] },
      addEventListener: (name: string, value: typeof listener) => {
        if (name === 'message') listener = value;
      },
    },
    fixture,
    URL,
    Date,
    ArrayBuffer,
    btoa,
    caches: {
      open: async () => ({
        match: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }),
      }),
    },
  });
  function request(data: unknown, trusted = true, sourceID = 'source') {
    const port = new Port();
    let finished!: Promise<void>;
    listener({
      data,
      ports: [port],
      isTrusted: trusted,
      source: { id: sourceID },
      waitUntil: (promise: Promise<void>) => {
        finished = promise;
      },
    });
    return { port, done: finished || Promise.resolve() };
  }
  return {
    fixture,
    writes,
    request,
    app,
    changeClient(value: typeof client) {
      client = value;
    },
    setLookup(value: typeof lookup) {
      lookup = value;
    },
  };
}

test('actual worker adapter denies synthetic, claimed and changed client identities', async () => {
  const fixture = await workerFixture();
  const synthetic = fixture.request({ operation: 'remove', payload: 'x' }, false);
  await synthetic.done;
  assert.equal(synthetic.port.closed, true);
  assert.equal(fixture.writes.length, 0);
  fixture.changeClient({
    id: 'other',
    type: 'window',
    url: 'https://runtime/connect.html',
  });
  const mismatch = fixture.request({
    operation: 'remove',
    payload: 'x',
    sourceID: 'other',
  });
  await mismatch.done;
  assert.equal((mismatch.port.sent[0] as { ok: boolean }).ok, false);
  fixture.changeClient({ id: 'source', type: 'window', url: 'https://runtime/app/' });
  const application = fixture.request({
    operation: 'list',
    role: 'manager',
    url: 'https://runtime/connect.html',
  });
  await application.done;
  assert.equal((application.port.sent[0] as { ok: boolean }).ok, false);
  assert.equal(fixture.writes.length, 0);
  const fault = await workerFixture(true);
  fault.changeClient({ id: 'source', type: 'window', url: 'https://runtime/app/' });
  const unguarded = fault.request({ operation: 'list' });
  await unguarded.done;
  assert.equal(
    (unguarded.port.sent[0] as { ok: boolean }).ok,
    true,
    'Removing actual URL role check makes application client accepted',
  );
});

test('actual worker adapter rechecks after asynchronous admission and before reply', async () => {
  const fixture = await workerFixture();
  const admitted = deferred<typeof fixture.app>();
  fixture.fixture.admit = () => admitted.promise;
  const install = fixture.request({ operation: 'install', payload: {} });
  await turn();
  fixture.changeClient({ id: 'source', type: 'window', url: 'https://runtime/app/' });
  admitted.resolve(fixture.app);
  await install.done;
  assert.equal(fixture.writes.length, 0);
  assert.equal((install.port.sent[0] as { ok: boolean }).ok, false);

  fixture.changeClient({
    id: 'source',
    type: 'window',
    url: 'https://runtime/connect.html',
  });
  const listed = deferred<never[]>();
  fixture.fixture.listApps = () => listed.promise;
  const list = fixture.request({ operation: 'list' });
  await turn();
  fixture.changeClient(undefined);
  listed.resolve([]);
  await list.done;
  assert.equal((list.port.sent[0] as { ok: boolean }).ok, false);
});

test('actual catalog publication rechecks recipient identity after preparation', async () => {
  const fixture = await workerFixture();
  fixture.fixture.listApps = async () => [fixture.app];
  fixture.changeClient({
    id: 'source',
    type: 'window',
    url: `https://runtime/${publicAlias(fixture.app.id)}/fixture/`,
  });
  const catalog = deferred<Awaited<ReturnType<typeof fixture.fixture.catalog>>>();
  const prepared = await fixture.fixture.catalog();
  fixture.fixture.catalog = () => catalog.promise;
  const request = fixture.request({ type: 'pf-guest-bootstrap' });
  await turn();
  fixture.changeClient({
    id: 'source',
    type: 'window',
    url: 'https://runtime/connect.html',
  });
  catalog.resolve(prepared);
  await request.done;
  const reply = request.port.sent[0] as { ok: boolean; error?: string };
  assert.equal(reply.ok, false);
  assert.match(reply.error || '', /Application client changed/);
});

test('actual worker adapter evaluates captured source at dequeue and isolates instance queues', async () => {
  const first = await workerFixture();
  const second = await workerFixture();
  const delayed = deferred<{ id: string; type: string; url: string } | undefined>();
  let lookups = 0;
  first.setLookup(async () => {
    lookups++;
    return delayed.promise;
  });
  const queuedA = first.request({ operation: 'list' });
  const queuedB = first.request({ operation: 'remove', payload: 'b' });
  await turn();
  assert.equal(lookups, 1, 'One instance serializes its own requests');
  const independent = second.request({ operation: 'remove', payload: 'independent' });
  await independent.done;
  assert.deepEqual(
    second.writes,
    ['independent'],
    'Another controller instance does not depend on this queue',
  );
  delayed.resolve({ id: 'source', type: 'window', url: 'https://runtime/app/' });
  await Promise.all([queuedA.done, queuedB.done]);
  assert.equal(first.writes.length, 0);
  assert.equal(lookups, 2);
});

async function bridgeFixture(fault = false, holdReady = false) {
  const handlers = new Map<string, (event: Record<string, unknown>) => unknown>();
  const channels: Channel[] = [];
  const dispatched: { data: unknown; ports: Port[] }[] = [];
  const parent = {};
  const readiness = deferred<void>();
  const controller = {
    postMessage: (data: unknown, ports: Port[]) => {
      dispatched.push({ data, ports });
    },
  };
  const status = { textContent: '' };
  const window = {
    parent,
    addEventListener: (name: string, fn: (event: Record<string, unknown>) => unknown) =>
      handlers.set(name, fn),
  };
  runInNewContext(await bundle('connect', fault), {
    window,
    location: { href: 'https://runtime/connect.html' },
    URL,
    document: { getElementById: () => status, documentElement: { dataset: {} } },
    navigator: {
      serviceWorker: {
        controller,
        register: async () => ({ navigationPreload: { disable: async () => {} } }),
        ready: holdReady ? readiness.promise : Promise.resolve(),
        addEventListener: () => {},
      },
    },
    localStorage: { getItem: () => null },
    sessionStorage: {},
    indexedDB: { databases: async () => [] },
    fetch: async () => ({
      ok: true,
      json: async () => ({ managerOrigins: ['https://manager'] }),
    }),
    MessageChannel: class extends Channel {
      constructor() {
        super();
        channels.push(this);
      }
    },
  });
  await turn();
  const message = async (port: Port, overrides: Record<string, unknown> = {}) => {
    await handlers.get('message')!({
      data: { type: 'pf-connect' },
      ports: [port],
      isTrusted: true,
      source: parent,
      origin: 'https://manager',
      ...overrides,
    });
  };
  return {
    channels,
    dispatched,
    message,
    parent,
    readiness,
    close: () => handlers.get('pagehide')!({ isTrusted: true, persisted: false }),
  };
}

test('actual bridge binds only a genuine allowed parent, with an origin removal control', async () => {
  const fixture = await bridgeFixture();
  for (const observations of [
    { isTrusted: false },
    { source: {} },
    { origin: 'https://other' },
  ]) {
    const rejected = new Port();
    await fixture.message(rejected, observations);
    assert.equal(rejected.closed, true);
    assert.equal(rejected.sent.length, 0);
  }
  const accepted = new Port();
  await fixture.message(accepted);
  assert.equal((accepted.sent[0] as { type: string }).type, 'pf-ready');
  const rebound = new Port();
  await fixture.message(rebound);
  assert.equal(rebound.closed, true);
  const fault = await bridgeFixture(true);
  const unauthorized = new Port();
  await fault.message(unauthorized, { origin: 'https://other' });
  assert.equal(
    (unauthorized.sent[0] as { type: string }).type,
    'pf-ready',
    'Removing origin check accepts unrelated parent',
  );
});

test('actual bridge closes pending ready and queued request/reply continuations', async () => {
  const preparing = await bridgeFixture(false, true);
  const pending = new Port();
  const binding = preparing.message(pending);
  await turn();
  preparing.close();
  preparing.readiness.resolve();
  await binding;
  assert.equal(pending.closed, true);
  assert.equal(pending.sent.length, 0, 'No ready publication after terminal close');

  const fixture = await bridgeFixture();
  const port = new Port();
  await fixture.message(port);
  const queued = port.onmessage!;
  queued({ isTrusted: true, data: { id: 1, operation: 'list' } });
  assert.equal(fixture.dispatched.length, 1);
  const reply = fixture.channels[0].port1;
  const queuedReply = reply.onmessage!;
  fixture.close();
  queued({ isTrusted: true, data: { id: 2, operation: 'remove', payload: 'x' } });
  queuedReply({ isTrusted: true, data: { ok: true, value: [] } });
  assert.equal(fixture.dispatched.length, 1, 'Queued callback cannot send after close');
  assert.equal(port.sent.length, 1, 'Queued worker reply cannot reach closed manager');
  assert.equal(reply.closed, true);
});

test.after(async () => {
  const hash = (source: string) => createHash('sha256').update(source).digest('hex');
  const files = [
    'src/runtime/authority.ts',
    'src/runtime/worker.ts',
    'src/bridge/connect.ts',
    'test/guest-management-authority.test.ts',
  ];
  const hashes = Object.fromEntries(
    await Promise.all(files.map(async (path) => [path, hash(await fileText(path))])),
  );
  await mkdir(new URL('results/quickjs-confinement/', root), { recursive: true });
  await writeFile(
    new URL('results/quickjs-confinement/management-adapters.json', root),
    JSON.stringify(
      {
        scope:
          'Actual production adapters bundled with simulated native event/client/port observations and storage/admission dependencies. These tests do not establish browser authenticity or complete confinement.',
        inputHashes: hashes,
        bundleHashes: Object.fromEntries(
          Object.entries(bundles).map(([name, body]) => [name, hash(body)]),
        ),
        controls: [
          'Actual client URL role check removed: application client accepted',
          'Actual parent origin check removed: unrelated parent accepted',
        ],
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
});
