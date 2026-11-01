import http from 'node:http';
import assert from 'node:assert/strict';
import { build } from './build.ts';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';
const origin = 'http://127.0.0.1:4332';
const nonce = 'client-identity';
const policy = `sandbox allow-scripts allow-same-origin allow-forms;default-src 'none';script-src 'self' 'nonce-${nonce}' 'unsafe-eval';connect-src 'self';img-src 'self';style-src 'unsafe-inline';frame-src 'self';worker-src 'self'`;
const compiled = await build({
  stdin: {
    contents: `import {prepareWindowRealm} from './src/runtime/contexts/window-realm.ts';const getContainer=Object.getOwnPropertyDescriptor(Navigator.prototype,'serviceWorker').get;const nativePost=ServiceWorker.prototype.postMessage;Object.defineProperty(window,'__sendIdentity',{value:()=>Reflect.apply(nativePost,Reflect.apply(getContainer,navigator,[]).controller,[{action:'child-ready',href:location.href,prepared:!!window.__identityPrepared}])});const p=prepareWindowRealm({application:'identity-app',applicationURL:${JSON.stringify(origin + '/child')},scriptNonce:${JSON.stringify(nonce)}});p.admitContent({scripts: [],installationGeneration:'fixture-generation',aliases:[],source:${JSON.stringify(origin + '/child')}});Object.defineProperty(window,'__identityPrepared',{value:true});`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  banner: { js: '"use strict";' },
  target: 'es2022',
});
const preparation = compiled.outputFiles[0].text;
const publisher = `window.__sendIdentity();fetch('/resource?stage=publisher').then(r=>r.json()).then(value=>window.__publisherResource=value);`;
const html = `<!doctype html><script src="/helper.js"></script><script nonce="${nonce}">${publisher}</script><body>HTML child`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><script href="/helper.js"/><script nonce="${nonce}"><![CDATA[${publisher}]]></script><rect width="40" height="30"/></svg>`;
const service = `const log=[];const intents=new Map();let sequence=0;const record=(value)=>{const entry={sequence:++sequence,...value};log.push(entry);return entry};const identity=client=>client?{id:client.id,url:client.url,type:client.type,frameType:client.frameType}:null;self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('message',e=>e.waitUntil((async()=>{record({kind:'message',action:e.data.action,source:identity(e.source),resolvedSource:identity(e.source?.id?await self.clients.get(e.source.id):null),claimedHref:e.data.href,prepared:e.data.prepared});if(e.ports[0])e.ports[0].postMessage({source:identity(e.source),log:[...log],clients:(await self.clients.matchAll({type:'window',includeUncontrolled:true})).map(identity)})})()));self.addEventListener('fetch',e=>{const dispatchURL=new URL(e.request.url);const dispatch=record({kind:'fetch-dispatch',path:dispatchURL.pathname,query:dispatchURL.search,method:e.request.method,clientId:e.clientId,resultingClientId:e.resultingClientId,destination:e.request.destination});e.respondWith((async()=>{const url=new URL(e.request.url);const token=url.searchParams.get('token');record({kind:'fetch',dispatchSequence:dispatch.sequence,path:url.pathname,query:url.search,method:e.request.method,destination:e.request.destination,clientId:e.clientId,resultingClientId:e.resultingClientId,replacesClientId:typeof e.replacesClientId==='string'?e.replacesClientId:null,replacesClientIdSupported:'replacesClientId' in e,source:identity(e.clientId?await self.clients.get(e.clientId):null),intentAvailable:token?intents.has(token):null});if(e.resultingClientId)e.waitUntil(self.clients.get(e.resultingClientId).then(client=>record({kind:'resulting-resolution',id:e.resultingClientId,client:identity(client)})));if(url.pathname==='/intent'){await new Promise(r=>setTimeout(r,150));intents.set(token,{creator:e.clientId});record({kind:'intent-ready',token,creator:e.clientId});return new Response('registered')}if(url.pathname==='/child'){await new Promise(r=>setTimeout(r,40));return new Response(url.searchParams.get('kind')==='svg'?${JSON.stringify(svg)}:${JSON.stringify(html)},{headers:{'Content-Type':url.searchParams.get('kind')==='svg'?'image/svg+xml':'text/html','Content-Security-Policy':${JSON.stringify(policy)},'Origin-Agent-Cluster':'?1','Cross-Origin-Opener-Policy':'same-origin'}})}if(url.pathname==='/helper.js')return new Response("fetch('/resource?stage=helper').then(r=>r.json()).then(value=>window.__helperResource=value)",{headers:{'Content-Type':'text/javascript'}});if(url.pathname==='/resource')return new Response(JSON.stringify({controlled:true,clientId:e.clientId}),{headers:{'Content-Type':'application/json'}});return fetch(e.request)})())});`;
const network: string[] = [];
const server = http.createServer((request, response) => {
  network.push(request.url || '/');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'text/html');
  response.setHeader('Content-Security-Policy', policy);
  response.setHeader('Origin-Agent-Cluster', '?1');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (request.url === '/sw.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(service);
    return;
  }
  response.end('<!doctype html><title>Document client identity</title><body>');
});
await new Promise<void>((resolve) => server.listen(4332, '127.0.0.1', resolve));
const results = [];
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      for (const kind of ['html', 'svg'])
        for (const mode of ['await-intent', 'parallel-intent', 'insert-first']) {
          const context = await browser.newContext();
          const page = await context.newPage();
          await page.goto(origin + '/parent');
          await page.evaluate(async () => {
            await navigator.serviceWorker.register('/sw.js');
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
          const start = network.length;
          const value = await page.evaluate(
            async ({ kind, mode, origin, nonce, preparation }) => {
              const snapshot = (action: string) =>
                new Promise((resolve) => {
                  const c = new MessageChannel();
                  c.port1.onmessage = (event) => {
                    c.port1.close();
                    resolve(event.data);
                  };
                  navigator.serviceWorker.controller!.postMessage({ action }, [c.port2]);
                });
              const rootIdentity = await snapshot('root-identity');
              const token = kind + '-' + mode;
              let registration: Promise<string> | undefined;
              const register = () =>
                fetch(origin + '/intent?token=' + token, { method: 'POST' }).then((r) =>
                  r.text(),
                );
              if (mode === 'await-intent') await register();
              if (mode === 'parallel-intent') registration = register();
              const frame = document.createElement('iframe');
              frame.src = origin + '/child?kind=' + kind + '&token=' + token;
              const loaded = new Promise<void>((resolve) => {
                frame.addEventListener('load', () => resolve(), { once: true });
                setTimeout(resolve, 3000);
              });
              document.body.append(frame);
              const child = frame.contentWindow!;
              const rawCreate = child.document.createElement,
                rawAppend = child.Element.prototype.append;
              const meta = Reflect.apply(rawCreate, child.document, ['meta']);
              meta.httpEquiv = 'Content-Security-Policy';
              meta.content = `default-src 'none';script-src 'nonce-${nonce}' 'unsafe-eval';connect-src 'none';img-src 'none';style-src 'unsafe-inline';frame-src 'none'`;
              Reflect.apply(rawAppend, child.document.head, [meta]);
              const script = Reflect.apply(rawCreate, child.document, ['script']);
              script.nonce = nonce;
              script.textContent = preparation;
              Reflect.apply(rawAppend, child.document.head, [script]);
              if (mode === 'insert-first') registration = register();
              await loaded;
              if (registration) await registration;
              for (let i = 0; i < 100 && !Reflect.get(child, '__publisherResource'); i++)
                await new Promise((resolve) => setTimeout(resolve, 10));
              await new Promise((resolve) => setTimeout(resolve, 20));
              return {
                kind,
                mode,
                rootIdentity,
                prepared: !!Reflect.get(child, '__identityPrepared'),
                publisher: Reflect.get(child, '__publisherResource'),
                helper: Reflect.get(child, '__helperResource'),
                after: await snapshot('final-snapshot'),
              };
            },
            { kind, mode, origin, nonce, preparation },
          );
          results.push({
            browser: name,
            version: browser.version(),
            ...value,
            network: network.slice(start),
          });
          console.log(name, kind, mode, JSON.stringify(value));
          await context.close();
        }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
await mkdir('results/contexts', { recursive: true });
await writeFile(
  'results/contexts/document-client-identity.json',
  JSON.stringify(
    {
      date: new Date().toISOString(),
      runnerSha256: createHash('sha256')
        .update(await readFile(new URL(import.meta.url)))
        .digest('hex'),
      preparationSha256: createHash('sha256').update(preparation).digest('hex'),
      results,
    },
    null,
    2,
  ) + '\n',
);
function field(value: unknown, key: string): unknown {
  assert(value !== null && typeof value === 'object');
  return Reflect.get(value, key);
}
for (const result of results) {
  assert.equal(result.prepared, true);
  assert.equal(result.publisher.controlled, true);
  assert.equal(result.helper.controlled, true);
  assert.equal(result.publisher.clientId, result.helper.clientId);
  const events = field(result.after, 'log');
  assert(Array.isArray(events));
  const navigation = events.find(
    (event) => field(event, 'kind') === 'fetch' && field(event, 'path') === '/child',
  );
  const intent = events.find(
    (event) => field(event, 'kind') === 'fetch' && field(event, 'path') === '/intent',
  );
  const ready = events.find((event) => field(event, 'action') === 'child-ready');
  assert.equal(field(navigation, 'clientId'), '');
  assert.equal(field(navigation, 'destination'), 'iframe');
  assert.equal(field(navigation, 'resultingClientId'), result.publisher.clientId);
  assert.equal(field(field(ready, 'source'), 'id'), result.publisher.clientId);
  assert.equal(field(field(ready, 'source'), 'type'), 'window');
  assert.equal(field(field(ready, 'source'), 'frameType'), 'nested');
  assert.equal(
    field(intent, 'clientId'),
    field(field(result.rootIdentity, 'source'), 'id'),
  );
  if (result.mode === 'await-intent')
    assert.equal(field(navigation, 'intentAvailable'), true);
}
