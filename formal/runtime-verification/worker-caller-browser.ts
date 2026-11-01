import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { build, type Plugin } from 'esbuild';
import { chromium, firefox } from 'playwright';
import { trustedPolicyPlugin } from '../../scripts/trusted-policy.ts';
import { launch } from '../../test/browser-profile.ts';
import { provideResourceList } from '../../test/resource-list-input.ts';
import { servers } from '../../test/server.ts';
import { testProvenance } from '../../test/provenance.ts';

const hash = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex');
const factoryPath = 'src/runtime/contexts/worker-factory.ts';
const factory = await readFile(factoryPath, 'utf8');
const directive = '`"use strict";\\n(() => {';
assert.equal(factory.split(directive).length, 2);
let mutations = 0;
const omission: Plugin = {
  name: 'test-only-omit-local-worker-strict-directive',
  setup(builder) {
    builder.onLoad(
      { filter: /[/\\]contexts[/\\]worker-factory\.ts$/ },
      async ({ path }) => {
        assert.equal(await readFile(path, 'utf8'), factory);
        mutations++;
        return { contents: factory.replace(directive, '`(() => {'), loader: 'ts' };
      },
    );
  },
};
async function guard(fault: boolean) {
  const result = await build({
    entryPoints: ['src/runtime/guard.ts'],
    bundle: true,
    write: false,
    target: 'es2022',
    format: 'iife',
    banner: { js: '"use strict";' },
    plugins: [
      await trustedPolicyPlugin(process.cwd(), fault ? [omission] : []),
      ...(fault ? [omission] : []),
    ],
  });
  return result.outputFiles[0].contents;
}
const normal = await guard(false);
const altered = await guard(true);
assert.equal(mutations, 2);
assert(Buffer.from(normal).equals(await readFile('dist-runtime/guard.js')));
assert.notEqual(hash(normal), hash(altered));

// Direct sloppy calls calibrate legacy caller inspection. Native conversions
// may independently hide callers, so omission need not reveal a function.
const applicationWorker = `
self.onmessage = () => {
  try {
    const coercion = Function('globalThis.lastCaller = arguments.callee.caller; return "child.js";');
    const getter = Function('globalThis.lastGetterCaller = arguments.callee.caller; return "classic";');
    const source = { toString: coercion };
    const options = Object.defineProperty({}, 'type', { get: getter });
    Function('callback', 'return callback();')(coercion);
    const coercionControl = typeof lastCaller === 'function';
    Function('callback', 'return callback();')(getter);
    const getterControl = typeof lastGetterCaller === 'function';
    lastCaller = undefined; lastGetterCaller = undefined;
    const child = new Worker(source, options);
    child.terminate();
    postMessage({ coercionControl, getterControl,
      coercionCaller: typeof lastCaller === 'function',
      getterCaller: typeof lastGetterCaller === 'function' });
  } catch (error) { postMessage({ error: String(error) }); }
};`;
const assets: Record<string, [string, string]> = {
  '/': [
    'text/html',
    '<!doctype html><output id="result"></output><script src="main.js"></script>',
  ],
  '/main.js': [
    'text/javascript',
    `const worker = new Worker('worker.js');
worker.onmessage = event => { document.querySelector('#result').textContent = JSON.stringify(event.data); worker.terminate(); };
worker.onerror = event => { document.querySelector('#result').textContent = JSON.stringify({error:event.message}); };
worker.postMessage('run');`,
  ],
  '/worker.js': ['text/javascript', applicationWorker],
  '/child.js': ['text/javascript', 'self.onmessage = () => {};'],
};
const publisher = http.createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  const asset = assets[request.url || '/'];
  if (!asset) return void response.writeHead(404).end();
  response.setHeader('Content-Type', asset[0]);
  response.end(asset[1]);
});
await new Promise<void>((resolve) => publisher.listen(0, '127.0.0.1', resolve));
const address = publisher.address();
assert(address && typeof address !== 'string');
const origin = 'http://127.0.0.1:' + address.port;
const runtimeFiles = new Map<string, Uint8Array>();
const host = await servers({ receiver: false, runtimeFiles });
const provenance = await testProvenance(import.meta.url);
const rows: object[] = [];
let completed = false;
let failure: string | undefined;
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    for (const fault of [false, true]) {
      runtimeFiles.set('/guard.js', fault ? altered : normal);
      const browser = await launch(engine);
      try {
        const context = await browser.newContext();
        const manager = await context.newPage();
        await manager.goto('http://127.0.0.1:4210/privacy-frames/');
        await manager.getByText('Ready to install.', { exact: true }).waitFor();
        await manager.locator('#app-url').fill(origin + '/');
        await provideResourceList(
          manager,
          ['/worker.js', '/child.js'].map((path) => origin + path),
        );
        await manager.locator('#install button').click();
        const installed = manager.locator('[data-app]').first();
        await installed.waitFor();
        const opened = context.waitForEvent('page');
        await installed.click();
        const app = await opened;
        await app.waitForFunction(() =>
          Boolean(document.querySelector('#result')?.textContent),
        );
        const result: unknown = JSON.parse(await app.locator('#result').innerText());
        rows.push({
          name,
          version: browser.version(),
          fault,
          result,
          guardSHA256: hash(fault ? altered : normal),
        });
        assert(result && typeof result === 'object');
        assert(
          'coercionControl' in result && result.coercionControl === true,
          JSON.stringify(result),
        );
        assert('getterControl' in result && result.getterControl === true);
        assert('coercionCaller' in result && 'getterCaller' in result);
        if (!fault) {
          assert.equal(result.coercionCaller, false);
          assert.equal(result.getterCaller, false);
        } else if (name === 'firefox') {
          assert(
            result.coercionCaller === true || result.getterCaller === true,
            'Firefox strict-mode omission control did not expose a caller',
          );
        }
        console.log(name, fault ? 'omission comparison' : 'normal boundary', result);
        await context.close();
      } finally {
        await browser.close();
      }
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
  await writeFile(
    'formal/runtime-verification/worker-caller-browser.json',
    JSON.stringify(
      {
        scope:
          'Direct sloppy callback controls and actual nested Worker argument conversion. An omission with no observed caller is not a successful mitigation fault control. This does not establish complete closure ownership or confinement.',
        completed,
        failure,
        provenance,
        factorySHA256: hash(factory),
        rows,
      },
      null,
      2,
    ) + '\n',
  );
  await host.close();
  publisher.closeAllConnections();
  await new Promise<void>((resolve) => publisher.close(() => resolve()));
}
