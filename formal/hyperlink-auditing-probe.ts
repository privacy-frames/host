import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import http from 'node:http';
import fs from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { build } from 'esbuild';
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
      const realm = prepareWindowRealm({
        application: 'ping-probe',
        applicationURL: location.origin + '/app/',
        scriptNonce: 'fixture',
        enableDocumentContexts: true,
      });
      realm.admitContent({
        installationGeneration: 'generation',
        aliases: [],
        source: location.origin + '/app/',
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
  const log = [];
  // The prepared realm uses message-based resource reads. This fixture admits
  // only its diagnostic log and supplies no publisher worker.
  self.addEventListener('message', event => {
    const packet = event.data;
    const port = event.ports[0];
    if (!port) return;
    if (packet?.type === 'privacy-installed-resource') {
      if (new URL(packet.url).pathname === '/events') {
        const body = new TextEncoder().encode(JSON.stringify(log)).buffer;
        port.postMessage({ok:true,value:{url:packet.url,status:200,statusText:'OK',
          headers:[['content-type','application/json']],body}}, [body]);
      } else port.postMessage({ok:false,error:'SW blocked'});
      port.close();
    }
    if (packet?.type === 'privacy-publisher-rpc' && packet.operation === 'status') {
      port.postMessage({ok:true,value:null});
      port.close();
    }
  });
  self.addEventListener('fetch', event => {
    const path = new URL(event.request.url).pathname;
    log.push({
      url: event.request.url,
      method: event.request.method,
      destination: event.request.destination,
    });
    const result = path === '/events'
      ? new Response(JSON.stringify(log))
      : ['/', '/app/', '/fixture.js'].includes(path)
        ? fetch(event.request)
        : new Response('SW blocked', { status: 403 });
    event.respondWith(result);
  });
`;
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  traffic.push({
    url: req.url,
    method: req.method,
    body,
    pingFrom: req.headers['ping-from'],
    pingTo: req.headers['ping-to'],
  });
  if (req.url === '/sw.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(sw);
  } else if (req.url === '/fixture.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(fixture.outputFiles[0].text);
  } else if (req.url.startsWith('/ping')) res.end('receiver');
  else {
    if (req.url === '/app/') {
      for (const [k, v] of response('', 'text/html', 200, {
        scriptNonce: 'fixture',
        workerSource: origin + '/__contexts/',
        controllerSource: origin + '/sw.js',
        frameSource: origin + '/__contexts/',
      }).headers)
        res.setHeader(k, v);
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(
      '<!doctype html><body>' +
        (req.url === '/app/'
          ? '<script src="/fixture.js" nonce="fixture"></script>'
          : ''),
    );
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
origin = 'http://127.0.0.1:' + server.address().port;
const receipt = {
  origin,
  testedAt: new Date().toISOString(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  runnerSHA256: createHash('sha256')
    .update(await fs.readFile(fileURLToPath(import.meta.url)))
    .digest('hex'),
  fixtureSHA256: createHash('sha256')
    .update(fixture.outputFiles[0].contents)
    .digest('hex'),
  sourceHashes: Object.fromEntries(
    await Promise.all(
      [
        'src/runtime/response-policy.ts',
        'src/runtime/enforcement/effects.ts',
        'src/runtime/contexts/window-realm.ts',
        'scripts/trusted-policy.ts',
      ].map(async (path) => [
        path,
        createHash('sha256')
          .update(await fs.readFile(join(root, path)))
          .digest('hex'),
      ]),
    ),
  ),
  scope:
    'Same-origin programmatic a/area hyperlink auditing, actual prepareWindowRealm and generated policy plus independent fixture service worker that blocks unknown requests. Native controls calibrate HTTP POST PING; Firefox enabled profile explicitly changes browser preference. Not a complete installed-app controller/lifecycle or Reporting API test.',
  rows: [],
  traffic,
};
try {
  for (const [name, engine, options] of [
    ['chromium', chromium, {}],
    ['firefox-default', firefox, {}],
    [
      'firefox-ping-enabled',
      firefox,
      {
        firefoxUserPrefs: {
          'browser.send_pings': true,
          'browser.send_pings.require_same_host': false,
        },
      },
    ],
  ]) {
    const browser = await engine.launch(options);
    try {
      const page = await browser.newPage();
      for (const phase of ['native', 'SW', 'prepared']) {
        if (phase === 'SW') {
          await page.evaluate(async () => {
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller)
              await new Promise((r) =>
                navigator.serviceWorker.addEventListener('controllerchange', r, {
                  once: true,
                }),
              );
          });
        }
        await page.goto(origin + (phase === 'prepared' ? '/app/' : '/'));
        if (phase === 'prepared') await page.waitForFunction(() => globalThis.prepared);
        for (const tag of ['a', 'area']) {
          const marker = name + '-' + phase + '-' + tag;
          const start = traffic.length;
          const result = await page.evaluate(
            async ({ tag, marker }) => {
              const a = document.createElement(tag);
              a.href = '#' + marker;
              a.ping = location.origin + '/ping?marker=' + marker;
              document.body.append(a);
              a.click();
              await new Promise((r) => setTimeout(r, 350));
              const r = {
                url: location.href,
                ping: a.getAttribute('ping'),
                mode: globalThis.privacyHost?.mode,
              };
              a.remove();
              return r;
            },
            { tag, marker },
          );
          const observed = traffic.slice(start);
          const markerTraffic = observed.filter((item) => item.url.includes(marker));
          const calibrated = name !== 'firefox-default';
          if (phase === 'native' && calibrated) {
            assert(
              markerTraffic.some(
                (item) => item.method === 'POST' && item.body === 'PING',
              ),
              'Native ping receiver control inactive',
            );
          } else if (phase !== 'native') {
            assert.deepEqual(markerTraffic, []);
          }
          if (phase === 'prepared') assert.equal(result.mode, 'network-isolated');
          receipt.rows.push({
            browser: name,
            version: browser.version(),
            phase,
            tag,
            result,
            observed,
          });
          console.log(JSON.stringify(receipt.rows.at(-1)));
        }
        if (phase !== 'native') {
          const events = await page.evaluate(
            async () => await (await fetch('/events')).json(),
          );
          if (name !== 'firefox-default')
            for (const tag of ['a', 'area'])
              assert(
                events.some(
                  (event) =>
                    event.url.includes(name + '-' + phase + '-' + tag) &&
                    event.method === 'POST',
                ),
                'Auditing request did not pass through service worker',
              );
          receipt.rows.push({ browser: name, phase, events });
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.mkdir(join(root, 'formal/evidence'), { recursive: true });
  await fs.writeFile(
    join(root, 'formal/evidence/hyperlink-auditing.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  );
}
