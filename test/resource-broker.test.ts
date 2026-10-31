import { memoryContextStorage } from './context-storage.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readInstalledResource,
  parseResourceRequest,
} from '../src/runtime/resource-broker.ts';
import {
  ContextRegistry,
  CONTEXT_POLICY_VERSION,
  type ContextIdentity,
} from '../src/runtime/contexts/model.ts';
import { applicationURL } from '../src/shared/runtime-url.ts';
import type { StoredInstallation } from '../src/runtime/storage.ts';
import { manifestURL } from '../src/runtime/pwa.ts';

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
      contentType: 'text/plain',
      sha256: 'fixture',
    },
    {
      path: 'image.png',
      url: 'https://publisher.test/image.png',
      contentType: 'image/png',
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
    read: (
      url = app.resources[0].url,
      transform?: Parameters<typeof readInstalledResource>[4],
    ) =>
      readInstalledResource(client, new Request(url), registry, base, transform, store),
    reads: () => reads,
    replace(value?: StoredInstallation) {
      installed = value;
    },
    duringRead(action: () => Promise<void>) {
      beforeRead = action;
    },
  };
}

test('publisher, canonical and captured publisher-path URLs share one admitted entry', async () => {
  const f = await fixture();
  for (const url of [
    app.resources[0].url,
    new URL('index.html', entry).href,
    new URL('/index.html', base).href,
  ]) {
    const response = await f.read(url);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '<h1>Admitted source</h1>');
  }
  assert.equal(f.reads(), 3);
  for (const url of [
    'https://foreign.test/index.html',
    new URL('connect.html', base).href,
    app.resources[0].url + '?private=1',
    new URL('missing.txt', entry).href,
  ])
    await assert.rejects(f.read(url), /Resource not admitted/);
  assert.equal(f.reads(), 3);
});

test('the application can read its generated public manifest without a body-store read', async () => {
  const f = await fixture();
  const response = await f.read(manifestURL(app, base).href);
  const value = await response.json();
  assert.equal(value.name, app.manifest.name);
  assert.equal(f.reads(), 0);
  await assert.rejects(f.read(manifestURL(app, base).href + '?unknown=1'));
});

test('unbound actors and wrong generations cannot read installed resources', async () => {
  const f = await fixture();
  await assert.rejects(
    readInstalledResource(
      { ...f.client, id: 'claimed-client' },
      new Request(app.source),
      f.registry,
      base,
      undefined,
      f.store,
    ),
    /not authorized/,
  );
  f.replace({ ...app, generation: 'replaced' });
  await assert.rejects(f.read(), /Installation unavailable/);
  assert.equal(f.reads(), 0);
});

test('resource failure, closure and replacement while bytes are pending reject locally', async () => {
  for (const action of ['missing', 'closed', 'replaced']) {
    const f = await fixture();
    f.duringRead(async () => {
      if (action === 'missing') throw new Error('Installed resource missing');
      if (action === 'closed')
        f.records.set(f.client.id, { ...f.identity, state: 'closed' });
      if (action === 'replaced') f.replace({ ...app, generation: 'replaced' });
    });
    await assert.rejects(f.read());
    assert.equal(f.reads(), 1);
  }
});

test('authority is checked again after asynchronous publisher handling', async () => {
  const f = await fixture();
  await assert.rejects(
    f.read(app.source, async (_app, _resource, response) => {
      f.records.set(f.client.id, { ...f.identity, state: 'closed' });
      return response;
    }),
    /Resource authority changed/,
  );
});

test('publisher CSS is relocated with its metadata preserved', async () => {
  const f = await fixture();
  const response = await f.read(
    app.source,
    async () =>
      new Response('body {background:url(./image.png)}', {
        headers: { 'content-type': 'text/css', etag: 'fixture-tag' },
      }),
  );
  const text = await response.text();
  assert(text.includes(new URL('image.png', entry).href));
  assert.equal(response.headers.get('etag'), 'fixture-tag');
  assert.equal(response.headers.get('content-type'), 'text/css');
});

test('the message parser rejects malformed URLs and headers before request use', () => {
  const valid = { url: app.source, headers: [['x-dummy', 'value']] };
  assert.equal(parseResourceRequest(valid).headers.get('x-dummy'), 'value');
  for (const packet of [
    null,
    {},
    { ...valid, url: 'data:text/plain,local' },
    { ...valid, url: 'https://user:password@publisher.test/' },
    { ...valid, url: app.source + '#fragment' },
    { ...valid, headers: [['bad\nname', 'value']] },
    { ...valid, headers: [['one-item']] },
    { ...valid, headers: Array.from({ length: 257 }, () => ['x-dummy', 'value']) },
  ])
    assert.throws(() => parseResourceRequest(packet));
});
