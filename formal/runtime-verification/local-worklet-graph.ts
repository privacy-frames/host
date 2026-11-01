import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { dirname, resolve } from 'node:path';
import { build, type Plugin } from 'esbuild';
import { VERSION } from '@rollup/browser';
import { chromium, firefox } from 'playwright';
import { launch } from '../../test/browser-profile.ts';
import { testProvenance } from '../../test/provenance.ts';
import { workletCompilerPlugin } from '../../scripts/worklet-compiler.ts';

const before = await testProvenance(import.meta.url);
const digest = (value: Uint8Array | string) =>
  createHash('sha256').update(value).digest('hex');
const runnerBefore = digest(await readFile(new URL(import.meta.url)));
const omittedPreparation = process.env.PF_WORKLET_OMIT_PREPARATION === '1';
const browserFilter = process.env.PF_WORKLET_BROWSER;
assert(
  browserFilter === undefined ||
    browserFilter === 'chromium' ||
    browserFilter === 'firefox',
);
const bootstrapPlugins: Plugin[] = [];
if (omittedPreparation)
  bootstrapPlugins.push({
    name: 'preparation-omission-control',
    setup(builder) {
      builder.onLoad({ filter: /\/worklet-chunks\.ts$/ }, async (args) => {
        assert.equal(args.path, resolve('src/runtime/contexts/worklet-chunks.ts'));
        const source = await readFile(args.path, 'utf8');
        const dependency =
          "'import ' + stringify(guard) + ';\\nimport ' + stringify(application) + ';'";
        assert.equal(
          source.split(dependency).length,
          2,
          'Preparation dependency changed',
        );
        return {
          contents: source.replace(
            dependency,
            "'import ' + stringify(application) + ';'",
          ),
          loader: 'ts',
          resolveDir: dirname(args.path),
        };
      });
    },
  });
const wasmPath = new URL(
  '../../node_modules/@rollup/browser/dist/es/bindings_wasm_bg.wasm',
  import.meta.url,
);
function entry(label: string): string {
  return `import {count,increment,readCycle,initializations,guardRuns} from './state.js';
increment();
registerProcessor('${label}',class extends AudioWorkletProcessor {
  constructor(){super();this.port.postMessage({label:'${label}',count,cycle:readCycle(),initializations,guardRuns});}
  process(inputs,outputs){outputs[0][0].fill(count/100);return false;}
});`;
}
const graph: Record<string, string> = {
  '/one.js': entry('one'),
  '/two.js': entry('two'),
  '/broken.js':
    "import {increment} from './state.js'; increment(); throw new Error('Owned partial evaluation control');",
  '/state.js': `import {runs} from './guard.js';import {read} from './cycle.js';
export let count=0;
export function increment(){count++;}
export function readCycle(){return read();}
globalThis.fixtureInitializations=(globalThis.fixtureInitializations||0)+1;
export const initializations=globalThis.fixtureInitializations;
export const guardRuns=runs;`,
  '/cycle.js': "import {count} from './state.js'; export function read(){return count;}",
  '/guard.js':
    'globalThis.fixtureGuardRuns=(globalThis.fixtureGuardRuns||0)+1;export const runs=globalThis.fixtureGuardRuns;',
  '/tdz-entry.js':
    "import {left} from './tdz-left.js';globalThis.tdzValue=left;registerProcessor('tdz-probe',class extends AudioWorkletProcessor{process(){return false;}});",
  '/tdz-left.js': "import {right} from './tdz-right.js';export let left=right;",
  '/tdz-right.js': "import {left} from './tdz-left.js';export let right=left;",
};
const hostGuard = await readFile('dist-runtime/worklet-guard.js', 'utf8');
const metadata = {
  version: 1,
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'audio',
  application: 'fixture',
  generation: 'fixture',
  parentClient: 'fixture-parent',
};
const hostModule =
  'const __privacyWorkletMetadata=' + JSON.stringify(metadata) + ';\n' + hostGuard;
const rejectedHostModule =
  'const __privacyWorkletMetadata=' +
  JSON.stringify({ ...metadata, kind: 'paint' }) +
  ';\n' +
  hostGuard;
const bootstrap = (
  await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
import {createWorkletChunks,createWorkletBootstrap} from './src/runtime/contexts/worklet-chunks.ts';
const handles=[];
const apply=Reflect.apply, define=Object.defineProperty;
const get=Object.getOwnPropertyDescriptor;
const push=Array.prototype.push;
const audio=new OfflineAudioContext(1,256,44100);
const localMode=new URL(location.href).searchParams.get('strict')==='true';
const host=createWorkletBootstrap(${JSON.stringify(hostModule)});
define(window,'fixtureLink',{value:(plan,mutate)=>{
  const saved=[
    [Map.prototype,'get',get(Map.prototype,'get')],
    [Map.prototype,'set',get(Map.prototype,'set')],
    [Array.prototype,'slice',get(Array.prototype,'slice')],
    [String.prototype,'slice',get(String.prototype,'slice')]
  ];
  try{
    if(mutate)for(const [owner,key]of saved)define(owner,key,{value:()=>{throw new Error('Application prototype hook ran');},configurable:true,writable:true});
    const linked=createWorkletChunks(plan);
    apply(push,handles,[linked]);
    return {entry:linked.entry,facades:[...linked.facades]};
  }finally{if(mutate)for(const [owner,key,value]of saved)define(owner,key,value);}
}});
define(window,'fixtureAdd',{value:url=>audio.audioWorklet.addModule(localMode&&url.startsWith('blob:')?host.entry(url):url)});
define(window,'fixtureHasProcessor',{value:label=>{
  try{const node=new AudioWorkletNode(audio,label);node.port.close();return true;}
  catch{return false;}
}});
define(window,'fixtureGuardControls',{value:async()=>{
  const outcomes=[];
  for(const fail of [false,true]){
    const context=new OfflineAudioContext(1,128,44100);
    const prelude=createWorkletBootstrap(fail?${JSON.stringify(rejectedHostModule)}:${JSON.stringify(hostModule)});
    const body='registerProcessor("after-preparation",class extends AudioWorkletProcessor{process(inputs,outputs){outputs[0][0].fill(0.25);return false;}});';
    const guests=[URL.createObjectURL(new Blob([body],{type:'text/javascript'}))];
    if(fail)guests.push(URL.createObjectURL(new Blob([body],{type:'text/javascript'})));
    let registered=false,sample=0;
    const resolved=[];
    try{
      for(const guest of guests){try{await context.audioWorklet.addModule(prelude.entry(guest));resolved.push(true);}catch{resolved.push(false);}}
      try{const node=new AudioWorkletNode(context,'after-preparation');registered=true;node.connect(context.destination);const output=await context.startRendering();sample=output.getChannelData(0)[0];node.port.close();}catch{}
      outcomes.push({failedPreparation:fail,resolved,registered,sample});
    }finally{prelude.close();for(const guest of guests)URL.revokeObjectURL(guest);}
  }
  return outcomes;
}});
define(window,'fixtureDependencyControl',{value:async()=>{
  const context=new OfflineAudioContext(1,128,44100);
  // Independent native construction keeps this browser control unchanged when
  // the production helper's preparation import is omitted in the test variant.
  const prelude=URL.createObjectURL(new Blob([${JSON.stringify(rejectedHostModule)}],{type:'text/javascript'}));
  const source='import '+JSON.stringify(location.origin+'/preparation-dependency.js')+';registerProcessor("after-dependency",class extends AudioWorkletProcessor{process(){return false;}});';
  const guest=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  const entry=URL.createObjectURL(new Blob(['import '+JSON.stringify(prelude)+';import '+JSON.stringify(guest)+';'],{type:'text/javascript'}));
  let resolved=true,registered=false;
  try{
    try{await context.audioWorklet.addModule(entry);}catch{resolved=false;}
    try{const node=new AudioWorkletNode(context,'after-dependency');node.port.close();registered=true;}catch{}
    return {resolved,registered};
  }finally{for(const url of [entry,prelude,guest])URL.revokeObjectURL(url);}
}});
define(window,'fixtureCompile',{value:payload=>new Promise((resolve,reject)=>{
  const channel=new MessageChannel();
  const timer=setTimeout(()=>{channel.port1.close();reject(new Error('Private compilation timed out'));},15000);
  channel.port1.onmessage=event=>{
    clearTimeout(timer);channel.port1.close();
    if(event.data?.ok===true)resolve(event.data);
    else reject(new Error(event.data?.error||'Private compilation failed'));
  };
  const controller=navigator.serviceWorker.controller;
  if(!controller){clearTimeout(timer);channel.port1.close();reject(new Error('Private compiler unavailable'));return;}
  controller.postMessage(payload,[channel.port2]);
})});
define(window,'fixtureRender',{value:async()=>{
  const messages=['one','two'].map(label=>{
    const node=new AudioWorkletNode(audio,label);
    const message=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Processor message missing')),5000);
      node.port.onmessage=event=>{clearTimeout(timer);node.port.close();resolve(event.data);};
    });
    node.connect(audio.destination);
    return message;
  });
  const output=await audio.startRendering();
  return {messages:await Promise.all(messages),sample:output.getChannelData(0)[0]};
}});
define(window,'fixtureDispose',{value:()=>{host.close();for(const handle of handles)handle.close();}});
`,
    },
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    plugins: bootstrapPlugins,
  })
).outputFiles[0].text;
const compilerSource = (
  await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
import {rollup} from 'trusted:worklet-compiler';
import {compileWorkletGraph} from './src/runtime/contexts/worklet-graph.ts';
const graph=${JSON.stringify(graph)};
const attempts=[];
Object.defineProperty(self,'fetch',{value:input=>{
  attempts.push(String(input));
  throw new Error('Private compiler attempted a fetch');
}});
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  const port=event.ports[0];if(!port)return;
  event.waitUntil((async()=>{
    try{
      const external=new Map(event.data.external);
      const reads=[];
      const plan=await compileWorkletGraph(rollup,{
        entry:event.data.entry,external,
        readModule:async id=>{
          if(external.has(id))throw new Error('Prepared module was read again');
          const url=new URL(id);
          if(url.origin!==self.location.origin||!Object.hasOwn(graph,url.pathname))
            throw new Error('No admitted fixture source');
          reads.push(url.pathname);return graph[url.pathname];
        }
      });
      port.postMessage({ok:true,plan,reads,compilerFetches:attempts});
    }catch(error){port.postMessage({ok:false,error:String(error)});}
    finally{port.close();}
  })());
});`,
    },
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    plugins: [workletCompilerPlugin(process.cwd())],
  })
).outputFiles[0].text;
const requests: string[] = [];
const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://fixture.invalid');
  requests.push(url.pathname);
  response.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/') {
    const strict = url.searchParams.get('strict') === 'true';
    response.setHeader('Content-Type', 'text/html');
    response.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; script-src ${strict ? '' : "'self' "}blob: 'unsafe-inline'; worker-src 'self'; connect-src 'none'`,
    );
    response.end(
      '<!doctype html><script>' +
        bootstrap.replaceAll('</script', '<\\/script') +
        '</script>',
    );
  } else if (url.pathname === '/compiler.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'wasm-unsafe-eval'; connect-src 'none'",
    );
    response.end(compilerSource);
  } else if (
    Object.hasOwn(graph, url.pathname) ||
    ['/receiver.js', '/preparation-dependency.js'].includes(url.pathname)
  ) {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(graph[url.pathname] || 'export const marker=1;');
  } else response.writeHead(404).end();
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;
function linkResult(value: unknown) {
  assert(
    value &&
      typeof value === 'object' &&
      'entry' in value &&
      typeof value.entry === 'string' &&
      'facades' in value &&
      Array.isArray(value.facades),
  );
  const facades: [string, string][] = [];
  for (const item of value.facades) {
    const pair: unknown = item;
    assert(
      Array.isArray(pair) &&
        pair.length === 2 &&
        typeof pair[0] === 'string' &&
        typeof pair[1] === 'string',
    );
    facades.push([pair[0], pair[1]]);
  }
  return { entry: value.entry, facades };
}
const rows = [];
let completed = false;
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    if (browserFilter && browserFilter !== name) continue;
    const browser = await launch(engine);
    let nativeThrowingResults: boolean[] | undefined;
    try {
      for (const mode of ['native', 'local', 'local-mutated'] as const) {
        const context = await browser.newContext();
        try {
          const page = await context.newPage();
          await page.goto(origin + '/?strict=' + (mode !== 'native'));
          if (mode !== 'native')
            await page.evaluate(async () => {
              await navigator.serviceWorker.register('/compiler.js');
              await navigator.serviceWorker.ready;
              if (!navigator.serviceWorker.controller)
                await new Promise<void>((resolve, reject) => {
                  const timer = setTimeout(
                    () => reject(new Error('Private compiler not claimed')),
                    10000,
                  );
                  navigator.serviceWorker.addEventListener(
                    'controllerchange',
                    () => {
                      clearTimeout(timer);
                      resolve();
                    },
                    { once: true },
                  );
                });
            });
          const baseline = requests.length;
          const actionStarted = Date.now();
          const external = new Map<string, string>();
          const reads: string[] = [];
          const plans: unknown[] = [];
          async function moduleURL(path: string): Promise<string> {
            const id = origin + path;
            const known = external.get(id);
            if (known) return known;
            const value: unknown = await page.evaluate(
              async ({ entry, external, mutate }) => {
                const compile: unknown = Reflect.get(window, 'fixtureCompile');
                const link: unknown = Reflect.get(window, 'fixtureLink');
                if (typeof link !== 'function' || typeof compile !== 'function')
                  throw new Error('Fixture linker missing');
                const packet: unknown = await compile({ entry, external });
                if (
                  !packet ||
                  typeof packet !== 'object' ||
                  !('plan' in packet) ||
                  !('reads' in packet) ||
                  !('compilerFetches' in packet)
                )
                  throw new Error('Invalid private compiler response');
                const linked: unknown = link(packet.plan, mutate);
                return {
                  linked,
                  plan: packet.plan,
                  reads: packet.reads,
                  compilerFetches: packet.compilerFetches,
                };
              },
              { entry: id, external: [...external], mutate: mode === 'local-mutated' },
            );
            assert(
              value &&
                typeof value === 'object' &&
                'linked' in value &&
                'plan' in value &&
                'reads' in value &&
                Array.isArray(value.reads) &&
                'compilerFetches' in value,
            );
            assert.deepEqual(value.compilerFetches, []);
            for (const path of value.reads) {
              assert(typeof path === 'string');
              reads.push(path);
            }
            plans.push(value.plan);
            const linked = linkResult(value.linked);
            // Native ESM caches modules even if their later evaluation fails.
            for (const [id, url] of linked.facades) external.set(id, url);
            return linked.entry;
          }
          async function add(path: string) {
            const url = mode === 'native' ? origin + path : await moduleURL(path);
            return page.evaluate(async (url) => {
              const load: unknown = Reflect.get(window, 'fixtureAdd');
              if (typeof load !== 'function') throw new Error('Native worklet missing');
              try {
                await load(url);
                return true;
              } catch {
                return false;
              }
            }, url);
          }
          assert(await add('/one.js'));
          assert(await add('/one.js'));
          const throwingResults = [await add('/broken.js'), await add('/broken.js')];
          if (mode === 'native') nativeThrowingResults = throwingResults;
          else assert.deepEqual(throwingResults, nativeThrowingResults);
          assert(await add('/two.js'));
          const tdzResolved = await add('/tdz-entry.js');
          const tdzRegistered = await page.evaluate(() => {
            const check: unknown = Reflect.get(window, 'fixtureHasProcessor');
            if (typeof check !== 'function') throw new Error('Processor probe missing');
            const result: unknown = check('tdz-probe');
            return result;
          });
          assert.equal(
            tdzRegistered,
            false,
            'Cyclic lexical initialization unexpectedly registered a processor',
          );
          const receiverLoaded = await page.evaluate(async (url) => {
            const load: unknown = Reflect.get(window, 'fixtureAdd');
            if (typeof load !== 'function') throw new Error('Native worklet missing');
            try {
              await load(url);
              return true;
            } catch {
              return false;
            }
          }, origin + '/receiver.js');
          const result: unknown = await page.evaluate(() => {
            const render: unknown = Reflect.get(window, 'fixtureRender');
            if (typeof render !== 'function') throw new Error('Native renderer missing');
            return render();
          });
          const guardControls: unknown =
            mode === 'native'
              ? null
              : await page.evaluate(() => {
                  const check: unknown = Reflect.get(window, 'fixtureGuardControls');
                  if (typeof check !== 'function')
                    throw new Error('Guard controls missing');
                  return check();
                });
          const dependencyControl: unknown = await page.evaluate(() => {
            const check: unknown = Reflect.get(window, 'fixtureDependencyControl');
            if (typeof check !== 'function')
              throw new Error('Dependency control missing');
            return check();
          });
          await page.waitForTimeout(300);
          const traffic = requests.slice(baseline);
          const observationEnded = Date.now();
          rows.push({
            name,
            version: browser.version(),
            mode,
            actionStarted,
            observationEnded,
            reads,
            plans,
            result,
            throwingResults,
            tdzResolved,
            tdzRegistered,
            guardControls,
            dependencyControl,
            receiverLoaded,
            traffic,
          });
          assert(
            result &&
              typeof result === 'object' &&
              'messages' in result &&
              'sample' in result,
          );
          assert.deepEqual(
            result.messages,
            ['one', 'two'].map((label) => ({
              label,
              count: 3,
              cycle: 3,
              initializations: 1,
              guardRuns: 1,
            })),
          );
          assert(
            typeof result.sample === 'number' && Math.abs(result.sample - 0.06) < 0.00001,
          );
          assert.equal(receiverLoaded, mode === 'native');
          assert(
            dependencyControl &&
              typeof dependencyControl === 'object' &&
              'registered' in dependencyControl,
          );
          assert.equal(dependencyControl.registered, false);
          if (mode !== 'native') {
            assert(Array.isArray(guardControls) && guardControls.length === 2);
            assert.equal(guardControls[0].registered, true);
            assert.equal(guardControls[0].sample, 0.25);
            assert.equal(guardControls[1].registered, false);
          }
          if (mode === 'native') {
            assert.deepEqual(
              [...traffic].sort(),
              [
                ...Object.keys(graph),
                '/receiver.js',
                '/preparation-dependency.js',
              ].sort(),
            );
          } else {
            assert.deepEqual(traffic, []);
            assert.deepEqual([...reads].sort(), Object.keys(graph).sort());
          }
          await page.evaluate(() => {
            const dispose: unknown = Reflect.get(window, 'fixtureDispose');
            if (typeof dispose === 'function') dispose();
          });
          console.log(
            `${name} ${mode}: shared cycles/live bindings/repeated and throwing entries PASS`,
          );
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
  const runnerAfter = digest(await readFile(new URL(import.meta.url)));
  const sourceStable = before.sourceSHA256 === after.sourceSHA256;
  const artifactsStable =
    JSON.stringify(before.artifacts) === JSON.stringify(after.artifacts);
  const runnerStable = runnerBefore === runnerAfter;
  await writeFile(
    new URL(
      './local-worklet-graph' +
        (omittedPreparation ? '-omitted-preparation' : '') +
        (browserFilter ? '-' + browserFilter : '') +
        '.json',
      import.meta.url,
    ),
    JSON.stringify(
      {
        scope:
          'Actual compile/link helpers with fixed immutable sources, compilation in a private native service worker with embedded WASM and HTTP-denying script/connect policy, an independent host-guard entry wrapper, and native AudioWorklets. Fixed fixture metadata; no production actor authentication, PaintWorklet or lifetime proof.',
        completed: completed && sourceStable && artifactsStable && runnerStable,
        omittedPreparation,
        browserFilter,
        before,
        after,
        sourceStable,
        artifactsStable,
        runnerBefore,
        runnerAfter,
        compilerVersion: VERSION,
        compilerWasmSHA256: digest(await readFile(wasmPath)),
        bootstrapSHA256: digest(bootstrap),
        hostGuardSHA256: digest(hostGuard),
        compilerSourceSHA256: digest(compilerSource),
        compilerSourceBytes: Buffer.byteLength(compilerSource),
        graph,
        rows,
      },
      null,
      2,
    ) + '\n',
  );
  assert(sourceStable && artifactsStable && runnerStable);
}
