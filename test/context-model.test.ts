import { memoryContextStorage } from './context-storage.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTEXT_POLICY_VERSION,
  ContextRegistry,
  type ContextIdentity,
} from '../src/runtime/contexts/model.ts';

function identity(): ContextIdentity {
  return {
    policyVersion: CONTEXT_POLICY_VERSION,
    installationGeneration: 'host-installation-generation',
    id: 'context',
    application: 'application',
    parent: 'real-parent-client',
    kind: 'dedicated-worker',
    state: 'preparing',
    url: 'https://runtime.test/worker',
  };
}

test('browser context bindings survive controller replacement but reject claimed IDs and changed URLs', async () => {
  const storage = memoryContextStorage();
  const first = new ContextRegistry(storage);
  const value = identity();
  await first.bind('real-browser-client', value);
  value.application = 'changed-after-bind';
  const replacement = new ContextRegistry(storage);
  assert.equal(
    (await replacement.resolveWorker('real-browser-client'))?.application,
    'application',
  );
  assert.equal(await replacement.resolveWorker('application-provided-claim'), undefined);
  assert.equal(
    await replacement.resolve({
      id: 'real-browser-client',
      url: 'https://runtime.test/other',
    }),
    undefined,
  );
  await assert.rejects(replacement.bind('real-browser-client', value), /already bound/);
});

test('closed contexts cannot regain authority through readiness checks', async () => {
  const registry = new ContextRegistry(memoryContextStorage());
  const client = { id: 'browser-client', url: identity().url };
  await registry.bind(client.id, identity());
  const expected = await registry.resolve(client);
  const capability = await registry.resourceCapability('context', client.id);
  assert(expected && capability);
  assert.equal(await registry.isCurrent(client, expected), true);
  assert.equal(
    await registry.isCapabilityCurrent('context', client.id, capability),
    true,
  );
  await registry.closeChild('real-parent-client', 'application', 'context');
  assert.equal(await registry.resolveWorker(client.id), undefined);
  assert.equal(await registry.isCurrent(client, expected), false);
  assert.equal(
    await registry.isCapabilityCurrent('context', client.id, capability),
    false,
  );
});

test('window fragments retain their browser binding while document/query changes and closure revoke it', async () => {
  const registry = new ContextRegistry(memoryContextStorage());
  const value = {
    ...identity(),
    kind: 'window' as const,
    url: 'https://runtime.test/child/',
  };
  await registry.bind('browser-window', value);
  assert.equal(
    (await registry.resolve({ id: 'browser-window', url: value.url + '#section' }))
      ?.application,
    value.application,
  );
  for (const url of [value.url + '?new=1', value.url + 'different/', 'not a URL'])
    assert.equal(await registry.resolve({ id: 'browser-window', url }), undefined);
  await registry.closeChild(value.parent!, value.application, value.id);
  assert.equal(
    await registry.resolve({ id: 'browser-window', url: value.url }),
    undefined,
  );
});

test('root window identity survives only routes inside its installed application namespace', async () => {
  const records = new Map<string, ContextIdentity>();
  const registry = new ContextRegistry(memoryContextStorage(records));
  const value = {
    ...identity(),
    parent: null,
    kind: 'window' as const,
    url: 'https://runtime.test/runtime/abcdefghijk/example/',
  };
  await registry.bind('root-window', value);
  assert.equal(
    (
      await registry.resolve({
        id: 'root-window',
        url: value.url + 'editor?image=1#view',
      })
    )?.application,
    value.application,
  );
  for (const url of [
    value.url + '__contexts/raw.js',
    'https://runtime.test/runtime/connect.html',
    'https://runtime.test/runtime/anotherapp1/example/',
    'https://publisher.test/',
  ])
    assert.equal(await registry.resolve({ id: 'root-window', url }), undefined);
  records.set('root-window', { ...value, state: 'closed' });
  assert.equal(await registry.resolve({ id: 'root-window', url: value.url }), undefined);
});

test('an incompatible context policy cannot bind or regain authority from persisted state', async () => {
  const records = new Map<string, ContextIdentity>();
  const registry = new ContextRegistry(memoryContextStorage(records));
  const value = { ...identity(), policyVersion: CONTEXT_POLICY_VERSION + 1 };
  await assert.rejects(registry.bind('browser-client', value), /Incomplete/);
  records.set('browser-client', value);
  assert.equal(await registry.resolveWorker('browser-client'), undefined);
  assert.equal(
    await registry.resolve({ id: 'browser-client', url: value.url }),
    undefined,
  );
});

test('only the actual owning parent and application can close a bound context', async () => {
  const registry = new ContextRegistry(memoryContextStorage());
  await registry.bind('browser-client', identity());
  assert.equal(
    await registry.closeChild('unrelated-parent', 'application', 'context'),
    false,
  );
  assert.equal(
    await registry.closeChild('real-parent-client', 'other-application', 'context'),
    false,
  );
  assert((await registry.resolveWorker('browser-client'))?.application === 'application');
  assert.equal(
    await registry.closeChild('real-parent-client', 'application', 'context'),
    true,
  );
  assert.equal(await registry.resolveWorker('browser-client'), undefined);
  assert.equal(
    await registry.closeChild('real-parent-client', 'application', 'context'),
    true,
  );
});

test('parent cancellation before binding survives a registry restart without closing another parent', async () => {
  const storage = memoryContextStorage();
  const first = new ContextRegistry(storage);
  assert.equal(
    await first.closeChild('real-parent-client', 'application', 'context'),
    true,
  );
  const replacement = new ContextRegistry(storage);
  await assert.rejects(
    replacement.bind('cancelled-client', identity()),
    /closed before startup/,
  );
  await replacement.bind('other-client', { ...identity(), parent: 'another-parent' });
  assert.equal(
    (await replacement.resolveWorker('other-client'))?.parent,
    'another-parent',
  );
  assert.equal(
    await replacement.closeChild('real-parent-client', 'application', 'context'),
    false,
  );
  assert(await replacement.resolveWorker('other-client'));
});

test('revalidation queued after closure cannot read before its pending tombstone', async () => {
  const storage = memoryContextStorage();
  const registry = new ContextRegistry(storage);
  const client = { id: 'browser-client', url: identity().url };
  await registry.bind(client.id, identity());
  const expected = await registry.resolve(client);
  const capability = await registry.resourceCapability('context', client.id);
  assert(expected && capability);
  const request = storage.close;
  let started!: () => void, release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  storage.close = async (...args) => {
    started();
    await blocked;
    return request(...args);
  };
  const closed = registry.closeChild('real-parent-client', 'application', 'context');
  let checks: Promise<boolean[]> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      waiting,
      closed.then(() => {
        throw new Error('Closure did not reach its scheduled tombstone');
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Closure gate timed out')), 3000);
      }),
    ]);
    let settled = false;
    checks = Promise.all([
      registry.isCurrent(client, expected),
      registry.isCapabilityCurrent('context', client.id, capability),
    ]).then((value) => {
      settled = true;
      return value;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(settled, false, 'Revalidation passed an earlier queued close');
  } finally {
    if (timer) clearTimeout(timer);
    release();
    await Promise.allSettled(checks ? [closed, checks] : [closed]);
  }
  assert(checks);
  assert.deepEqual(await checks, [false, false]);
});
