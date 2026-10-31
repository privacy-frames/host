import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ContextRegistry,
  CONTEXT_POLICY_VERSION,
  type ContextIdentity,
} from '../src/runtime/contexts/model.ts';
import { requestWorkerControl } from '../src/runtime/contexts/worker-control.ts';
import { parseWorkerControl } from '../src/runtime/contexts/worker-protocol.ts';
import type { StoredInstallation } from '../src/runtime/storage.ts';
import { memoryContextStorage } from './context-storage.ts';

const child = '65f0558d-d4dc-47c7-bc3b-946e028f740a';
const grandchild = '58f0558d-d4dc-47c7-bc3b-946e028f740a';
const absent = '48f0558d-d4dc-47c7-bc3b-946e028f740a';
async function fixture() {
  const records = new Map<string, ContextIdentity>();
  const contexts = new ContextRegistry(memoryContextStorage(records));
  const root = {
    id: 'native-root',
    url: 'https://runtime.test/app/',
    type: 'window' as const,
  };
  const other = { ...root, id: 'native-other' };
  const identity: ContextIdentity = {
    policyVersion: CONTEXT_POLICY_VERSION,
    installationGeneration: 'generation',
    application: 'app',
    id: 'root',
    parent: null,
    kind: 'window',
    state: 'preparing',
    url: root.url,
  };
  await contexts.bind(root.id, identity);
  await contexts.bind(other.id, { ...identity, id: 'other' });
  await contexts.bind('native-child', {
    ...identity,
    id: child,
    parent: root.id,
    kind: 'dedicated-worker',
    url: 'https://runtime.test/app/__contexts/' + child + '/classic.js',
  });
  await contexts.bind('native-grandchild', {
    ...identity,
    id: grandchild,
    parent: 'native-child',
    kind: 'dedicated-worker',
    url: 'https://runtime.test/app/__contexts/' + grandchild + '/classic.js',
  });
  let app: StoredInstallation = {
    id: 'app',
    generation: 'generation',
    source: 'https://publisher.test/',
    manifest: { id: 'app', name: 'App', entry: 'index.html' },
    resources: [],
    size: 0,
    installedAt: 'fixture',
    format: 'offline-resources-v1',
    capture: { additionalResources: [], unavailableResources: [] },
  };
  const store = {
    async getApp(id: string) {
      return id === app.id ? app : undefined;
    },
  };
  return {
    contexts,
    records,
    root,
    other,
    replace() {
      app = { ...app, generation: 'replacement' };
    },
    request(
      client: typeof root | undefined,
      operation: string,
      path: unknown,
      id?: string,
    ) {
      return requestWorkerControl(
        client,
        { operation, path, id, parent: 'forged', application: 'forged' },
        contexts,
        store,
      ).then((value) => structuredClone(value));
    },
  };
}

test('worker delegation follows each native parent binding and rejects sibling shortcuts', async () => {
  const f = await fixture();
  for (const path of [[], [child], [child, grandchild]])
    assert.deepEqual(await f.request(f.root, 'verify', path), { verified: true });
  for (const path of [[grandchild], [absent], [grandchild, child], [child, child]])
    await assert.rejects(f.request(f.root, 'verify', path));
  await assert.rejects(f.request(f.other, 'verify', [child]));
  await assert.rejects(f.request(undefined, 'verify', []));
  await assert.rejects(f.request({ ...f.root, id: 'forged' }, 'verify', []));
  await assert.rejects(
    f.request({ ...f.root, url: 'https://runtime.test/elsewhere/' }, 'verify', []),
  );
});

test('delegated closure retains the selected native parent and pre-binding cancellation', async () => {
  const f = await fixture();
  assert.deepEqual(await f.request(f.root, 'close', [], grandchild), { closed: false });
  assert(await f.contexts.resolveWorker('native-grandchild'));
  assert.deepEqual(await f.request(f.root, 'close', [child], grandchild), {
    closed: true,
  });
  assert.equal(await f.contexts.resolveWorker('native-grandchild'), undefined);
  await assert.rejects(f.request(f.root, 'verify', [child, grandchild]));
  assert.deepEqual(await f.request(f.root, 'close', [child], absent), { closed: true });
  const template = f.records.get('native-grandchild');
  assert(template);
  await assert.rejects(f.contexts.bind('late-child', { ...template, id: absent }));
});

test('closed or replaced ancestors invalidate later delegated verification', async () => {
  const f = await fixture();
  await f.contexts.closeChild(f.root.id, 'app', child);
  await assert.rejects(f.request(f.root, 'verify', [child]));
  await assert.rejects(f.request(f.root, 'verify', [child, grandchild]));
  const g = await fixture();
  const record = g.records.get('native-child');
  assert(record);
  g.records.set('native-child', {
    ...record,
    installationGeneration: 'foreign-generation',
  });
  await assert.rejects(g.request(g.root, 'verify', [child]));
  const h = await fixture();
  h.replace();
  await assert.rejects(h.request(h.root, 'verify', []));
  await assert.rejects(h.request(h.root, 'verify', [child, grandchild]));
});

test('worker control parses own data fields without executing accessors', () => {
  let getterCalls = 0;
  const accessor = {
    get operation() {
      getterCalls++;
      return 'verify';
    },
    path: [],
  };
  const inherited = Object.create({ operation: 'verify', path: [] });
  for (const packet of [
    null,
    42,
    {},
    accessor,
    inherited,
    { operation: 'other', path: [] },
    { operation: 'verify', path: {} },
    { operation: 'verify', path: [null] },
    { operation: 'verify', path: new Array(1) },
    { operation: 'verify', path: [], id: child },
    { operation: 'close', path: [] },
  ])
    assert.throws(() => parseWorkerControl(packet));
  assert.equal(getterCalls, 0);
  assert.deepEqual(
    { ...parseWorkerControl({ operation: 'verify', path: [child] }), path: [child] },
    { operation: 'verify', path: [child] },
  );
});
