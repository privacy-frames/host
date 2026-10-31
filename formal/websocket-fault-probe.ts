import { fixtureControllerMessages } from './fixtures/controller-messages.ts';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import type { Duplex } from 'node:stream';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build, type Plugin } from 'esbuild';
import { chromium, firefox } from 'playwright';
import { trustedPolicyPlugin } from '../scripts/trusted-policy.ts';
import { response } from '../src/runtime/response-policy.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const input = `
  import { prepareWindowRealm } from './src/runtime/contexts/window-realm.ts';
  const applicationURL = location.origin + location.pathname;
  const realm = prepareWindowRealm({
    application: 'websocket-fault-probe', applicationURL,
    scriptNonce: 'fixture', enableDocumentContexts: true,
  });
  realm.admitContent({ installationGeneration: 'generation', aliases: [], source: applicationURL });
  globalThis.prepared = true;
`;

async function fixture(mutate: boolean) {
  let transformations = 0;
  const mutation: Plugin = {
    name: 'test-only-remove-websocket-denial',
    setup(builder) {
      builder.onLoad(
        { filter: /[/\\]enforcement[/\\]effects\.ts$/ },
        async ({ path }) => {
          const original = await readFile(path, 'utf8');
          const needle = "    'WebSocket',\n";
          assert.equal(original.split(needle).length, 2, 'Mutation anchor changed');
          transformations++;
          return { contents: original.replace(needle, ''), loader: 'ts' };
        },
      );
    },
  };
  const output = await build({
    absWorkingDir: root,
    stdin: { resolveDir: root, loader: 'ts', contents: input },
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    plugins: [...(mutate ? [mutation] : []), await trustedPolicyPlugin(root)],
  });
  assert.equal(transformations, mutate ? 1 : 0, 'Unexpected mutation count');
  return output.outputFiles[0].contents;
}
const normal = await fixture(false);
const fault = await fixture(true);
assert.notDeepEqual(normal, fault, 'Fault bundle did not differ');
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const worker = `
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
  const events = [];
${fixtureControllerMessages('events')}

  self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    events.push(url.pathname);
    if (url.pathname === '/app/events') {
      event.respondWith(new Response(JSON.stringify(events))); return;
    }
    const setup = ['/app/native', '/app/normal/', '/app/fault/', '/app/normal.js', '/app/fault.js'];
    event.respondWith(setup.includes(url.pathname) && !url.search && event.request.method === 'GET'
      ? fetch(event.request) : new Response('SW blocked', {status: 403}));
  });
`;
const upgrades: { path: string; origin: string | undefined }[] = [];
const sockets = new Set<Duplex>();
let origin = '';
const server = http.createServer((request, reply) => {
  reply.setHeader('Cache-Control', 'no-store');
  if (request.url === '/app/sw.js') {
    reply.setHeader('Content-Type', 'text/javascript');
    reply.end(worker);
  } else if (request.url === '/app/normal.js' || request.url === '/app/fault.js') {
    reply.setHeader('Content-Type', 'text/javascript');
    reply.end(request.url.includes('fault') ? fault : normal);
  } else if (request.url === '/app/normal/' || request.url === '/app/fault/') {
    const script = request.url.includes('fault') ? 'fault.js' : 'normal.js';
    for (const [name, value] of response('', 'text/html', 200, {
      scriptNonce: 'fixture',
      controllerSource: origin + '/app/sw.js',
      workerSource: origin + '/__contexts/',
      frameSource: origin + '/__contexts/',
    }).headers)
      reply.setHeader(name, value);
    reply.end(`<!doctype html><script nonce="fixture" src="/app/${script}"></script>`);
  } else {
    reply.setHeader('Content-Type', 'text/html');
    reply.end('<!doctype html><title>Native WebSocket observer</title>');
  }
});
server.on('upgrade', (request, socket) => {
  upgrades.push({ path: request.url ?? '', origin: request.headers.origin });
  const key = request.headers['sec-websocket-key'];
  if (!key) return socket.destroy();
  const accept = createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
  socket.on('error', () => socket.destroy());
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
      accept +
      '\r\n\r\n',
  );
  socket.once('data', () => socket.end(Buffer.from([0x88, 0])));
});
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
assert(address && typeof address !== 'string');
origin = `http://127.0.0.1:${address.port}`;
const receipt = {
  scope:
    'Actual window preparation and generated response policy; test-only mutation removes exactly the WebSocket deny-list entry. Same-origin independent WebSocket upgrade receiver; no installed-app or all-context claim.',
  revision: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  runnerSHA256: hash(await readFile(fileURLToPath(import.meta.url))),
  effectsSHA256: hash(await readFile(join(root, 'src/runtime/enforcement/effects.ts'))),
  normalBundleSHA256: hash(normal),
  faultBundleSHA256: hash(fault),
  completed: false,
  sourceHashes: Object.fromEntries(
    await Promise.all(
      [
        'formal/fixtures/controller-messages.ts',
        'src/runtime/contexts/window-realm.ts',
        'src/runtime/response-policy.ts',
        'scripts/trusted-policy.ts',
        'package-lock.json',
      ].map(async (path) => [path, hash(await readFile(join(root, path)))]),
    ),
  ),
  browsers: [] as object[],
};
try {
  for (const engine of [chromium, firefox]) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext();
      const observer = await context.newPage();
      await observer.goto(origin + '/native');
      await observer.evaluate(async () => {
        const registration = await navigator.serviceWorker.register('/app/sw.js');
        const worker =
          registration.installing || registration.waiting || registration.active;
        if (!worker) throw new Error('Service worker unavailable');
        if (worker.state !== 'activated')
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error('Worker activation timed out')),
              10000,
            );
            worker.addEventListener('statechange', () => {
              if (worker.state === 'activated') {
                clearTimeout(timer);
                resolve();
              }
            });
          });
      });
      const attempts: object[] = [];
      const ids = new Map<string, string>();
      for (const profile of ['native', 'normal', 'fault']) {
        const page = await context.newPage();
        const prepared = profile !== 'native';
        const navigation = await page.goto(
          origin + (prepared ? `/app/${profile}/` : '/native'),
        );
        if (prepared)
          await page.waitForFunction(() => Reflect.get(window, 'prepared') === true);
        const marker = `${profile}-${randomUUID()}`;
        ids.set(profile, marker);
        const result = await page.evaluate(async (name) => {
          const target = `ws://${location.host}/receive?${name}`;
          return await new Promise<{ outcome: string; mode: unknown }>((resolve) => {
            const mode = Reflect.get(globalThis, 'privacyHost')?.mode;
            let socket: WebSocket | undefined;
            const timer = setTimeout(() => {
              socket?.close();
              resolve({ outcome: 'timeout', mode });
            }, 4000);
            try {
              socket = new WebSocket(target);
              socket.onopen = () => {
                clearTimeout(timer);
                socket?.close();
                resolve({ outcome: 'open', mode });
              };
              socket.onerror = () => {
                clearTimeout(timer);
                resolve({ outcome: 'error', mode });
              };
            } catch (error) {
              clearTimeout(timer);
              resolve({ outcome: error instanceof Error ? error.name : 'unknown', mode });
            }
          });
        }, marker);
        await page.waitForTimeout(300);
        const observed = upgrades.filter((entry) => entry.path.includes(marker));
        if (prepared) assert.equal(result.mode, 'network-isolated');
        if (profile === 'normal') {
          assert.equal(result.outcome, 'SecurityError');
          assert.deepEqual(observed, []);
        } else {
          assert.equal(
            result.outcome,
            'open',
            `${engine.name()} ${profile}: ${JSON.stringify(result)}`,
          );
          assert.equal(observed.length, 1);
        }
        const headers = await navigation!.allHeaders();
        if (prepared) {
          assert(headers['content-security-policy']?.includes("connect-src 'self'"));
          assert.equal(
            headers['connection-allowlist'],
            '(response-origin); redirects=block; webrtc=block',
          );
        }
        attempts.push({
          profile,
          marker,
          result,
          observed,
          headers,
        });
        await page.close();
      }
      const workerEvents = await observer.evaluate(async () => {
        const page = document.createElement('iframe');
        page.src = '/app/native';
        document.body.append(page);
        await new Promise<void>((resolve) => {
          page.onload = () => resolve();
        });
        return (await page.contentWindow!.fetch('/app/events')).json();
      });
      assert(
        workerEvents.includes('/app/normal/') && workerEvents.includes('/app/fault/'),
      );
      assert(!workerEvents.some((path: string) => path.includes('/receive')));
      assert(!upgrades.some((entry) => entry.path.includes(ids.get('normal')!)));
      receipt.browsers.push({
        name: engine.name(),
        version: browser.version(),
        attempts,
        workerEvents,
      });
      await context.close();
    } finally {
      await browser.close();
    }
  }
  receipt.completed = true;
} finally {
  for (const socket of sockets) socket.destroy();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await writeFile(
    new URL('evidence/websocket-fault.json', import.meta.url),
    JSON.stringify(receipt, null, 2) + '\n',
  );
}
console.log('WebSocket native, prepared and mutation receiver controls passed');
