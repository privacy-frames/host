import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedController } from '../src/runtime/contexts/shared-controller.ts';
import {
  ContextRegistry,
  CONTEXT_POLICY_VERSION,
} from '../src/runtime/contexts/model.ts';
import type { StoredInstallation } from '../src/runtime/storage.ts';
import { applicationURL } from '../src/shared/runtime-url.ts';
import { parseSharedWorkerKey } from '../src/shared/shared-worker.ts';
import { memoryContextStorage } from './context-storage.ts';

const base = new URL('https://runtime.test/');
const initial: StoredInstallation = {
  id: 'shared-' + 'a'.repeat(64),
  generation: 'first',
  source: 'https://publisher.test/app/',
  manifest: { id: 'shared', name: 'Shared', entry: 'index.html' },
  resources: [
    {
      path: 'entry.js',
      url: 'https://publisher.test/app/entry.js',
      contentType: 'text/javascript',
      sha256: 'fixture',
    },
    {
      path: 'index.html',
      url: 'https://publisher.test/app/',
      contentType: 'text/html',
      sha256: 'fixture',
    },
  ],
  size: 1,
  installedAt: '2026-11-01',
  format: 'offline-resources-v1',
  capture: { additionalResources: [], unavailableResources: [] },
};
async function fixture() {
  let app = initial;
  let duringIssue: (() => void) | undefined;
  const tickets = new Map<string, string>();
  const contexts = new ContextRegistry(memoryContextStorage());
  const clients = new Map<string, Client>();
  for (const id of ['owner', 'peer']) {
    const client: Client = {
      id,
      type: 'window',
      frameType: 'top-level',
      url: applicationURL(app, base).href,
      postMessage() {},
    };
    clients.set(id, client);
    await contexts.bind(id, {
      policyVersion: CONTEXT_POLICY_VERSION,
      id: crypto.randomUUID(),
      application: app.id,
      installationGeneration: app.generation,
      kind: 'window',
      state: 'preparing',
      parent: null,
      url: client.url,
    });
  }
  const controller = createSharedController({
    base,
    contexts,
    async client(id) {
      return clients.get(id);
    },
    async application() {
      return app.id;
    },
    async installation(id) {
      return id === app.id ? app : undefined;
    },
    async bootstrap() {
      return new Response('trusted fixture');
    },
    store: {
      async issue(actor) {
        const id = crypto.randomUUID();
        tickets.set(id, actor.client);
        duringIssue?.();
        return id;
      },
      async disconnect(ticket, actor) {
        if (tickets.get(ticket) !== actor.client) return false;
        tickets.delete(ticket);
        return true;
      },
      async consume() {
        throw new Error('HTTP redemption is outside this unit fixture');
      },
    },
  });
  const packet = {
    operation: 'connect',
    source: initial.resources[0].url,
    workerType: 'classic',
    name: 'shared',
    application: 'forged',
    client: 'forged',
  };
  return {
    controller,
    packet,
    tickets,
    duringIssue(callback: () => void) {
      duringIssue = callback;
    },
    replace() {
      app = { ...app, generation: 'replacement' };
    },
  };
}

test('shared connection messages derive their principal from the actual Window', async () => {
  const f = await fixture();
  const grant = await f.controller.request('owner', f.packet);
  assert('ticket' in grant);
  assert.equal(grant.application, initial.id);
  assert.equal(parseSharedWorkerKey(grant.key)?.source, initial.resources[0].url);
  assert.equal(f.tickets.get(grant.ticket), 'owner');
  assert.deepEqual(
    structuredClone(
      await f.controller.request('peer', {
        operation: 'disconnect',
        ticket: grant.ticket,
        client: 'owner',
      }),
    ),
    { closed: false },
  );
  assert.deepEqual(
    structuredClone(
      await f.controller.request('owner', {
        operation: 'disconnect',
        ticket: grant.ticket,
      }),
    ),
    { closed: true },
  );
  await assert.rejects(f.controller.request('missing', f.packet), /owner unavailable/);
});

test('replacement during ticket issuance revokes the unreturned grant', async () => {
  const f = await fixture();
  f.duringIssue(() => f.replace());
  await assert.rejects(f.controller.request('owner', f.packet), /owner changed/);
  assert.equal(f.tickets.size, 0);
});

test('invalid shared module and protocol data fail before a ticket is issued', async () => {
  const f = await fixture();
  for (const change of [
    { source: initial.source },
    { source: 'https://outside.test/entry.js' },
    { source: 'blob:https://outside.test/entry' },
    { source: 'data:text/javascript,0' },
    { workerType: 'invalid' },
    { operation: 'consume' },
  ])
    await assert.rejects(f.controller.request('owner', { ...f.packet, ...change }));
  let invoked = false;
  const packet = Object.defineProperty({ ...f.packet }, 'name', {
    get() {
      invoked = true;
      return 'bad';
    },
  });
  await assert.rejects(f.controller.request('owner', packet), /accessors/);
  assert.equal(invoked, false);
  assert.equal(f.tickets.size, 0);
});
