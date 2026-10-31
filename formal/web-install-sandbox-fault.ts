import { fixtureControllerMessages } from './fixtures/controller-messages.ts';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import http from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { trustedPolicyPlugin } from '../scripts/trusted-policy.ts';
import { response } from '../src/runtime/response-policy.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = await build({
  absWorkingDir: root,
  stdin: {
    resolveDir: root,
    loader: 'ts',
    contents: `
      import { prepareWindowRealm } from './src/runtime/contexts/window-realm.ts';
      const applicationURL = location.origin + location.pathname;
      const realm = prepareWindowRealm({
        application:'web-install-probe', applicationURL,
        scriptNonce:'fixture', enableDocumentContexts:true,
      });
      realm.admitContent({installationGeneration:'generation', aliases:[], source:applicationURL});
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

  const setup = new Set(['/app/native', '/app/prepared/', '/app/fault/', '/app/fixture.js']);
  self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    events.push({url:url.href, method:event.request.method});
    if (url.pathname === '/app/events' && !url.search) {
      event.respondWith(new Response(JSON.stringify(events))); return;
    }
    const allowed = setup.has(url.pathname) && !url.search && event.request.method === 'GET';
    event.respondWith(allowed ? fetch(event.request) : new Response('SW blocked',{status:403}));
  });
`;
const traffic = [];
let origin;
const server = http.createServer(async (request, reply) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  traffic.push({
    at: new Date().toISOString(),
    url: request.url,
    method: request.method,
    body,
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
  if (request.url === '/app/prepared/' || request.url === '/app/fault/') {
    for (const [name, value] of response('', 'text/html', 200, {
      scriptNonce: 'fixture',
      controllerSource: origin + '/app/sw.js',
      workerSource: origin + '/__contexts/',
      frameSource: origin + '/__contexts/',
    }).headers) {
      if (request.url === '/app/fault/' && name === 'content-security-policy') {
        const directive = 'sandbox allow-scripts allow-same-origin allow-forms; ';
        assert.equal(value.split(directive).length, 2, 'Sandbox mutation anchor changed');
        reply.setHeader(name, value.replace(directive, ''));
      } else reply.setHeader(name, value);
    }
    reply.end('<!doctype html><script nonce="fixture" src="/app/fixture.js"></script>');
    return;
  }
  if (request.url.startsWith('/manifest?')) {
    reply.setHeader('Content-Type', 'application/manifest+json');
    reply.end('{}');
    return;
  }
  reply.setHeader('Content-Type', 'text/html');
  reply.end('<!doctype html><title>Web Install observer</title>');
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
  scope:
    'Test-only response mutation removes exactly the CSP sandbox directive. Experimental Web Install APIs use a same-origin native manifest receiver; invalid manifests prevent installation. Other runtime preparation and response policy remain in place.',
  specification:
    'https://github.com/WICG/install-element/blob/8645e61de5af0fadde87db75c99028461585a8a4/index.html',
  implementationIDL:
    'https://github.com/chromium/chromium/blob/153.0.8010.12/third_party/blink/renderer/modules/web_install/navigator_web_install.idl',
  runnerSHA256: createHash('sha256')
    .update(await readFile(fileURLToPath(import.meta.url)))
    .digest('hex'),
  fixtureSHA256: createHash('sha256')
    .update(fixture.outputFiles[0].contents)
    .digest('hex'),
  mutation:
    'Test-only response removes exactly the generated CSP sandbox directive; source and every other response header are unchanged.',
  sourceHashes: Object.fromEntries(
    await Promise.all(
      [
        'formal/fixtures/controller-messages.ts',
        'src/runtime/response-policy.ts',
        'src/runtime/contexts/window-realm.ts',
        'src/runtime/enforcement/effects.ts',
      ].map(async (path) => [
        path,
        createHash('sha256')
          .update(await readFile(join(root, path)))
          .digest('hex'),
      ]),
    ),
  ),
  rows: [],
  traffic,
};
const temporary = await mkdtemp(join(tmpdir(), 'pf-web-install-'));
let context;
try {
  const defaultBrowser = await chromium.launch({
    executablePath: chromium.executablePath(),
  });
  try {
    const page = await defaultBrowser.newPage();
    await page.goto(origin + '/native');
    receipt.defaultAvailability = await page.evaluate(() => ({
      install: typeof navigator.install,
      element: typeof HTMLInstallElement,
      created: document.createElement('install').constructor.name,
      secure: isSecureContext,
    }));
    receipt.version = defaultBrowser.version();
  } finally {
    await defaultBrowser.close();
  }
  context = await chromium.launchPersistentContext(temporary, {
    executablePath: chromium.executablePath(),
    args: [
      '--enable-features=WebAppInstallation',
      '--enable-blink-features=InstallElement',
      '--enable-automation',
    ],
    ignoreDefaultArgs: ['--disable-background-networking'],
  });
  const observer = await context.newPage();
  await observer.goto(origin + '/native');
  receipt.actualArguments = (
    await (await context.newCDPSession(observer)).send('Browser.getBrowserCommandLine')
  ).arguments;
  for (const profile of ['native', 'native-worker', 'prepared', 'fault']) {
    if (profile === 'native-worker')
      await observer.evaluate(async () => {
        const registration = await navigator.serviceWorker.register('/app/sw.js');
        const worker =
          registration.installing || registration.waiting || registration.active;
        if (worker.state !== 'activated')
          await new Promise((resolve) =>
            worker.addEventListener('statechange', () => {
              if (worker.state === 'activated') resolve();
            }),
          );
      });
    for (const entry of ['imperative', 'declarative']) {
      const page = await context.newPage();
      const navigation = await page.goto(
        origin +
          (profile === 'fault'
            ? '/app/fault/'
            : profile === 'prepared'
              ? '/app/prepared/'
              : profile === 'native-worker'
                ? '/app/native'
                : '/native'),
      );
      if (profile === 'prepared' || profile === 'fault')
        await page.waitForFunction(() => globalThis.prepared);
      if (profile === 'prepared' || profile === 'fault')
        assert.equal(
          await page.evaluate(() => globalThis.privacyHost?.mode),
          'network-isolated',
        );
      const marker = profile + '-' + entry + '-' + randomUUID();
      const manifest = origin + '/manifest?' + marker;
      const start = traffic.length;
      let state;
      if (entry === 'imperative') {
        const session = await context.newCDPSession(page);
        const result = await session.send('Runtime.evaluate', {
          expression: `navigator.install({manifest:${JSON.stringify(manifest)}}).then(()=>({result:'installed'}),error=>({error:error.name,message:error.message}))`,
          userGesture: true,
          awaitPromise: true,
          returnByValue: true,
        });
        state = result.result.value || result.exceptionDetails;
      } else {
        state = await page.evaluate((manifest) => {
          try {
            const element = document.createElement('install');
            element.id = 'install-control';
            element.setAttribute('manifest', manifest);
            element.addEventListener('error', () => (globalThis.installEvent = 'error'));
            element.addEventListener(
              'success',
              () => (globalThis.installEvent = 'success'),
            );
            document.body.append(element);
            return { created: element.constructor.name };
          } catch (error) {
            return { error: error.name, message: error.message };
          }
        }, manifest);
        if (!state.error) {
          await page.waitForTimeout(1000);
          state.beforeClick = await page.evaluate(() => {
            const element = document.getElementById('install-control');
            return {
              valid: element.isValid,
              invalidReason: element.invalidReason,
              width: element.getBoundingClientRect().width,
              height: element.getBoundingClientRect().height,
            };
          });
          assert(
            !traffic
              .slice(start)
              .some((request) => JSON.stringify(request).includes(marker)),
            'Manifest fetched before activation',
          );
          await page.locator('#install-control').click({ force: true });
          await page.waitForTimeout(1000);
          state.event = await page.evaluate(() => globalThis.installEvent || null);
        }
      }
      if (profile !== 'prepared') {
        const deadline = Date.now() + 10000;
        while (!traffic.slice(start).some((request) => request.url.includes(marker))) {
          assert(Date.now() < deadline, 'Native manifest control inactive: ' + entry);
          await page.waitForTimeout(100);
        }
      }
      await page.waitForTimeout(300);
      const markerTraffic = traffic
        .slice(start)
        .filter((request) => JSON.stringify(request).includes(marker));
      const headers = await navigation.allHeaders();
      if (profile === 'fault') {
        assert(!headers['content-security-policy'].includes('sandbox '));
        assert(headers['content-security-policy'].includes("manifest-src 'self'"));
        assert(headers['content-security-policy'].includes("connect-src 'self'"));
        assert.equal(
          headers['connection-allowlist'],
          '(response-origin); redirects=block; webrtc=block',
        );
      }
      const row = {
        profile,
        entry,
        marker,
        state,
        headers,
        markerTraffic,
      };
      receipt.rows.push(row);
      console.log(JSON.stringify(row));
      if (entry === 'imperative' && profile !== 'prepared')
        assert(
          markerTraffic.some((request) => request.method === 'GET'),
          'Native manifest control inactive',
        );
      if (profile === 'prepared' && entry === 'imperative')
        assert.equal(state.error, 'SecurityError');
      if (profile === 'prepared' && entry === 'declarative') {
        assert.equal(state.beforeClick.valid, false);
        assert.equal(state.beforeClick.invalidReason, 'illegal_sandbox');
      }
      if (profile === 'prepared')
        assert.equal(
          markerTraffic.length,
          0,
          'Prepared manifest marker reached receiver',
        );
      await page.close();
    }
  }
  await observer.goto(origin + '/app/native');
  receipt.workerEvents = await observer.evaluate(async () =>
    (await fetch('/app/events')).json(),
  );
  assert(
    receipt.workerEvents.some((event) => new URL(event.url).pathname === '/app/fault/'),
    'Mutated page was not observed under the blocking worker',
  );
  const originalPolicy = receipt.rows.find((row) => row.profile === 'prepared').headers[
    'content-security-policy'
  ];
  for (const row of receipt.rows.filter((row) => row.profile === 'fault'))
    assert.equal(
      row.headers['content-security-policy'],
      originalPolicy.replace('sandbox allow-scripts allow-same-origin allow-forms; ', ''),
      'Fault changed more than the sandbox directive',
    );
  for (const row of receipt.rows.filter(
    (row) => row.profile === 'native-worker' || row.profile === 'fault',
  ))
    assert(
      !receipt.workerEvents.some((event) => event.url.includes(row.marker)),
      'Manifest native control unexpectedly observed by worker',
    );
  for (const row of receipt.rows.filter((row) => row.profile === 'prepared'))
    assert(!traffic.some((request) => JSON.stringify(request).includes(row.marker)));
  receipt.completed = true;
} finally {
  await context?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await writeFile(
    new URL('evidence/web-install-sandbox-fault.json', import.meta.url),
    JSON.stringify(receipt, null, 2) + '\n',
  );
  await rm(temporary, { recursive: true, force: true });
}
