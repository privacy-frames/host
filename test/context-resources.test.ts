import { memoryContextStorage } from './context-storage.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ContextRegistry,
  CONTEXT_POLICY_VERSION,
  type ContextIdentity,
} from '../src/runtime/contexts/model.ts';
import { contextResourceResponse } from '../src/runtime/contexts/resources.ts';
import { applicationURL } from '../src/shared/runtime-url.ts';
import type { StoredInstallation } from '../src/runtime/storage.ts';

const base = new URL('https://runtime.test/runtime/');
const context = '65f0558d-d4dc-47c7-bc3b-946e028f740a';
const app: StoredInstallation = {
  generation: 'host-issued-generation',
  id: 'fixture-' + 'a'.repeat(64),
  manifest: { id: 'fixture', name: 'Fixture', entry: 'index.html' },
  source: 'https://publisher.test/',
  resources: [
    {
      path: 'scripts/helper.js',
      url: 'https://publisher.test/scripts/helper.js',
      contentType: 'text/javascript',
      sha256: 'fixture',
    },
  ],
  size: 1,
  installedAt: '2026-10-27',
  format: 'offline-resources-v1',
  capture: { additionalResources: [], unavailableResources: [] },
};
const directory = new URL(`__contexts/${context}/`, applicationURL(app, base));
const resourceURL = new URL('resources/scripts/helper.js', directory).href;
const readyURL = new URL('ready', directory).href;

async function fixture() {
  const records = new Map<string, ContextIdentity>();
  const storage = memoryContextStorage(records);
  const registry = new ContextRegistry(storage);
  await registry.bind('actual-worker', {
    policyVersion: CONTEXT_POLICY_VERSION,
    installationGeneration: app.generation,
    id: context,
    application: app.id,
    parent: 'actual-parent',
    kind: 'dedicated-worker',
    state: 'preparing',
    url: new URL('module.js', directory).href,
  });
  let reads = 0;
  let installedApp = app;
  const store = {
    async getApp(id: string) {
      return id === app.id ? installedApp : undefined;
    },
    async getResource(id: string, path: string) {
      assert.equal(id, app.id);
      assert.equal(path, 'scripts/helper.js');
      reads++;
      return new TextEncoder().encode('export const helper = 1;').buffer;
    },
  };
  const request = (
    url: string,
    clientId = '',
    destination: RequestDestination = '',
    method = 'GET',
    mode: RequestMode = 'cors',
    resultingClientId?: string,
  ) => {
    const value = new Request(url, { method });
    Object.defineProperties(value, {
      destination: { value: destination },
      mode: { value: mode },
    });
    return contextResourceResponse(
      { request: value, clientId, resultingClientId },
      registry,
      base,
      store,
    );
  };
  return {
    records,
    registry,
    request,
    reads: () => reads,
    replaceInstallation() {
      installedApp = { ...app, generation: 'new-host-installation-generation' };
    },
  };
}

test('resource bearers admit only their immutable graph and exact bound native client', async () => {
  const f = await fixture();
  assert.equal((await f.request(resourceURL))?.status, 200);
  assert.equal((await f.request(resourceURL, 'actual-worker', 'script'))?.status, 200);
  assert.equal((await f.request(resourceURL, 'another-worker'))?.type, 'error');
  assert.equal((await f.request(resourceURL, 'actual-parent'))?.type, 'error');
  assert.equal(
    (await f.request(resourceURL.replace('/runtime/', '/foreign/')))?.type,
    'error',
  );
  assert.equal(
    (await f.request(new URL('resources/not-installed.js', directory).href))?.type,
    'error',
  );
  assert.equal(
    (
      await f.request(
        resourceURL.replace(context, '00000000-0000-4000-8000-000000000000'),
      )
    )?.type,
    'error',
  );
  assert.equal(f.reads(), 2);
});

test('resource bearers never admit context startups, navigation, request bodies or queries', async () => {
  const f = await fixture();
  for (const destination of [
    'worker',
    'sharedworker',
    'serviceworker',
    'audioworklet',
    'paintworklet',
    'document',
    'iframe',
    'object',
  ] as RequestDestination[]) {
    assert.equal(
      (await f.request(resourceURL, '', destination))?.type,
      'error',
      destination,
    );
  }
  assert.equal((await f.request(resourceURL, '', '', 'POST'))?.type, 'error');
  assert.equal((await f.request(resourceURL, '', '', 'GET', 'navigate'))?.type, 'error');
  assert.equal((await f.request(resourceURL + '?extra=1'))?.type, 'error');
  assert.equal(f.reads(), 0);
});

test('readiness is replayable and concurrent but grants no authority after closure', async () => {
  const f = await fixture();
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => f.request(readyURL)),
  );
  assert(responses.every((response) => response?.status === 200));
  assert.equal(f.records.get('actual-worker')?.state, 'preparing');
  assert.equal((await f.request(readyURL, 'actual-worker'))?.status, 200);
  assert.equal((await f.request(readyURL, 'other'))?.type, 'error');
  assert.equal((await f.request(readyURL, '', 'script'))?.type, 'error');
  assert.equal(
    (await f.request(readyURL.replace('/runtime/', '/other/')))?.type,
    'error',
  );
  assert.equal(await f.registry.closeChild('actual-parent', app.id, context), true);
  assert.equal((await f.request(readyURL))?.type, 'error');
  assert.equal((await f.request(resourceURL))?.type, 'error');
  assert.equal(f.reads(), 0);
});

test('incompatible versions and document bindings cannot grant a worker resource bearer', async () => {
  const f = await fixture();
  const identity = f.records.get('actual-worker')!;
  f.records.set('actual-worker', {
    ...identity,
    policyVersion: CONTEXT_POLICY_VERSION + 1,
  });
  assert.equal((await f.request(resourceURL))?.type, 'error');
  f.records.set('actual-worker', { ...identity, kind: 'window' });
  assert.equal((await f.request(resourceURL))?.type, 'error');
  assert.equal(f.reads(), 0);
});

test('Firefox module descendants require an existing exact worker and no new reserved client', async () => {
  const f = await fixture();
  assert.equal(
    (await f.request(resourceURL, 'actual-worker', 'worker', 'GET', 'cors', ''))?.status,
    200,
  );
  // Native Worker construction reserves a different resulting client. It must
  // never execute graph bytes before the trusted bootstrap has prepared it.
  for (const caller of ['actual-worker', 'actual-parent', '']) {
    assert.equal(
      (
        await f.request(
          resourceURL,
          caller,
          'worker',
          'GET',
          'cors',
          'new-reserved-worker',
        )
      )?.type,
      'error',
    );
  }
  assert.equal(
    (await f.request(resourceURL, '', 'worker', 'GET', 'cors', ''))?.type,
    'error',
  );
  assert.equal((await f.request(resourceURL, 'actual-worker', 'worker'))?.type, 'error');
  assert.equal(
    (await f.request(resourceURL, 'another-worker', 'worker', 'GET', 'cors', ''))?.type,
    'error',
  );
  assert.equal(f.reads(), 1);
});

test('replacing an installation revokes its old graph and readiness bearers', async () => {
  const f = await fixture();
  assert.equal((await f.request(resourceURL))?.status, 200);
  f.replaceInstallation();
  assert.equal((await f.request(resourceURL))?.type, 'error');
  assert.equal((await f.request(readyURL))?.type, 'error');
  assert.equal(
    (await f.request(resourceURL, 'actual-worker', 'worker', 'GET', 'cors', ''))?.type,
    'error',
  );
  assert.equal(f.records.get('actual-worker')?.state, 'preparing');
  assert.equal(f.reads(), 1);
});
