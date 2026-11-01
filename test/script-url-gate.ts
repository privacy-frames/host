import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { build } from 'esbuild';
import { launch } from './browser-profile.ts';
import { testProvenance } from './provenance.ts';
import { SCRIPT_URL_CSP } from '../src/shared/script-url-policy.ts';

async function bundle(contents: string) {
  const result = await build({
    stdin: { contents, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
  });
  return result.outputFiles[0].text;
}

const worker = await bundle(`
import {prepareScriptURLs} from './src/runtime/enforcement/script-urls.ts';
const scriptURL = prepareScriptURLs();
const source = URL.createObjectURL(new Blob(['globalThis.importMarker = 29'], {
  type: 'text/javascript',
}));
let refused = false;
try { importScripts(source); } catch { refused = true; }
const before = globalThis.importMarker;
importScripts(scriptURL(source));
URL.revokeObjectURL(source);
postMessage({refused, before, after: globalThis.importMarker});
`);

const bootstrap = await bundle(`
import {prepareScriptURLs} from './src/runtime/enforcement/script-urls.ts';
import {SCRIPT_URL_POLICY_NAME} from './src/shared/script-url-policy.ts';
const NativeWorker = Worker;
const construct = Reflect.construct;
const apply = Reflect.apply;
const scriptSrc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src').set;
const nativeCreatePolicy = Object.getPrototypeOf(trustedTypes).createPolicy;
const mode = location.pathname.slice(1);
try {
  if (mode === 'missing-api')
    Object.defineProperty(globalThis, 'trustedTypes', {value: undefined});
  if (mode === 'occupied-policy')
    trustedTypes.createPolicy(SCRIPT_URL_POLICY_NAME, {createScriptURL: value => value});
  const scriptURL = prepareScriptURLs();
  globalThis.exercise = async () => {
    let duplicateRefused = false, otherPolicyRefused = false;
    try {trustedTypes.createPolicy(SCRIPT_URL_POLICY_NAME, {createScriptURL: value => value});}
    catch {duplicateRefused = true;}
    try {trustedTypes.createPolicy('application-policy', {createScriptURL: value => value});}
    catch {otherPolicyRefused = true;}
    const applicationPolicy = trustedTypes.createPolicy('application-html', {
      createHTML: (value, suffix) => '<b>' + value + suffix + '</b>',
      createScript: value => value,
    });
    const htmlValue = applicationPolicy.createHTML('ordinary', '-policy');
    const scriptValue = applicationPolicy.createScript('2 + 1');
    let facadeURLRefused = false, nativeIssuerRefused = false, duplicateAppRefused = false;
    try {applicationPolicy.createScriptURL('/marker.js');} catch {facadeURLRefused = true;}
    try {apply(nativeCreatePolicy, trustedTypes, ['unreserved-native-policy', {createScriptURL: value => value}]);}
    catch {nativeIssuerRefused = true;}
    try {trustedTypes.createPolicy('application-html', {createHTML: value => value});}
    catch {duplicateAppRefused = true;}
    const application = {
      name: applicationPolicy.name,
      nativeHTML: trustedTypes.isHTML(htmlValue),
      nativeScript: trustedTypes.isScript(scriptValue),
      html: String(htmlValue),
      evaluation: eval(scriptValue),
      facadeURLRefused, nativeIssuerRefused, duplicateAppRefused,
    };
    let mintCalls = 0, coercions = 0;
    Object.defineProperty(TrustedTypePolicy.prototype, 'createScriptURL', {
      configurable: true,
      value() {mintCalls++; throw Error('Replaced mint method');},
    });
    for (const key of ['toString', 'valueOf', Symbol.toPrimitive])
      Object.defineProperty(TrustedScriptURL.prototype, key, {
        configurable: true,
        value() {coercions++; return '/unadmitted.js';},
      });
    const source = URL.createObjectURL(new Blob([${JSON.stringify(worker)}], {
      type: 'text/javascript',
    }));
    let rawWorkerRefused = false;
    try {construct(NativeWorker, [source]);} catch {rawWorkerRefused = true;}
    const reply = await new Promise((resolve, reject) => {
      const handle = construct(NativeWorker, [scriptURL(source)]);
      const timer = setTimeout(() => {handle.terminate(); reject(Error('Worker timed out'));}, 5000);
      handle.onmessage = event => {
        clearTimeout(timer); handle.terminate(); resolve(event.data);
      };
      handle.onerror = event => {
        event.preventDefault(); clearTimeout(timer); handle.terminate();
        reject(Error('Worker failed: ' + event.message));
      };
    });
    URL.revokeObjectURL(source);
    const script = document.createElement('script');
    let rawScriptRefused = false;
    try {apply(scriptSrc, script, ['/marker.js']);} catch {rawScriptRefused = true;}
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = () => reject(Error('Marker script failed'));
      apply(scriptSrc, script, [scriptURL(new URL('/marker.js', location.href).href)]);
      document.head.appendChild(script);
    });
    const div = document.createElement('div');
    div.innerHTML = '<b>ordinary</b>';
    return {
      duplicateRefused, otherPolicyRefused, rawWorkerRefused, rawScriptRefused, application,
      mintCalls, coercions, worker: reply, marker: globalThis.scriptMarker,
      sourceIsString: typeof script.src === 'string',
      html: div.textContent, evaluation: eval('1 + 1'),
    };
  };
  document.documentElement.dataset.setup = 'prepared';
} catch(error) {
  document.documentElement.dataset.setup = 'refused';
  document.documentElement.dataset.failure = String(error);
}
`);

const server = http.createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/bootstrap.js' || request.url === '/marker.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(
      request.url === '/bootstrap.js' ? bootstrap : 'globalThis.scriptMarker = 17;',
    );
    return;
  }
  response.setHeader('Content-Type', 'text/html');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self' blob: 'unsafe-eval'; worker-src blob:; " +
      (request.url === '/missing-enforcement' ? '' : SCRIPT_URL_CSP),
  );
  response.end('<!doctype html><script src="/bootstrap.js"></script>');
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const origin = 'http://127.0.0.1:' + address.port;
const rows: object[] = [];
let failure: string | undefined;
const results = {
  scope:
    'Native tests of the production script-URL gate, including actual missing-enforcement setup refusal. This fixture deliberately exposes a test exerciser, omits the other runtime adapters and permits owned marker HTTP loads; it does not establish complete confinement.',
  provenance: await testProvenance(import.meta.url),
  completed: false,
  rows,
};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      for (const mode of [
        'normal',
        'missing-enforcement',
        'missing-api',
        'occupied-policy',
      ]) {
        const context = await browser.newContext();
        try {
          const page = await context.newPage();
          await page.goto(origin + '/' + mode);
          await page.waitForFunction(() =>
            Boolean(document.documentElement.dataset.setup),
          );
          const status = await page.evaluate(() => ({
            setup: document.documentElement.dataset.setup,
            failure: document.documentElement.dataset.failure,
            exercise: typeof Reflect.get(globalThis, 'exercise'),
          }));
          if (mode === 'normal') {
            assert.equal(
              status.setup,
              'prepared',
              status.failure || 'Setup did not complete',
            );
            const value: unknown = await page.evaluate(async () => {
              const exercise: unknown = Reflect.get(globalThis, 'exercise');
              if (typeof exercise !== 'function') throw new Error('Exerciser missing');
              return await Reflect.apply(exercise, undefined, []);
            });
            assert.deepEqual(value, {
              duplicateRefused: true,
              otherPolicyRefused: true,
              rawWorkerRefused: true,
              rawScriptRefused: true,
              application: {
                name: 'application-html',
                nativeHTML: true,
                nativeScript: true,
                html: '<b>ordinary-policy</b>',
                evaluation: 3,
                facadeURLRefused: true,
                nativeIssuerRefused: true,
                duplicateAppRefused: true,
              },
              mintCalls: 0,
              coercions: 0,
              worker: { refused: true, before: undefined, after: 29 },
              marker: 17,
              sourceIsString: true,
              html: 'ordinary',
              evaluation: 2,
            });
            results.rows.push({ browser: name, version: browser.version(), mode, value });
          } else {
            assert.equal(status.setup, 'refused');
            assert.equal(status.exercise, 'undefined');
            results.rows.push({
              browser: name,
              version: browser.version(),
              mode,
              status,
            });
          }
          console.log(name, mode, status.setup);
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
  assert.equal(results.rows.length, 8);
  results.completed = true;
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    'results/contexts/script-url-gate.json',
    JSON.stringify({ ...results, failure }, null, 2) + '\n',
  );
}
