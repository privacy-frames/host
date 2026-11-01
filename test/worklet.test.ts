import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWorkletModule } from '../src/runtime/contexts/worklet-source.ts';
import {
  WorkletRegistry,
  type StoredWorklet,
  type WorkletStorage,
} from '../src/runtime/contexts/worklet-store.ts';
import { createWorkletController } from '../src/runtime/contexts/worklet-controller.ts';
import { resourceURL } from '../src/shared/runtime-url.ts';
import type { StoredInstallation } from '../src/runtime/storage.ts';
import { WORKLET_IMPORTS } from '../src/runtime/contexts/worklet-types.ts';
import type { WorkletGraphOptions } from '../src/runtime/contexts/worklet-graph.ts';
import { createPolicyTools } from '../src/runtime/enforcement/native.ts';

const base = new URL('https://runtime.test/');
const initial: StoredInstallation = {
  id: 'worklets-' + 'a'.repeat(64),
  generation: 'generation-one',
  source: 'https://publisher.test/app/index.html',
  manifest: { id: 'worklets', name: 'Worklets', entry: 'index.html' },
  resources: [
    {
      path: 'entry.js',
      url: 'https://publisher.test/app/entry.js',
      contentType: 'text/javascript',
      sha256: 'fixture',
    },
    {
      path: 'dependency.js',
      url: 'https://publisher.test/app/dependency.js',
      contentType: 'text/javascript',
      sha256: 'fixture',
    },
    {
      path: 'index.html',
      url: 'https://publisher.test/app/index.html',
      contentType: 'text/html',
      sha256: 'fixture',
    },
  ],
  size: 1,
  installedAt: '2026-10-27',
  format: 'offline-resources-v1',
  capture: { additionalResources: [], unavailableResources: [] },
};
function memory() {
  const records = new Map<string, StoredWorklet>();
  const storage: WorkletStorage = {
    async get(id) {
      const record = records.get(id);
      // Persistence decoding need not retain the writer's property order.
      return record
        ? {
            entries: record.entries,
            parentClient: record.parentClient,
            generation: record.generation,
            application: record.application,
            kind: record.kind,
            state: record.state,
            id: record.id,
            version: record.version,
          }
        : undefined;
    },
    async put(value) {
      records.set(value.id, structuredClone(value));
    },
  };
  return { records, storage };
}
function fixture() {
  let app = initial;
  const { storage, records } = memory();
  let reads = 0;
  let compilations = 0;
  let preparation: WorkletGraphOptions | undefined;
  let duringCompile: (() => void) | undefined;
  const controller = createWorkletController({
    base,
    storage,
    async owner(clientId) {
      return ['native-window', 'other-window'].includes(clientId)
        ? { clientId, app }
        : undefined;
    },
    async readResource(_app, path, generation) {
      assert.equal(generation, app.generation);
      reads++;
      return new TextEncoder().encode(
        path === 'entry.js'
          ? "import './dependency.js';globalThis.entryRan=true;"
          : 'export const dependency=1;',
      ).buffer;
    },
    async guardSource() {
      return 'globalThis.hostPreparation=true;';
    },
    async importSource() {
      return 'export function rejectDynamicImport(){}';
    },
    // This double exercises controller authorization and immutable reads only.
    // Actual compilation and native execution have separate browser comparisons.
    async compile(options) {
      compilations++;
      preparation = options;
      const code = await options.readModule(options.entry);
      duringCompile?.();
      return {
        entry: options.entry,
        chunks: [{ name: 'fixture.js', code, imports: [] }],
        facades: [{ module: options.entry, chunk: 'fixture.js' }],
      };
    },
  });
  const issue = (
    source: unknown = { kind: 'resource', url: initial.resources[0].url },
    kind = 'audio',
    id?: string,
    modules: unknown = [],
    clientId = 'native-window',
  ) =>
    controller.request(clientId, {
      kind,
      source,
      modules,
      ...(id ? { id } : {}),
      application: 'ignored-claim',
      generation: 'ignored-claim',
      parentClient: 'native-window',
    });
  return {
    issue,
    records,
    reads: () => reads,
    compilations: () => compilations,
    preparation: () => {
      assert(preparation);
      return preparation;
    },
    duringCompile(callback: () => void) {
      duringCompile = callback;
    },
    replace() {
      app = { ...app, generation: 'generation-two' };
    },
  };
}

test('module rewriting relocates imports and adds the dynamic-loading rejection helper', () => {
  const options = {
    baseURL: 'https://runtime.test/app/main.js',
    logicalURL: 'https://publisher.test/main.js',
    importsURL: WORKLET_IMPORTS,
    aliases: [
      [
        'https://runtime.test/app/dependency.js',
        'https://runtime.test/context/resources/dependency.js',
      ],
    ] as [string, string][],
  };
  const code = prepareWorkletModule(
    '#!module\nimport value from "./dependency.js"; export * from "./dependency.js"; const __privacyWorkletImport0 = 1; import(import("data:text/javascript,bad()")); const identity=import.meta.url;',
    options,
  );
  assert(
    code.startsWith(
      '#!module\nimport { rejectDynamicImport as __privacyWorkletImport1 }',
    ),
  );
  assert.equal(code.match(/context\/resources\/dependency.js/g)?.length, 2);
  assert(
    code.includes(
      '__privacyWorkletImport1(__privacyWorkletImport1("data:text/javascript,bad()"))',
    ),
  );
  assert(!code.includes('import.meta.url'));
  assert(code.includes('https://publisher.test/main.js'));
  assert.throws(
    () => prepareWorkletModule('import "https://outside.test/code.js";', options),
    /not installed/,
  );
  assert.throws(
    () => prepareWorkletModule('import "data:text/javascript,bad()";', options),
    /not installed/,
  );
  assert.throws(
    () => prepareWorkletModule('import "blob:https://runtime.test/unknown";', options),
    /not installed/,
  );
});

test('worklet registry persists actual owner/generation independently of browser worker identities', async () => {
  const { storage } = memory();
  const actor = {
    application: initial.id,
    generation: initial.generation,
    parentClient: 'native-window',
  };
  const first = await new WorkletRegistry(storage).register(actor, 'audio', {
    kind: 'resource',
    url: initial.resources[0].url,
  });
  const replacement = new WorkletRegistry(storage);
  assert.equal((await replacement.resolve(first.identity.id, actor))?.entries.length, 1);
  assert.equal(
    await replacement.resolve(first.identity.id, {
      ...actor,
      parentClient: 'other-window',
    }),
    undefined,
  );
  assert.equal(
    await replacement.resolve(first.identity.id, { ...actor, generation: 'replacement' }),
    undefined,
  );
  await assert.rejects(
    replacement.register(
      { ...actor, application: 'other-app' },
      'audio',
      first.entry.source,
      first.identity.id,
    ),
    /not owned/,
  );
});

test('controller binds local preparation to the actual Window and generation', async () => {
  const f = fixture();
  const issued = await f.issue();
  assert.equal(issued.kind, 'audio');
  assert.equal(issued.entry, resourceURL(initial, 'entry.js', base).href);
  assert(issued.guard.includes('hostPreparation=true'));
  assert(issued.graph?.chunks[0].code.startsWith('import { rejectDynamicImport'));
  assert.equal(f.reads(), 1);
  assert.equal(f.compilations(), 1);
  const prepared = f.preparation();
  assert.equal(
    await prepared.readModule(WORKLET_IMPORTS),
    'export function rejectDynamicImport(){}',
  );
  await assert.rejects(prepared.readModule(initial.source), /not installed JavaScript/);
  await assert.rejects(
    prepared.readModule('https://outside.test/code.js'),
    /not installed JavaScript/,
  );
  await assert.rejects(
    f.issue(undefined, 'audio', issued.id, [], 'other-window'),
    /not owned/,
  );
  await assert.rejects(
    f.issue(undefined, 'audio', undefined, [], ''),
    /owner is unavailable/,
  );
  f.replace();
  await assert.rejects(f.issue(undefined, 'audio', issued.id), /not owned/);
});

test('owner replacement during compilation prevents publication', async () => {
  const f = fixture();
  f.duringCompile(() => f.replace());
  await assert.rejects(f.issue(), /owner changed during preparation/);
  assert.equal(f.compilations(), 1);
});

test('prepared facades avoid compilation but still require current owner authority', async () => {
  const f = fixture();
  const issued = await f.issue();
  const modules = [[issued.entry, 'blob:https://runtime.test/local-entry']];
  const reused = await f.issue(undefined, 'audio', issued.id, modules);
  assert.equal(reused.graph, null);
  assert.equal(reused.guard, issued.guard);
  assert.equal(f.compilations(), 1);
  await assert.rejects(
    f.issue(undefined, 'audio', issued.id, modules, 'other-window'),
    /not owned/,
  );
  for (const invalid of [
    [[issued.entry, 'https://runtime.test/code.js']],
    [[issued.entry, 'blob:https://foreign.test/code']],
    [['https://outside.test/code.js', 'blob:https://runtime.test/local']],
    [modules[0], modules[0]],
    new Array(1),
  ])
    await assert.rejects(f.issue(undefined, 'audio', issued.id, invalid));
  assert.equal(f.compilations(), 1);
});

test('resource and runtime Blob entries reject unknown HTTP, foreign origins and invalid MIME', async () => {
  const f = fixture();
  await assert.rejects(
    f.issue({ kind: 'resource', url: 'https://outside.test/not-installed.js' }),
    /not installed JavaScript/,
  );
  await assert.rejects(
    f.issue({ kind: 'resource', url: initial.source }),
    /not installed JavaScript/,
  );
  await assert.rejects(
    f.issue({
      kind: 'blob',
      url: 'blob:https://outside.test/module',
      text: 'bad()',
      contentType: 'text/javascript',
    }),
    /another origin/,
  );
  await assert.rejects(
    f.issue({
      kind: 'blob',
      url: 'blob:https://runtime.test/module',
      text: 'bad()',
      contentType: 'text/html',
    }),
  );
  const issued = await f.issue({
    kind: 'blob',
    url: 'blob:https://runtime.test/module',
    text: 'registerProcessor("local", class {});',
    contentType: 'text/javascript',
  });
  assert.equal(issued.entry, 'blob:https://runtime.test/module');
  assert(issued.graph?.chunks[0].code.includes('registerProcessor'));
  assert.equal(f.reads(), 0);
  assert.equal(f.records.size, 1);
});

test('policy denials identify methods/properties and remain idempotent', () => {
  const tools = createPolicyTools();
  const target = {
    method() {
      return 'native';
    },
  };
  Object.defineProperty(target, 'property', {
    configurable: true,
    get() {
      return 'native';
    },
  });
  tools.method(target, 'method', tools.deny);
  tools.method(target, 'method', tools.deny);
  tools.accessor(target, 'property', { get: tools.deny });
  tools.accessor(target, 'property', { get: tools.deny });
  assert.throws(() => target.method(), {
    name: 'SecurityError',
    message: 'Operation method prohibited by application host',
  });
  assert.throws(() => Reflect.get(target, 'property'), {
    name: 'SecurityError',
    message: 'Operation property prohibited by application host',
  });
});
