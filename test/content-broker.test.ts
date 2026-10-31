import { memoryContextStorage } from './context-storage.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readInstalledContent } from '../src/runtime/content-broker.ts';
import {
  ContextRegistry,
  CONTEXT_POLICY_VERSION,
  type ContextIdentity,
} from '../src/runtime/contexts/model.ts';
import { applicationURL } from '../src/shared/runtime-url.ts';
import type { StoredInstallation } from '../src/runtime/storage.ts';

const base = new URL('https://runtime.test/runtime/');
const app: StoredInstallation = {
  generation: 'host-issued-generation',
  id: 'fixture-' + 'a'.repeat(64),
  manifest: { id: 'fixture', name: 'Fixture', entry: 'index.html' },
  source: 'https://publisher.test/index.html',
  resources: [
    {
      path: 'index.html',
      url: 'https://publisher.test/index.html',
      contentType: 'text/html',
      sha256: 'fixture',
    },
  ],
  size: 1,
  installedAt: '2026-10-31',
  format: 'offline-resources-v1',
  capture: { additionalResources: [], unavailableResources: [] },
};
const entry = applicationURL(app, base).href;

async function fixture(parent: string | null = null) {
  const records = new Map<string, ContextIdentity>();
  const storage = memoryContextStorage(records);
  const registry = new ContextRegistry(storage);
  const identity: ContextIdentity = {
    policyVersion: CONTEXT_POLICY_VERSION,
    installationGeneration: app.generation,
    id: 'root-context',
    application: app.id,
    parent,
    kind: 'window',
    state: 'preparing',
    url: entry,
  };
  await registry.bind('actual-root', identity);
  let installed: StoredInstallation | undefined = app;
  let beforeRead: () => Promise<void> = async () => {};
  let reads = 0;
  const store = {
    async getApp(id: string) {
      assert.equal(id, app.id);
      return installed;
    },
    async getResource(id: string, path: string, generation: string) {
      assert.equal(id, app.id);
      assert.equal(path, app.manifest.entry);
      assert.equal(generation, app.generation);
      reads++;
      await beforeRead();
      return new TextEncoder().encode('<h1>Admitted source</h1>').buffer;
    },
  };
  const client = { id: 'actual-root', url: entry, type: 'window' as const };
  return {
    client,
    records,
    identity,
    registry,
    store,
    read: () => readInstalledContent(client, registry, base, store),
    reads: () => reads,
    replace(value?: StoredInstallation) {
      installed = value;
    },
    duringRead(action: () => Promise<void>) {
      beforeRead = action;
    },
  };
}

test('content is derived from a bound browser root and its admitted generation', async () => {
  const f = await fixture();
  const content = await f.read();
  assert.equal(content.installationGeneration, app.generation);
  assert.equal(content.document.text, '<h1>Admitted source</h1>');
  assert.equal(content.document.sourceURL, app.source);
  assert.equal(f.reads(), 1);
  // A public application query has no content-endpoint authority.
  const routed = await readInstalledContent(
    { ...f.client, url: entry + 'editor?host-content=1' },
    f.registry,
    base,
    f.store,
  );
  assert.equal(routed.installationGeneration, app.generation);
});

test('unbound clients, workers, foreign routes and child windows cannot read root content', async () => {
  const f = await fixture();
  for (const client of [
    undefined,
    { ...f.client, id: 'claimed-root' },
    { ...f.client, type: 'worker' as const },
    { ...f.client, url: new URL('connect.html', base).href },
  ])
    await assert.rejects(readInstalledContent(client, f.registry, base, f.store));
  assert.equal(f.reads(), 0);
  const child = await fixture('actual-parent');
  await assert.rejects(child.read(), /Root client not authorized/);
  assert.equal(child.reads(), 0);
});

test('missing or replaced installations fail before resource access', async () => {
  const f = await fixture();
  f.replace();
  await assert.rejects(f.read(), /Installation unavailable/);
  f.replace({ ...app, generation: 'replacement' });
  await assert.rejects(f.read(), /Installation unavailable/);
  assert.equal(f.reads(), 0);
});

test('resource failure propagates locally and never substitutes a response', async () => {
  const f = await fixture();
  f.duringRead(async () => {
    throw new Error('Installed resource missing');
  });
  await assert.rejects(f.read(), /Installed resource missing/);
  assert.equal(f.reads(), 1);
});

test('authority closure or replacement while bytes are pending refuses delivery', async () => {
  for (const update of [
    { state: 'closed' as const },
    { installationGeneration: 'replacement' },
    { id: 'replacement-context' },
  ]) {
    const f = await fixture();
    f.duringRead(async () => {
      f.records.set(f.client.id, { ...f.identity, ...update });
    });
    await assert.rejects(f.read(), /Root authority changed/);
  }
});

test('installation replacement while bytes are pending refuses delivery', async () => {
  const f = await fixture();
  f.duringRead(async () => {
    f.replace({ ...app, generation: 'replacement' });
  });
  await assert.rejects(f.read(), /Installation changed/);
});
