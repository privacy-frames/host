import { fixtureControllerMessages } from './fixtures/controller-messages.ts';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID, X509Certificate } from 'node:crypto';
import https from 'node:https';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { trustedPolicyPlugin } from '../scripts/trusted-policy.ts';
import { response } from '../src/runtime/response-policy.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'pf-modern-reporting-'));
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    join(temporary, 'key.pem'),
    '-out',
    join(temporary, 'cert.pem'),
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=IP:127.0.0.1,DNS:localhost',
  ],
  { stdio: 'ignore' },
);
const cert = await readFile(join(temporary, 'cert.pem'));
const key = await readFile(join(temporary, 'key.pem'));
const pin = createHash('sha256')
  .update(
    new X509Certificate(cert).publicKey.export({
      type: 'spki',
      format: 'der',
    }),
  )
  .digest('base64');
const fixture = await build({
  absWorkingDir: root,
  stdin: {
    resolveDir: root,
    loader: 'ts',
    contents: `
      import { prepareWindowRealm } from './src/runtime/contexts/window-realm.ts';
      const applicationURL = location.origin + location.pathname;
      const realm = prepareWindowRealm({
        application: 'modern-report-probe', applicationURL,
        scriptNonce: 'fixture', enableDocumentContexts: true,
      });
      realm.admitContent({
        installationGeneration: 'generation', aliases: [], source: applicationURL,
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
const sw = `
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
  const events = [];
${fixtureControllerMessages('events')}

  const setup = new Set(['/app/', '/app/configured/', '/app/fixture.js']);
  self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    events.push({ url: url.href, method: event.request.method });
    if (url.pathname === '/app/events' && !url.search) {
      event.respondWith(new Response(JSON.stringify(events)));
      return;
    }
    const allowed = setup.has(url.pathname) && !url.search && event.request.method === 'GET';
    event.respondWith(allowed ? fetch(event.request) : new Response('SW blocked', {status: 403}));
  });
`;
const traffic = [];
const uploads = [];
let origin;
let collectorOrigin;
const collector = https.createServer({ key, cert }, async (request, reply) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  uploads.push({
    at: new Date().toISOString(),
    url: request.url,
    method: request.method,
    type: request.headers['content-type'],
    body,
  });
  reply.setHeader('Access-Control-Allow-Origin', origin);
  reply.setHeader('Access-Control-Allow-Headers', 'content-type');
  reply.writeHead(204);
  reply.end();
});
const server = https.createServer({ key, cert }, async (request, reply) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  traffic.push({
    at: new Date().toISOString(),
    url: request.url,
    method: request.method,
    type: request.headers['content-type'],
    body,
    referer: request.headers.referer,
  });
  reply.setHeader('Cache-Control', 'no-store');
  if (request.url === '/app/sw.js') {
    reply.setHeader('Content-Type', 'text/javascript');
    reply.end(sw);
    return;
  }
  if (request.url === '/app/fixture.js') {
    reply.setHeader('Content-Type', 'text/javascript');
    reply.end(fixture.outputFiles[0].text);
    return;
  }
  if (request.url === '/seed') {
    reply.setHeader(
      'Report-To',
      JSON.stringify({
        group: 'nel',
        max_age: 90,
        endpoints: [{ url: collectorOrigin + '/nel' }],
      }),
    );
    reply.setHeader(
      'NEL',
      JSON.stringify({
        report_to: 'nel',
        max_age: 90,
        success_fraction: 1,
        failure_fraction: 1,
      }),
    );
  }
  if (request.url === '/native-modern') {
    reply.setHeader('Content-Security-Policy', "img-src 'none'; report-to default");
    reply.setHeader('Reporting-Endpoints', 'default="' + collectorOrigin + '/modern"');
  }
  if (request.url === '/app/' || request.url === '/app/configured/') {
    const headers = response('', 'text/html', 200, {
      scriptNonce: 'fixture',
      workerSource: origin + '/__contexts/',
      controllerSource: origin + '/app/sw.js',
      frameSource: origin + '/__contexts/',
    }).headers;
    for (const [name, value] of headers) reply.setHeader(name, value);
    // Conditional trusted-header control only; production emits neither header.
    if (request.url === '/app/configured/') {
      reply.setHeader(
        'Content-Security-Policy',
        headers.get('Content-Security-Policy') + '; report-to default',
      );
      reply.setHeader(
        'Reporting-Endpoints',
        'default="' + collectorOrigin + '/configured"',
      );
    }
    reply.end(
      '<!doctype html><body><script nonce="fixture" src="/app/fixture.js"></script>',
    );
    return;
  }
  reply.setHeader('Content-Type', 'text/html');
  reply.end('<!doctype html><body>Native observer</body>');
});
await new Promise((resolve) => collector.listen(0, '127.0.0.1', resolve));
collectorOrigin = 'https://127.0.0.1:' + collector.address().port;
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
origin = 'https://127.0.0.1:' + server.address().port;
const receipt = {
  testedAt: new Date().toISOString(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  scope:
    'Full Chromium; actual prepareWindowRealm and generated production headers. NEL is deliberately seeded as prior origin state. Configured reporting is a trusted-header adverse control, not production configuration. Temporary HTTPS uses the WPT-style SPKI certificate exception. No claim about arbitrary deployment state or Firefox modern reporting.',
  origin,
  collectorOrigin,
  rows: [],
  traffic,
  uploads,
  runnerSHA256: createHash('sha256')
    .update(await readFile(fileURLToPath(import.meta.url)))
    .digest('hex'),
  fixtureSHA256: createHash('sha256')
    .update(fixture.outputFiles[0].contents)
    .digest('hex'),
  sourceHashes: Object.fromEntries(
    await Promise.all(
      [
        'formal/fixtures/controller-messages.ts',
        'src/runtime/response-policy.ts',
        'src/runtime/contexts/window-realm.ts',
      ].map(async (path) => [
        path,
        createHash('sha256')
          .update(await readFile(join(root, path)))
          .digest('hex'),
      ]),
    ),
  ),
};
let browser;
const waitForUpload = async (marker) => {
  const deadline = Date.now() + 15000;
  while (!uploads.some((item) => item.method === 'POST' && item.body.includes(marker))) {
    assert(Date.now() < deadline, 'No independent report upload for ' + marker);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};
try {
  browser = await chromium.launch({
    executablePath: chromium.executablePath(),
    ignoreDefaultArgs: ['--disable-background-networking'],
    args: [
      '--enable-automation',
      '--short-reporting-delay',
      '--ignore-certificate-errors-spki-list=' + pin,
    ],
  });
  receipt.version = browser.version();
  const context = await browser.newContext();
  const observer = await context.newPage();
  const session = await context.newCDPSession(observer);
  receipt.actualArguments = (
    await session.send('Browser.getBrowserCommandLine')
  ).arguments;
  assert(receipt.actualArguments[0].endsWith('/chrome'));
  assert(!receipt.actualArguments.includes('--disable-background-networking'));
  await observer.goto(origin + '/native-modern');
  const nativeModern = 'native-modern-' + randomUUID();
  await observer.evaluate((marker) => {
    const image = new Image();
    image.src = '/blocked?' + marker;
    document.body.append(image);
  }, nativeModern);
  await waitForUpload(nativeModern);
  receipt.rows.push({ profile: 'native-modern', marker: nativeModern, delivered: true });
  await observer.goto(origin + '/seed');
  const before = 'nel-before-' + randomUUID();
  await observer.evaluate((marker) => fetch('/native?' + marker), before);
  await waitForUpload(before);
  receipt.rows.push({ profile: 'native-NEL-before', marker: before, delivered: true });
  await observer.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/app/sw.js');
    const worker = registration.installing || registration.waiting || registration.active;
    if (worker.state !== 'activated')
      await new Promise((resolve) => {
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') resolve();
        });
      });
  });
  for (const configured of [false, true]) {
    const page = await context.newPage();
    const navigation = await page.goto(
      origin + (configured ? '/app/configured/' : '/app/'),
    );
    await page.waitForFunction(() => globalThis.prepared);
    const startTraffic = traffic.length;
    const startUploads = uploads.length;
    const marker = 'prepared-private-' + randomUUID();
    const state = await page.evaluate(async (marker) => {
      const results = { mode: globalThis.privacyHost?.mode, fetch: null, post: null };
      try {
        results.fetch = await (await fetch('/unknown?' + marker)).text();
      } catch (error) {
        results.fetch = error.name;
      }
      try {
        results.post = await (
          await fetch('/unknown-post', { method: 'POST', body: marker })
        ).text();
      } catch (error) {
        results.post = error.name;
      }
      const image = new Image();
      image.src = '/unknown-image?' + marker;
      document.body.append(image);
      const blocked = new Image();
      blocked.src = 'https://outside.invalid/' + marker;
      document.body.append(blocked);
      return results;
    }, marker);
    assert.equal(state.fetch, 'TypeError');
    assert.equal(state.post, 'TypeError');
    if (configured) await waitForUpload(marker);
    else await page.waitForTimeout(3000);
    const markerTraffic = traffic
      .slice(startTraffic)
      .filter((item) => JSON.stringify(item).includes(marker));
    const markerUploads = uploads
      .slice(startUploads)
      .filter((item) => JSON.stringify(item).includes(marker));
    const workerEvents = await page.evaluate(async () =>
      (await fetch('/app/events')).json(),
    );
    const row = {
      profile: configured ? 'prepared-configured-header' : 'prepared-production-headers',
      marker,
      state,
      headers: await navigation.allHeaders(),
      markerTraffic,
      markerUploads,
      workerEvents,
    };
    receipt.rows.push(row);
    console.log(JSON.stringify(row));
    assert.equal(markerTraffic.length, 0, 'App marker reached ordinary HTTP receiver');
    if (!configured)
      assert.equal(
        markerUploads.length,
        0,
        'App marker reached reporting collector with production headers',
      );
    else
      assert(
        markerUploads.some(
          (item) => item.url === '/configured' && item.method === 'POST',
        ),
      );
    await page.close();
  }
  const after = 'nel-after-' + randomUUID();
  await observer.evaluate((marker) => fetch('/native?' + marker), after);
  await waitForUpload(after);
  receipt.rows.push({ profile: 'native-NEL-after', marker: after, delivered: true });
  // Recheck after the final calibrated upload, not merely at the end of a timer.
  const production = receipt.rows.find(
    (row) => row.profile === 'prepared-production-headers',
  );
  const lateMarkerUploads = uploads.filter((item) =>
    JSON.stringify(item).includes(production.marker),
  );
  assert.equal(
    lateMarkerUploads.length,
    0,
    'Delayed production marker report reached collector',
  );
  receipt.productionMarkerUploadsAtCompletion = lateMarkerUploads;
  receipt.completed = true;
} finally {
  await browser?.close();
  for (const item of [server, collector]) {
    item.closeAllConnections();
    await new Promise((resolve) => item.close(resolve));
  }
  await mkdir(join(root, 'formal/evidence'), { recursive: true });
  await writeFile(
    join(root, 'formal/evidence/modern-reporting.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  );
  await rm(temporary, { recursive: true, force: true });
}
