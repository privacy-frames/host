import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';
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
    const realm = prepareWindowRealm({ application: 'effect-probe',
      applicationURL: location.origin + '/app/', scriptNonce: 'fixture',
      enableDocumentContexts: true });
    realm.admitContent({ installationGeneration: 'generation', aliases: [],
      source: location.origin + '/app/' });
    globalThis.prepared = true;
  `,
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  plugins: [await trustedPolicyPlugin(root)],
});
const worker = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
const events = [];
self.addEventListener('message', event => {
  if (event.data?.type === 'privacy-publisher-rpc' && event.data.operation === 'status') {
    event.ports[0].postMessage({ok:true,value:null});
    event.ports[0].close();
  }
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  events.push({url: url.href, method: event.request.method});
  if (url.pathname === '/events') return event.respondWith(new Response(JSON.stringify(events)));
  if (['/controlled', '/app/', '/fixture.js'].includes(url.pathname) && !url.search)
    return event.respondWith(fetch(event.request));
  event.respondWith(new Response('blocked', {status: 403}));
});`;
const traffic: { url: string; method: string; body: string }[] = [];
let origin = '';
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  traffic.push({ url: req.url ?? '', method: req.method ?? '', body });
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/sw.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(worker);
  } else if (req.url === '/fixture.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(fixture.outputFiles[0].contents);
  } else if (req.url?.startsWith('/sse?')) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.end('data: connected\n\n');
  } else if (req.url?.startsWith('/beacon?')) res.end('received');
  else {
    if (req.url === '/app/') {
      for (const [key, value] of response('', 'text/html', 200, {
        scriptNonce: 'fixture',
        controllerSource: origin + '/sw.js',
        workerSource: origin + '/__contexts/',
        frameSource: origin + '/__contexts/',
      }).headers)
        res.setHeader(key, value);
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(
      '<!doctype html>' +
        (req.url === '/app/'
          ? '<script nonce="fixture" src="/fixture.js"></script>'
          : ''),
    );
  }
});
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
assert(address && typeof address !== 'string');
origin = `http://127.0.0.1:${address.port}`;
const sha = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const receipt = {
  scope:
    'Same-origin EventSource, sendBeacon and a Wasm-invoked JavaScript fetch in a prepared Window, with an independent receiver and a fixture service worker. Not installed-app lifecycle or worker coverage.',
  revision: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  runnerSHA256: sha(await readFile(fileURLToPath(import.meta.url))),
  bundleSHA256: sha(fixture.outputFiles[0].contents),
  sourceHashes: Object.fromEntries(
    await Promise.all(
      [
        'src/runtime/contexts/window-realm.ts',
        'src/runtime/enforcement/effects.ts',
        'src/runtime/response-policy.ts',
        'scripts/trusted-policy.ts',
        'package-lock.json',
      ].map(async (path) => [
        path,
        sha(await readFile(new URL('../' + path, import.meta.url))),
      ]),
    ),
  ),
  completed: false,
  browsers: [] as object[],
};
try {
  for (const engine of [chromium, firefox]) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const observer = await context.newPage();
      await page.goto(origin + '/native');
      const observations: object[] = [];
      for (const phase of ['native', 'worker', 'prepared']) {
        if (phase === 'worker') {
          await page.evaluate(async () => {
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
          });
          await page.goto(origin + '/controlled');
          assert(await page.evaluate(() => !!navigator.serviceWorker.controller));
          await observer.goto(origin + '/controlled');
        }
        if (phase === 'prepared') {
          await page.goto(origin + '/app/');
          await page.waitForFunction(() => Reflect.get(window, 'prepared') === true);
          const events = await observer.evaluate(
            async () => (await (await fetch('/events')).json()) as { url: string }[],
          );
          assert(events.some((item) => item.url.endsWith('/app/')));
        }
        for (const kind of ['eventsource', 'beacon', 'wasm']) {
          const marker = `${phase}-${kind}-${randomUUID()}`;
          const result = await page.evaluate(
            async ({ kind, marker }) => {
              try {
                if (kind === 'wasm') {
                  const bytes = new Uint8Array([
                    0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 2, 12, 1, 3, 101, 110,
                    118, 4, 115, 101, 110, 100, 0, 0, 3, 2, 1, 0, 7, 7, 1, 3, 114, 117,
                    110, 0, 1, 10, 6, 1, 4, 0, 16, 0, 11,
                  ]);
                  let request: Promise<Response> | undefined;
                  let invoked = false;
                  let synchronousError = '';
                  const module = await WebAssembly.instantiate(bytes, {
                    env: {
                      send: () => {
                        invoked = true;
                        try {
                          request = fetch('/beacon?' + marker, {
                            method: 'POST',
                            body: marker,
                          });
                        } catch (error) {
                          synchronousError =
                            error instanceof Error ? error.name : 'unknown';
                        }
                      },
                    },
                  });
                  (module.instance.exports.run as () => void)();
                  if (!invoked) throw new Error('Wasm import was not called');
                  if (!request) return { result: synchronousError, invoked };
                  try {
                    return { result: 'http-' + (await request).status, invoked };
                  } catch (error) {
                    return {
                      result: error instanceof Error ? error.name : 'unknown',
                      invoked,
                    };
                  }
                }
                if (kind === 'beacon')
                  return {
                    result: String(navigator.sendBeacon('/beacon?' + marker, marker)),
                  };
                return await new Promise<{ result: string }>((resolve) => {
                  const source = new EventSource('/sse?' + marker);
                  const timer = setTimeout(() => {
                    source.close();
                    resolve({ result: 'timeout' });
                  }, 5000);
                  source.onmessage = () => {
                    clearTimeout(timer);
                    source.close();
                    resolve({ result: 'message' });
                  };
                  source.onerror = () => {
                    clearTimeout(timer);
                    source.close();
                    resolve({ result: 'error' });
                  };
                });
              } catch (error) {
                return { result: error instanceof Error ? error.name : 'unknown' };
              }
            },
            { kind, marker },
          );
          if (kind === 'wasm') assert('invoked' in result && result.invoked === true);
          if (phase === 'native') {
            if (kind === 'beacon') assert.equal(result.result, 'true');
            else if (kind === 'wasm') assert.equal(result.result, 'http-200');
            else assert.equal(result.result, 'message');
            await page.waitForTimeout(300);
            const received = traffic.filter((item) => item.url.includes(marker));
            assert.equal(received.length, 1, `${engine.name()} native ${kind}`);
            if (kind === 'beacon' || kind === 'wasm') {
              assert.equal(received[0].method, 'POST');
              assert.equal(received[0].body, marker);
            }
          } else {
            await page.waitForTimeout(300);
            assert.equal(
              traffic.filter((item) => item.url.includes(marker)).length,
              0,
              `${engine.name()} ${phase} ${kind}`,
            );
            if (phase === 'prepared' && kind !== 'wasm')
              assert.equal(result.result, 'SecurityError');
            if (phase !== 'native' && kind === 'wasm')
              assert.notEqual(result.result, 'http-200');
            if (phase === 'worker') {
              const events = await page.evaluate(
                async () => (await (await fetch('/events')).json()) as { url: string }[],
              );
              assert(
                events.some((item) => item.url.includes(marker)),
                `${engine.name()} worker did not observe ${kind}`,
              );
            }
            if (phase === 'prepared' && kind === 'wasm') {
              const events = await observer.evaluate(
                async () => (await (await fetch('/events')).json()) as { url: string }[],
              );
              assert.equal(result.result, 'TypeError');
              assert.equal(
                events.some((item) => item.url.includes(marker)),
                false,
                'Prepared POST must fail locally before a native fetch event',
              );
            }
          }
          observations.push({
            phase,
            kind,
            marker,
            result,
            received: traffic.filter((item) => item.url.includes(marker)),
          });
        }
      }
      receipt.browsers.push({
        name: engine.name(),
        version: browser.version(),
        observations,
      });
      await context.close();
    } finally {
      await browser.close();
    }
  }
  receipt.completed = true;
  await writeFile(
    new URL('./evidence/eventsource-beacon.json', import.meta.url),
    JSON.stringify(receipt, null, 2) + '\n',
  );
  console.log(
    'EventSource, sendBeacon and Wasm-invoked fetch controls passed in Chromium and Firefox',
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
