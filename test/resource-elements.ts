import { SCRIPT_URL_CSP } from '../src/shared/script-url-policy.ts';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { build } from './build.ts';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';
import { testProvenance } from './provenance.ts';
import type {} from './fixtures/resource-elements/guarded.ts';
const bundle = await build({
  entryPoints: ['test/fixtures/resource-elements/guarded.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
});
const receiverTraffic: string[] = [];
const traffic: string[] = [];
const receiver = createServer((request, response) => {
  receiverTraffic.push(request.url || '/');
  response.setHeader('Content-Type', 'text/css');
  response.end('body{--control-proof:admitted}');
});
const server = createServer((request, response) => {
  traffic.push(request.url || '/');
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/fixture.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(bundle.outputFiles[0].text);
    return;
  }
  if (request.url === '/admitted.css') {
    response.setHeader('Content-Type', 'text/css');
    response.end('body{--resource-proof:admitted}');
    return;
  }
  if (request.url === '/admitted.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end('globalThis.preloadExecuted=true;');
    return;
  }
  response.setHeader('Content-Type', 'text/html');
  if (request.url === '/guarded')
    response.setHeader('Content-Security-Policy', SCRIPT_URL_CSP);
  response.end(
    "<!doctype html><meta http-equiv=\"Content-Security-Policy\" content=\"default-src * data: blob:;script-src 'self' 'unsafe-eval';style-src * 'unsafe-inline'\"><body>" +
      (request.url === '/guarded' ? '<script src="/fixture.js"></script>' : ''),
  );
});
for (const service of [server, receiver])
  await new Promise<void>((resolve) => service.listen(0, '127.0.0.1', resolve));
const address = server.address(),
  receiverAddress = receiver.address();
if (
  !address ||
  typeof address === 'string' ||
  !receiverAddress ||
  typeof receiverAddress === 'string'
)
  throw new Error('Fixture address missing');
const origin = `http://127.0.0.1:${address.port}`,
  receiverOrigin = `http://127.0.0.1:${receiverAddress.port}`;
const results = [];
const provenance = await testProvenance(import.meta.url);
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      const page = await browser.newPage();
      await page.goto(origin + '/control');
      await page.evaluate(async (receiver) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = receiver + '/working-control.css';
        await new Promise<void>((resolve, reject) => {
          link.onload = () => resolve();
          link.onerror = () => reject(new Error('Native control failed'));
          document.head.append(link);
        });
      }, receiverOrigin);
      assert(receiverTraffic.includes('/working-control.css'));
      receiverTraffic.length = 0;
      await page.goto(origin + '/guarded');
      const result = await page.evaluate(
        (receiver) => window.probeResourceElements(receiver),
        receiverOrigin,
      );
      assert(result.denied >= 24);
      assert.equal(result.styled, true);
      assert.equal(result.preloaded, true);
      assert.equal(result.preloadExecuted, false);
      assert(traffic.includes('/admitted.css'));
      assert(traffic.includes('/admitted.js'));
      assert.deepEqual(receiverTraffic, []);
      results.push({
        name,
        version: browser.version(),
        result,
        externalRequests: receiverTraffic.length,
      });
    } finally {
      await browser.close();
    }
  }
} finally {
  for (const service of [server, receiver])
    await new Promise<void>((resolve, reject) =>
      service.close((error) => (error ? reject(error) : resolve())),
    );
  await writeFile(
    'results/contexts/resource-elements.json',
    JSON.stringify({ provenance, browsers: results }, null, 2) + '\n',
  );
}
console.log(
  results
    .map(
      (result) =>
        `${result.name}: ${result.result.denied} resource-policy attempts denied; stylesheet admitted`,
    )
    .join('\n'),
);
