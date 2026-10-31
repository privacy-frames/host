import assert, { AssertionError } from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { trustedPolicyPlugin } from '../../scripts/trusted-policy.ts';
import { chromium, firefox } from 'playwright';
import { launch } from '../../test/browser-profile.ts';
import { servers } from '../../test/server.ts';
import { testProvenance } from '../../test/provenance.ts';
import { provideResourceList } from '../../test/resource-list-input.ts';
import {
  installWorkerClosureProbe,
  checkWorkerClosure,
} from '../../test/worker-closure.ts';

const receipt = new URL('./worker-closure-browser.json', import.meta.url);
await rm(receipt, { force: true });
const source = await readFile('src/runtime/contexts/worker-control.ts', 'utf8');
const hash = (value: Uint8Array | string) =>
  createHash('sha256').update(value).digest('hex');
const factorySource = await readFile('src/runtime/contexts/worker-factory.ts', 'utf8');
const faults = [
  {
    mode: 'owner',
    entry: 'src/runtime/worker.ts',
    file: 'worker-control.ts',
    source,
    anchor: 'return contexts.closeChild(client.id, app.id, child);',
    replacement: `const bound = await contexts.resourceCapability(child, '');
  return contexts.closeChild(bound?.identity.parent || client.id, app.id, child);`,
    route: '/sw.js',
  },
  {
    mode: 'delegation',
    entry: 'src/runtime/worker.ts',
    file: 'worker-control.ts',
    source,
    anchor: 'bound.identity.parent !== selected.client.id ||',
    replacement: '',
    route: '/sw.js',
  },
];
const variants = new Map<string, { route: string; body: Uint8Array }>();
const faultInputs: object[] = [];
for (const fault of faults) {
  assert.equal(fault.source.split(fault.anchor).length, 2);
  const faultySource = fault.source.replace(fault.anchor, fault.replacement);
  let changed = 0;
  const result = await build({
    entryPoints: [fault.entry],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    define: { __BUILD_ID__: '"worker-control-receiver-control"' },
    plugins: [
      await trustedPolicyPlugin(process.cwd()),
      {
        name: 'test-only-worker-control-fault',
        setup(builder) {
          builder.onLoad(
            { filter: /[/\\]contexts[/\\]worker-(control|factory)\.ts$/ },
            ({ path }) => {
              if (!path.endsWith('/' + fault.file)) return;
              changed++;
              return { contents: faultySource, loader: 'ts' };
            },
          );
        },
      },
    ],
  });
  assert.equal(changed, 1);
  const body = result.outputFiles[0].contents;
  variants.set(fault.mode, { route: fault.route, body });
  faultInputs.push({
    mode: fault.mode,
    sourceSHA256: hash(faultySource),
    bundleSHA256: hash(body),
  });
}
const publisher = http.createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/worker.js' || request.url === '/main.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(
      request.url === '/worker.js'
        ? 'self.onmessage=()=>postMessage("ready");'
        : `const worker=new Worker('worker.js');
await new Promise((resolve,reject)=>{worker.onmessage=resolve;worker.onerror=reject;worker.postMessage('startup');});
worker.terminate();globalThis.workerFixtureReady=true;`,
    );
  } else if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      '<!doctype html><script type="module" src="main.js"></script><p>Closure fixture</p>',
    );
  } else response.writeHead(404).end();
});
await new Promise<void>((resolve) => publisher.listen(0, '127.0.0.1', resolve));
const address = publisher.address();
assert(address && typeof address !== 'string');
const origin = 'http://127.0.0.1:' + address.port;
const provenance = await testProvenance(import.meta.url);
const rows: object[] = [];
let completed = false;
let failure: string | undefined;
try {
  for (const mode of ['normal', 'owner', 'delegation']) {
    const variant = variants.get(mode);
    const host = await servers({
      receiver: false,
      ...(variant ? { runtimeFiles: new Map([[variant.route, variant.body]]) } : {}),
    });
    try {
      for (const profile of [
        { engine: chromium, stale: false },
        { engine: firefox, stale: false },
        { engine: firefox, stale: true },
      ]) {
        const { engine, stale } = profile;
        const browser = await launch(
          engine,
          stale
            ? { firefoxUserPrefs: { 'dom.serviceWorkers.testUpdateOverOneDay': true } }
            : {},
        );
        try {
          const context = await browser.newContext();
          try {
            await installWorkerClosureProbe(context);
            const manager = await context.newPage();
            await manager.goto('http://127.0.0.1:4210/privacy-frames/');
            await manager.getByText('Ready to install.', { exact: true }).waitFor();
            await manager.locator('#app-url').fill(origin + '/');
            await provideResourceList(manager, [origin + '/worker.js']);
            await manager.locator('#install button').click();
            const installed = manager.locator('[data-app]').first();
            await installed.waitFor();
            const opened = context.waitForEvent('page');
            await installed.click();
            const app = await opened;
            await app.waitForFunction(() =>
              Reflect.get(globalThis, 'workerFixtureReady'),
            );
            let outcome: object;
            if (mode !== 'normal') {
              try {
                await checkWorkerClosure(app, context, host.traffic);
                throw new Error('The worker-control fault was not detected');
              } catch (error) {
                assert(error instanceof AssertionError);
                if (mode === 'owner') {
                  assert.deepEqual(error.actual, { ok: true, value: { closed: true } });
                  assert.deepEqual(error.expected, {
                    ok: true,
                    value: { closed: false },
                  });
                } else {
                  assert.equal(error.actual, true);
                  assert.equal(error.expected, false);
                }
                outcome = { detectedAuthorizationFault: mode, actual: error.actual };
              }
            } else outcome = await checkWorkerClosure(app, context, host.traffic);
            rows.push({
              browser: engine.name(),
              version: browser.version(),
              forcedStaleCheck: stale,
              mode,
              outcome,
            });
            console.log(
              engine.name() + (stale ? ' forced-stale' : ''),
              mode === 'normal'
                ? 'native worker control passed'
                : mode + ' fault detected',
            );
          } finally {
            await context.close();
          }
        } finally {
          await browser.close();
        }
      }
    } finally {
      await host.close();
    }
  }
  const after = await testProvenance(import.meta.url);
  assert.equal(after.sourceSHA256, provenance.sourceSHA256);
  assert.deepEqual(after.artifacts, provenance.artifacts);
  completed = true;
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  try {
    await writeFile(
      receipt,
      JSON.stringify(
        {
          scope:
            'Built controller, actual browser clients and native IndexedDB. Window-owned worker closure uses messages and emits no HTTP in the one-second post-commit observation. Delegated verification follows actual native bindings. Test-only parent-selection and delegation-check faults must be detected by the same fixture. This is not complete confinement or an arbitrary-schedule proof.',
          completed,
          failure,
          provenance,
          runnerSHA256: hash(await readFile(import.meta.filename)),
          helperSHA256: hash(await readFile('test/worker-closure.ts')),
          controllerSourceSHA256: hash(source),
          factorySourceSHA256: hash(factorySource),
          faults: faultInputs,
          rows,
          completedAt: completed ? new Date().toISOString() : null,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    publisher.closeAllConnections();
    await new Promise<void>((resolve) => publisher.close(() => resolve()));
  }
}
