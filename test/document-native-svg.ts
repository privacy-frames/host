import http from 'node:http';
import assert from 'node:assert/strict';
import { build } from './build.ts';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';
const origin = 'http://127.0.0.1:4332';
const nonce = 'native-svg-bootstrap';
const csp = `sandbox allow-scripts allow-same-origin allow-forms;default-src 'none';script-src 'self' blob: 'nonce-${nonce}' 'unsafe-eval';connect-src 'self';img-src 'self' blob: data:;style-src 'unsafe-inline';frame-src 'self';worker-src 'self'`;
const compiled = await build({
  stdin: {
    contents: `import {prepareWindowRealm} from './src/runtime/contexts/window-realm.ts';const prepared=prepareWindowRealm({application:'native-svg-app',applicationURL:${JSON.stringify(origin + '/child')},scriptNonce:${JSON.stringify(nonce)}});prepared.admitContent({scripts: [${JSON.stringify(origin + '/helper.js')}],installationGeneration:'fixture-generation',aliases:[[${JSON.stringify(origin + '/resource')},${JSON.stringify(origin + '/resource')}],[${JSON.stringify(origin + '/helper.js')},${JSON.stringify(origin + '/helper.js')}]],source:${JSON.stringify(origin + '/child')}});Object.defineProperty(window,'__commonPreparation',{value:true});`,
    resolveDir: process.cwd(),
  },
  banner: { js: '"use strict";' },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
});
const preparation = compiled.outputFiles[0].text;
const script = `window.__firstPublisher={prepared:!!window.__commonPreparation,storagePrivate:localStorage.getItem('other-app-private-key'),frozenArray:Object.isFrozen(Array.prototype)};fetch(${JSON.stringify(origin + '/resource')}).then(r=>r.json()).then(value=>window.__committedResource=value);`;
const html = `<!doctype html><script src="/helper.js"></script><script nonce="${nonce}">${script}</script><body><p>HTML document</p>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><script href="${origin}/helper.js"/><script nonce="${nonce}"><![CDATA[${script}]]></script><rect id="shape" width="40" height="30" fill="red"/></svg>`;
const sw = `self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.pathname==='/child'){e.respondWith((async()=>{await new Promise(r=>setTimeout(r,200));return new Response(u.searchParams.get('kind')==='svg'?${JSON.stringify(svg)}:${JSON.stringify(html)},{headers:{'Content-Type':u.searchParams.get('kind')==='svg'?'image/svg+xml':'text/html','Content-Security-Policy':${JSON.stringify(csp)},'Origin-Agent-Cluster':'?1','Cross-Origin-Opener-Policy':'same-origin'}})})());return}if(u.pathname==='/resource'){e.respondWith(new Response(JSON.stringify({controlled:true,clientId:e.clientId}),{headers:{'Content-Type':'application/json'}}));return}if(u.pathname==='/helper.js'){e.respondWith(new Response('window.__externalAtCommit=true',{headers:{'Content-Type':'text/javascript'}}));return}e.respondWith(fetch(e.request))})`;
const traffic: { port: number; path: string }[] = [];
const server = http.createServer((request, response) => {
  const path = request.url || '/';
  traffic.push({ port: 4332, path });
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', csp);
  response.setHeader('Origin-Agent-Cluster', '?1');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Content-Type', 'text/html');
  if (path === '/sw.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(sw);
    return;
  }
  response.end('<!doctype html><title>Native SVG platform</title><body>');
});
const receiver = http.createServer((request, response) => {
  traffic.push({ port: 4333, path: request.url || '/' });
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.end('Unrestricted control');
});
await Promise.all(
  [server, receiver].map(
    (server, index) =>
      new Promise<void>((resolve) => server.listen(4332 + index, '127.0.0.1', resolve)),
  ),
);
const results = [];
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      for (const kind of ['html', 'svg'])
        for (const strict of [false, true]) {
          const context = await browser.newContext();
          const page = await context.newPage();
          page.on('pageerror', (error) =>
            console.log('PAGE ERROR', name, kind, strict, error.message),
          );
          page.on('console', (message) => {
            if (message.type() === 'error')
              console.log('CONSOLE ERROR', name, kind, strict, message.text());
          });
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
          const start = traffic.length;
          const value = await page.evaluate(
            async ({ kind, strict, preparation, nonce, origin }) => {
              localStorage.setItem('other-app-private-key', 'private-value');
              const frame = document.createElement('iframe');
              frame.style.cssText = 'width:100px;height:80px';
              frame.src = origin + '/child?kind=' + kind;
              const loaded = new Promise<void>((resolve) => {
                frame.addEventListener('load', () => resolve(), { once: true });
                setTimeout(resolve, 4000);
              });
              document.body.append(frame);
              const child = frame.contentWindow!;
              const initialDocument = child.document;
              const containerGetter = Object.getOwnPropertyDescriptor(
                child.Navigator.prototype,
                'serviceWorker',
              )!.get!;
              const rawFetch = child.fetch;
              const rawCreate = child.document.createElement;
              const rawAppend = child.Element.prototype.append;
              const nativeStorageMethod = child.Storage.prototype.getItem;
              if (strict) {
                const meta = Reflect.apply(rawCreate, initialDocument, ['meta']);
                meta.httpEquiv = 'Content-Security-Policy';
                meta.content = `default-src 'none';script-src blob: 'nonce-${nonce}' 'unsafe-eval';connect-src blob: data:;img-src blob: data:;style-src 'unsafe-inline';frame-src 'none'`;
                Reflect.apply(rawAppend, initialDocument.head, [meta]);
              }
              const bootstrap = Reflect.apply(rawCreate, initialDocument, ['script']);
              bootstrap.nonce = nonce;
              bootstrap.textContent = preparation;
              Reflect.apply(rawAppend, initialDocument.head, [bootstrap]);
              const preparedBefore = !!Reflect.get(child, '__commonPreparation');
              const array = child.Array,
                fn = child.Function;
              const scopedStorageMethod = child.Storage.prototype.getItem;
              const initialResource = await Reflect.apply(rawFetch, child, [
                origin + '/resource?pending',
              ])
                .then((r: Response) => r.text())
                .then(
                  (value) => ({ ok: true, value }),
                  (error) => ({ ok: false, error: String(error) }),
                );
              const image = Reflect.apply(rawCreate, initialDocument, ['img']);
              image.src = origin + '/pending-image';
              Reflect.apply(rawAppend, initialDocument.body, [image]);
              initialDocument.body.style.backgroundImage = `url(${origin}/pending-css)`;
              await loaded;
              for (let i = 0; i < 200 && !Reflect.get(child, '__committedResource'); i++)
                await new Promise((resolve) => setTimeout(resolve, 10));
              const committedDocument = frame.contentDocument!;
              const shape = committedDocument.querySelector('#shape');
              const geometry = shape?.getBoundingClientRect();
              return {
                kind,
                strict,
                preparedBefore,
                initialResource,
                arrayRetained: child.Array === array,
                functionRetained: child.Function === fn,
                documentReplaced: committedDocument !== initialDocument,
                preparedAfter: !!Reflect.get(child, '__commonPreparation'),
                storageWrapperRetained:
                  child.Storage.prototype.getItem === scopedStorageMethod,
                storageWasWrapped: scopedStorageMethod !== nativeStorageMethod,
                privateStorage: child.localStorage.getItem('other-app-private-key'),
                controller: !!Reflect.apply(containerGetter, child.navigator, [])
                  .controller,
                firstPublisher: Reflect.get(child, '__firstPublisher'),
                resource: Reflect.get(child, '__committedResource'),
                externalAtCommit: !!Reflect.get(child, '__externalAtCommit'),
                contentType: committedDocument.contentType,
                namespace: committedDocument.documentElement.namespaceURI,
                getSVGDocument:
                  kind === 'svg' ? frame.getSVGDocument() === committedDocument : null,
                svgWidth: geometry?.width,
                svgHeight: geometry?.height,
              };
            },
            { kind, strict, preparation, nonce, origin },
          );
          const requests = traffic.slice(start);
          results.push({ browser: name, version: browser.version(), ...value, requests });
          console.log(name, kind, strict, JSON.stringify(value));
          await context.close();
        }
    } finally {
      await browser.close();
    }
  }
} finally {
  await Promise.all(
    [server, receiver].map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
}
await mkdir('results/contexts', { recursive: true });
await writeFile(
  'results/contexts/document-native-svg.json',
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
for (const result of results) {
  assert.equal(result.preparedBefore, true);
  assert.equal(result.preparedAfter, true);
  assert.equal(result.arrayRetained, true);
  assert.equal(result.functionRetained, true);
  assert.equal(result.storageWrapperRetained, true);
  assert.equal(result.privateStorage, null);
  assert.equal(result.resource?.controlled, true);
  assert.equal(result.controller, true);
  assert.equal(result.externalAtCommit, true);
  if (result.strict) {
    assert.equal(result.initialResource.ok, false);
    assert(
      !result.requests.some(
        (r) => r.path.startsWith('/pending-') || r.path === '/resource?pending',
      ),
    );
  }
  if (!result.strict) {
    assert.equal(result.initialResource.ok, true);
    assert(result.requests.some((r) => r.path === '/pending-image'));
    assert(result.requests.some((r) => r.path === '/pending-css'));
  }
  assert.deepEqual(result.firstPublisher, {
    prepared: true,
    storagePrivate: null,
    frozenArray: true,
  });
  if (result.kind === 'svg') {
    assert.equal(result.contentType, 'image/svg+xml');
    assert.equal(result.namespace, 'http://www.w3.org/2000/svg');
    assert.equal(result.getSVGDocument, true);
    assert.equal(result.svgWidth, 40);
    assert.equal(result.svgHeight, 30);
  }
}
