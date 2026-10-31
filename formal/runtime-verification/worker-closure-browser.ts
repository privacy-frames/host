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
const anchor = 'return contexts.closeChild(client.id, app.id, child);';
assert.equal(source.split(anchor).length, 2);
const faultySource = source.replace(
  anchor,
  `const bound = await contexts.resourceCapability(child, '');
  return contexts.closeChild(bound?.identity.parent || client.id, app.id, child);`,
);
let changed = 0;
const fault = await build({
  entryPoints: ['src/runtime/worker.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  define: { __BUILD_ID__: '"worker-closure-receiver-control"' },
  plugins: [
    await trustedPolicyPlugin(process.cwd()),
    {
      name: 'test-only-parent-selection-fault',
      setup(builder) {
        builder.onLoad({ filter: /[/\\]contexts[/\\]worker-control\.ts$/ }, () => {
          changed++;
          return { contents: faultySource, loader: 'ts' };
        });
      },
    },
  ],
});
assert.equal(changed, 1);
const faultyWorker = fault.outputFiles[0].contents;
const publisher = http.createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/worker.js' || request.url === '/main.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(
      request.url === '/worker.js'
        ? 'self.onmessage=()=>postMessage("ready");'
        : 'globalThis.workerFixtureReady=true;',
    );
  } else if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><script src="main.js"></script><p>Closure fixture</p>');
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
  for (const mutant of [false, true]) {
    const host = await servers({
      receiver: false,
      ...(mutant ? { runtimeFiles: new Map([['/sw.js', faultyWorker]]) } : {}),
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
            if (mutant) {
              try {
                await checkWorkerClosure(app, context, host.traffic);
                throw new Error('The parent-selection fault was not detected');
              } catch (error) {
                assert(error instanceof AssertionError);
                assert.deepEqual(error.actual, { ok: true, value: { closed: true } });
                assert.deepEqual(error.expected, { ok: true, value: { closed: false } });
                outcome = { detectedWrongOwnerClosure: true, reply: error.actual };
              }
            } else outcome = await checkWorkerClosure(app, context, host.traffic);
            rows.push({
              browser: engine.name(),
              version: browser.version(),
              forcedStaleCheck: stale,
              mutant,
              outcome,
            });
            console.log(
              engine.name() + (stale ? ' forced-stale' : ''),
              mutant ? 'parent-selection fault detected' : 'native closure passed',
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
  const hash = (value: Uint8Array | string) =>
    createHash('sha256').update(value).digest('hex');
  try {
    await writeFile(
      receipt,
      JSON.stringify(
        {
          scope:
            'Built controller, actual browser clients and native IndexedDB. Window-owned worker closure uses messages and emits no HTTP in the one-second post-commit observation. A test-only parent-selection fault must be detected by the same native wrong-owner assertion. This does not verify readiness, nested-worker transport or complete confinement.',
          completed,
          failure,
          provenance,
          runnerSHA256: hash(await readFile(import.meta.filename)),
          helperSHA256: hash(await readFile('test/worker-closure.ts')),
          controllerSourceSHA256: hash(source),
          faultySourceSHA256: hash(faultySource),
          faultyWorkerSHA256: hash(faultyWorker),
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
