import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { build, type Plugin } from 'esbuild';
import { chromium, firefox } from 'playwright';
import { trustedPolicyPlugin } from '../scripts/trusted-policy.ts';
import { response } from '../src/runtime/response-policy.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const input = `
import {prepareWindowRealm} from './src/runtime/contexts/window-realm.ts';
const applicationURL=location.origin+location.pathname;
const realm=prepareWindowRealm({application:'preload-fault',applicationURL,scriptNonce:'fixture',enableDocumentContexts:true});
realm.admitContent({scripts: [],installationGeneration:'generation',aliases:[],source:applicationURL});
globalThis.prepared=true;`;
async function fixture(mutate: boolean) {
  let mutations = 0;
  const plugin: Plugin = {
    name: 'remove-navigation-cancellation',
    setup(builder) {
      builder.onLoad(
        { filter: /[/\\]enforcement[/\\]document-exit\.ts$/ },
        async ({ path }) => {
          const original = await readFile(path, 'utf8');
          const needle = 'apply(prevent, event, []);';
          assert.equal(
            original.split(needle).length,
            2,
            'navigation mutation anchor changed',
          );
          mutations++;
          return {
            contents: original.replace(needle, 'void event;'),
            loader: 'ts',
          };
        },
      );
    },
  };
  const result = await build({
    absWorkingDir: root,
    stdin: { resolveDir: root, loader: 'ts', contents: input },
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    plugins: [...(mutate ? [plugin] : []), await trustedPolicyPlugin(root)],
  });
  assert.equal(mutations, mutate ? 1 : 0);
  return result.outputFiles[0].contents;
}
const normal = await fixture(false);
const fault = await fixture(true);
const worker = `
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
const events=[];
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);events.push(url.href);
 if(url.pathname==='/events')return event.respondWith(new Response(JSON.stringify(events)));
 if(event.request.mode==='navigate')return event.respondWith((async()=>{
   const preload=await event.preloadResponse;
   if(['/native/','/app/normal/','/app/fault/'].includes(url.pathname)&&!url.search)return preload||fetch(event.request);
   return new Response('<!doctype html>blocked navigation',{headers:{'content-type':'text/html'}});
 })());
 if(['/normal.js','/fault.js'].includes(url.pathname)&&!url.search)return event.respondWith(fetch(event.request));
 event.respondWith(new Response('blocked',{status:403}));
});`;
const traffic: { url: string; preload: string | undefined }[] = [];
let origin = '';
const server = http.createServer((request, reply) => {
  const url = request.url || '/';
  const header = request.headers['service-worker-navigation-preload'];
  traffic.push({ url, preload: typeof header === 'string' ? header : undefined });
  reply.setHeader('Cache-Control', 'no-store');
  if (url === '/sw.js') {
    reply.setHeader('Content-Type', 'text/javascript');
    reply.end(worker);
    return;
  }
  if (url === '/normal.js' || url === '/fault.js') {
    reply.setHeader('Content-Type', 'text/javascript');
    reply.end(url === '/normal.js' ? normal : fault);
    return;
  }
  if (url === '/app/normal/' || url === '/app/fault/') {
    for (const [key, value] of response('', 'text/html', 200, {
      scriptNonce: 'fixture',
      controllerSource: origin + '/sw.js',
      workerSource: origin + '/__contexts/',
      frameSource: origin + '/__contexts/',
    }).headers)
      reply.setHeader(key, value);
    const script = url.includes('fault') ? 'fault.js' : 'normal.js';
    reply.end(`<!doctype html><script nonce="fixture" src="/${script}"></script>`);
    return;
  }
  reply.setHeader('Content-Type', 'text/html');
  reply.end('<!doctype html>receiver');
});
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
assert(address && typeof address !== 'string');
origin = `http://127.0.0.1:${address.port}`;
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const receipt = {
  scope:
    'Prepared window and generated response policy with a fixture service worker and deliberately pre-enabled navigation preload. A test-only source mutation removes the navigate-event cancellation. Not a production escape or installed-app lifecycle proof.',
  revision: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  runnerSHA256: hash(await readFile(fileURLToPath(import.meta.url))),
  normalBundleSHA256: hash(normal),
  faultBundleSHA256: hash(fault),
  sourceHashes: Object.fromEntries(
    await Promise.all(
      [
        'src/runtime/enforcement/navigation.ts',
        'src/runtime/enforcement/document-exit.ts',
        'src/runtime/contexts/window-realm.ts',
        'src/runtime/response-policy.ts',
        'scripts/trusted-policy.ts',
        'package-lock.json',
      ].map(async (path) => [
        path,
        hash(await readFile(new URL('../' + path, import.meta.url))),
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
      const inspector = await context.newPage();
      await inspector.goto(origin + '/setup');
      const seeded = 'seed-' + randomUUID();
      await inspector.evaluate(async (marker) => {
        const r = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        await r.navigationPreload.enable();
        await r.navigationPreload.setHeaderValue(marker);
      }, seeded);
      const cases = [];
      for (const kind of ['native', 'normal', 'fault']) {
        const page = await context.newPage();
        const eventObservations: unknown[] = [];
        page.on('console', (message) => {
          const prefix = 'navigation-contract:';
          if (message.text().startsWith(prefix))
            eventObservations.push(JSON.parse(message.text().slice(prefix.length)));
        });
        const path = kind === 'native' ? '/native/' : `/app/${kind}/`;
        const navigation = await page.goto(origin + path);
        assert(navigation);
        const headers = await navigation.allHeaders();
        if (kind !== 'native') {
          assert(headers['content-security-policy']?.includes("connect-src 'self'"));
          assert.equal(
            headers['connection-allowlist'],
            '(response-origin); redirects=block; webrtc=block',
          );
        }
        if (kind !== 'native')
          await page.waitForFunction(() => Reflect.get(window, 'prepared') === true);
        const events = await inspector.evaluate(
          async () => (await (await fetch('/events')).json()) as string[],
        );
        assert(
          events.some((value) => value.endsWith(path)),
          `${kind} page not observed by worker`,
        );
        const before = page.url();
        const marker = `${kind}-${randomUUID()}`;
        await page.evaluate(() => {
          window.navigation.addEventListener('navigate', (event) => {
            console.log(
              'navigation-contract:' +
                JSON.stringify({
                  trusted: event.isTrusted,
                  cancelable: event.cancelable,
                  prevented: event.defaultPrevented,
                  sameDocument: event.destination.sameDocument,
                  navigationType: event.navigationType,
                }),
            );
          });
        });
        await page.evaluate((marker) => {
          const a = document.createElement('a');
          a.href = '/target?' + marker;
          document.body.append(a);
          a.click();
        }, marker);
        await page.waitForTimeout(700);
        const observed = traffic.filter((item) => item.url.includes(marker));
        const laterEvents = await inspector.evaluate(
          async () => (await (await fetch('/events')).json()) as string[],
        );
        const workerObserved = laterEvents.some((value) => value.includes(marker));
        assert.deepEqual(eventObservations, [
          {
            trusted: true,
            cancelable: true,
            prevented: kind === 'normal',
            sameDocument: false,
            navigationType: 'push',
          },
        ]);
        if (kind === 'normal') {
          assert.deepEqual(observed, []);
          assert.equal(page.url(), before);
          assert.equal(workerObserved, false);
        } else {
          assert.equal(observed.length, 1, `${engine.name()} ${kind} preload receiver`);
          assert.equal(observed[0].preload, seeded);
          assert.equal(workerObserved, true);
        }
        cases.push({
          kind,
          marker,
          before,
          after: page.url(),
          received: observed,
          workerObserved,
          eventObservations,
          headers: kind === 'native' ? undefined : headers,
        });
        await page.close();
      }
      receipt.browsers.push({
        name: engine.name(),
        version: browser.version(),
        seeded,
        cases,
      });
      await context.close();
    } finally {
      await browser.close();
    }
  }
  receipt.completed = true;
  await writeFile(
    new URL('./evidence/navigation-preload-fault.json', import.meta.url),
    JSON.stringify(receipt, null, 2) + '\n',
  );
  console.log(
    'Native and fault preloads reached the receiver; normal prepared navigations did not, in Chromium and Firefox',
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
