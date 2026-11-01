import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox, type Page } from 'playwright';
import { launch } from './browser-profile.ts';
import { servers } from './server.ts';
import { testProvenance } from './provenance.ts';
import { provideResourceList } from './resource-list-input.ts';
const publisher = 'http://127.0.0.1:4352';
const receiverOrigin = 'http://127.0.0.1:4353';
const shared = `
let count=0,connections=0;
self.onconnect=event=>{
  const port=event.ports[0],connection=++connections;
  port.onmessage=async message=>{
    const data=message.data||{};
    if(data.op==='port'){const reply=data.port;reply.onmessage=e=>reply.postMessage('pong:'+e.data);reply.start();reply.postMessage('ready');return;}
    if(data.op==='nested'){
      if(typeof Worker!=='function'){port.postMessage({supported:false});return;}
      const child=new Worker('nested.js');child.onmessage=e=>{port.postMessage({supported:true,nested:e.data});child.terminate()};child.onerror=e=>port.postMessage({error:e.message});return;
    }
    if(data.op==='network'){
      let fetchRefused=false,importRefused=false,socketRefused=false;
      try{await fetch(data.target+'/shared-private-marker')}catch{fetchRefused=true}
      try{importScripts(data.target+'/shared-import-marker')}catch{importRefused=true}
      try{new WebSocket(data.target.replace(/^http/,'ws')+'/shared-socket-marker')}catch{socketRefused=true}
      port.postMessage({fetchRefused,importRefused,socketRefused});return;
    }
    port.postMessage({count:++count,connection,connections,name:self.name,location:location.href,helper:globalThis.sharedHelper||0,host:globalThis.privacyHost||null,bytes:data.buffer?Array.from(new Uint8Array(data.buffer)):[],sourceIsPort:event.source===port,worker:typeof Worker});
  };
  port.start();
};`;
const main = `
globalThis.sharedFixture={
  classic:(name='state')=>new SharedWorker(new URL('./shared.js',import.meta.url),{name}),
  module:(name='state')=>new SharedWorker(new URL('./shared-module.js',import.meta.url),{name,type:'module'}),
  tla:()=>new SharedWorker(new URL('./shared-tla.js',import.meta.url),{name:'tla',type:'module'}),
  alternate:()=>new SharedWorker(new URL('./alternate.js',import.meta.url),{name:'state'}),
  broken:()=>new SharedWorker(new URL('./broken.js',import.meta.url),{name:'broken'}),
};globalThis.sharedFixtureReady=true;`;
const files: Record<string, [string, string]> = {
  '/first/': [
    'text/html',
    '<!doctype html><title>First</title><script type="module" src="/main.js"></script><p>Shared worker fixture</p>',
  ],
  '/second/': [
    'text/html',
    '<!doctype html><title>Second</title><script type="module" src="/main.js"></script><p>Shared worker fixture</p>',
  ],
  '/main.js': ['text/javascript', main],
  '/shared.js': ['text/javascript', `importScripts('helper.js');${shared}`],
  '/shared-module.js': [
    'text/javascript',
    `import {value} from './module-helper.js';globalThis.sharedHelper=value;${shared}`,
  ],
  '/shared-tla.js': [
    'text/javascript',
    `const event=await new Promise(resolve=>self.onconnect=resolve);const port=event.ports[0];port.onmessage=message=>port.postMessage({value:message.data,host:privacyHost,trusted:event.isTrusted,sourceIsPort:event.source===port});port.start();`,
  ],
  '/alternate.js': ['text/javascript', `importScripts('helper.js');${shared}`],
  '/unused.js': ['text/javascript', shared],
  '/helper.js': ['text/javascript', 'globalThis.sharedHelper=17;'],
  '/module-helper.js': ['text/javascript', 'export const value=17;'],
  '/nested.js': [
    'text/javascript',
    `postMessage({value:73,host:globalThis.privacyHost||null});`,
  ],
  '/broken.js': [
    'text/javascript',
    `throw new Error('Synthetic shared source failure');`,
  ],
};
const receiverRequests: string[] = [],
  receiverConnections: number[] = [];
const publisherServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const item = files[new URL(req.url || '/', publisher).pathname];
  if (!item) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader('Content-Type', item[0]);
  res.end(item[1]);
});
const receiver = http.createServer((req, res) => {
  receiverRequests.push(req.url || '/');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/javascript');
  res.end('globalThis.sharedReceiverControl=true;');
});
receiver.on('connection', () => receiverConnections.push(Date.now()));
await new Promise<void>((resolve) => publisherServer.listen(4352, '127.0.0.1', resolve));
await new Promise<void>((resolve) => receiver.listen(4353, '127.0.0.1', resolve));
const server = await servers({ receiver: false });
const results = {
  scope:
    'Installed shared workers and admission controls. A fixture-only constructor hook retains host-issued bootstrap URL brands to reach the native admission protocol; raw URL refusal is checked separately. The hook is not included in production.',
  provenance: await testProvenance(import.meta.url),
  browsers: [] as object[],
};
async function openHandle(page: Page, kind = 'classic', name = 'state') {
  return page.evaluate(
    async ({ kind, name }) => {
      const handle = Reflect.get(globalThis, 'sharedFixture')[kind](name);
      Reflect.set(globalThis, 'sharedHandle', handle);
      const buffer = new Uint8Array([5, 11, 29]).buffer;
      const reply = new Promise((resolve, reject) => {
        handle.port.onmessage = (e) => resolve(e.data);
        handle.onerror = (e) => {
          e.preventDefault();
          reject(new Error(e.message));
        };
        setTimeout(() => reject(new Error('Shared worker response timed out')), 10000);
      });
      handle.port.postMessage({ buffer }, [buffer]);
      return {
        detached: buffer.byteLength === 0,
        native: handle instanceof SharedWorker,
        portNative: handle.port instanceof MessagePort,
        portIdentity: handle.port === handle.port,
        value: await reply,
      };
    },
    { kind, name },
  );
}
async function request(page: Page, data: object) {
  return page.evaluate(async (data) => {
    const handle = Reflect.get(globalThis, 'sharedHandle');
    return await new Promise((resolve, reject) => {
      handle.port.onmessage = (e) => resolve(e.data);
      handle.onerror = (e) => reject(new Error(e.message));
      setTimeout(() => reject(new Error('Shared request timed out')), 8000);
      handle.port.postMessage(data);
    });
  }, data);
}
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    if (process.env.SHARED_WORKER_BROWSER && process.env.SHARED_WORKER_BROWSER !== name)
      continue;
    const browser = await launch(engine);
    try {
      const context = await browser.newContext();
      context.setDefaultTimeout(20000);
      await context.addInitScript(() => {
        const Native = SharedWorker,
          nativeFetch = fetch,
          read = Object.getOwnPropertyDescriptor(SharedWorker.prototype, 'port')!.get!,
          post = MessagePort.prototype.postMessage,
          start = MessagePort.prototype.start,
          close = MessagePort.prototype.close,
          apply = Reflect.apply;
        const construct = Reflect.construct;
        const URLType: unknown = Reflect.get(globalThis, 'TrustedScriptURL');
        if (typeof URLType !== 'function') throw new Error('Native URL type missing');
        const text: unknown = Reflect.get(URLType.prototype, 'toString');
        if (typeof text !== 'function') throw new Error('Native URL stringifier missing');
        const factory: unknown = Reflect.get(globalThis, 'trustedTypes');
        if (!factory || typeof factory !== 'object')
          throw new Error('URL factory missing');
        const isURL: unknown = Reflect.get(factory, 'isScriptURL');
        if (typeof isURL !== 'function')
          throw new Error('Native URL brand check missing');
        const brands = new Map<string, unknown>();
        const set = Map.prototype.set;
        const get = Map.prototype.get;
        const observed = new Proxy(Native, {
          construct(target, args: unknown[], newTarget) {
            if (apply(isURL, factory, [args[0]]) === true) {
              const url: unknown = apply(text, args[0], []);
              if (typeof url !== 'string') throw new Error('Bootstrap URL missing');
              apply(set, brands, [url, args[0]]);
            }
            return construct(target, args, newTarget === observed ? Native : newTarget);
          },
        });
        Object.defineProperty(globalThis, 'SharedWorker', {
          configurable: true,
          writable: true,
          value: observed,
        });
        const container = Object.getOwnPropertyDescriptor(
          Navigator.prototype,
          'serviceWorker',
        )!.get!;
        const controller = Object.getOwnPropertyDescriptor(
          ServiceWorkerContainer.prototype,
          'controller',
        )!.get!;
        const controllerPost = ServiceWorker.prototype.postMessage;
        const NativeChannel = MessageChannel;
        Object.defineProperty(globalThis, '__rawShared', {
          value: {
            // Trusted fixture setup retains native controller access; application
            // identity assertions never substitute for its actual browser actor.
            request: (packet: unknown) =>
              new Promise((resolve, reject) => {
                const channel = new NativeChannel();
                const timer = setTimeout(
                  () => reject(new Error('Shared controller timeout')),
                  10000,
                );
                channel.port1.onmessage = (event) => {
                  clearTimeout(timer);
                  channel.port1.close();
                  if (event.data.ok) resolve(event.data.value);
                  else reject(new Error(event.data.error));
                };
                apply(
                  controllerPost,
                  apply(controller, apply(container, navigator, []), []),
                  [
                    { type: 'privacy-shared-worker-control', ...Object(packet) },
                    [channel.port2],
                  ],
                );
              }),
            fetch: (input: RequestInfo | URL, init?: RequestInit) =>
              apply(nativeFetch, globalThis, [input, init]),
            create: (url: string, name: string) => {
              const brand: unknown = apply(get, brands, [url]);
              if (!brand) throw new Error('Fixture did not observe this bootstrap');
              const handle: SharedWorker = construct(Native, [
                brand,
                { name, credentials: 'omit' },
              ]);
              return { handle, port: apply(read, handle, []) };
            },
            createRaw: (url: string, name: string) =>
              new Native(url, { name, credentials: 'omit' }),
            post: (port: MessagePort, data: unknown, ports: Transferable[] = []) =>
              apply(post, port, [data, ports]),
            start: (port: MessagePort) => apply(start, port, []),
            close: (port: MessagePort) => apply(close, port, []),
          },
        });
      });
      const manager = await context.newPage();
      await manager.goto('http://127.0.0.1:4210/privacy-frames/');
      await manager.getByText('Ready to install.', { exact: true }).waitFor();
      async function install(label: string) {
        await manager.locator('#app-url').fill(publisher + '/' + label + '/');
        await provideResourceList(
          manager,
          Object.keys(files)
            .filter((file) => file.endsWith('.js') && file !== '/unused.js')
            .map((file) => publisher + file),
        );
        await manager.locator('#install button').click();
        try {
          await manager.locator('[data-app="' + label + '"]').waitFor();
        } catch (error) {
          console.log('install failure', await manager.locator('#status').textContent());
          throw error;
        }
      }
      async function open(label: string) {
        const opened = context.waitForEvent('page');
        await manager.locator('[data-app="' + label + '"]').click();
        const page = await opened;
        page.on('console', (message) => {
          if (process.env.SHARED_WORKER_DEBUG)
            console.log(name, message.type(), message.text());
        });
        await page.waitForFunction(() => Reflect.get(globalThis, 'sharedFixtureReady'));
        return page;
      }
      await install('first');
      await install('second');
      const first = await open('first'),
        second = await open('first');
      const a = await openHandle(first),
        b = await openHandle(second);
      await first.evaluate(() =>
        Reflect.set(globalThis, 'classicShared', Reflect.get(globalThis, 'sharedHandle')),
      );
      await second.evaluate(() =>
        Reflect.set(globalThis, 'classicShared', Reflect.get(globalThis, 'sharedHandle')),
      );
      assert.equal(a.value.count, 1);
      assert.equal(b.value.count, 2);
      assert.equal(b.value.connections, 2);
      assert.deepEqual(a.value.bytes, [5, 11, 29]);
      assert(a.detached && a.native && a.portNative && a.portIdentity);
      assert.equal(a.value.name, 'state');
      assert.equal(a.value.helper, 17);
      assert.equal(a.value.host.context, 'shared-worker');
      assert.equal(a.value.sourceIsPort, true);
      const other = await open('second');
      const isolated = await openHandle(other);
      assert.equal(isolated.value.count, 1);
      assert.notEqual(isolated.value.host.application, a.value.host.application);
      assert.equal(isolated.value.location, a.value.location);
      const childConnection = await first.evaluate(async (source) => {
        const child = document.createElement('iframe');
        child.srcdoc =
          '<script>globalThis.childShared=new SharedWorker(' +
          JSON.stringify(source) +
          ',{name:"child-control"});globalThis.childResult=new Promise(resolve=>{childShared.port.onmessage=event=>resolve(event.data);childShared.port.postMessage({})});</script>';
        const loaded = new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('Shared child load timeout')),
            15000,
          );
          child.onload = () => {
            clearTimeout(timer);
            resolve();
          };
          child.onerror = () => {
            clearTimeout(timer);
            reject(new Error('Shared child failed'));
          };
        });
        document.body.append(child);
        await loaded;
        const value = await Reflect.get(child.contentWindow!, 'childResult');
        const parent = new SharedWorker(source, { name: 'child-control' });
        const reply = () =>
          new Promise((resolve) => {
            parent.port.onmessage = (event) => resolve(event.data);
            parent.port.postMessage({});
          });
        const shared = await reply();
        Reflect.get(child.contentWindow!, 'childShared').port.close();
        child.remove();
        const retained = await reply();
        parent.port.close();
        return { value, shared, retained };
      }, publisher + '/shared.js');
      assert.equal(childConnection.value.host.application, a.value.host.application);
      assert.equal(childConnection.value.count, 1);
      assert.equal(childConnection.shared.count, 2);
      assert.equal(childConnection.retained.count, 3);
      const ownedTicket = await first.evaluate(
        (source) =>
          Reflect.get(globalThis, '__rawShared').request({
            operation: 'connect',
            source,
            workerType: 'classic',
            name: 'owner-control',
          }),
        publisher + '/shared.js',
      );
      const peerDisconnect = await second.evaluate(
        (ticket) =>
          Reflect.get(globalThis, '__rawShared').request({
            operation: 'disconnect',
            ticket,
            client: 'forged-owner',
          }),
        ownedTicket.ticket,
      );
      assert.deepEqual(peerDisconnect, { closed: false });
      const ownerDisconnect = await first.evaluate(
        (ticket) =>
          Reflect.get(globalThis, '__rawShared').request({
            operation: 'disconnect',
            ticket,
          }),
        ownedTicket.ticket,
      );
      assert.deepEqual(ownerDisconnect, { closed: true });
      const removedControlRoutes = await first.evaluate(async () => {
        const raw = Reflect.get(globalThis, '__rawShared');
        const rejected = [];
        for (const operation of ['connect', 'disconnect']) {
          try {
            await raw.fetch(new URL('__contexts/shared/' + operation, location.href), {
              method: 'POST',
              body: '{}',
            });
          } catch {
            rejected.push(operation);
          }
        }
        return rejected;
      });
      assert.deepEqual(removedControlRoutes, ['connect', 'disconnect']);
      const malformed = await first.evaluate(async (source) => {
        const raw = Reflect.get(globalThis, '__rawShared');
        const ticket = await raw.request({
          operation: 'connect',
          source,
          workerType: 'classic',
          name: 'state',
        });
        await raw.request({ operation: 'disconnect', ticket: ticket.ticket });
        let rawURLRefused = false;
        try {
          raw.createRaw(ticket.bootstrapURL, ticket.key);
        } catch (error) {
          rawURLRefused = error instanceof TypeError;
        }
        const connection = raw.create(ticket.bootstrapURL, ticket.key);
        const channel = new MessageChannel();
        let appMessages = 0;
        channel.port1.onmessage = () => appMessages++;
        const response = await new Promise((resolve, reject) => {
          connection.port.onmessage = (e) => resolve(e.data);
          connection.handle.onerror = (e) => {
            e.preventDefault();
            reject(new Error(e.message));
          };
          raw.start(connection.port);
          raw.post(
            connection.port,
            {
              type: 'privacy-shared-connect',
              ticket: crypto.randomUUID(),
              key: ticket.key,
              start: { source, base: source },
            },
            [channel.port2],
          );
          channel.port1.postMessage({});
          setTimeout(
            () => reject(new Error('Unauthenticated shared control timed out')),
            8000,
          );
        });
        raw.close(connection.port);
        channel.port1.close();
        return {
          response,
          rawURLRefused,
          appMessages,
          key: ticket.key,
          generation: ticket.installationGeneration,
        };
      }, publisher + '/shared.js');
      assert.equal(malformed.response.type, 'privacy-shared-failed');
      assert.equal(malformed.rawURLRefused, true);
      assert.equal(malformed.appMessages, 0);
      const afterMalformed = await request(first, {});
      assert.equal(afterMalformed.connections, 2);
      const transferredPort = await first.evaluate(async () => {
        const handle = Reflect.get(globalThis, 'sharedHandle');
        const channel = new MessageChannel();
        try {
          return await new Promise((resolve, reject) => {
            const messages = [];
            channel.port1.onmessage = (e) => {
              messages.push(e.data);
              if (e.data === 'ready') channel.port1.postMessage('ping');
              else resolve(messages);
            };
            handle.port.postMessage({ op: 'port', port: channel.port2 }, [channel.port2]);
            setTimeout(() => reject(new Error('Shared transferred port timeout')), 8000);
          });
        } finally {
          channel.port1.close();
        }
      });
      assert.deepEqual(transferredPort, ['ready', 'pong:ping']);
      const nested = await request(first, { op: 'nested' });
      if (a.value.worker === 'function') {
        assert.equal(nested.supported, true);
        assert.equal(nested.nested.value, 73);
        assert.equal(nested.nested.host.application, a.value.host.application);
      } else assert.equal(nested.supported, false);
      const alternate = await openHandle(first, 'alternate');
      assert.equal(alternate.value.count, 1);
      assert.equal(alternate.value.name, 'state');
      assert.equal(alternate.value.host.application, a.value.host.application);
      assert.notEqual(alternate.value.location, a.value.location);
      const recovery = await first.evaluate(async (source) => {
        const current = Reflect.get(globalThis, 'sharedHandle');
        const constructor = current.constructor;
        let refused = false;
        try {
          const candidate = new constructor(source);
          candidate.port.close();
        } catch {
          refused = true;
        }
        return { sameConstructor: constructor === SharedWorker, refused };
      }, publisher + '/unused.js');
      assert.deepEqual(recovery, { sameConstructor: true, refused: true });
      const topLevelAwait = await first.evaluate(async () => {
        const worker = Reflect.get(globalThis, 'sharedFixture').tla();
        try {
          return await new Promise((resolve, reject) => {
            worker.port.onmessage = (e) => resolve(e.data);
            worker.onerror = (e) => {
              e.preventDefault();
              reject(new Error(e.message));
            };
            worker.port.postMessage(91);
            setTimeout(() => reject(new Error('Mediated shared TLA timed out')), 8000);
          });
        } finally {
          worker.port.close();
        }
      });
      assert.equal(topLevelAwait.value, 91);
      assert.equal(topLevelAwait.host.application, a.value.host.application);
      assert.equal(topLevelAwait.sourceIsPort, true);
      const module = await openHandle(first, 'module');
      assert.equal(module.value.count, 1);
      assert.equal(module.value.helper, 17);
      await context.setOffline(true);
      let offline;
      try {
        offline = await openHandle(second, 'module', 'offline');
        assert.equal(offline.value.count, 1);
        assert.equal(offline.value.helper, 17);
      } finally {
        await context.setOffline(false);
      }
      const blob = await first.evaluate(async () => {
        const url = URL.createObjectURL(
          new Blob(
            [
              `let count=0;onconnect=e=>{const port=e.ports[0];port.onmessage=()=>port.postMessage({count:++count,host:privacyHost});port.start()};`,
            ],
            { type: 'text/javascript' },
          ),
        );
        const handles = [
          new SharedWorker(url, { name: 'blob' }),
          new SharedWorker(url, { name: 'blob' }),
        ];
        URL.revokeObjectURL(url);
        const values = [];
        try {
          for (const handle of handles) {
            values.push(
              await new Promise((resolve, reject) => {
                handle.port.onmessage = (e) => resolve(e.data);
                handle.onerror = (e) => reject(new Error(e.message));
                handle.port.postMessage({});
                setTimeout(() => reject(new Error('Shared Blob timeout')), 8000);
              }),
            );
          }
          return values;
        } finally {
          for (const handle of handles) handle.port.close();
        }
      });
      assert.equal(blob[0].count, 1);
      assert.equal(blob[1].count, 2);
      const broken = await first.evaluate(async () => {
        const handle = Reflect.get(globalThis, 'sharedFixture').broken();
        try {
          return await new Promise((resolve, reject) => {
            handle.onerror = (e) => {
              e.preventDefault();
              resolve(!!e.message);
            };
            setTimeout(() => reject(new Error('Shared failure not surfaced')), 8000);
            handle.port.start();
          });
        } finally {
          handle.port.close();
        }
      });
      assert.equal(broken, true);
      await second.evaluate(() => Reflect.get(globalThis, 'classicShared').port.close());
      await first.evaluate(() =>
        Reflect.set(globalThis, 'sharedHandle', Reflect.get(globalThis, 'classicShared')),
      );
      const afterClose = await request(first, {});
      assert.equal(afterClose.host.application, a.value.host.application);
      assert.equal(afterClose.count, afterMalformed.count + 1);
      const before = receiverRequests.length,
        connectionsBefore = receiverConnections.length;
      const network = await request(first, { op: 'network', target: receiverOrigin });
      assert.deepEqual(network, {
        fetchRefused: true,
        importRefused: true,
        socketRefused: true,
      });
      assert.equal(receiverRequests.length, before);
      assert.equal(receiverConnections.length, connectionsBefore);
      const control = await context.newPage();
      await control.goto(publisher + '/first/');
      await control.waitForFunction(() => Reflect.get(globalThis, 'sharedFixtureReady'));
      await openHandle(control);
      const nativeNetwork = await request(control, {
        op: 'network',
        target: receiverOrigin,
      });
      assert.equal(nativeNetwork.fetchRefused, false);
      assert.equal(nativeNetwork.importRefused, false);
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert(receiverRequests.length > before);
      assert(receiverConnections.length > connectionsBefore);
      await first.close();
      await second.close();
      await manager.locator('#app-url').fill(publisher + '/first/');
      await provideResourceList(
        manager,
        Object.keys(files)
          .filter((file) => file.endsWith('.js') && file !== '/unused.js')
          .map((file) => publisher + file),
      );
      await manager.locator('#install button').click();
      await manager.getByText('Installed First.', { exact: true }).waitFor();
      const replacement = await open('first');
      const regenerated = await openHandle(replacement);
      assert.equal(regenerated.value.count, 1);
      assert.equal(regenerated.value.host.application, a.value.host.application);
      const newIdentity = await replacement.evaluate(async (source) => {
        const raw = Reflect.get(globalThis, '__rawShared');
        const response = await raw.request({
          operation: 'connect',
          source,
          workerType: 'classic',
          name: 'state',
        });
        await raw.request({ operation: 'disconnect', ticket: response.ticket });
        return { key: response.key, generation: response.installationGeneration };
      }, publisher + '/shared.js');
      assert.equal(typeof malformed.generation, 'string');
      assert.equal(typeof malformed.key, 'string');
      assert.equal(typeof newIdentity.generation, 'string');
      assert.equal(typeof newIdentity.key, 'string');
      assert.notEqual(newIdentity.generation, malformed.generation);
      assert.notEqual(newIdentity.key, malformed.key);
      const unaffectedOther = await request(other, {});
      assert.equal(unaffectedOther.count, 2);
      results.browsers.push({
        name,
        version: browser.version(),
        a,
        b,
        isolated,
        malformed,
        childConnection,
        peerDisconnect,
        ownerDisconnect,
        removedControlRoutes,
        afterMalformed,
        transferredPort,
        nested,
        module,
        topLevelAwait,
        alternate,
        recovery,
        offline,
        blob,
        broken,
        afterClose,
        network,
        nativeNetwork,
        privateReceiverRequests: 0,
        privateReceiverConnections: 0,
        activeReceiverControl: true,
        regenerated,
        newIdentity,
        unaffectedOther,
      });
      await context.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
  for (const listener of [publisherServer, receiver]) {
    listener.closeAllConnections();
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  }
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    'results/contexts/shared-workers.json',
    JSON.stringify(results, null, 2) + '\n',
  );
}
console.log(
  'Shared worker isolation and native-port controls passed ' +
    results.browsers.map((value) => Reflect.get(value, 'name')).join(', '),
);
