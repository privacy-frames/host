import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { build } from './build.ts';
import { launch } from './browser-profile.ts';
import { testProvenance } from './provenance.ts';

interface ConsumptionResult {
  scenario: string;
  consumedBeforeMutation: boolean;
  validations: number;
  accepted: boolean;
  body: string;
}
declare global {
  interface Window {
    runConsumptionRace(): Promise<ConsumptionResult[]>;
    runParentConsumptionRace(): Promise<ConsumptionResult[]>;
  }
}

// Run independently: node test/document-consumption-race.ts
// Receipt: results/contexts/document-consumption-race.json
// This trusted fixture calls the actual controller and real IndexedDB stores.
// Client identities and ContextStorage are stand-ins: this does not
// test browser authentication, CacheStorage concurrency or physical publication.
const compiled = await build({
  stdin: {
    resolveDir: process.cwd(),
    sourcefile: 'document-consumption-race-fixture.js',
    contents: `
import { createDocumentController } from './src/runtime/contexts/document-controller.ts';
import { memoryContextStorage } from './test/context-storage.ts';
import { DocumentIntentStore } from './src/runtime/contexts/document-intents.ts';
import { ContextRegistry, CONTEXT_POLICY_VERSION } from './src/runtime/contexts/model.ts';
import { getApp, putApp } from './src/runtime/storage.ts';
import { applicationURL } from './src/shared/runtime-url.ts';
const check = (value, message) => { if (!value) throw new Error(message); };
function gate() {
  let release, entered;
  const blocked = new Promise(resolve => { release = resolve; });
  const waiting = new Promise(resolve => { entered = resolve; });
  return { release, entered, blocked, waiting };
}
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Race fixture timed out')), 5000); }),
    ]);
  } finally { clearTimeout(timer); }
}
async function runRace(parentMode) {
  const id = 'consumption-' + '1'.repeat(64);
  await putApp({
    id, manifest: { id: 'consumption', name: 'Consumption', entry: 'index.html' },
    source: 'https://publisher.invalid/', resources: [], size: 0,
    installedAt: new Date().toISOString(), format: 'offline-resources-v1',
    capture: { additionalResources: [], unavailableResources: [] },
  });
  const app = await getApp(id);
  check(app, 'Stored installation missing');
  const base = new URL('/runtime/', location.origin);
  const results = [];
  const scenarios = ['unchanged', 'closed', 'owner-changed', 'generation-changed'];
  if (parentMode) scenarios.push('parent-closed', 'parent-owner-changed', 'parent-generation-changed', 'intent-closed');
  for (const scenario of scenarios) {
    const records = new Map();
    const closures = new Set();
    const storage = memoryContextStorage(records, closures);
    const contexts = new ContextRegistry(storage);
    const otherController = new ContextRegistry(storage);
    const intents = new DocumentIntentStore({ databaseName: 'consumption-race-' + parentMode + '-' + scenario });
    const input = { kind: 'html', text: '<p>Admitted private document</p>', sourceURL: app.source, aliases: [] };
    const intent = await intents.issue({ application: id, installationGeneration: app.generation, parentClient: 'parent' }, input);
    const target = new URL('__contexts/' + intent.id + '/document.html', applicationURL(app, base));
    check(await intents.bind(intent, 'child', app.generation), 'Intent binding failed');
    await contexts.bind('child', {
      policyVersion: CONTEXT_POLICY_VERSION, id: intent.id, application: id,
      installationGeneration: app.generation, parent: 'parent', kind: 'window',
      state: 'preparing', url: target.href,
    });
    const parent = { id: 'parent', url: applicationURL(app, base).href, type: 'window' };
    if (parentMode) await contexts.bind('parent', {
      policyVersion: CONTEXT_POLICY_VERSION, id: 'parent-context', application: id,
      installationGeneration: app.generation, parent: null, kind: 'window',
      state: 'running', url: parent.url,
    });
    let validations = 0;
    const validate = contexts.isCurrent.bind(contexts);
    contexts.isCurrent = (...args) => { validations++; return validate(...args); };
    const child = { id: 'child', url: target.href, type: 'window' };
    const controller = createDocumentController({
      base, contexts, intents,
      async client(clientId) { return clientId === 'child' ? child : parentMode && clientId === 'parent' ? parent : undefined; },
      async application() { return id; }, async bootstrap() { return undefined; },
    });
    const paused = gate();
    const consume = intents.consume.bind(intents);
    intents.consume = async (...args) => {
      const content = await consume(...args);
      check(content, 'Actual consumption did not return content');
      paused.entered();
      await paused.blocked;
      return content;
    };
    const pending = controller.request(parentMode ? 'parent' : 'child', parentMode ? 'child-content' : 'content', JSON.stringify({ id: intent.id, parentToken: intent.parentToken }))
      .then(value => ({ accepted: true, body: JSON.stringify(value) }),
        () => ({ accepted: false, body: '' }));
    try {
      await bounded(paused.waiting);
      const consumedBeforeMutation = (await intents.inspect(intent.id)).state === 'consumed';
      check(consumedBeforeMutation, 'Pause did not follow persisted consumption');
      if (scenario === 'closed')
        check(await otherController.closeChild('parent', id, intent.id), 'Concurrent close failed');
      if (scenario === 'owner-changed' || scenario === 'generation-changed') {
        const current = records.get('child');
        records.set('child', { ...current, ...(scenario === 'owner-changed'
          ? { parent: 'different-parent' } : { installationGeneration: 'different-generation' }) });
      }
      if (scenario.startsWith('parent-')) {
        const current = records.get('parent');
        records.set('parent', { ...current, ...(scenario === 'parent-closed'
          ? { state: 'closed' } : scenario === 'parent-owner-changed'
          ? { parent: 'different-parent' } : { installationGeneration: 'different-generation' }) });
      }
      if (scenario === 'intent-closed')
        check(await intents.close(intent.id, intent, intent.parentToken), 'Concurrent intent closure failed');
      paused.release();
      const response = await bounded(pending);
      check(response, 'Controller did not handle content request');
      results.push({ scenario, consumedBeforeMutation, validations,
        accepted: response.accepted, body: response.body });
    } finally {
      paused.release();
      await bounded(Promise.allSettled([pending]));
      intents.consume = consume;
    }
  }
  return results;
}
window.runParentConsumptionRace = () => runRace(true);
window.runConsumptionRace = async () => {
  return runRace(false);
};`,
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
});
const script = compiled.outputFiles[0].contents;
const server = http.createServer((request, response) => {
  response.setHeader(
    'Content-Type',
    request.url === '/fixture.js' ? 'text/javascript' : 'text/html',
  );
  response.end(
    request.url === '/fixture.js'
      ? script
      : '<!doctype html><title>Consumption race</title><script src="/fixture.js"></script>',
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const evidence = {
  provenance: await testProvenance(import.meta.url),
  fixtureSHA256: createHash('sha256').update(script).digest('hex'),
  scope:
    'Actual document controller post-consumption revalidation with real IndexedDB; simulated client identities and in-memory context storage',
  browsers: [] as {
    name: string;
    version: string;
    results: ConsumptionResult[];
    parentResults: ConsumptionResult[];
  }[],
};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${address.port}/`);
      const results = await page.evaluate(() => window.runConsumptionRace());
      assert.equal(results.length, 4);
      for (const result of results) {
        assert.equal(result.consumedBeforeMutation, true);
        assert.equal(result.validations, 1);
        if (result.scenario === 'unchanged') {
          assert.equal(result.accepted, true);
          assert.equal(JSON.parse(result.body).text, '<p>Admitted private document</p>');
        } else {
          assert.equal(result.accepted, false);
          assert.equal(result.body, '');
        }
      }
      const parentResults = await page.evaluate(() => window.runParentConsumptionRace());
      assert.equal(parentResults.length, 8);
      for (const result of parentResults) {
        assert.equal(result.consumedBeforeMutation, true);
        assert(result.validations >= 2);
        assert.equal(result.accepted, result.scenario === 'unchanged');
        if (result.accepted)
          assert.equal(JSON.parse(result.body).text, '<p>Admitted private document</p>');
        else assert.equal(result.body, '');
      }
      evidence.browsers.push({
        name,
        version: browser.version(),
        results,
        parentResults,
      });
      console.log(
        `${name}: unchanged content succeeds; post-consume close/owner/generation changes refused`,
      );
    } finally {
      await browser.close();
    }
  }
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    'results/contexts/document-consumption-race.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
