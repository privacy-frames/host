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
const runnerBefore = createHash('sha256')
  .update(await readFile(new URL(import.meta.url)))
  .digest('hex');
const graph: Record<string, string> = {
  '/entry.js': `
import {counter, increment} from './state.js';
export {counter, increment};
export const meta=import.meta.url;
export const resolved=import.meta.resolve('./dependency.js');
export async function dynamic(){return (await import('./dependency.js')).answer;}
await Promise.resolve();
export const ready=1;`,
  '/state.js': 'export let counter=0; export function increment(){counter++;}',
  '/dependency.js': 'export const answer=13;',
  '/receiver.js': 'export const ready=2;',
};
const bootstrap = (
  await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
import {createModuleLoader} from './src/runtime/module-loader.ts';
import {relocateRuntimeModule} from './src/runtime/modules.ts';
import {prepareRuntimeIntrinsics} from './src/runtime/intrinsics.ts';
import {prepareScriptURLs} from './src/runtime/enforcement/script-urls.ts';
const graph=${JSON.stringify(graph)};
const scope=location.origin;
const mode=new URL(location.href).searchParams.get('mode');
const restricted=mode.endsWith('-denied') || mode==='local';
const violations=[];
window.fixturePolicyViolations=()=>violations.slice();
addEventListener('securitypolicyviolation',event=>violations.push({
  blockedURI:event.blockedURI,effectiveDirective:event.effectiveDirective
}));
prepareRuntimeIntrinsics();
const mint=prepareScriptURLs();
const nativeImport=new Function('url','return import(url)');
const reads=[];
const resources={
  mapURL:input=>String(input),
  isInstalledURL:input=>typeof input==='string' &&
    input.startsWith(scope+'/') && Object.hasOwn(graph,new URL(input).pathname)
};
const modules=createModuleLoader(async input=>{
  if(typeof input!=='string' || !resources.isInstalledURL(input))
    throw new TypeError('No fixture resource');
  reads.push(input);
  const response=new Response(graph[new URL(input).pathname],{
    headers:{'Content-Type':'text/javascript'}
  });
  Object.defineProperty(response,'url',{value:input});
  return response;
},(code,url)=>relocateRuntimeModule(code,url,resources,true));
Object.defineProperty(window,'privacyHost',{
  value:Object.freeze({importModule:modules.importModule})
});
async function start(){
  await navigator.serviceWorker.register(mint('/sw.js'),{updateViaCache:'none'});
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller) await new Promise(resolve=>
    navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  if(restricted){
    const policy=document.createElement('meta');
    policy.httpEquiv='Content-Security-Policy';
    policy.content="script-src blob: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src blob: data:; worker-src blob:; frame-src 'none'";
    document.head.appendChild(policy);
    policy.remove();
  }
  modules.prepare();
  window.exercise=async()=>{
    const entry=scope+'/entry.js';
    const first=mode==='native-graph' ? await nativeImport(entry) : await modules.load(entry);
    first.increment();
    const state=mode==='native-graph' ? await nativeImport(scope+'/state.js') : await modules.load(scope+'/state.js');
    if(state.counter!==1) throw new Error('Module identity failed');
    state.increment();
    const result={graph:{counter:first.counter,dynamic:await first.dynamic(),
      meta:first.meta,resolved:first.resolved},reads,violations};
    if(mode==='local'||mode==='native-graph')return result;
    try{
      let value;
      if(mode.startsWith('record')){
        const registry=Reflect.get(window.importShim,'_r');
        const record=Reflect.get(registry,entry);
        record.b=scope+'/receiver.js';
        value=await modules.load(entry);
      }else value=await nativeImport(scope+'/receiver.js');
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
  const path = new URL(request.url || '/', 'http://fixture.invalid').pathname;
  traffic.push(path);
  response.setHeader('Cache-Control', 'no-store');
  if (path === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.setHeader(
      'Content-Security-Policy',
      "script-src 'self' blob: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; " +
        "worker-src 'self' blob:; " +
        SCRIPT_URL_CSP,
    );
    response.end(
      '<!doctype html><head><link rel="icon" href="data:,"><script src="/bootstrap.js"></script></head><body></body>',
    );
  } else if (path === '/bootstrap.js' || path === '/sw.js' || path in graph) {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(
      path === '/bootstrap.js'
        ? bootstrap
        : path === '/sw.js'
          ? "addEventListener('install',event=>event.waitUntil(skipWaiting()));addEventListener('activate',event=>event.waitUntil(clients.claim()));"
          : graph[path],
    );
  } else response.writeHead(404).end();
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;
const rows = [];
let completed = false;
try {
  for (const profile of ['chromium', 'firefox', 'firefox-forced-age']) {
    const engine = profile === 'chromium' ? chromium : firefox;
    const browser = await launch(
      engine,
      profile.endsWith('forced-age')
        ? { firefoxUserPrefs: { 'dom.serviceWorkers.testUpdateOverOneDay': true } }
        : {},
    );
    try {
      for (const mode of [
        'native-graph',
        'native-control',
        'record-control',
        'local',
        'native-denied',
        'record-denied',
      ]) {
        const context = await browser.newContext();
        try {
          const page = await context.newPage();
          await page.goto(origin + '/?mode=' + mode);
          await page.waitForFunction(
            () =>
              Reflect.get(window, 'fixtureReady') || Reflect.get(window, 'fixtureError'),
          );
          assert.equal(
            await page.evaluate(() => Reflect.get(window, 'fixtureError')),
            undefined,
          );
          await page.waitForTimeout(3000);
          const start = traffic.length;
          const result: unknown = await page.evaluate(() =>
            Reflect.get(window, 'exercise')(),
          );
          await page.waitForTimeout(3000);
          const requests = traffic.slice(start);
          const policyEvents: unknown = await page.evaluate(() =>
            Reflect.get(window, 'fixturePolicyViolations')(),
          );
          rows.push({
            profile,
            version: browser.version(),
            mode,
            result,
            requests,
            policyEvents,
          });
          assert(result && typeof result === 'object' && 'graph' in result);
          assert.deepEqual(result.graph, {
            counter: 2,
            dynamic: 13,
            meta: origin + '/entry.js',
            resolved: origin + '/dependency.js',
          });
          if (mode === 'local' || mode.endsWith('-denied'))
            assert.deepEqual(requests, []);
          if (mode.endsWith('-denied')) {
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
          } else if (mode.endsWith('-control')) {
            assert('ready' in result && result.ready === 2);
            assert(requests.includes('/receiver.js'));
          }
          console.log(profile, mode, 'PASS');
        } finally {
          await context.close();
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
  const runnerAfter = createHash('sha256')
    .update(await readFile(new URL(import.meta.url)))
    .digest('hex');
  const sourceStable = before.sourceSHA256 === after.sourceSHA256;
  const artifactsStable =
    JSON.stringify(before.artifacts) === JSON.stringify(after.artifacts);
  await writeFile(
    new URL('./window-module-policy.json', import.meta.url),
    JSON.stringify(
      {
        scope:
          'Window script-loader component with intrinsic and Trusted Types preparation. The fixture supplies local resources; it does not prepare the full production Window, verify actor authentication, or establish complete confinement.',
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
        bootstrapSHA256: createHash('sha256').update(bootstrap).digest('hex'),
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
