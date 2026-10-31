import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTEXT_POLICY_VERSION,
  ContextRegistry,
  type ContextIdentity,
} from '../../src/runtime/contexts/model.ts';
import { memoryContextStorage } from '../../test/context-storage.ts';

// Actual registry code with atomic in-memory storage contracts. Browser-backed
// transactions and independent connections are tested by controller-context-storage.ts.
function identity(id = 'context'): ContextIdentity {
  return {
    policyVersion: CONTEXT_POLICY_VERSION,
    installationGeneration: 'generation',
    id,
    application: 'application',
    parent: 'owner',
    kind: 'dedicated-worker',
    state: 'preparing',
    url: 'https://runtime.test/worker',
  };
}
function gate() {
  let release!: () => void;
  let started!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  return { release, started, blocked, waiting };
}
async function reaches(pause: ReturnType<typeof gate>, operation: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      pause.waiting,
      operation.then(() => {
        throw new Error('Operation skipped scheduled suspension');
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Scheduled suspension not reached')),
          3000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
for (const mode of ['client', 'context', 'independent'] as const) {
  test(`independent registry queues preserve ${mode} binding constraints`, async () => {
    const records = new Map<string, ContextIdentity>();
    const left = new ContextRegistry(memoryContextStorage(records));
    const right = new ContextRegistry(memoryContextStorage(records));
    const replies = await Promise.allSettled([
      left.bind('left-client', identity('left-context')),
      right.bind(
        mode === 'client' ? 'left-client' : 'right-client',
        identity(mode === 'context' ? 'left-context' : 'right-context'),
      ),
    ]);
    const winners = mode === 'independent' ? 2 : 1;
    assert.equal(replies.filter((reply) => reply.status === 'fulfilled').length, winners);
    assert.equal(records.size, winners);
  });
}
for (const mode of ['identity', 'capability'] as const) {
  test(`cross-controller closure during ${mode} revalidation refuses delivery`, async () => {
    const records = new Map<string, ContextIdentity>();
    const closures = new Set<string>();
    const storage = memoryContextStorage(records, closures);
    const first = new ContextRegistry(storage);
    const replacement = new ContextRegistry(memoryContextStorage(records, closures));
    await first.bind('client', identity());
    const expected = await first.resourceCapability('context', 'client');
    assert(expected);
    const pause = gate();
    const get = storage.get;
    let firstRead = true;
    storage.get = async (client) => {
      const snapshot = await get(client);
      if (firstRead) {
        firstRead = false;
        pause.started();
        await pause.blocked;
      }
      return snapshot;
    };
    const checking =
      mode === 'identity'
        ? first.isCurrent({ id: 'client', url: identity().url }, identity())
        : first.isCapabilityCurrent('context', 'client', expected);
    try {
      await reaches(pause, checking);
      assert.equal(await replacement.closeChild('owner', 'application', 'context'), true);
    } finally {
      pause.release();
      await Promise.allSettled([checking]);
    }
    assert.equal(await checking, false);
    const restarted = new ContextRegistry(memoryContextStorage(records, closures));
    assert.equal(await restarted.resolveWorker('client'), undefined);
  });
}
test('cancellation before an atomic bind survives controller replacement', async () => {
  const records = new Map<string, ContextIdentity>();
  const closures = new Set<string>();
  const storage = memoryContextStorage(records, closures);
  const first = new ContextRegistry(storage);
  const replacement = new ContextRegistry(memoryContextStorage(records, closures));
  const pause = gate();
  const bind = storage.bind;
  storage.bind = async (...args) => {
    pause.started();
    await pause.blocked;
    return bind(...args);
  };
  const pending = first.bind('client', identity());
  const outcome = pending.then(
    () => 'accepted',
    () => 'rejected',
  );
  try {
    await reaches(pause, pending);
    assert.equal(await replacement.closeChild('owner', 'application', 'context'), true);
  } finally {
    pause.release();
    await Promise.allSettled([pending]);
  }
  assert.equal(await outcome, 'rejected');
  assert.equal(await replacement.resourceCapability('context', ''), undefined);
});
