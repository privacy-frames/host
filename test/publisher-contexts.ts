import { waitUntil } from './helpers/poll.ts';
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
let receiverOrigin = '';
const receiver = http.createServer((request, response) => {
  received.push(request.url || '/');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.end('receiver');
});
const assets = [
  'value.txt',
  'fallback.txt',
  'rejected.txt',
  'redirect.txt',
  'executable.txt',
  'headers.txt',
  'style.css',
];
const publisher = http.createServer((request, response) => {
  const path = request.url || '/';
  traffic.push(path);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  if (path === '/publisher-lab/' || path === '/publisher-lab/index.html') {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      '<!doctype html><title>Publisher lab</title>' +
        assets
          .map((asset) => `<link rel="preload" as="fetch" href="./${asset}">`)
          .join('') +
        '<script src="./main.js"></script>',
    );
  } else if (path === '/publisher-lab/main.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(`
 globalThis.startPublisher=async()=>{const registration=await navigator.serviceWorker.register('./foreground.js');await navigator.serviceWorker.ready;return{scope:registration.scope,controller:!!navigator.serviceWorker.controller};};
 globalThis.startPhysicalPublisher=async()=>{const base=new URL('./',document.baseURI);const registration=await navigator.serviceWorker.register(new URL('foreground.js',base),{scope:base.pathname,updateViaCache:'none'});return{scope:registration.scope,script:registration.active.scriptURL};};
 globalThis.startPublisherModule=async()=>{return navigator.serviceWorker.register('./foreground-module.js',{type:'module'});};
 globalThis.messagePublisher=data=>new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>reject(new Error('Application message timeout')),10000);channel.port1.onmessage=event=>{clearTimeout(timer);resolve(event.data);channel.port1.close();};navigator.serviceWorker.controller.postMessage(data,[channel.port2]);});
 globalThis.publisherReady=true;
 `);
  } else if (
    path === '/publisher-lab/foreground.js' ||
    path === '/publisher-lab/foreground-module.js'
  ) {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(`
 ${path.endsWith('foreground-module.js') ? "import './library.js';" : "importScripts('./library.js');"}
 let installs=0,activates=0,seen=[];
 self.addEventListener('install',event=>{installs++;event.waitUntil(caches.open('publisher-values').then(cache=>cache.addAll(['./value.txt'])));});
 self.addEventListener('activate',event=>{activates++;event.waitUntil(clients.claim());});
 self.addEventListener('message',event=>{event.waitUntil((async()=>{let denied=false;try{new WebSocket('ws://127.0.0.1:1');}catch(error){denied=error.name==='SecurityError';}let external=false;try{await fetch(${JSON.stringify(receiverOrigin)}+'/blocked?nonce='+crypto.randomUUID());}catch{external=true;}const appClients=await clients.matchAll();event.ports[0].postMessage({data:event.data,prepared:(Object.getOwnPropertyDescriptor(Array.prototype,"push")?.configurable===false&&Object.getOwnPropertyDescriptor(Object.prototype,"then")?.configurable===false),libraryPrepared:globalThis.libraryPrepared,installs,activates,denied,external,clients:appClients.map(client=>client.id),seen});event.source.postMessage({from:'publisher',echo:event.data});})());});
 self.addEventListener('fetch',event=>{const path=new URL(event.request.url).pathname;seen.push(path);if(path.endsWith('/style.css')){event.respondWith(new Promise(()=>{}));return;}if(path.endsWith('/fallback.txt'))return;if(path.endsWith('/rejected.txt')){event.respondWith(Promise.reject(new Error('policy failure')));return;}if(path.endsWith('/redirect.txt')){event.respondWith(Response.redirect('https://receiver.invalid/'));return;}if(path.endsWith('/executable.txt')){event.respondWith(new Response('globalThis.shouldNotExecute=true',{headers:{'content-type':'text/javascript'}}));return;}if(path.endsWith('/headers.txt')){event.respondWith(new Response(JSON.stringify({authorization:event.request.headers.get('authorization'),cookie:event.request.headers.get('cookie'),dummy:event.request.headers.get('x-dummy')}),{headers:{'content-type':'application/json','set-cookie':'ambient=1','refresh':'0;url=https://receiver.invalid/'}}));return;}event.respondWith(caches.open('publisher-values').then(cache=>cache.match(event.request)).then(async value=>new Response('mediated:'+(await value.text()),{headers:{'content-type':'text/plain'}})));});
 `);
  } else if (path === '/publisher-lab/library.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(
      'globalThis.libraryPrepared=(Object.getOwnPropertyDescriptor(Array.prototype,"push")?.configurable===false&&Object.getOwnPropertyDescriptor(Object.prototype,"then")?.configurable===false);',
    );
  } else if (assets.some((asset) => path === '/publisher-lab/' + asset)) {
    response.setHeader(
      'Content-Type',
      path.endsWith('/style.css') ? 'text/css' : 'text/plain',
    );
    response.end(
      path.endsWith('/style.css')
        ? 'body{--publisher-rebind:admitted}'
        : path.endsWith('/value.txt')
          ? 'immutable'
          : 'fallback graph',
    );
  } else {
    response.writeHead(404);
    response.end('absent');
  }
});
await Promise.all([
  new Promise<void>((done) => publisher.listen(0, '127.0.0.1', done)),
  new Promise<void>((done) => receiver.listen(0, '127.0.0.1', done)),
]);
const publisherAddress = publisher.address(),
  receiverAddress = receiver.address();
if (
  !publisherAddress ||
  typeof publisherAddress === 'string' ||
  !receiverAddress ||
  typeof receiverAddress === 'string'
)
  throw new Error('Missing publisher fixture');
const publisherOrigin = `http://127.0.0.1:${publisherAddress.port}`;
receiverOrigin = `http://127.0.0.1:${receiverAddress.port}`;
const server = process.env.HOST_URL ? undefined : await servers({ receiver: false });
const host = process.env.HOST_URL || 'http://127.0.0.1:4210/privacy-frames/';
const evidence = {
  provenance: await testProvenance(import.meta.url),
  browsers: [] as unknown[],
};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine),
      logs: string[] = [];
    try {
      const context = await browser.newContext();
      const manager = await context.newPage();
      await manager.goto(host);
      await manager.getByText('Ready to install.', { exact: true }).waitFor();
      await manager.locator('#app-url').fill(publisherOrigin + '/publisher-lab/');
      await provideResourceList(
        manager,
        ['foreground.js', 'foreground-module.js', 'library.js'].map(
          (file) => publisherOrigin + '/publisher-lab/' + file,
        ),
      );
      await manager.locator('#install button').click();
      await manager.locator('[data-app="publisher-lab"]').waitFor();
      const opened = context.waitForEvent('page');
      await manager.locator('[data-app="publisher-lab"]').click();
      const app = await opened;
      app.on('pageerror', (error) => logs.push(error.message));
      app.on('console', (message) => {
        if (message.type() === 'error') logs.push(message.text());
      });
      await app.waitForFunction(() => Reflect.get(window, 'publisherReady') === true);
      const startTraffic = traffic.length;
      received.length = 0;
      const initialPublisherState = await app.evaluate(async () => ({
        registrations: (await navigator.serviceWorker.getRegistrations()).length,
        registration: (await navigator.serviceWorker.getRegistration()) ?? null,
        controller: navigator.serviceWorker.controller,
      }));
      assert.deepEqual(initialPublisherState, {
        registrations: 0,
        registration: null,
        controller: null,
      });
      const registration = await app.evaluate(() =>
        Reflect.get(window, 'startPublisher')(),
      );
      assert.equal(registration.controller, true);
      const physicalRegistration = await app.evaluate(async () => {
        const fields = ['href', 'origin', 'pathname', 'search', 'hash'];
        const descriptors = fields.map(
          (field) =>
            [field, Object.getOwnPropertyDescriptor(URL.prototype, field)!] as const,
        );
        const href = descriptors[0][1].get!;
        let privateReads = 0,
          publicReads = 0;
        for (const [field, descriptor] of descriptors)
          Object.defineProperty(URL.prototype, field, {
            ...descriptor,
            get() {
              const actual: string = Reflect.apply(href, this, []);
              if (actual.includes('/__contexts/publisher/')) {
                privateReads++;
                if (field === 'href') return actual + '#untrusted-constructor-input';
              } else publicReads++;
              return Reflect.apply(descriptor.get!, this, []);
            },
          });
        try {
          const control = new URL('https://native-control.invalid/');
          for (const field of fields) Reflect.get(control, field);
          const registration = await Reflect.get(window, 'startPhysicalPublisher')();
          return { ...registration, privateReads, publicReads };
        } finally {
          for (const [field, descriptor] of descriptors)
            Object.defineProperty(URL.prototype, field, descriptor);
        }
      });
      assert.equal(physicalRegistration.scope, publisherOrigin + '/publisher-lab/');
      assert.equal(
        physicalRegistration.script,
        publisherOrigin + '/publisher-lab/foreground.js',
      );
      assert.equal(
        physicalRegistration.privateReads,
        0,
        'Application URL getters received private executor URLs',
      );
      assert(
        physicalRegistration.publicReads >= 5,
        'Native URL getter poisoning control did not execute',
      );
      const invalidPhysicalScopes = await app.evaluate(async () => {
        const base = new URL('./', document.baseURI);
        const script = new URL('foreground.js', base);
        const denied = [];
        for (const scope of [
          new URL('/runtime/another-app/', location.href).href,
          base.href + '?variant=1',
          base.href + '#fragment',
        ]) {
          try {
            await navigator.serviceWorker.register(script, { scope });
            denied.push(false);
          } catch {
            denied.push(true);
          }
        }
        try {
          await navigator.serviceWorker.register(new URL('missing-script.js', base), {
            scope: base.pathname,
          });
          denied.push(false);
        } catch {
          denied.push(true);
        }
        return denied;
      });
      assert.deepEqual(invalidPhysicalScopes, [true, true, true, true]);
      const first = await app.evaluate(() =>
        Reflect.get(
          window,
          'messagePublisher',
        )({ type: 'privacy-publisher-ready', claim: 'manager' }),
      );
      assert.equal(first.prepared, true);
      assert.equal(first.libraryPrepared, true);
      assert.equal(first.installs, 1);
      assert.equal(first.activates, 1);
      assert.equal(first.denied, true);
      assert.equal(first.external, true);
      assert.equal(first.data.claim, 'manager');
      assert.equal(first.clients.length, 1);
      const value = await app.evaluate(
        async () => await (await fetch('./value.txt')).text(),
      );
      assert.equal(value, 'mediated:immutable');
      const fallback = await app.evaluate(
        async () => await (await fetch('./fallback.txt')).text(),
      );
      assert.equal(fallback, 'fallback graph');
      const failures = await app.evaluate(async () => {
        const results = [];
        for (const path of ['rejected.txt', 'redirect.txt', 'executable.txt']) {
          try {
            await fetch('./' + path);
            results.push(false);
          } catch {
            results.push(true);
          }
        }
        return results;
      });
      assert.deepEqual(failures, [true, true, true]);
      const headers = await app.evaluate(async () => {
        const response = await fetch('./headers.txt', {
          headers: { Authorization: 'dummy-private-token', 'X-Dummy': 'test' },
        });
        return {
          body: await response.json(),
          cookie: response.headers.get('set-cookie'),
          refresh: response.headers.get('refresh'),
        };
      });
      assert.deepEqual(headers, {
        body: { authorization: null, cookie: null, dummy: 'test' },
        cookie: null,
        refresh: null,
      });
      await app.evaluate(() => {
        Reflect.set(
          window,
          'pendingPublisherStyle',
          new Promise<string>((resolve) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = './style.css';
            link.onload = () => resolve('loaded');
            link.onerror = () => resolve('failed');
            document.head.append(link);
          }),
        );
      });
      await waitUntil(
        () =>
          app.evaluate(async () => {
            const state = await Reflect.get(window, 'messagePublisher')('pending-style');
            return state.seen.some((path: string) => path.endsWith('/style.css'));
          }),
        'Publisher did not observe the pending stylesheet',
      );
      const second = await context.newPage();
      await second.goto(app.url(), { waitUntil: 'commit' });
      await second.waitForFunction(() => Reflect.get(window, 'publisherReady') === true);
      await second.evaluate(() => Reflect.get(window, 'startPublisher')());
      const shared = await second.evaluate(() =>
        Reflect.get(window, 'messagePublisher')('second'),
      );
      assert.equal(shared.installs, 1);
      assert.equal(shared.activates, 1);
      assert.equal(shared.clients.length, 2);
      assert.equal(
        shared.seen.filter((path: string) => path.endsWith('/style.css')).length,
        1,
        'Executor replacement replayed publisher fetch code',
      );
      const reboundStyle = await app.evaluate(async () => {
        const outcome = await Promise.race([
          Reflect.get(window, 'pendingPublisherStyle'),
          new Promise<string>((resolve) => setTimeout(() => resolve('timed-out'), 10000)),
        ]);
        return {
          outcome,
          applied: getComputedStyle(document.body)
            .getPropertyValue('--publisher-rebind')
            .trim(),
        };
      });
      assert.deepEqual(reboundStyle, { outcome: 'loaded', applied: 'admitted' });
      const reboundFailures = await app.evaluate(async () => {
        const outcomes = [];
        for (const path of ['rejected.txt', 'redirect.txt', 'executable.txt']) {
          try {
            await fetch('./' + path);
            outcomes.push(false);
          } catch {
            outcomes.push(true);
          }
        }
        return outcomes;
      });
      assert.deepEqual(reboundFailures, [true, true, true]);

      await context.setOffline(true);
      const offline = await second.evaluate(
        async () => await (await fetch('./value.txt')).text(),
      );
      await context.setOffline(false);
      assert.equal(offline, 'mediated:immutable');
      await app.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration!.unregister();
      });
      await second.waitForFunction(() => navigator.serviceWorker.controller === null);
      await app.evaluate(() => Reflect.get(window, 'startPublisherModule')());
      const module = await app.evaluate(() =>
        Reflect.get(window, 'messagePublisher')('module'),
      );
      assert.equal(module.prepared, true);
      assert.equal(module.libraryPrepared, true);
      assert.equal(module.installs, 1);
      assert.equal(module.activates, 1);
      const moduleValue = await app.evaluate(
        async () => await (await fetch('./value.txt')).text(),
      );
      assert.equal(moduleValue, 'mediated:immutable');

      assert.deepEqual(received, []);
      assert.deepEqual(traffic.slice(startTraffic), []);
      evidence.browsers.push({
        name,
        version: browser.version(),
        registration,
        physicalRegistration,
        invalidPhysicalScopes,
        first,
        value,
        fallback,
        failures,
        headers,
        shared,
        reboundStyle,
        reboundFailures,
        offline,
        module,
        moduleValue,
        logs,
        publisherRuntimeRequests: traffic.slice(startTraffic),
        receiverRequests: [...received],
      });
      await context.close();
      console.log(
        name + ': foreground publisher lifecycle/messages/fetch/shared/offline passed',
      );
    } catch (error) {
      evidence.browsers.push({
        name,
        failure: String(error),
        logs,
        traffic: [...traffic],
      });
      throw error;
    } finally {
      await browser.close();
    }
  }
} finally {
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    'results/contexts/publishers.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
  await server?.close();
  for (const listener of [publisher, receiver]) {
    listener.closeAllConnections();
    await new Promise<void>((done) => listener.close(() => done()));
  }
}
