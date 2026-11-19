import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, firefox, type Page } from 'playwright';
import { servers } from './server.ts';
import { provideResourceList } from './resource-list-input.ts';
import {
  maintenanceCoverage,
  type MaintenanceSample,
  type MaintenanceSensor,
} from './guest-context-maintenance-coverage.ts';

const scripts: Record<string, string> = {
  '/classic.js': 'importScripts("./dependency.js");postMessage(globalThis.ready);',
  '/dependency.js': 'globalThis.ready="ready";',
  '/dynamic.js': 'import("./module-dependency.js").then(({ready})=>postMessage(ready));',
  '/module.js':
    'import {ready} from "./module-dependency.js";await Promise.resolve();postMessage(ready);',
  '/module-dependency.js': 'export const ready="ready";',
  '/shared.js': 'onconnect=event=>event.ports[0].postMessage("ready");',
  '/worklet.js':
    'registerProcessor("fixture-native-audio",class extends AudioWorkletProcessor{process(){return false}});',
};
const main = `document.querySelector('#run').onclick=()=>{
 const output=document.querySelector('#result');output.textContent='';
 if(document.querySelector('#private').value!=='1'){output.textContent='skipped';return;}
 const kind=document.querySelector('#kind').value;
 if(kind==='modifier'){
  for(const namespace of ['http://www.w3.org/1999/xhtml','http://www.w3.org/2000/svg'])for(const modifier of ['ctrl','shift']){
   const container=namespace.endsWith('svg')?document.createElementNS(namespace,'svg'):document.body;
   if(container!==document.body)document.body.append(container);
   const anchor=document.createElementNS(namespace,'a');anchor.setAttribute('href','#modifier-'+modifier);anchor.setAttribute('target','_blank');container.append(anchor);
   anchor.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:false,ctrlKey:modifier==='ctrl',shiftKey:modifier==='shift'}));
  }
  output.textContent='ready';
 }else if(kind==='popup'){
  const child=open('./frame.html','_blank');globalThis.retained=child;if(!child){output.textContent='wrong';return;}
  const timer=setInterval(()=>{try{if(child.document.querySelector('#frame-ready')){clearInterval(timer);output.textContent='ready'}}catch{}},10);
 }else if(kind==='frame'){
  const frame=document.createElement('iframe');frame.onload=()=>output.textContent=frame.contentDocument.querySelector('#frame-ready')?'ready':'wrong';frame.src='./frame.html';document.body.append(frame);globalThis.retained=frame;
 }else if(kind==='worklet'){
  const audio=new OfflineAudioContext(1,128,48000);globalThis.retained=audio;audio.audioWorklet.addModule('./worklet.js').then(()=>output.textContent='ready');
 }else if(kind==='resources'){
  const image=new Image();const loaded=new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject});image.src='./image.svg';document.body.append(image);
  const link=document.createElement('link');link.rel='stylesheet';link.href='./style.css';const styled=new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=reject});document.head.append(link);
  const text=document.createElement('span');text.className='fixture-asset';text.textContent='ABC';document.body.append(text);
  Promise.all([loaded,styled]).then(()=>document.fonts.load('16px FixtureFont')).then(fonts=>{output.textContent=image.naturalWidth===2&&fonts.length>0&&getComputedStyle(text).color==='rgb(12, 34, 56)'?'ready':'wrong';});
 }else if(kind==='reload'){
  try{location.reload();output.textContent='unexpected'}catch{output.textContent='ready'}
 }else if(kind==='shared'){
  const worker=new SharedWorker('./shared.js',{name:'maintenance'});
  worker.port.onmessage=event=>output.textContent=event.data;worker.port.start();globalThis.retained=worker;
 }else{
  const worker=new Worker('./'+kind+'.js',{type:kind==='module'?'module':'classic'});
  worker.onmessage=event=>output.textContent=event.data;globalThis.retained=worker;
 }
};document.body.dataset.fixtureReady='yes';`;
const html =
  '<!doctype html><title>Guest worker maintenance fixture</title><link rel="icon" href="data:,"><input id="private"><select id="kind"><option>classic</option><option>dynamic</option><option>module</option><option>shared</option><option>frame</option><option>popup</option><option>modifier</option><option>worklet</option><option>resources</option><option>reload</option></select><button id="run">Run</button><output id="result"></output><script src="main.js"></script>';
const font = await readFile(new URL('./fixtures/guest-ahem.ttf', import.meta.url));
const assets = new Map<string, { body: Buffer; type: string }>([
  ...Object.entries(scripts).map(
    ([path, source]) =>
      [path, { body: Buffer.from(source), type: 'text/javascript' }] as const,
  ),
  [
    '/frame.html',
    {
      body: Buffer.from('<!doctype html><p id="frame-ready">ready</p>'),
      type: 'text/html',
    },
  ],
  [
    '/image.svg',
    {
      body: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>',
      ),
      type: 'image/svg+xml',
    },
  ],
  [
    '/style.css',
    {
      body: Buffer.from(
        '@import "./nested.css";@font-face{font-family:FixtureFont;src:url("./font.ttf")} .fixture-asset{font-family:FixtureFont;background-image:url("./image.svg")}',
      ),
      type: 'text/css',
    },
  ],
  [
    '/nested.css',
    { body: Buffer.from('.fixture-asset{color:rgb(12,34,56)}'), type: 'text/css' },
  ],
  ['/font.ttf', { body: font, type: 'font/ttf' }],
]);
const nativeSW = `self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
const assets=${JSON.stringify(Object.fromEntries([...assets].map(([path, asset]) => [path, { body: asset.body.toString('base64'), type: asset.type }])))};
self.addEventListener('fetch',event=>{const asset=assets[new URL(event.request.url).pathname];if(asset)event.respondWith(new Response(Uint8Array.from(atob(asset.body),value=>value.charCodeAt(0)),{headers:{'Content-Type':asset.type}}));});`;
const publisherTraffic: { path: string; time: number }[] = [];
const publisher = createServer((request, response) => {
  const path = request.url || '/';
  publisherTraffic.push({ path, time: Date.now() });
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  if (path.startsWith('/sensor?')) {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><link rel="icon" href="data:,"><p>HTTP sensor</p>');
  } else if (path === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end(html);
  } else if (assets.has(path)) {
    const asset = assets.get(path)!;
    response.setHeader('Content-Type', asset.type);
    response.end(asset.body);
  } else if (path === '/main.js' || path === '/sw.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(path === '/main.js' ? main : nativeSW);
  } else response.writeHead(404).end();
});
await new Promise<void>((resolve) => publisher.listen(0, '127.0.0.1', resolve));
const address = publisher.address();
assert(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;
const server = await servers({ receiver: false });
const samples: MaintenanceSample[] = [];
const sensors: MaintenanceSensor[] = [];
let coverage: ReturnType<typeof maintenanceCoverage> | undefined;
let completed = false;
let failure: string | undefined;
const artifacts = [
  'guard.js',
  'sw.js',
  'guest-worker.js',
  'guest-shared-worker.js',
  '__guest_worker_registry__.js',
  'engine.wasm',
];
const hashArtifacts = async () =>
  Object.fromEntries(
    await Promise.all(
      artifacts.map(async (path) => [
        path,
        createHash('sha256')
          .update(await readFile(new URL('../dist-runtime/' + path, import.meta.url)))
          .digest('hex'),
      ]),
    ),
  );
let hashes: Record<string, string> | undefined;

async function quiet(page: Page): Promise<void> {
  let count = server.traffic.length + publisherTraffic.length;
  let changed = Date.now();
  const deadline = Date.now() + 20000;
  while (Date.now() - changed < 3000) {
    assert(Date.now() < deadline, 'Startup did not become quiet');
    await page.waitForTimeout(200);
    const next = server.traffic.length + publisherTraffic.length;
    if (count !== next) {
      count = next;
      changed = Date.now();
    }
  }
}

try {
  hashes = await hashArtifacts();
  for (const profile of [
    { name: 'chromium', type: chromium, forcedAge: false },
    { name: 'firefox', type: firefox, forcedAge: false },
    { name: 'firefox-forced-age', type: firefox, forcedAge: true },
  ]) {
    if (process.env.GUEST_BROWSER && profile.name !== process.env.GUEST_BROWSER) continue;
    const browser = await profile.type.launch({
      headless: true,
      ...(profile.forcedAge
        ? { firefoxUserPrefs: { 'dom.serviceWorkers.testUpdateOverOneDay': true } }
        : {}),
    });
    try {
      const sensor = await browser.newPage();
      const sensorStart = publisherTraffic.length;
      await sensor.goto(origin + '/sensor?profile=' + profile.name);
      const sensorRequests = publisherTraffic.slice(sensorStart);
      assert(
        sensorRequests.some((request) => request.path.startsWith('/sensor?')),
        'Native physical HTTP sensor did not reach publisher',
      );
      sensors.push({ profile: profile.name, requests: sensorRequests });
      await sensor.close();
      for (const kind of [
        'classic',
        'dynamic',
        'module',
        'shared',
        'frame',
        'popup',
        'modifier',
        'worklet',
        'resources',
        'reload',
      ]) {
        if (process.env.GUEST_CASES && !process.env.GUEST_CASES.split(',').includes(kind))
          continue;
        for (const confined of [false, true]) {
          const expectUpdate =
            !['worklet', 'resources'].includes(kind) || profile.forcedAge;
          if (kind === 'reload' && !confined) continue;
          const bits = ['0', '1'];
          for (const bit of bits) {
            const context = await browser.newContext();
            context.setDefaultTimeout(30000);
            try {
              let app: Page;
              if (confined) {
                const manager = await context.newPage();
                await manager.goto('http://127.0.0.1:4210/privacy-frames/');
                await manager.getByText('Ready to install.', { exact: true }).waitFor();
                await manager.locator('#app-url').fill(origin + '/');
                await provideResourceList(
                  manager,
                  [...assets.keys()].map((path) => origin + path),
                );
                await manager.locator('#install button').click();
                await manager.waitForFunction(() =>
                  /^(Installed |Installation refused:)/.test(
                    document.querySelector('#status')?.textContent || '',
                  ),
                );
                assert.match(await manager.locator('#status').innerText(), /^Installed /);
                const opened = context.waitForEvent('page');
                await manager.locator('#app-list a[data-app]').first().click();
                app = await opened;
              } else {
                app = await context.newPage();
                await app.goto(origin);
                await app.evaluate(async () => {
                  await navigator.serviceWorker.register('/sw.js', {
                    updateViaCache: 'none',
                  });
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
              }
              await app.waitForFunction(
                () => document.body.dataset.fixtureReady === 'yes',
              );
              await app.locator('#kind').selectOption(kind);
              await quiet(app);
              const idleStart = server.traffic.length;
              const idlePublisherStart = publisherTraffic.length;
              await app.waitForTimeout(1000);
              assert.equal(
                server.traffic.length,
                idleStart,
                'Runtime idle control was not quiet',
              );
              assert.equal(
                publisherTraffic.length,
                idlePublisherStart,
                'Publisher idle control was not quiet',
              );
              await app.locator('#private').fill(bit);
              const runtimeStart = server.traffic.length;
              const publisherStart = publisherTraffic.length;
              await app.locator('#run').click();
              await app
                .locator('#result')
                .filter({ hasText: bit === '0' ? /^skipped$/ : /^ready$/ })
                .waitFor();
              await app.waitForTimeout(2500);
              const runtime = server.traffic.slice(runtimeStart);
              const publisherRequests = publisherTraffic.slice(publisherStart);
              const updates = confined
                ? runtime.filter(
                    (request) =>
                      request.port === 4211 && request.path === '/runtime/sw.js',
                  )
                : publisherRequests.filter((request) => request.path === '/sw.js');
              const observation = {
                profile: profile.name,
                version: browser.version(),
                kind,
                confined,
                bit,
                result: await app.locator('#result').innerText(),
                runtime,
                publisher: publisherRequests,
                updates,
              };
              samples.push(observation);
              console.log(JSON.stringify(observation));
              if (
                !confined &&
                expectUpdate &&
                bit === '1' &&
                !updates.length &&
                bits.length < 4
              )
                bits.push('1');
              if (!confined && bit === '0')
                assert.equal(
                  publisherRequests.length,
                  0,
                  'No-worker native control transmitted',
                );
            } finally {
              await context.close();
            }
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
  assert.deepEqual(
    await hashArtifacts(),
    hashes,
    'Runtime artifacts changed during measurement',
  );
  coverage = maintenanceCoverage(samples, sensors);
  completed = true;
  assert(coverage.passed, coverage.errors.join('\n'));
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  await server.close();
  await new Promise<void>((resolve) => publisher.close(() => resolve()));
  await mkdir('results/guest-runtime', { recursive: true });
  await writeFile(
    'results/guest-runtime/worker-maintenance.json',
    JSON.stringify(
      {
        completed,
        passed: completed && !failure,
        failure,
        hashes,
        sensors,
        coverage: coverage || maintenanceCoverage(samples, sensors),
        samples,
      },
      null,
      2,
    ) + '\n',
  );
}
