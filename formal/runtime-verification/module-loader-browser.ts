import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, firefox, type Page, type BrowserContext } from 'playwright';
import { launch, launchPersistent } from '../../test/browser-profile.ts';

// Evaluate an unmodified dependency in a separate fixture, never in the runtime.
const version = '2.8.4';
const started = new Date().toISOString();
const httpRoot = process.env.PF_MODULE_LOADER_HTTP_ROOT === '1';
const persistent = process.env.PF_MODULE_POLICY_PERSISTENT === '1';
const packageURL = `https://registry.npmjs.org/es-module-shims/-/es-module-shims-${version}.tgz`;
const integrity =
  'ea5srn5L89PWVad6Qle6r2kg+HvvLiL/GHqgNx06eFrkERHkrTFWaqo1w8Sd+XI3Xr0iAG5x3ZQ7mQ/hnQzNpA==';
const directory = new URL(
  '../../.tools/runtime-verification/module-loader/',
  import.meta.url,
);
await mkdir(directory, { recursive: true });
const response = await fetch(packageURL);
assert(response.ok, 'Pinned module-loader package is unavailable');
const archive = Buffer.from(await response.arrayBuffer());
assert.equal(createHash('sha512').update(archive).digest('base64'), integrity);
const archivePath = new URL('package.tgz', directory);
await writeFile(archivePath, archive);
execFileSync('tar', [
  '-xzf',
  archivePath.pathname,
  '--strip-components=1',
  '-C',
  directory.pathname,
]);
const loader = await readFile(new URL('dist/es-module-shims.wasm.js', directory));
const received: Array<{ path: string; time: number }> = [];
const moduleSources: Record<string, string> = {
  '/entry.js': `
import {value as initial} from './dependency.js';
export {counter, increment} from './state.js';
export {readCycle} from './cycle-a.js';
export const value = await Promise.resolve(initial);
export const meta = import.meta.url;
export const resolved = import.meta.resolve('./dependency.js');
export async function dynamic() { const name = './dynamic.js'; return (await import(name)).value; }
export function state() { return import('./state.js'); }
`,
  '/dependency.js': 'export const value = 1;',
  '/state.js': 'export let counter = 0; export function increment() {counter++;}',
  '/cycle-a.js': `import {readB} from './cycle-b.js'; export function readA() {return 'A';} export function readCycle() {return readA()+readB();}`,
  '/cycle-b.js': `import {readA} from './cycle-a.js'; export function readB() {return readA()==='A' ? 'B' : 'unexpected';}`,
  '/dynamic.js': 'export const value = 13;',
};
const probe = `
const reads = [];
const modules = ${JSON.stringify(moduleSources)};
const violations = [];
self.addEventListener('securitypolicyviolation', event => violations.push({
  blockedURI:event.blockedURI, effectiveDirective:event.effectiveDirective,
  disposition:event.disposition
}));
self.esmsInitOptions = {
  shimMode: true,
  nativePassthrough: false,
  fetch: async (url) => {
    reads.push(url);
    const path = new URL(url).pathname;
    if (!Object.hasOwn(modules, path) || url !== new URL(path, fixtureBase).href)
      throw new Error('No admitted resource');
    const response = new Response(modules[path], {
      headers: {'Content-Type': 'text/javascript'}
    });
    Object.defineProperty(response, 'url', {value:url});
    return response;
  }
};
${loader.toString('utf8')}
self.onmessage = async event => {
  let first, local, graph;
  try {
    const entry = new URL('/entry.js', fixtureBase).href;
    const target = new URL('/native-target.js', fixtureBase).href;
    first = event.data === 'native-graph-control' ? await import(entry) : await importShim(entry);
    if (first.value !== 1) throw new Error('Local hook did not supply the module');
    first.increment();
    const state = await first.state();
    if (state.counter !== 1) throw new Error('Module identity or re-export failed');
    state.increment();
    graph = {counter:first.counter, dynamic:await first.dynamic(),
      cycle:first.readCycle(), meta:first.meta, resolved:first.resolved};
    if (event.data === 'native-graph-control') {
      postMessage({first:first.value, value:first.value, reads, graph, violations});
      return;
    }
    const record = importShim._r[entry];
    local = record.b;
    if (typeof local !== 'string' || !local.startsWith('blob:'))
      throw new Error('Shim did not use local delivery');
    if (event.data === 'record-change' || event.data === 'record-change-denied')
      record.b = target;
    const result = event.data === 'literal-import-denied'
      ? await import('/native-target.js')
      : event.data === 'native-control' || event.data === 'computed-import-denied'
      ? await import(target)
      : await importShim(entry);
    postMessage({first:first.value, value:result.value, reads, local, graph, violations});
  } catch (error) {
    await new Promise(resolve => setTimeout(resolve, 100));
    postMessage({first:first?.value, local, reads, graph, violations,
      failure:String(error), errorName:error?.name});
  }
};
postMessage({type:'bootstrap-ready'});`;
let probeBody = '';
const server = http.createServer((request, reply) => {
  const path = request.url || '/';
  received.push({ path, time: Date.now() });
  reply.setHeader('Cache-Control', 'no-store');
  if (
    path === '/probe.js' ||
    path === '/probe.js?local-only' ||
    path === '/native-target.js'
  ) {
    reply.setHeader('Content-Type', 'text/javascript');
    if (path === '/probe.js?local-only')
      reply.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; script-src blob: 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'none'",
      );
    reply.end(path === '/native-target.js' ? 'export const value = 2;' : probeBody);
  } else if (Object.hasOwn(moduleSources, path)) {
    reply.setHeader('Content-Type', 'text/javascript');
    reply.end(moduleSources[path]);
  } else if (path === '/sw.js') {
    reply.setHeader('Content-Type', 'text/javascript');
    reply.end(`
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => event.respondWith(fetch(event.request)));
`);
  } else if (path === '/') {
    reply.setHeader('Content-Type', 'text/html');
    reply.end(
      '<!doctype html><title>Module loader boundary fixture</title><link rel="icon" href="data:,">',
    );
  } else reply.writeHead(404).end();
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
probeBody =
  `const fixtureBase = ${JSON.stringify(origin)};\n` +
  probe.replace(
    "import('/native-target.js')",
    `import(${JSON.stringify(origin + '/native-target.js')})`,
  );
const rows: object[] = [];
let completed = false;
async function quiet(page: Page) {
  let count = received.length;
  let changed = Date.now();
  const deadline = changed + 20000;
  while (Date.now() - changed < 3000) {
    assert(Date.now() < deadline, 'Module fixture setup did not become quiet');
    await page.waitForTimeout(250);
    if (received.length !== count) {
      count = received.length;
      changed = Date.now();
    }
  }
}
try {
  for (const { engine, forcedStaleAgeCheck } of [
    { engine: chromium, forcedStaleAgeCheck: false },
    { engine: firefox, forcedStaleAgeCheck: false },
    { engine: firefox, forcedStaleAgeCheck: true },
  ]) {
    const options = {
      executablePath: engine.executablePath(),
      ...(forcedStaleAgeCheck
        ? {
            firefoxUserPrefs: { 'dom.serviceWorkers.testUpdateOverOneDay': true },
          }
        : {}),
    };
    const browser = persistent ? undefined : await launch(engine, options);
    try {
      for (const mode of [
        'native-graph-control',
        'local-hook',
        'native-control',
        'record-change',
        'local-only',
        'record-change-denied',
        'literal-import-denied',
        'computed-import-denied',
      ]) {
        const profile = persistent
          ? await mkdtemp(join(tmpdir(), 'pf-module-policy-'))
          : undefined;
        let context: BrowserContext | undefined;
        try {
          context = profile
            ? await launchPersistent(engine, profile, options)
            : await browser?.newContext();
          assert(context, 'Native fixture context missing');
          const activeBrowser = context.browser();
          assert(activeBrowser, 'Native fixture browser missing');
          const page = await context.newPage();
          await page.goto(origin);
          await page.evaluate(async () => {
            await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller)
              await new Promise<void>((resolve) =>
                navigator.serviceWorker.addEventListener(
                  'controllerchange',
                  () => resolve(),
                  { once: true },
                ),
              );
          });
          const nativeWorkers: string[] = [];
          page.on('worker', (worker) => nativeWorkers.push(worker.url()));
          await page.evaluate(
            ({ mode, source, httpRoot }) =>
              new Promise<void>((resolve, reject) => {
                const restricted = mode === 'local-only' || mode.endsWith('-denied');
                if (restricted && !httpRoot) {
                  const policy = document.createElement('meta');
                  policy.httpEquiv = 'Content-Security-Policy';
                  policy.content =
                    "default-src 'none'; script-src blob: 'unsafe-eval' 'wasm-unsafe-eval'; worker-src blob:; connect-src 'none'";
                  document.head.append(policy);
                  policy.remove();
                }
                const url = httpRoot
                  ? '/probe.js' + (restricted ? '?local-only' : '')
                  : URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
                const worker = new Worker(url);
                const timer = setTimeout(() => {
                  worker.terminate();
                  reject(new Error('Bootstrap timed out'));
                }, 15000);
                worker.onerror = (event) => {
                  clearTimeout(timer);
                  worker.terminate();
                  reject(new Error(event.message));
                };
                worker.onmessage = (event) => {
                  if (event.data?.type !== 'bootstrap-ready') return;
                  clearTimeout(timer);
                  if (!httpRoot) URL.revokeObjectURL(url);
                  Reflect.set(window, 'fixtureWorker', worker);
                  resolve();
                };
              }),
            { mode, source: probeBody, httpRoot },
          );
          await quiet(page);
          const baseline = received.length;
          const actionStarted = Date.now();
          const result: unknown = await page.evaluate(
            (mode) =>
              new Promise((resolve, reject) => {
                const worker: unknown = Reflect.get(window, 'fixtureWorker');
                if (!(worker instanceof Worker)) {
                  reject(new Error('Prepared fixture worker is missing'));
                  return;
                }
                const timer = setTimeout(() => {
                  worker.terminate();
                  reject(new Error('Loader fixture timed out'));
                }, 15000);
                worker.onerror = (event) => {
                  clearTimeout(timer);
                  worker.terminate();
                  reject(new Error(event.message));
                };
                worker.onmessage = (event) => {
                  clearTimeout(timer);
                  worker.terminate();
                  resolve(event.data);
                };
                worker.postMessage(mode);
              }),
            mode,
          );
          await page.waitForTimeout(3000);
          const traffic = received.slice(baseline);
          rows.push({
            browser: engine.name(),
            version: activeBrowser.version(),
            contextMode: persistent ? 'persistent-default' : 'incognito-like',
            executablePath: engine.executablePath(),
            forcedStaleAgeCheck,
            rootTransport: httpRoot ? 'http' : 'blob',
            nativeWorkers,
            mode,
            actionStarted,
            observationEnded: Date.now(),
            result,
            traffic,
          });
          assert(result && typeof result === 'object');
          assert('first' in result && result.first === 1);
          const nativeGraph = mode === 'native-graph-control';
          if (!nativeGraph)
            assert(
              'local' in result &&
                typeof result.local === 'string' &&
                result.local.startsWith('blob:'),
            );
          assert('graph' in result);
          assert.deepEqual(result.graph, {
            counter: 2,
            dynamic: 13,
            cycle: 'AB',
            meta: origin + '/entry.js',
            resolved: origin + '/dependency.js',
          });
          const denied = mode.endsWith('-denied');
          const local = mode === 'local-hook' || mode === 'local-only';
          if (denied) {
            assert('failure' in result && typeof result.failure === 'string');
            assert('errorName' in result && result.errorName === 'TypeError');
            assert('violations' in result && Array.isArray(result.violations));
            assert(
              result.violations.some(
                (violation: unknown) =>
                  violation &&
                  typeof violation === 'object' &&
                  'blockedURI' in violation &&
                  violation.blockedURI === origin + '/native-target.js' &&
                  'effectiveDirective' in violation &&
                  typeof violation.effectiveDirective === 'string' &&
                  violation.effectiveDirective.startsWith('script-src') &&
                  'disposition' in violation &&
                  violation.disposition === 'enforce',
              ),
            );
          } else {
            assert(!('failure' in result));
            assert('value' in result && result.value === (local || nativeGraph ? 1 : 2));
          }
          assert('reads' in result);
          assert(Array.isArray(result.reads));
          const expectedReads = nativeGraph
            ? []
            : Object.keys(moduleSources)
                .map((path) => origin + path)
                .sort();
          assert.deepEqual([...result.reads].sort(), expectedReads);
          const targetRequests = traffic.filter(
            ({ path }) => path === '/native-target.js',
          );
          assert.equal(targetRequests.length, local || denied || nativeGraph ? 0 : 1);
          if (nativeGraph)
            assert.deepEqual(
              traffic
                .filter(({ path }) => path !== '/sw.js')
                .map(({ path }) => path)
                .sort(),
              Object.keys(moduleSources).sort(),
            );
          assert.equal(nativeWorkers.length, 1);
          assert(nativeWorkers[0].startsWith(httpRoot ? origin : 'blob:' + origin));
          if (!httpRoot && (mode === 'local-only' || denied))
            assert.deepEqual(traffic, [], 'Local-only operation emitted HTTP');
          else if (forcedStaleAgeCheck && !local && !denied)
            assert(
              traffic.some(({ path }) => path === '/sw.js'),
              'Native forced-age update control missing',
            );
          console.log(
            engine.name(),
            forcedStaleAgeCheck ? 'forced-age' : 'fresh',
            mode,
            'PASS',
          );
        } finally {
          try {
            await context?.close();
          } finally {
            if (profile) await rm(profile, { recursive: true, force: true });
          }
        }
      }
    } finally {
      await browser?.close();
    }
  }
  completed = true;
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await writeFile(
    new URL(
      persistent
        ? './module-loader-browser-persistent.json'
        : './module-loader-browser.json',
      import.meta.url,
    ),
    JSON.stringify(
      {
        completed,
        started,
        finished: new Date().toISOString(),
        scope:
          'Dependency boundary experiment only; not runtime integration or a confinement proof.',
        rootTransport: httpRoot ? 'http' : 'blob',
        contextMode: persistent ? 'persistent-default' : 'incognito-like',
        executableSelection:
          'Explicit bundled full browser executable; Playwright background-service defaults remain in effect.',
        packageURL,
        version,
        integrity: 'sha512-' + integrity,
        loaderSHA256: createHash('sha256').update(loader).digest('hex'),
        runnerSHA256: createHash('sha256')
          .update(await readFile(new URL(import.meta.url)))
          .digest('hex'),
        launcherSHA256: createHash('sha256')
          .update(
            await readFile(new URL('../../test/browser-profile.ts', import.meta.url)),
          )
          .digest('hex'),
        packageLockSHA256: createHash('sha256')
          .update(await readFile(new URL('../../package-lock.json', import.meta.url)))
          .digest('hex'),
        rows,
      },
      null,
      2,
    ) + '\n',
  );
}
