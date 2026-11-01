import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';
import { servers } from './server.ts';
import { testProvenance } from './provenance.ts';
import { provideResourceList } from './resource-list-input.ts';

const traffic: string[] = [],
  received: string[] = [];
let publisherOrigin = '',
  receiverOrigin = '';
const receiver = http.createServer((request, response) => {
  received.push(request.url || '/');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.end('dummy receiver');
});
const processor = (name: string) =>
  `import './dependency.js';globalThis.moduleExecutions=(globalThis.moduleExecutions||0)+1;registerProcessor(${JSON.stringify(name)},class extends AudioWorkletProcessor{constructor(options){super();this.port.postMessage({type:'features',prepared:(Object.getOwnPropertyDescriptor(Array.prototype,"push")?.configurable===false&&Object.getOwnPropertyDescriptor(Object.prototype,"then")?.configurable===false),dependencyPrepared:globalThis.dependencyPrepared===true,executions:globalThis.moduleExecutions,dummy:options.processorOptions.dummy,network:typeof fetch,storage:typeof indexedDB});import(options.processorOptions.target).then(()=>this.port.postMessage({type:'dynamic',outcome:'unexpected'})).catch(error=>this.port.postMessage({type:'dynamic',outcome:'rejected',name:error.name}));}process(inputs,outputs){for(const output of outputs)for(const channel of output)channel.fill(0.25);return false;}});`;
function main() {
  const blob = `import ${JSON.stringify(publisherOrigin + '/worklet-lab/dependency.js')};registerProcessor('blob-probe',class extends AudioWorkletProcessor{constructor(options){super();this.port.postMessage({type:'features',prepared:(Object.getOwnPropertyDescriptor(Array.prototype,"push")?.configurable===false&&Object.getOwnPropertyDescriptor(Object.prototype,"then")?.configurable===false),dependencyPrepared:globalThis.dependencyPrepared===true,executions:1,dummy:options.processorOptions.dummy,network:typeof fetch,storage:typeof indexedDB});import(options.processorOptions.target).catch(error=>this.port.postMessage({type:'dynamic',outcome:'rejected',name:error.name}));}process(inputs,outputs){for(const output of outputs)for(const channel of output)channel.fill(0.25);return false;}});`;
  return `
async function runAudio(kind='resource'){
 const context=new OfflineAudioContext(1,256,44100); const worklet=context.audioWorklet;
 let source;
 if(kind==='blob'){source=URL.createObjectURL(new Blob([${JSON.stringify(blob)}],{type:'text/javascript'}));await worklet.addModule(source);URL.revokeObjectURL(source);}
 else {await worklet.addModule('./processor.js');await worklet.addModule('./processor.js');await worklet.addModule('./second.js');}
 const node=new AudioWorkletNode(context,kind==='blob'?'blob-probe':'resource-probe',{processorOptions:{dummy:'confined-worklet-dummy',target:${JSON.stringify(receiverOrigin + '/computed-import')}}});
 const messages=[]; const done=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Audio port timeout')),10000);node.port.onmessage=event=>{messages.push(event.data);if(messages.length===2){clearTimeout(timer);resolve();}};});
 node.connect(context.destination);const output=await context.startRendering();await done;node.port.close();return{sample:output.getChannelData(0)[0],messages};
}
async function runDenials(){
 const context=new OfflineAudioContext(1,128,44100);const worklet=context.audioWorklet;const denied=[];
 for(const [label,url] of [['http',${JSON.stringify(receiverOrigin + '/uninstalled-module.js')}],['foreign-blob','blob:https://outside.invalid/code']]){try{await worklet.addModule(url);}catch{denied.push(label);}}
 const bad=URL.createObjectURL(new Blob([${JSON.stringify('import "' + receiverOrigin + '/uninstalled-dependency.js";registerProcessor("bad",class {});')}],{type:'text/javascript'}));try{await worklet.addModule(bad);}catch{denied.push('dependency');}finally{URL.revokeObjectURL(bad);}
 return{denied,privateCaches:(await caches.keys()).filter(name=>name.startsWith('pf-worklet-contexts'))};
}
async function runPaint(){if(!('paintWorklet'in CSS))return{available:false};await CSS.paintWorklet.addModule('./paint.js');const target=document.createElement('div');target.id='worklet-paint';target.style.cssText='width:8px;height:8px;background-image:paint(confined-probe)';document.body.appendChild(target);return{available:true};}
globalThis.workletFixtureReady=true;
`;
}
const publisher = http.createServer((request, response) => {
  const path = request.url || '/';
  traffic.push(path);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  if (path.endsWith('/sw.js')) {
    response.writeHead(404);
    response.end('No preparation worker');
    return;
  }
  if (path.endsWith('/main.js')) {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(main());
  } else if (path.endsWith('/processor.js')) {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(processor('resource-probe'));
  } else if (path.endsWith('/second.js')) {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(processor('second-probe'));
  } else if (path.endsWith('/dependency.js')) {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(
      'globalThis.dependencyPrepared=(Object.getOwnPropertyDescriptor(Array.prototype,"push")?.configurable===false&&Object.getOwnPropertyDescriptor(Object.prototype,"then")?.configurable===false);export const dependency=1;',
    );
  } else if (path.endsWith('/paint.js')) {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(
      'registerPaint("confined-probe",class{paint(context){context.fillStyle=(Object.getOwnPropertyDescriptor(Array.prototype,"push")?.configurable===false&&Object.getOwnPropertyDescriptor(Object.prototype,"then")?.configurable===false)?"#00ff00":"#ff0000";context.fillRect(0,0,8,8);}});',
    );
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      '<!doctype html><title>Worklet lab</title><script src="main.js"></script><p>Worklet fixture</p>',
    );
  }
});
await Promise.all([
  new Promise<void>((resolve) => publisher.listen(0, '127.0.0.1', resolve)),
  new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve)),
]);
const publisherAddress = publisher.address(),
  receiverAddress = receiver.address();
if (
  !publisherAddress ||
  typeof publisherAddress === 'string' ||
  !receiverAddress ||
  typeof receiverAddress === 'string'
)
  throw new Error('Worklet fixture address missing');
publisherOrigin = `http://127.0.0.1:${publisherAddress.port}`;
receiverOrigin = `http://127.0.0.1:${receiverAddress.port}`;
const server = await servers({ receiver: false });
const evidence = {
  provenance: await testProvenance(import.meta.url),
  scope:
    'Actual installed runtime AudioWorklet/paint adapter, owner bindings, local Blob graph preparation, graph denials and offline processor behavior',
  browsers: [] as unknown[],
};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    const logs: string[] = [];
    try {
      const context = await browser.newContext();
      await context.addInitScript(() => {
        if (!location.pathname.startsWith('/runtime/')) return;
        const NativeContext = OfflineAudioContext,
          NativeNode = AudioWorkletNode,
          add = Worklet.prototype.addModule,
          get = Object.getOwnPropertyDescriptor(
            BaseAudioContext.prototype,
            'audioWorklet',
          )!.get!,
          apply = Reflect.apply;
        const post = ServiceWorker.prototype.postMessage;
        const registrations: { id: string; kind: string; entry: string }[] = [];
        const moduleURLs: string[] = [];
        Object.defineProperty(window, '__workletModuleURLs', { value: moduleURLs });
        Object.defineProperty(window, '__workletRegistrationCapture', {
          value: registrations,
        });
        // Test-only native captures observe issued identities on subsequent
        // requests and allow replay from a different actual browser actor.
        ServiceWorker.prototype.postMessage = function (message, transfer) {
          if (
            message?.type === 'privacy-worklet-prepare' &&
            typeof message.id === 'string'
          ) {
            registrations.push({
              id: message.id,
              kind: message.kind,
              entry: message.source.url,
            });
          }
          return apply(post, this, [message, transfer]);
        };
        Worklet.prototype.addModule = function (url, options) {
          moduleURLs.push(String(url));
          return apply(add, this, [url, options]);
        };
        const controller = navigator.serviceWorker.controller;
        Object.defineProperty(window, '__workletRequestControl', {
          value: (packet: unknown) =>
            new Promise((resolve) => {
              const channel = new MessageChannel();
              channel.port1.onmessage = (event) => {
                channel.port1.close();
                resolve(event.data);
              };
              apply(post, controller, [packet, [channel.port2]]);
            }),
        });
        Object.defineProperty(window, '__nativeWorkletControl', {
          value: async (url: string, render = false) => {
            const context = new NativeContext(1, 256, 44100);
            const worklet = apply(get, context, []);
            try {
              await apply(add, worklet, [url]);
              if (!render) return { outcome: 'loaded' };
              const node = new NativeNode(context, 'resource-probe', {
                processorOptions: {
                  dummy: 'raw-graph-control',
                  target: '/dummy-computed',
                },
              });
              const feature = new Promise((resolve) => {
                node.port.onmessage = (event) => {
                  if (event.data.type === 'features') resolve(event.data);
                };
              });
              node.connect(context.destination);
              const output = await context.startRendering();
              return {
                outcome: 'loaded',
                sample: output.getChannelData(0)[0],
                feature: await feature,
              };
            } catch (error) {
              return {
                outcome: 'rejected',
                name: error instanceof Error ? error.name : String(error),
              };
            }
          },
        });
      });
      const unrestricted = await context.newPage();
      await unrestricted.goto(publisherOrigin + '/unrestricted/');
      const nativeAudio = await unrestricted.evaluate(() =>
        Reflect.get(globalThis, 'runAudio')(),
      );
      assert.equal(nativeAudio.sample, 0.25);
      assert.equal(
        nativeAudio.messages.find((item: { type: string }) => item.type === 'features')
          .prepared,
        false,
      );
      await unrestricted.evaluate((url) => fetch(url), receiverOrigin + '/control');
      await unrestricted.close();
      received.length = 0;
      traffic.length = 0;
      const manager = await context.newPage();
      await manager.goto('http://127.0.0.1:4210/privacy-frames/');
      await manager.getByText('Ready to install.', { exact: true }).waitFor();
      await manager.locator('#app-url').fill(publisherOrigin + '/worklet-lab/');
      await provideResourceList(
        manager,
        ['processor.js', 'second.js', 'dependency.js', 'paint.js', 'child.html'].map(
          (file) => publisherOrigin + '/worklet-lab/' + file,
        ),
      );
      await manager.locator('#install button').click();
      await manager.locator('[data-app="worklet-lab"]').waitFor();
      const opened = context.waitForEvent('page');
      await manager.locator('[data-app="worklet-lab"]').click();
      const app = await opened;
      app.on('pageerror', (error) => logs.push(error.message));
      app.on('console', (message) => {
        if (message.type() === 'error') logs.push(message.text());
      });
      await app.waitForFunction(
        () => Reflect.get(globalThis, 'workletFixtureReady') === true,
      );
      const startTraffic = traffic.length;
      const resource = await app.evaluate(() => Reflect.get(globalThis, 'runAudio')());
      const blob = await app.evaluate(() => Reflect.get(globalThis, 'runAudio')('blob'));
      for (const result of [resource, blob]) {
        assert.equal(result.sample, 0.25);
        const feature = result.messages.find(
          (item: { type: string }) => item.type === 'features',
        );
        assert.equal(feature.prepared, true);
        assert.equal(feature.dependencyPrepared, true);
        assert.equal(feature.network, 'undefined');
        assert.equal(feature.storage, 'undefined');
        assert.equal(feature.dummy, 'confined-worklet-dummy');
        assert.deepEqual(
          result.messages.find((item: { type: string }) => item.type === 'dynamic'),
          { type: 'dynamic', outcome: 'rejected', name: 'TypeError' },
        );
      }
      assert.equal(
        resource.messages.find((item: { type: string }) => item.type === 'features')
          .executions,
        2,
      );
      const denied = await app.evaluate(() => Reflect.get(globalThis, 'runDenials')());
      assert.deepEqual(denied.denied, ['http', 'foreign-blob', 'dependency']);
      assert.deepEqual(denied.privateCaches, []);
      const identity = await app.evaluate(() =>
        Reflect.get(window, '__workletRegistrationCapture').find(
          (value: { kind: string }) => value.kind === 'audio',
        ),
      );
      assert(
        identity,
        'Private worklet registration was not observed by trusted control',
      );
      const ownedRoot = new URL('./', app.url()).href;
      const rawBlocked = await app.evaluate(
        (url) => Reflect.get(window, '__nativeWorkletControl')(url),
        new URL('processor.js', ownedRoot).href,
      );
      assert.equal(rawBlocked.outcome, 'rejected');
      const graph = new URL(
        `__contexts/${identity.id}/worklet/resources/processor.js`,
        ownedRoot,
      ).href;
      const rawGraph = await app.evaluate(
        (url) => Reflect.get(window, '__nativeWorkletControl')(url),
        graph,
      );
      assert.equal(rawGraph.outcome, 'rejected', 'Removed HTTP worklet route must fail');
      const moduleURLs = await app.evaluate(() =>
        Reflect.get(window, '__workletModuleURLs'),
      );
      assert(moduleURLs.length >= 3);
      assert(moduleURLs.every((url: string) => url.startsWith('blob:')));
      const second = context.waitForEvent('page');
      await manager.locator('[data-app="worklet-lab"]').click();
      const peer = await second;
      await peer.waitForFunction(
        () => Reflect.get(globalThis, 'workletFixtureReady') === true,
      );
      const foreignOwner = await peer.evaluate(
        (packet) => Reflect.get(window, '__workletRequestControl')(packet),
        {
          type: 'privacy-worklet-prepare',
          kind: 'audio',
          id: identity.id,
          source: { kind: 'resource', url: identity.entry },
          modules: [],
        },
      );
      assert.equal(foreignOwner.ok, false);
      await peer.close();
      const childAudio = await app.evaluate(async () => {
        const child = document.createElement('iframe');
        child.id = 'worklet-child';
        child.src = './child.html';
        const loaded = new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('Worklet child load timeout')),
            20000,
          );
          child.onload = () => {
            clearTimeout(timer);
            resolve();
          };
          child.onerror = () => {
            clearTimeout(timer);
            reject(new Error('Worklet child failed'));
          };
        });
        document.body.append(child);
        await loaded;
        const result = await Reflect.get(child.contentWindow!, 'runAudio')();
        child.remove();
        return result;
      });
      assert.equal(childAudio.sample, 0.25);
      assert.equal(
        childAudio.messages.find((item: { type: string }) => item.type === 'features')
          .prepared,
        true,
      );
      await context.setOffline(true);
      const offline = await app.evaluate(() => Reflect.get(globalThis, 'runAudio')());
      assert.equal(offline.sample, 0.25);
      assert.equal(
        offline.messages.find((item: { type: string }) => item.type === 'features')
          .prepared,
        true,
      );
      const paint = await app.evaluate(() => Reflect.get(globalThis, 'runPaint')());
      if (paint.available) {
        const screenshot = await app.locator('#worklet-paint').screenshot();
        const pixel = await app.evaluate(
          async (bytes) => {
            const bitmap = await createImageBitmap(
              new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
            );
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 8;
            const context = canvas.getContext('2d')!;
            context.drawImage(bitmap, 0, 0);
            return [...context.getImageData(4, 4, 1, 1).data];
          },
          [...screenshot],
        );
        assert.deepEqual(pixel, [0, 255, 0, 255]);
        paint.pixel = pixel;
      } else assert.equal(name, 'firefox');
      assert.deepEqual(received, []);
      assert.equal(traffic.length, startTraffic);
      evidence.browsers.push({
        name,
        version: browser.version(),
        nativeAudio,
        resource,
        blob,
        denied,
        rawBlocked,
        rawGraph,
        moduleURLs,
        foreignOwner,
        childAudio,
        offline,
        paint,
        logs,
        receiverTraffic: [...received],
        publisherRuntimeRequests: traffic.slice(startTraffic),
      });
      console.log(
        `${name}: installed/Blob/native-graph/offline AudioWorklet passed; paint ${paint.available ? 'passed' : 'unavailable'}`,
      );
      await context.close();
    } catch (error) {
      evidence.browsers.push({
        name,
        version: browser.version(),
        failure: String(error),
        logs,
        receiverTraffic: [...received],
        publisherTraffic: [...traffic],
      });
      throw error;
    } finally {
      await browser.close();
    }
  }
} finally {
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    'results/contexts/worklets.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
  await server.close();
  for (const listener of [publisher, receiver]) {
    listener.closeAllConnections();
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  }
}
