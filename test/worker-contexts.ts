import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox, type Page } from 'playwright';
import { launch } from './browser-profile.ts';
import { servers } from './server.ts';
import { testProvenance } from './provenance.ts';
import { provideResourceList } from './resource-list-input.ts';

const publisherURL = 'http://127.0.0.1:4344';
const provenance = await testProvenance(import.meta.url);
const receiverURL = 'http://127.0.0.1:4345';
const workerCode = `
function readValue() { return new Promise((resolve,reject)=>{const request=indexedDB.open('worker-shared',1);request.onupgradeneeded=()=>request.result.createObjectStore('values');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const read=db.transaction('values').objectStore('values').get('value');read.onsuccess=()=>{db.close();resolve(read.result??null)};read.onerror=()=>reject(read.error)}}) }
self.onmessage=async e=>{
 try {
  const op=e.data?.op;
  if(op==='port'){const port=e.data.port;port.onmessage=message=>port.postMessage('pong:'+message.data);port.start();port.postMessage('ready');return}
  if(op==='nested'){const nested=new Worker('nested.js');nested.onerror=event=>{event.preventDefault();postMessage({nestedError:event.message})};nested.onmessage=event=>{postMessage({nested:event.data,host:typeof privacyHost==='object'?privacyHost:null});nested.terminate()};nested.postMessage({value:71,depth:2,target:e.data.target});return}
  if(op==='storage'){const response=await caches.match('https://cache.invalid/shared');postMessage({value:await readValue(),cached:response?await response.text():null,names:await caches.keys(),databaseNames:await indexedDB.databases()});return}
  if(op==='network'){let fetchRefused=false,importsRefused=false;try{await fetch(e.data.target+'/worker-private-marker')}catch{fetchRefused=true}try{importScripts(e.data.target+'/import-private-marker')}catch{importsRefused=true}postMessage({fetchRefused,importsRefused});return}
  postMessage({bytes:Array.from(new Uint8Array(e.data.buffer||new ArrayBuffer(0))),location:location.href,host:typeof privacyHost==='object'?privacyHost:null,imported:globalThis.importedValue||0});
 }catch(error){postMessage({failure:error.name,message:error.message})}
};`;
const nestedCode = `self.onmessage=async e=>{if(e.data.depth){const next=new Worker('nested.js');next.onerror=event=>{event.preventDefault();postMessage({nestedError:event.message})};next.onmessage=event=>{postMessage(event.data);next.terminate()};next.postMessage({...e.data,depth:e.data.depth-1});return}let fetchRefused=false,importsRefused=false;try{await fetch(e.data.target+'/nested-private-marker')}catch{fetchRefused=true}try{importScripts(e.data.target+'/nested-import-private-marker')}catch{importsRefused=true}const alias=Worker.prototype.constructor;let recoveryRefused=false;try{new alias(e.data.target+'/nested-constructor-marker')}catch{recoveryRefused=true}postMessage({value:e.data.value,host:typeof privacyHost==='object'?privacyHost:null,location:location.href,fetchRefused,importsRefused,recoveryRefused,sameConstructor:alias===Worker})};`;
const tlaCode = `const value=await new Promise(resolve=>self.onmessage=e=>resolve(e.data));postMessage({value,host:typeof privacyHost==='object'?privacyHost:null});`;
const tlaListenerCode = `const value=await new Promise(resolve=>self.addEventListener('message',e=>resolve(e.data),{once:true}));postMessage({value,host:typeof privacyHost==='object'?privacyHost:null});`;
const files: Record<string, [string, string]> = {
  '/workers/': [
    'text/html',
    '<!doctype html><title>Workers</title><script type="module" src="scripts/main.js"></script><p id="ready">Worker fixture</p>',
  ],
  '/workers/scripts/main.js': [
    'text/javascript',
    `
globalThis.fixtureWorkers = {
  classic: (options = {}) => new Worker('./worker.js', options),
  module: () => new Worker('./module.js', {type: 'module'}),
  directory: () => new Worker('./directory/entry.js'),
  meta: () => new Worker(new URL('../module.js', import.meta.url), {type: 'module'}),
  'await.js': () => new Worker('./await.js', {type: 'module'}),
  'await-listener.js': () => new Worker('./await-listener.js', {type: 'module'}),
  'fail-after-listener.js': () => new Worker('./fail-after-listener.js', {type: 'module'}),
  'broken.js': () => new Worker('./broken.js'),
};
globalThis.workerFixtureReady = true;
`,
  ],
  '/workers/worker.js': ['text/javascript', `importScripts('helper.js');${workerCode}`],
  '/workers/directory/entry.js': [
    'text/javascript',
    `importScripts('./helper.js');${workerCode}`,
  ],
  '/workers/directory/helper.js': ['text/javascript', 'globalThis.importedValue=27;'],
  '/workers/directory/nested.js': ['text/javascript', nestedCode],
  '/workers/module.js': [
    'text/javascript',
    `import {value} from './helper-module.js';globalThis.importedValue=value;${workerCode}`,
  ],
  '/workers/helper.js': ['text/javascript', 'globalThis.importedValue=13;'],
  '/workers/helper-module.js': ['text/javascript', 'export const value=13;'],
  '/workers/nested.js': ['text/javascript', nestedCode],
  '/workers/await.js': ['text/javascript', tlaCode],
  '/workers/await-listener.js': ['text/javascript', tlaListenerCode],
  '/workers/fail-after-listener.js': [
    'text/javascript',
    `self.onmessage=()=>{};await Promise.resolve();throw new Error('Synthetic failure after input ready');`,
  ],
  '/workers/broken.js': [
    'text/javascript',
    `throw new Error('Synthetic startup failure');`,
  ],
  '/workers/uninstalled.js': ['text/javascript', workerCode],
};
const requests: string[] = [];
const connections: number[] = [];
const publisher = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const path = new URL(req.url || '/', publisherURL).pathname.replace(
    '/other-workers/',
    '/workers/',
  );
  const file = files[path];
  if (!file) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader('Content-Type', file[0]);
  res.end(file[1]);
});
const receiver = http.createServer((req, res) => {
  requests.push(req.url || '/');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/javascript');
  res.end('globalThis.importedReceiverControl=true;');
});
receiver.on('connection', () => connections.push(Date.now()));
await new Promise<void>((resolve) => publisher.listen(4344, '127.0.0.1', resolve));
await new Promise<void>((resolve) => receiver.listen(4345, '127.0.0.1', resolve));
const server = await servers({ receiver: false });
const results = [];

async function roundTrip(page: Page, kind: string, optionsMode = 'array') {
  return page.evaluate(
    async ({ kind, optionsMode }) => {
      const blob = kind.startsWith('blob')
        ? URL.createObjectURL(
            new Blob(
              [
                (kind === 'blob-module'
                  ? "import {value} from 'http://127.0.0.1:4344/workers/helper-module.js';globalThis.importedValue=value;"
                  : '') +
                  'self.onmessage=e=>postMessage({bytes:Array.from(new Uint8Array(e.data.buffer)),host:privacyHost,location:location.href,imported:globalThis.importedValue||0})',
              ],
              { type: 'text/javascript' },
            ),
          )
        : null;
      const options = optionsMode === 'constructor-null' ? null : {};
      const factories = Reflect.get(globalThis, 'fixtureWorkers');
      const worker = blob
        ? new Worker(blob, kind === 'blob-module' ? { type: 'module' } : {})
        : factories[kind](options);
      const buffer = new Uint8Array([7, 19, 42]).buffer;
      const response = new Promise<unknown>((resolve, reject) => {
        worker.onmessage = (e) => resolve(e.data);
        worker.onerror = (e) => reject(new Error(e.message));
        setTimeout(() => reject(new Error('Worker response timed out')), 10000);
      });
      const payload = { buffer };
      if (optionsMode === 'null')
        worker.postMessage(payload, null as unknown as StructuredSerializeOptions);
      else if (optionsMode === 'set')
        worker.postMessage(payload, new Set([buffer]) as unknown as Transferable[]);
      else worker.postMessage(payload, [buffer]);
      const detached = buffer.byteLength === 0;
      if (blob) URL.revokeObjectURL(blob);
      try {
        return { kind, detached, value: await response };
      } finally {
        worker.terminate();
      }
    },
    { kind, optionsMode },
  );
}

async function awaitFirstMessage(page: Page, path: string) {
  return page.evaluate(async (path) => {
    const worker = Reflect.get(globalThis, 'fixtureWorkers')[path]();
    try {
      return await new Promise<unknown>((resolve, reject) => {
        worker.onmessage = (e) => resolve(e.data);
        worker.onerror = (e) => reject(new Error(e.message));
        setTimeout(() => reject(new Error('Top-level await message timed out')), 8000);
        worker.postMessage(91);
      });
    } finally {
      worker.terminate();
    }
  }, path);
}

async function readWorkerStorage(page: Page) {
  return page.evaluate(async () => {
    const worker = new Worker('worker.js');
    try {
      return await new Promise<unknown>((resolve, reject) => {
        worker.onmessage = (e) => resolve(e.data);
        worker.onerror = (e) => reject(new Error(e.message));
        setTimeout(() => reject(new Error('Worker storage timed out')), 8000);
        worker.postMessage({ op: 'storage' });
      });
    } finally {
      worker.terminate();
    }
  });
}

try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    if (process.env.WORKER_CONTEXT_BROWSER && process.env.WORKER_CONTEXT_BROWSER !== name)
      continue;
    const browser = await launch(engine);
    try {
      const context = await browser.newContext();
      context.setDefaultTimeout(15000);
      await context.addInitScript(() => {
        const NativeWorker = Worker;
        const nativePost = Worker.prototype.postMessage;
        const nativeTerminate = Worker.prototype.terminate;
        const apply = Reflect.apply;
        Object.defineProperty(globalThis, '__nativeWorkerProbe', {
          value: {
            create: (source: string) => new NativeWorker(source),
            post: (worker: Worker) => apply(nativePost, worker, ['probe']),
            terminate: (worker: Worker) => apply(nativeTerminate, worker, []),
          },
        });
      });
      const manager = await context.newPage();
      await manager.goto('http://127.0.0.1:4210/privacy-frames/');
      await manager.getByText('Ready to install.', { exact: true }).waitFor();
      async function install(path: string, label: string) {
        await manager.locator('#app-url').fill(publisherURL + path);
        await provideResourceList(
          manager,
          Object.keys(files)
            .filter((file) => file.endsWith('.js') && !file.endsWith('/uninstalled.js'))
            .map((file) => publisherURL + file.replace('/workers/', path)),
        );
        await manager.locator('#install button').click();
        try {
          await manager.locator(`[data-app="${label}"]`).waitFor();
        } catch (error) {
          console.log(
            'installation failure',
            await manager.locator('#status').textContent(),
          );
          throw error;
        }
        const opened = context.waitForEvent('page');
        await manager.locator(`[data-app="${label}"]`).click();
        const app = await opened;
        app.on('console', (message) => {
          if (process.env.WORKER_CONTEXT_DEBUG && message.type() === 'error')
            console.log(name, 'worker console', message.text());
        });
        await app.waitForFunction(() => Reflect.get(globalThis, 'workerFixtureReady'));
        return app;
      }
      if (process.env.WORKER_CONTEXT_DEBUG)
        context.on('requestfailed', (request) =>
          console.log(name, 'requestfailed', request.url(), request.failure()?.errorText),
        );
      const app = await install('/workers/', 'workers');
      const rawWorkers = await app.evaluate(async () => {
        const raw = Reflect.get(globalThis, '__nativeWorkerProbe');
        const blob = URL.createObjectURL(
          new Blob(['self.onmessage=()=>postMessage("escaped")'], {
            type: 'text/javascript',
          }),
        );
        try {
          const out = [];
          for (const source of [
            new URL('scripts/main.js', location.href).href,
            blob,
            new URL('../../sw.js', location.href).href,
          ]) {
            const result = await new Promise((resolve) => {
              let worker: Worker;
              try {
                worker = raw.create(source);
              } catch (error) {
                resolve({ source, refused: true, synchronous: true });
                return;
              }
              const timer = setTimeout(() => {
                raw.terminate(worker);
                resolve({ source, refused: false, timeout: true });
              }, 5000);
              worker.onerror = (e) => {
                e.preventDefault();
                clearTimeout(timer);
                raw.terminate(worker);
                resolve({ source, refused: true });
              };
              worker.onmessage = (e) => {
                clearTimeout(timer);
                raw.terminate(worker);
                resolve({ source, refused: false, message: e.data });
              };
              raw.post(worker);
            });
            out.push(result);
          }
          return out;
        } finally {
          URL.revokeObjectURL(blob);
        }
      });
      assert(
        rawWorkers.slice(0, 2).every((result) => result.refused),
        JSON.stringify(rawWorkers),
      );
      assert(!('message' in rawWorkers[2]), JSON.stringify(rawWorkers));
      const startupEvents = await manager
        .frames()
        .find((frame) => frame.url().endsWith('/connect.html'))!
        .evaluate(
          () =>
            new Promise((resolve) => {
              const channel = new MessageChannel();
              channel.port1.onmessage = (e) => resolve(e.data);
              navigator.serviceWorker.controller!.postMessage({ operation: 'events' }, [
                channel.port2,
              ]);
            }),
        );
      if (process.env.WORKER_CONTEXT_DEBUG)
        console.log('raw worker startup events', startupEvents);
      assert(
        startupEvents.value.some(
          (event) =>
            event.kind === 'blocked-context-startup' &&
            event.url === rawWorkers[2].source,
        ),
      );
      const checks = [];
      for (const kind of [
        'classic',
        'module',
        'blob',
        'blob-module',
        'directory',
        'meta',
      ]) {
        let result;
        try {
          result = await roundTrip(app, kind);
        } catch (error) {
          const bridge = manager
            .frames()
            .find((frame) => frame.url().endsWith('/connect.html'))!;
          console.log(
            'failed worker kind',
            kind,
            await bridge.evaluate(
              () =>
                new Promise((resolve) => {
                  const channel = new MessageChannel();
                  channel.port1.onmessage = (e) => resolve(e.data);
                  navigator.serviceWorker.controller!.postMessage(
                    { operation: 'events' },
                    [channel.port2],
                  );
                }),
            ),
          );
          throw error;
        }
        assert.equal(result.detached, true);
        assert.deepEqual(result.value.bytes, [7, 19, 42]);
        assert.equal(result.value.host.context, 'dedicated-worker');
        if (kind !== 'blob')
          assert.equal(result.value.imported, kind === 'directory' ? 27 : 13);
        if (kind === 'meta')
          assert.equal(result.value.location, publisherURL + '/workers/module.js');
        if (kind === 'directory')
          assert.equal(
            result.value.location,
            publisherURL + '/workers/directory/entry.js',
          );
        checks.push(result);
      }
      const offlineWorkers = [];
      await context.setOffline(true);
      try {
        for (const kind of ['meta', 'directory']) {
          const result = await roundTrip(app, kind);
          assert.equal(result.value.imported, kind === 'meta' ? 13 : 27);
          assert.equal(result.value.host.context, 'dedicated-worker');
          assert.equal(
            result.value.location,
            publisherURL +
              (kind === 'meta' ? '/workers/module.js' : '/workers/directory/entry.js'),
          );
          offlineWorkers.push(result);
        }
      } finally {
        await context.setOffline(false);
      }
      const nullConstructorOptions = await roundTrip(app, 'classic', 'constructor-null');
      assert.equal(nullConstructorOptions.value.host.context, 'dedicated-worker');
      const nullOptions = await roundTrip(app, 'classic', 'null');
      assert.equal(nullOptions.detached, false);
      const iterableTransfer = await roundTrip(app, 'classic', 'set');
      assert.equal(iterableTransfer.detached, true);
      const missing = await app.evaluate(() => {
        const worker = new Worker('worker.js');
        try {
          worker.postMessage();
          return 'accepted';
        } catch (e) {
          return e.name;
        } finally {
          worker.terminate();
        }
      });
      assert.equal(missing, 'TypeError');
      const beforeNestedRequests = requests.length,
        beforeNestedConnections = connections.length;
      const nested = process.env.WORKER_CONTEXT_SKIP_NESTED
        ? null
        : await app.evaluate(async (target) => {
            const worker = new Worker('worker.js');
            try {
              return await new Promise<unknown>((resolve, reject) => {
                worker.onmessage = (e) => resolve(e.data);
                worker.onerror = (e) => reject(new Error(e.message));
                setTimeout(() => reject(new Error('Nested worker timed out')), 8000);
                worker.postMessage({ op: 'nested', target });
              });
            } finally {
              worker.terminate();
            }
          }, receiverURL);
      if (process.env.WORKER_CONTEXT_DEBUG)
        console.log(name, 'nested diagnostic', JSON.stringify(nested));
      if (nested && !nested.nested) {
        const bridge = manager
          .frames()
          .find((frame) => frame.url().endsWith('/connect.html'))!;
        console.log(
          'private events',
          await bridge.evaluate(
            () =>
              new Promise((resolve) => {
                const channel = new MessageChannel();
                channel.port1.onmessage = (e) => resolve(e.data);
                navigator.serviceWorker.controller!.postMessage({ operation: 'events' }, [
                  channel.port2,
                ]);
              }),
          ),
        );
      }
      if (nested) {
        assert.equal(nested.nested.value, 71);
        assert.equal(nested.nested.host.application, nested.host.application);
        assert.equal(nested.nested.host.context, 'dedicated-worker');
        assert.equal(nested.nested.fetchRefused, true);
        assert.equal(nested.nested.importsRefused, true);
        assert.equal(nested.nested.recoveryRefused, true);
        assert.equal(nested.nested.sameConstructor, true);
        assert.equal(requests.length, beforeNestedRequests);
        assert.equal(connections.length, beforeNestedConnections);
      }
      const transferredPort = await app.evaluate(async () => {
        const worker = new Worker('worker.js');
        const channel = new MessageChannel();
        try {
          return await new Promise<unknown>((resolve, reject) => {
            const messages: string[] = [];
            channel.port1.onmessage = (e) => {
              messages.push(e.data);
              if (e.data === 'ready') channel.port1.postMessage('ping');
              else resolve(messages);
            };
            worker.onerror = (e) => reject(new Error(e.message));
            setTimeout(() => reject(new Error('Transferred port timed out')), 8000);
            worker.postMessage({ op: 'port', port: channel.port2 }, [channel.port2]);
          });
        } finally {
          channel.port1.close();
          worker.terminate();
        }
      });
      assert.deepEqual(transferredPort, ['ready', 'pong:ping']);
      const topLevelAwait = [];
      for (const path of ['await.js', 'await-listener.js']) {
        const result = await awaitFirstMessage(app, path);
        assert.equal(result.value, 91);
        assert.equal(result.host.context, 'dedicated-worker');
        topLevelAwait.push({ path, result });
      }
      await app.evaluate(async () => {
        const cache = await caches.open('shared-cache');
        await cache.put(
          'https://cache.invalid/shared',
          new Response('scoped-cache-value'),
        );
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('worker-shared', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('values');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('values', 'readwrite');
            tx.objectStore('values').put('scoped-database-value', 'value');
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        });
      });
      const sharedStorage = await readWorkerStorage(app);
      assert.equal(sharedStorage.value, 'scoped-database-value');
      assert.equal(sharedStorage.cached, 'scoped-cache-value');
      assert(sharedStorage.names.includes('shared-cache'));
      const other = await install('/other-workers/', 'other-workers');
      const isolatedStorage = await readWorkerStorage(other);
      assert.equal(isolatedStorage.value, null);
      assert.equal(isolatedStorage.cached, null);
      assert(!isolatedStorage.names.includes('shared-cache'));
      await other.close();
      const failed = [];
      for (const path of ['broken.js', 'fail-after-listener.js']) {
        const result = await app.evaluate(async (path) => {
          const worker = Reflect.get(globalThis, 'fixtureWorkers')[path]();
          const buffer = new Uint8Array([1]).buffer;
          try {
            return await new Promise<unknown>((resolve, reject) => {
              worker.onerror = (e) => {
                e.preventDefault();
                resolve({ error: !!e.message, detached: buffer.byteLength === 0 });
              };
              setTimeout(
                () => reject(new Error('Startup failure was not reported')),
                8000,
              );
              worker.postMessage({ buffer }, [buffer]);
            });
          } finally {
            worker.terminate();
          }
        }, path);
        assert.equal(result.error, true);
        assert.equal(result.detached, true);
        failed.push({ path, result });
      }
      const recovery = await app.evaluate(async () => {
        const originalReflect = Object.getOwnPropertyDescriptor(globalThis, 'Reflect')!;
        const originalData = Object.getOwnPropertyDescriptor(
          MessageEvent.prototype,
          'data',
        )!;
        const nativeReflect = Reflect;
        const dataGetter = originalData.get!;
        let nativeConstructorCalls = 0,
          privateEvents = 0;
        const replacement = Object.create(nativeReflect);
        Object.defineProperty(replacement, 'construct', {
          value: (...args: unknown[]) => {
            nativeConstructorCalls++;
            return nativeReflect.apply(nativeReflect.construct, nativeReflect, args);
          },
        });
        Object.defineProperty(MessageEvent.prototype, 'data', {
          ...originalData,
          get() {
            const value = nativeReflect.apply(dataGetter, this, []);
            if (value?.type?.startsWith('pf-context-')) privateEvents++;
            return value;
          },
        });
        void new MessageEvent('message', { data: { type: 'pf-context-ready' } }).data;
        const getterControl = privateEvents;
        privateEvents = 0;
        const replacementDescriptor =
          'value' in originalReflect
            ? { ...originalReflect, value: replacement }
            : { ...originalReflect, get: () => replacement };
        let bindingReplacementDenied = false;
        try {
          Object.defineProperty(globalThis, 'Reflect', replacementDescriptor);
        } catch {
          bindingReplacementDenied = true;
        }
        const bindingRetained = Reflect === nativeReflect;
        let worker: Worker | undefined;
        try {
          worker = new Worker('worker.js');
        } finally {
          Object.defineProperty(globalThis, 'Reflect', originalReflect);
        }
        try {
          const alias = worker.constructor as typeof Worker;
          const sameConstructor = alias === Worker;
          let unknownRejected = false;
          try {
            const extra = new alias('uninstalled.js');
            extra.terminate();
          } catch {
            unknownRejected = true;
          }
          const response = await new Promise<unknown>((resolve, reject) => {
            worker!.onmessage = (e) => resolve(nativeReflect.apply(dataGetter, e, []));
            worker!.onerror = (e) => reject(new Error(e.message));
            setTimeout(() => reject(new Error('Recovery probe worker timed out')), 8000);
            worker!.postMessage({ buffer: new ArrayBuffer(0) });
          });
          return {
            sameConstructor,
            bindingReplacementDenied,
            bindingRetained,
            unknownRejected,
            nativeConstructorCalls,
            privateEvents,
            getterControl,
            host: response.host,
          };
        } finally {
          Object.defineProperty(MessageEvent.prototype, 'data', originalData);
          worker?.terminate();
        }
      });
      assert.equal(recovery.sameConstructor, true);
      assert.equal(recovery.bindingReplacementDenied, true);
      assert.equal(recovery.bindingRetained, true);
      assert.equal(recovery.unknownRejected, true);
      assert.equal(recovery.nativeConstructorCalls, 0);
      assert.equal(recovery.privateEvents, 0);
      assert.equal(recovery.getterControl, 1);
      assert.equal(recovery.host.context, 'dedicated-worker');
      const before = requests.length,
        connectionsBefore = connections.length;
      const network = await app.evaluate(async (target) => {
        const worker = new Worker('worker.js');
        try {
          return await new Promise<unknown>((resolve, reject) => {
            worker.onmessage = (e) => resolve(e.data);
            worker.onerror = (e) => reject(new Error(e.message));
            setTimeout(() => reject(new Error('Network probe timed out')), 8000);
            worker.postMessage({ op: 'network', target });
          });
        } finally {
          worker.terminate();
        }
      }, receiverURL);
      assert.equal(network.fetchRefused, true);
      assert.equal(network.importsRefused, true);
      assert.equal(requests.length, before);
      assert.equal(connections.length, connectionsBefore);
      const control = await context.newPage();
      await control.goto(publisherURL + '/workers/');
      const nativeOptions = {
        missing: await control.evaluate(() => {
          const worker = new Worker('worker.js');
          try {
            worker.postMessage();
            return 'accepted';
          } catch (e) {
            return e.name;
          } finally {
            worker.terminate();
          }
        }),
        constructorNull: await roundTrip(control, 'classic', 'constructor-null'),
        null: await roundTrip(control, 'classic', 'null'),
        iterable: await roundTrip(control, 'classic', 'set'),
      };
      assert.deepEqual(
        nativeOptions.constructorNull.value.bytes,
        nullConstructorOptions.value.bytes,
      );
      assert.equal(nativeOptions.missing, missing);
      assert.equal(nativeOptions.null.detached, nullOptions.detached);
      assert.equal(nativeOptions.iterable.detached, iterableTransfer.detached);
      const nativeTla = [];
      for (const path of ['await.js', 'await-listener.js']) {
        const result = await awaitFirstMessage(control, path);
        assert.equal(result.value, 91);
        nativeTla.push({ path, result });
      }
      const nativeRecovery = await control.evaluate(async (target) => {
        const original = Object.getOwnPropertyDescriptor(globalThis, 'Reflect')!;
        const nativeReflect = Reflect;
        const replacement = Object.create(nativeReflect);
        const replacementDescriptor =
          'value' in original
            ? { ...original, value: replacement }
            : { ...original, get: () => replacement };
        let replacementAccepted = false;
        try {
          Object.defineProperty(globalThis, 'Reflect', replacementDescriptor);
          replacementAccepted = Reflect === replacement;
        } finally {
          Object.defineProperty(globalThis, 'Reflect', original);
        }
        const worker = new Worker('worker.js');
        const constructor = worker.constructor as typeof Worker;
        worker.terminate();
        const recovered = new constructor('uninstalled.js');
        try {
          const response = await new Promise<unknown>((resolve, reject) => {
            recovered.onmessage = (e) => resolve(e.data);
            recovered.onerror = (e) => reject(new Error(e.message));
            setTimeout(
              () => reject(new Error('Native recovery control timed out')),
              8000,
            );
            recovered.postMessage({ op: 'network', target });
          });
          return { ...response, replacementAccepted };
        } finally {
          recovered.terminate();
        }
      }, receiverURL);
      assert.equal(nativeRecovery.fetchRefused, false);
      assert.equal(nativeRecovery.replacementAccepted, true);
      assert.equal(nativeRecovery.importsRefused, false);
      assert(requests.length > before);
      assert(connections.length > connectionsBefore);
      results.push({
        provenance,
        name,
        version: browser.version(),
        rawWorkers,
        rawControllerStartupBlocked: true,
        checks,
        offlineWorkers,
        nullConstructorOptions,
        nullOptions,
        iterableTransfer,
        missing,
        nested,
        transferredPort,
        topLevelAwait,
        sharedStorage,
        isolatedStorage,
        failed,
        recovery,
        network,
        nativeOptions,
        nativeTla,
        nativeRecovery,
        privateReceiverRequests: 0,
        privateReceiverConnections: 0,
        activeReceiverControl: true,
      });
      await context.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
  for (const listener of [publisher, receiver]) {
    listener.closeAllConnections();
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  }
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    process.env.WORKER_CONTEXT_SKIP_NESTED
      ? 'results/contexts/workers-partial.json'
      : 'results/contexts/workers.json',
    JSON.stringify(results, null, 2) + '\n',
  );
}
console.log(
  process.env.WORKER_CONTEXT_SKIP_NESTED
    ? 'Partial worker checks passed; nested workers omitted.'
    : `Managed worker controls passed in ${results.map((result) => result.name).join(', ')}.`,
);
