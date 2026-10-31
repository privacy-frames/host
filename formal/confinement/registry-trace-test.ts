import { memoryContextStorage } from '../../test/context-storage.ts';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import {
  CONTEXT_POLICY_VERSION,
  ContextRegistry,
  type ContextIdentity,
} from '../../src/runtime/contexts/model.ts';

execFileSync('python3', ['formal/confinement/generate-registry.py'], {
  stdio: 'inherit',
});
const graph: unknown = JSON.parse(
  await readFile('formal/confinement/registry-graph.json', 'utf8'),
);
assert(
  graph &&
    typeof graph === 'object' &&
    'nodes' in graph &&
    'edges' in graph &&
    'inputs' in graph,
);
assert(graph.nodes && typeof graph.nodes === 'object' && !Array.isArray(graph.nodes));
assert(Array.isArray(graph.edges));
const canonical = (value: object) =>
  JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))),
  );
const nodes = new Map<string, string>();
for (const [id, value] of Object.entries(graph.nodes)) {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  nodes.set(id, canonical(value));
}
const edges = new Set<string>();
for (const edge of graph.edges) {
  assert(
    edge &&
      typeof edge === 'object' &&
      typeof edge.from === 'string' &&
      typeof edge.to === 'string' &&
      typeof edge.action === 'string',
  );
  assert(nodes.has(edge.from) && nodes.has(edge.to));
  edges.add(JSON.stringify([nodes.get(edge.from), edge.action, nodes.get(edge.to)]));
}
assert(nodes.size >= 6);
const identity: ContextIdentity = {
  policyVersion: CONTEXT_POLICY_VERSION,
  installationGeneration: 'generation',
  id: 'context',
  application: 'app',
  parent: 'owner',
  kind: 'dedicated-worker',
  state: 'preparing',
  url: 'https://runtime.test/worker',
};
const actions = [
  'Bind',
  'Current',
  'CapabilityCurrent',
  'CloseOwner',
  'CloseOther',
  'Replace',
  'StaleGeneration',
  'StaleIdentity',
  'WrongClient',
  'WrongURL',
] as const;
type Action = (typeof actions)[number];
const samples: object[] = [];
let checkedStoredPhases = false;
let count = 0,
  transitions = 0;
async function exercise(sequence: readonly Action[]) {
  const records = new Map<string, ContextIdentity>();
  const closures = new Set<string>();
  const key = (parent: string, app: string, context: string) =>
    JSON.stringify([parent, app, context]);
  let writes = 0;
  const storage = memoryContextStorage(records, closures, () => {
    writes++;
  });
  let registry = new ContextRegistry(storage);
  const snapshot = () => ({
    state: records.get('client')
      ? records.get('client')?.state === 'closed'
        ? 'closed'
        : 'bound'
      : 'absent',
    closedByOwner: closures.has(key('owner', 'app', 'context')),
    closedByOther: closures.has(key('other', 'app', 'context')),
    badBind: false,
    badRevive: false,
    badClose: false,
  });
  const trace: object[] = [];
  for (const action of sequence) {
    const before = snapshot();
    let outcome: unknown = null;
    try {
      if (action === 'Bind') {
        await registry.bind('client', { ...identity });
        outcome = 'bound';
      }
      if (action === 'Current')
        outcome = await registry.isCurrent({ id: 'client', url: identity.url }, identity);
      if (action === 'CapabilityCurrent')
        outcome = await registry.isCapabilityCurrent('context', 'client', {
          client: 'client',
          identity,
        });
      if (action === 'CloseOwner')
        outcome = await registry.closeChild('owner', 'app', 'context');
      if (action === 'CloseOther')
        outcome = await registry.closeChild(
          process.env.REGISTRY_FAULT === 'wrong-owner' ? 'owner' : 'other',
          'app',
          'context',
        );
      if (action === 'StaleGeneration' || action === 'StaleIdentity') {
        const stale = {
          ...identity,
          ...(action === 'StaleGeneration'
            ? { installationGeneration: 'stale-generation' }
            : { id: 'stale-context' }),
        };
        outcome = await registry.isCurrent({ id: 'client', url: identity.url }, stale);
        assert.equal(
          await registry.isCapabilityCurrent('context', 'client', {
            client: 'client',
            identity: stale,
          }),
          false,
        );
      }
      if (action === 'WrongClient')
        outcome = await registry.isCurrent(
          { id: 'other-client', url: identity.url },
          identity,
        );
      if (action === 'WrongURL')
        outcome = await registry.isCurrent(
          { id: 'client', url: 'https://runtime.test/wrong' },
          identity,
        );
      if (action === 'Replace') {
        registry = new ContextRegistry(storage);
        outcome = 'replaced';
      }
    } catch (error) {
      outcome = error instanceof Error ? 'rejected: ' + error.message : 'rejected';
    }
    const after = snapshot();
    const stored = records.get('client');
    if (stored) {
      assert.equal(stored.id, identity.id);
      assert.equal(stored.application, identity.application);
      assert.equal(stored.parent, identity.parent);
      assert.equal(stored.installationGeneration, identity.installationGeneration);
      assert.equal(stored.url, identity.url);
    }
    const live = after.state === 'bound' && !after.closedByOwner;
    const direct = await registry.resourceCapability('context', 'client');
    const bearer = await registry.resourceCapability('context', '');
    const stranger = await registry.resourceCapability('context', 'other-client');
    assert.equal(Boolean(direct), live);
    assert.equal(Boolean(bearer), live);
    assert.equal(stranger, undefined);
    if (live && stored && !checkedStoredPhases) {
      // Persistent protocol labels are intentionally retained. This supplemental
      // seed check verifies all of them; they are one bound state in the graph.
      const beforeChecks = writes;
      for (const state of ['preparing', 'ready', 'running', 'closed'] as const) {
        records.set('client', { ...stored, state });
        const expected = state !== 'closed';
        assert.equal(
          await registry.isCurrent({ id: 'client', url: identity.url }, identity),
          expected,
        );
        assert.equal(
          await registry.isCapabilityCurrent('context', 'client', {
            client: 'client',
            identity,
          }),
          expected,
        );
      }
      records.set('client', stored);
      const changedAuthority: Partial<ContextIdentity>[] = [
        { id: 'other-context' },
        { application: 'other-application' },
        { installationGeneration: 'other-generation' },
        { parent: 'other-parent' },
        { kind: 'shared-worker' },
        { policyVersion: CONTEXT_POLICY_VERSION + 1 },
        { url: 'https://runtime.test/other-worker' },
        { state: 'closed' },
      ];
      for (const changed of changedAuthority) {
        const stale = { ...identity, ...changed };
        assert.equal(
          await registry.isCurrent({ id: 'client', url: identity.url }, stale),
          false,
        );
        assert.equal(
          await registry.isCapabilityCurrent('context', 'client', {
            client: 'client',
            identity: stale,
          }),
          false,
        );
      }
      assert.equal(
        await registry.isCapabilityCurrent('context', 'client', {
          client: 'wrong-client',
          identity,
        }),
        false,
      );
      assert.equal(writes, beforeChecks, 'Authority validation must not rewrite phases');
      checkedStoredPhases = true;
    }

    const from = canonical(before),
      to = canonical(after);
    assert(
      [...nodes.values()].includes(from) && [...nodes.values()].includes(to),
      'registry model mismatch: ' +
        JSON.stringify({ sequence, action, before, after, outcome }),
    );
    assert(
      from === to || edges.has(JSON.stringify([from, action, to])),
      'registry model mismatch: ' +
        JSON.stringify({ sequence, action, before, after, outcome }),
    );
    if (['WrongClient', 'WrongURL', 'StaleGeneration', 'StaleIdentity'].includes(action))
      assert.equal(outcome, false);
    if (action === 'Current' || action === 'CapabilityCurrent')
      assert.equal(outcome, live);
    if (action === 'CloseOther' && before.state !== 'absent')
      assert.equal(outcome, false);
    if (action === 'Bind' && before.closedByOwner)
      assert(String(outcome).startsWith('rejected:'));
    trace.push({
      action,
      before,
      outcome,
      after,
      capabilities: {
        direct: Boolean(direct),
        bearer: Boolean(bearer),
        stranger: Boolean(stranger),
      },
    });
    transitions++;
  }
  count++;
  if (
    sequence.join(',') === 'CloseOwner,Replace,Bind,Current' ||
    sequence.join(',') === 'Bind,Current,CloseOwner,CapabilityCurrent' ||
    sequence.join(',') === 'CloseOther,Bind,CapabilityCurrent,CloseOwner'
  )
    samples.push({ sequence, trace });
}
async function enumerate(prefix: Action[], depth: number): Promise<void> {
  if (depth === 0) {
    await exercise(prefix);
    return;
  }
  for (const action of actions) await enumerate([...prefix, action], depth - 1);
}
await enumerate([], 4);
assert.equal(count, 10000);
assert.equal(checkedStoredPhases, true);
assert.equal(samples.length, 3);
await writeFile(
  'formal/confinement/registry-implementation-traces.json',
  JSON.stringify(
    {
      scope:
        '10000 length-four sequential operation traces against the actual ContextRegistry, using an in-memory ContextStorage. No browser guard, native client identity or concurrent storage interleaving is verified.',
      modelInputs: graph.inputs,
      runnerSHA256: createHash('sha256')
        .update(await readFile('formal/confinement/registry-trace-test.ts'))
        .digest('hex'),
      sourceSHA256: createHash('sha256')
        .update(await readFile('src/runtime/contexts/model.ts'))
        .digest('hex'),
      storageFixtureSHA256: createHash('sha256')
        .update(await readFile('test/context-storage.ts'))
        .digest('hex'),
      boundAbstraction:
        'Persisted preparing/ready/running all project to bound; no guard readiness is inferred',
      supplementalChecks:
        'All four stored phase labels, seven changed authority fields, closed expected identity, wrong capability client, and no validation writes',
      sequences: count,
      transitions,
      samples,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `${count} actual registry sequences, ${transitions} transitions matched the TLC graph or stuttered`,
);
