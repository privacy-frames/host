import { fixtureControllerMessages } from './fixtures/controller-messages.ts';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';
import { trustedPolicyPlugin } from '../scripts/trusted-policy.ts';
import { response } from '../src/runtime/response-policy.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const traffic = [];
let origin;
const fixture = await build({
  absWorkingDir: root,
  stdin: {
    resolveDir: root,
    loader: 'ts',
    contents: `
      import { prepareWindowRealm } from './src/runtime/contexts/window-realm.ts';

      const applicationURL = location.origin + location.pathname;
      const realm = prepareWindowRealm({
        application: 'report-probe',
        applicationURL,
        scriptNonce: 'fixture',
        enableDocumentContexts: true,
      });
      realm.admitContent({
        installationGeneration: 'generation',
        aliases: [],
        source: applicationURL,
      });
      globalThis.prepared = true;
    `,
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  plugins: [await trustedPolicyPlugin(root)],
});
// Only setup documents/scripts reach the network. Unknown application fetches,
// including a JavaScript attempt to POST a report, are refused by this worker.
const sw = `
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
  const log = [];
${fixtureControllerMessages('log')}

  const setup = new Set([
    '/', '/native', '/native-SW', '/prepared/',
    '/prepared-reporting-control/', '/fixture.js',
  ]);

  self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    log.push({ url: url.href, method: request.method });
    if (url.pathname === '/events' && !url.search && request.method === 'GET') {
      event.respondWith(new Response(JSON.stringify(log)));
      return;
    }
    const allowed = setup.has(url.pathname) && !url.search && request.method === 'GET';
    event.respondWith(
      allowed ? fetch(request) : new Response('SW blocked', { status: 403 }),
    );
  });
`;
const server = http.createServer(async (request, reply) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  const url = new URL(request.url, 'http://fixture.invalid');
  traffic.push({
    url: request.url,
    method: request.method,
    body,
    type: request.headers['content-type'],
  });
  reply.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/sw.js') {
    reply.setHeader('Content-Type', 'text/javascript');
    reply.end(sw);
    return;
  }
  if (url.pathname === '/fixture.js') {
    reply.setHeader('Content-Type', 'text/javascript');
    reply.end(fixture.outputFiles[0].text);
    return;
  }
  if (url.pathname === '/report') {
    reply.writeHead(204);
    reply.end();
    return;
  }
  if (url.pathname.startsWith('/prepared')) {
    const headers = response('', 'text/html', 200, {
      scriptNonce: 'fixture',
      workerSource: origin + '/__contexts/',
      controllerSource: origin + '/sw.js',
      frameSource: origin + '/__contexts/',
    }).headers;
    for (const [name, value] of headers) reply.setHeader(name, value);
    // Adverse control only: production does not emit this reporting directive.
    if (url.pathname === '/prepared-reporting-control/')
      reply.setHeader(
        'Content-Security-Policy',
        headers.get('Content-Security-Policy') +
          '; report-uri /report?profile=prepared-reporting-control',
      );
  } else if (url.pathname.startsWith('/native'))
    reply.setHeader(
      'Content-Security-Policy',
      "img-src 'none'; report-uri /report?profile=" + url.pathname.slice(1),
    );
  reply.setHeader('Content-Type', 'text/html');
  reply.end(
    '<!doctype html><body>' +
      (url.pathname.startsWith('/prepared')
        ? '<script src="/fixture.js" nonce="fixture"></script>'
        : ''),
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
origin = 'http://127.0.0.1:' + server.address().port;
const receipt = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  testedAt: new Date().toISOString(),
  origin,
  runnerSHA256: createHash('sha256')
    .update(await readFile(fileURLToPath(import.meta.url)))
    .digest('hex'),
  fixtureSHA256: createHash('sha256')
    .update(fixture.outputFiles[0].contents)
    .digest('hex'),
  policySourceSHA256: createHash('sha256')
    .update(await readFile(join(root, 'src/runtime/response-policy.ts')))
    .digest('hex'),
  sourceHashes: Object.fromEntries(
    await Promise.all(
      [
        'formal/fixtures/controller-messages.ts',
        'src/runtime/contexts/window-realm.ts',
        'src/runtime/publisher/controller.ts',
        'src/runtime/enforcement/native-markup.ts',
        'src/shared/markup.ts',
      ].map(async (path) => [
        path,
        createHash('sha256')
          .update(await readFile(join(root, path)))
          .digest('hex'),
      ]),
    ),
  ),
  scope:
    'Legacy CSP report-uri, native positive controls and actual prepareWindowRealm. Reporting endpoint is injected only into adverse control responses, never production. Fixture SW refuses unknown application fetches; HTTP observer independently receives native reports. Modern Reporting API and NEL are not qualified by this fixture.',
  rows: [],
  traffic,
};
try {
  for (const [name, engine] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      page.on('console', (message) => console.log('BROWSER', name, message.text()));
      for (const profile of [
        'native',
        'native-SW',
        'prepared',
        'prepared-reporting-control',
      ]) {
        if (profile === 'native-SW') {
          await page.evaluate(async () => {
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller)
              await new Promise((resolve) =>
                navigator.serviceWorker.addEventListener('controllerchange', resolve, {
                  once: true,
                }),
              );
          });
        }
        const navigation = await page.goto(
          origin + '/' + profile + (profile.startsWith('prepared') ? '/' : ''),
        );
        const headers = await navigation.allHeaders();
        if (profile.startsWith('prepared'))
          await page.waitForFunction(() => globalThis.prepared);
        const marker = 'private-marker-' + name + '-' + profile.toLowerCase();
        const start = traffic.length;
        const state = await page.evaluate(
          async ({ marker, prepared }) => {
            const state = {
              mode: globalThis.privacyHost?.mode,
              ordinaryFetch: null,
              meta: null,
            };
            if (prepared) {
              try {
                state.ordinaryFetch = await (
                  await fetch('/unknown-local?' + marker)
                ).text();
              } catch (error) {
                state.ordinaryFetch = error.name;
              }
            }
            const image = new Image();
            image.src = 'https://' + marker + '.invalid/payload';
            document.body.append(image);
            if (prepared) {
              try {
                const meta = document.createElement('meta');
                meta.httpEquiv = 'Content-Security-Policy';
                meta.content =
                  "img-src 'none'; report-uri /report?profile=application-selected";
                document.head.append(meta);
                state.meta = meta.isConnected ? 'inserted' : 'not connected';
              } catch (error) {
                state.meta = error.name;
              }
            }
            return state;
          },
          { marker, prepared: profile.startsWith('prepared') },
        );
        const expectsReport =
          profile === 'native' || (name === 'firefox' && profile !== 'prepared');
        if (expectsReport) {
          const deadline = Date.now() + 5000;
          while (
            !traffic
              .slice(start)
              .some(
                (item) => item.url.startsWith('/report') && item.body.includes(marker),
              ) &&
            Date.now() < deadline
          )
            await page.waitForTimeout(50);
        } else await page.waitForTimeout(500);
        const observed = traffic.slice(start);
        const reports = observed.filter(
          (item) => item.url.startsWith('/report') && item.body.includes(marker),
        );
        if (expectsReport) {
          assert(
            reports.some(
              (item) => item.method === 'POST' && item.type === 'application/csp-report',
            ),
            'Native CSP report receiver control inactive',
          );
        } else assert.deepEqual(reports, []);
        if (profile.startsWith('prepared')) {
          assert.equal(state.mode, 'network-isolated');
          assert.equal(state.ordinaryFetch, 'TypeError');
          assert.equal(state.meta, 'SecurityError');
          assert(!observed.some((item) => item.url.includes('unknown-local')));
        }
        let events = [];
        if (profile !== 'native') {
          events = await page.evaluate(async () => await (await fetch('/events')).json());
          if (profile !== 'prepared' && name === 'chromium')
            assert(
              events.some(
                (event) =>
                  new URL(event.url).pathname === '/report' &&
                  new URL(event.url).searchParams.get('profile') === profile &&
                  event.method === 'POST',
              ),
              'Expected service-worker interception of the legacy CSP report',
            );
          if (profile !== 'prepared' && name === 'firefox')
            assert(
              !events.some(
                (event) =>
                  new URL(event.url).pathname === '/report' &&
                  new URL(event.url).searchParams.get('profile') === profile,
              ),
              'Firefox native report unexpectedly passed through the worker',
            );
        }
        receipt.rows.push({
          browser: name,
          version: browser.version(),
          profile,
          marker,
          headers,
          state,
          observed,
          reports,
          events,
        });
        console.log(JSON.stringify(receipt.rows.at(-1)));
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await mkdir(join(root, 'formal/evidence'), { recursive: true });
  await writeFile(
    join(root, 'formal/evidence/reporting.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  );
}
