import { SCRIPT_URL_CSP } from '../src/shared/script-url-policy.ts';
import http from 'node:http';
import assert from 'node:assert/strict';
import { build } from './build.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';
import { testProvenance } from './provenance.ts';
import type {} from './fixtures/inert-documents/guarded.ts';
const fixture = await build({
  entryPoints: ['test/fixtures/inert-documents/guarded.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  banner: { js: '"use strict";' },
});
let origin = '',
  receiverOrigin = '';
const traffic: string[] = [];
const receiverTraffic: string[] = [];
const service = `const log=[];addEventListener('install',e=>e.waitUntil(skipWaiting()));addEventListener('activate',e=>e.waitUntil(clients.claim()));addEventListener('fetch',e=>{log.push({url:e.request.url,clientId:e.clientId,destination:e.request.destination});e.respondWith(fetch(e.request))});addEventListener('message',e=>e.ports[0].postMessage({sourceId:e.source?.id,log}));`;
const server = http.createServer((request, response) => {
  traffic.push(request.url || '/');
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/sw.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(service);
    return;
  }
  if (request.url === '/fixture.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(fixture.outputFiles[0].contents);
    return;
  }
  if (request.url === '/local.svg') {
    response.setHeader('Content-Type', 'image/svg+xml');
    response.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
    return;
  }
  response.setHeader('Content-Type', 'text/html');
  if (request.url !== '/control')
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none';script-src 'self' 'unsafe-eval' 'nonce-inert-guard';connect-src 'self';img-src 'self';style-src 'unsafe-inline';worker-src 'self';frame-src 'self'; " +
        SCRIPT_URL_CSP,
    );
  response.end(
    '<!doctype html><title>Inert documents</title><body>' +
      (request.url === '/control' ? '' : '<script src="/fixture.js"></script>'),
  );
});
const receiver = http.createServer((request, response) => {
  receiverTraffic.push(request.url || '/');
  response.setHeader('Content-Type', 'image/svg+xml');
  response.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
});
for (const s of [server, receiver])
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
const a = server.address(),
  b = receiver.address();
if (!a || typeof a === 'string' || !b || typeof b === 'string')
  throw new Error('Probe address missing');
origin = 'http://127.0.0.1:' + a.port;
receiverOrigin = 'http://127.0.0.1:' + b.port;
const evidence = {
  provenance: await testProvenance(import.meta.url),
  browsers: [] as unknown[],
};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      const context = await browser.newContext(),
        page = await context.newPage();
      await page.goto(origin + '/control');
      await page.evaluate(async (receiver) => {
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
        const inert = document.implementation.createHTMLDocument('');
        inert.body.innerHTML = '<form></form><form></form>';
        if (inert.body.childNodes.length !== 2)
          throw new Error('Native forms control failed');
        const image = inert.createElement('img');
        image.src = receiver + '/working-adoption-control';
        inert.body.append(image);
        await new Promise((resolve) => setTimeout(resolve, 40));
        document.body.append(image);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }, receiverOrigin);
      assert(receiverTraffic.includes('/working-adoption-control'));
      receiverTraffic.length = 0;
      await page.goto(origin + '/guarded');
      const start = traffic.length;
      const result = await page.evaluate(
        (receiver) => window.runInertProbe(receiver),
        receiverOrigin,
      );
      assert(result.checks >= 40);
      assert.equal(result.insertions, 12);
      assert.deepEqual(receiverTraffic, []);
      assert(traffic.slice(start).includes('/local.svg'));
      evidence.browsers.push({
        name,
        version: browser.version(),
        result,
        receiverTraffic: [...receiverTraffic],
        traffic: traffic.slice(start),
      });
      console.log(name, JSON.stringify(result));
      await context.close();
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
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    'results/contexts/inert-documents.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
}
