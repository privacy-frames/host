import assert from 'node:assert/strict';
import test from 'node:test';
import { bindWorkerBirth } from '../src/runtime/contexts/worker-birth.ts';
import { parseWorkerBirth } from '../src/runtime/contexts/worker-birth-protocol.ts';
import {
  ContextRegistry,
  CONTEXT_POLICY_VERSION,
  type ContextIdentity,
} from '../src/runtime/contexts/model.ts';
import type { StoredInstallation } from '../src/runtime/storage.ts';
import { memoryContextStorage } from './context-storage.ts';

const id = '65f0558d-d4dc-47c7-bc3b-946e028f740a';
const application = 'app-' + 'a'.repeat(64);
const base = new URL('https://runtime.test/');
const url = 'blob:https://runtime.test/58f0558d-d4dc-47c7-bc3b-946e028f740a';

async function fixture() {
  const records = new Map<string, ContextIdentity>();
  const contexts = new ContextRegistry(memoryContextStorage(records));
  const parent = {
    id: 'native-parent',
    url: 'https://runtime.test/app/',
    type: 'window' as const,
  };
  await contexts.bind(parent.id, {
    policyVersion: CONTEXT_POLICY_VERSION,
    installationGeneration: 'generation',
    id: 'root',
    application,
    parent: null,
    kind: 'window',
    state: 'preparing',
    url: parent.url,
  });
  const native = { id: 'actual-native-worker', url, type: 'worker' as const };
  let generation = 'generation';
  let matches: Array<Pick<Client, 'id' | 'url' | 'type'>> = [native];
  let reads = 0;
  let disappear = false;
  const clients = {
    async list() {
      return matches;
    },
    async get(client: string) {
      reads++;
      return client === native.id && !(disappear && reads > 1) ? native : undefined;
    },
  };
  const store = {
    async getApp(identifier: string): Promise<StoredInstallation | undefined> {
      if (identifier !== application) return;
      return {
        id: application,
        generation,
        source: 'https://publisher.test/',
        manifest: { id: 'app', name: 'App', entry: 'index.html' },
        resources: [],
        size: 0,
        installedAt: 'fixture',
        format: 'offline-resources-v1',
        capture: { additionalResources: [], unavailableResources: [] },
      };
    },
  };
  const packet = {
    path: [],
    id,
    url,
    module: false,
    client: 'forged-native-client',
    parent: 'forged-parent',
    application: 'forged-app',
  };
  return {
    contexts,
    records,
    native,
    parent,
    clients,
    store,
    packet,
    matches(value: typeof matches) {
      matches = value;
    },
    disappear() {
      disappear = true;
    },
    replace() {
      generation = 'replacement';
    },
    bind() {
      return bindWorkerBirth(parent, packet, contexts, base, clients, store);
    },
  };
}

test('local worker birth binds the enumerated native client to the authenticated parent', async () => {
  const f = await fixture();
  const metadata = await f.bind();
  assert.equal(metadata.identity.parent, f.parent.id);
  assert.equal(metadata.identity.application, application);
  assert.equal(metadata.identity.url, url);
  assert.equal(metadata.module, false);
  assert.equal(f.records.get(f.native.id)?.id, id);
  assert(!f.records.has('forged-native-client'));
  await assert.rejects(f.bind(), /already bound/);
  assert.equal(f.records.get(f.native.id)?.state, 'preparing');
});

test('local worker birth refuses absent or ambiguous native URL matches', async () => {
  for (const count of [0, 2]) {
    const f = await fixture();
    f.matches(
      Array.from({ length: count }, (_, index) => ({
        ...f.native,
        id: 'native-' + index,
      })),
    );
    await assert.rejects(f.bind(), /no unique native client/);
    assert.equal(f.records.size, 1);
  }
  const f = await fixture();
  f.matches([{ ...f.native, type: 'window' }]);
  await assert.rejects(f.bind(), /no unique native client/);
});

test('a missing native worker or a changed installation closes a pending binding', async () => {
  const missing = await fixture();
  missing.disappear();
  await assert.rejects(missing.bind(), /changed during binding/);
  assert.equal(missing.records.get(missing.native.id)?.state, 'closed');
  const replaced = await fixture();
  const list = replaced.clients.list;
  replaced.clients.list = async () => {
    const result = await list();
    replaced.replace();
    return result;
  };
  await assert.rejects(replaced.bind(), /installation changed/);
  assert.equal(replaced.records.get(replaced.native.id)?.state, 'closed');
});

test('pre-binding cancellation prevents a late worker birth', async () => {
  const f = await fixture();
  await f.contexts.closeChild(f.parent.id, application, id);
  await assert.rejects(f.bind(), /closed before startup/);
  assert(!f.records.has(f.native.id));
});

test('worker birth requires a current browser parent and a same-origin Blob URL', async () => {
  const f = await fixture();
  for (const parent of [undefined, { ...f.parent, id: 'unbound-client' }])
    await assert.rejects(
      bindWorkerBirth(parent, f.packet, f.contexts, base, f.clients, f.store),
    );
  for (const source of [
    'https://runtime.test/worker.js',
    'blob:https://other.test/id',
    url + '#fragment',
  ])
    await assert.rejects(
      bindWorkerBirth(
        f.parent,
        { ...f.packet, url: source },
        f.contexts,
        base,
        f.clients,
        f.store,
      ),
      /local runtime Blob/,
    );
  assert.equal(f.records.size, 1);
});

test('worker birth parses only own data fields and ignores claimed native identities', () => {
  let calls = 0;
  const packet = { path: [], id, url, module: true };
  const getter = Object.defineProperty({ ...packet }, 'url', {
    get() {
      calls++;
      return url;
    },
  });
  for (const input of [
    null,
    Object.create(packet),
    getter,
    { ...packet, path: ['not-a-context'] },
    { ...packet, id: 'not-a-uuid' },
    { ...packet, module: 'module' },
  ])
    assert.throws(() => parseWorkerBirth(input));
  assert.equal(calls, 0);
  assert.deepEqual(
    structuredClone(parseWorkerBirth({ ...packet, client: 'claimed' })),
    packet,
  );
});
