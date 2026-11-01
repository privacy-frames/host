import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';
import { launch } from '../../test/browser-profile.ts';
import { testProvenance } from '../../test/provenance.ts';
import { trustedPolicyPlugin } from '../../scripts/trusted-policy.ts';
import { SCRIPT_URL_CSP } from '../../src/shared/script-url-policy.ts';

const started = new Date().toISOString();
const before = await testProvenance(import.meta.url);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const runnerBefore = digest(await readFile(new URL(import.meta.url), 'utf8'));
const graph: Record<string, string> = {
  '/entry.js': `import {counter,increment,cyclic} from './state.js';
export {counter,increment,cyclic}; export const meta=import.meta.url;
export async function dynamic(){return (await import('./dependency.js')).answer;}
await Promise.resolve(); export const ready=1;`,
  '/state.js': `import {read} from './cycle.js'; export let counter=0;
export function increment(){counter++;} export function cyclic(){return read();}`,
  '/cycle.js': `import {counter} from './state.js'; export function read(){return counter;}`,
  '/dependency.js': 'export const answer=13;',
};
const bootstrap = (
  await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
import {createWindowScripts} from './src/runtime/contexts/window-scripts.ts';
import {prepareRuntimeIntrinsics} from './src/runtime/intrinsics.ts';
import {prepareScriptURLs} from './src/runtime/enforcement/script-urls.ts';
const graph=${JSON.stringify(graph)};
const scope=location.origin;
const mode=new URL(location.href).searchParams.get('mode');
const violations=[];
window.fixturePolicyViolations=()=>violations.slice();
addEventListener('securitypolicyviolation',event=>violations.push({
  blockedURI:event.blockedURI,effectiveDirective:event.effectiveDirective
}));
prepareRuntimeIntrinsics();
prepareScriptURLs();
const nativeImport=new Function('url','return import(url)');
const reads=[];
const resources={
  mapURL:input=>String(input),
  sourceURL:input=>input,
  isInstalledURL:input=>typeof input==='string' &&
    input.startsWith(scope+'/') && Object.hasOwn(graph,new URL(input).pathname)
};
const modules=createWindowScripts(resources,async input=>{
  if(typeof input!=='string' || !resources.isInstalledURL(input))
    throw new TypeError('No fixture resource');
  reads.push(input);
  return new Response(graph[new URL(input).pathname],{
    headers:{'Content-Type':'text/javascript'}
  });
},'fixture-nonce');
Object.defineProperty(window,'privacyHost',{
  value:Object.freeze({importModule:modules.importModule})
});
async function start(){
  if(mode!=='native') await modules.prepare(Object.keys(graph).map(path=>scope+path));
  window.exercise=async()=>{
    const entry=scope+'/entry.js';
    const first=mode==='native' ? await nativeImport(entry) :
      await modules.importModule(entry,undefined,scope+'/');
    first.increment();
    const state=mode==='native' ? await nativeImport(scope+'/state.js') :
      await modules.importModule(scope+'/state.js',undefined,scope+'/');
    if(state.counter!==1) throw new Error('Module identity failed');
    state.increment();
    const result={graph:{counter:first.counter,cyclic:first.cyclic(),
      dynamic:await first.dynamic(),meta:first.meta},reads};
    if(mode==='local'||mode==='native')return result;
    try{
      const value=await nativeImport(scope+'/receiver.js');
      return {...result,ready:value.ready};
    }catch(error){return {...result,errorName:error.name,message:String(error)};}
  };
  window.fixtureReady=true;
}
void start().catch(error=>{window.fixtureError=String(error)});
`,
    },
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    plugins: [await trustedPolicyPlugin(process.cwd())],
  })
).outputFiles[0].text;
const traffic: string[] = [];
const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://fixture.invalid');
  traffic.push(url.pathname);
  response.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/') {
    const strict = ['local', 'denied'].includes(url.searchParams.get('mode') || '');
    response.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; script-src ${strict ? '' : "'self' "}blob: data: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src blob: data:; ${SCRIPT_URL_CSP}`,
    );
    if (url.searchParams.get('document') === 'svg') {
      response.setHeader('Content-Type', 'image/svg+xml');
      response.end(
        '<svg xmlns="http://www.w3.org/2000/svg"><script href="data:text/javascript;base64,' +
          Buffer.from(bootstrap).toString('base64') +
          '"></script></svg>',
      );
    } else {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(
        '<!doctype html><head><script>' +
          bootstrap.replaceAll('</script', '<\\/script') +
          '</script></head><body></body>',
      );
    }
  } else if (url.pathname in graph || url.pathname === '/receiver.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(graph[url.pathname] || 'export const ready=2;');
  } else response.writeHead(404).end();
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;
const rows = [];
let completed = false;
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      for (const document of ['html', 'svg']) {
        for (const mode of ['native', 'control', 'local', 'denied']) {
          const context = await browser.newContext();
          try {
            const page = await context.newPage();
            page.on('pageerror', (error) =>
              console.error(name, document, mode, error.message),
            );
            page.on('console', (message) => {
              if (message.type() === 'error')
                console.error(name, document, mode, message.text());
            });
            await page.goto(origin + '/?mode=' + mode + '&document=' + document);
            await page.waitForFunction(
              () =>
                Reflect.get(window, 'fixtureReady') ||
                Reflect.get(window, 'fixtureError'),
            );
            assert.equal(
              await page.evaluate(() => Reflect.get(window, 'fixtureError')),
              undefined,
            );
            const start = traffic.length;
            const result: unknown = await page.evaluate(() =>
              Reflect.get(window, 'exercise')(),
            );
            await page.waitForTimeout(300);
            const requests = traffic.slice(start);
            const policyEvents: unknown = await page.evaluate(() =>
              Reflect.get(window, 'fixturePolicyViolations')(),
            );
            rows.push({
              name,
              version: browser.version(),
              document,
              mode,
              result,
              requests,
              policyEvents,
            });
            assert(result && typeof result === 'object' && 'graph' in result);
            assert.deepEqual(result.graph, {
              counter: 2,
              cyclic: 2,
              dynamic: 13,
              meta: origin + '/entry.js',
            });
            if (mode === 'native') {
              for (const path of Object.keys(graph)) assert(requests.includes(path));
            } else if (mode === 'control') {
              assert('ready' in result && result.ready === 2);
              assert.deepEqual(requests, ['/receiver.js']);
            } else {
              assert.deepEqual(requests, []);
              if (mode === 'denied') {
                assert('errorName' in result && result.errorName === 'TypeError');
                assert(
                  Array.isArray(policyEvents) &&
                    policyEvents.some(
                      (event: unknown) =>
                        event !== null &&
                        typeof event === 'object' &&
                        'blockedURI' in event &&
                        event.blockedURI === origin + '/receiver.js',
                    ),
                );
              }
            }
            console.log(name, document, mode, 'PASS');
          } finally {
            await context.close();
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
  completed = true;
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const after = await testProvenance(import.meta.url);
  const runnerAfter = digest(await readFile(new URL(import.meta.url), 'utf8'));
  const sourceStable = before.sourceSHA256 === after.sourceSHA256;
  const artifactsStable =
    JSON.stringify(before.artifacts) === JSON.stringify(after.artifacts);
  await writeFile(
    new URL('./native-window-policy.json', import.meta.url),
    JSON.stringify(
      {
        scope:
          'Actual Window local-script delivery under initial HTTP-denying native policy in HTML and SVG. Fixed trusted fixture reader; no service-worker lifecycle or production actor-authentication proof.',
        completed:
          completed && sourceStable && artifactsStable && runnerBefore === runnerAfter,
        started,
        finished: new Date().toISOString(),
        before,
        after,
        sourceStable,
        artifactsStable,
        runnerBefore,
        runnerAfter,
        bootstrapSHA256: digest(bootstrap),
        rows,
      },
      null,
      2,
    ) + '\n',
  );
  assert(
    sourceStable && artifactsStable && runnerBefore === runnerAfter,
    'Fixture inputs changed',
  );
}
