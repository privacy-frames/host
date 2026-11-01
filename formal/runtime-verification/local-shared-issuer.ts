import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { launch } from '../../test/browser-profile.ts';

const runner = await readFile(new URL(import.meta.url));
const transport = process.env.PF_SHARED_ISSUER_TRANSPORT || 'direct';
assert(transport === 'direct' || transport === 'port');
const traffic: string[] = [];
const child = `
let connections = 0;
onconnect = event => event.ports[0].postMessage({ connections: ++connections });
`;
const kernel = `
const childURL = URL.createObjectURL(new Blob([${JSON.stringify(child)}], {
  type: 'text/javascript'
}));
function issue(event) {
  if (event.data !== 'issue') return;
  event.ports[0].postMessage({
    url: childURL,
    trusted: event.isTrusted,
    sourceURL: event.source && event.source.scriptURL,
    sourceBrand: Object.prototype.toString.call(event.source)
  });
}
onconnect = event => {
  const ports = [];
  if (${JSON.stringify(transport)} === 'port') {
    const management = new MessageChannel();
    management.port1.onmessage = issue;
    ports.push(management.port2);
  }
  event.ports[0].postMessage({
    ready: true, serviceWorkerContainer: typeof navigator.serviceWorker
  }, ports);
};
if (${JSON.stringify(transport)} === 'direct') {
  const messages = navigator.serviceWorker || self;
  messages.addEventListener('message', issue);
  if (navigator.serviceWorker) navigator.serviceWorker.startMessages();
}
`;
const worker = `
addEventListener('install', event => event.waitUntil(skipWaiting()));
addEventListener('activate', event => event.waitUntil(clients.claim()));
addEventListener('fetch', event => event.respondWith(fetch(event.request)));
let issuerPort;
addEventListener('message', event => event.waitUntil((async () => {
  try {
    if (event.data === 'bind') {
      issuerPort = event.ports[0];
      event.ports[1].postMessage({ bound: true, sourceType: event.source.type });
      return;
    }
    const actors = await clients.matchAll({ type: 'sharedworker', includeUncontrolled: true });
    const actor = actors.find(actor => actor.url === location.origin + '/kernel.js');
    if (!actor) throw new Error('Kernel client not found');
    event.ports[0].postMessage({ progress: 'client-found', actor: {
      id: actor.id, type: actor.type, url: actor.url
    }});
    const channel = new MessageChannel();
    const reply = new Promise(resolve => channel.port1.onmessage = event => resolve(event.data));
    if (${JSON.stringify(transport)} === 'port') {
      if (!issuerPort) throw new Error('No private issuer port');
      issuerPort.postMessage('issue', [channel.port2]);
    } else actor.postMessage('issue', [channel.port2]);
    const issued = await reply;
    channel.port1.close();
    event.ports[0].postMessage({ issued, actor: { id: actor.id, type: actor.type, url: actor.url } });
  } catch (error) {
    event.ports[0].postMessage({ error: String(error) });
  }
})()));
`;
const server = http.createServer((request, response) => {
  const path = new URL(request.url || '/', 'http://local').pathname;
  traffic.push(path);
  response.setHeader('Cache-Control', 'no-store');
  if (path === '/sw.js' || path === '/kernel.js' || path === '/native-child.js') {
    response.setHeader('Content-Type', 'text/javascript');
    if (path === '/kernel.js')
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; script-src blob:; worker-src blob:; connect-src 'none'",
      );
    response.end(path === '/sw.js' ? worker : path === '/kernel.js' ? kernel : child);
    return;
  }
  response.setHeader('Content-Type', 'text/html');
  response.end(
    '<!doctype html><link rel="icon" href="data:,"><title>Local issuer fixture</title>',
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const origin = 'http://127.0.0.1:' + address.port;
const rows: object[] = [];
let completed = false;
let observationsComplete = false;
const failures: string[] = [];
try {
  for (const [name, engine, forcedAge] of [
    ['chromium', chromium, false],
    ['firefox', firefox, false],
    ['firefox', firefox, true],
  ] as const) {
    const browser = await launch(engine, {
      executablePath: engine.executablePath(),
      ...(forcedAge
        ? { firefoxUserPrefs: { 'dom.serviceWorkers.testUpdateOverOneDay': true } }
        : {}),
    });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(origin);
      const capabilities = await page.evaluate(async (transport) => {
        await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller)
          await new Promise<void>((resolve) =>
            navigator.serviceWorker.addEventListener(
              'controllerchange',
              () => resolve(),
              {
                once: true,
              },
            ),
          );
        const kernel = new SharedWorker('/kernel.js', 'trusted-local-issuer');
        const ready = await new Promise<MessageEvent>((resolve, reject) => {
          kernel.port.onmessage = resolve;
          kernel.onerror = () => reject(new Error('Kernel startup failed'));
          setTimeout(() => reject(new Error('Kernel startup timeout')), 10000);
        });
        Reflect.set(window, 'retainedIssuerPort', kernel.port);
        let binding;
        if (transport === 'port') {
          if (ready.ports.length !== 1)
            throw new Error('Missing private management port');
          const channel = new MessageChannel();
          const reply = new Promise(
            (resolve) => (channel.port1.onmessage = (event) => resolve(event.data)),
          );
          navigator.serviceWorker.controller!.postMessage('bind', [
            ready.ports[0],
            channel.port2,
          ]);
          binding = await reply;
          channel.port1.close();
        }
        return { ...ready.data, binding };
      }, transport);
      // A working native HTTP control calibrates the server before local policy.
      const controlStart = traffic.length;
      await page.evaluate(async () => {
        const child = new SharedWorker('/native-child.js', 'native-control');
        await new Promise<void>((resolve, reject) => {
          child.port.onmessage = () => resolve();
          child.onerror = () => reject(new Error('Native shared-worker startup failed'));
          setTimeout(
            () => reject(new Error('Native shared-worker startup timeout')),
            10000,
          );
        });
        child.port.close();
      });
      assert(traffic.slice(controlStart).includes('/native-child.js'));
      await page.waitForTimeout(1000);
      const controlTraffic = traffic.slice(controlStart);
      const first = traffic.length;
      const actionStarted = Date.now();
      const result = await page.evaluate(async () => {
        const policy = document.createElement('meta');
        policy.httpEquiv = 'Content-Security-Policy';
        policy.content =
          "default-src 'none'; script-src blob: 'unsafe-eval'; worker-src blob:; connect-src 'none'";
        document.head.appendChild(policy);
        const channel = new MessageChannel();
        const progress: unknown[] = [];
        const reply = new Promise<{
          issued?: {
            url: string;
            trusted: boolean;
            sourceURL: string | null;
            sourceBrand: string;
          };
          actor?: { id: string; type: string; url: string };
          error?: string;
        }>(
          (resolve) =>
            (channel.port1.onmessage = (event) => {
              if (event.data.progress) progress.push(event.data);
              else resolve(event.data);
            }),
        );
        navigator.serviceWorker.controller!.postMessage('issue', [channel.port2]);
        const packet = await Promise.race([
          reply,
          new Promise<{ error: string; progress: unknown[] }>((resolve) =>
            setTimeout(() => resolve({ error: 'Kernel issue timeout', progress }), 10000),
          ),
        ]);
        channel.port1.close();
        if (!('issued' in packet) || !packet.issued) return packet;
        const child = new SharedWorker(packet.issued.url, 'local-child');
        const value = await new Promise((resolve, reject) => {
          child.port.onmessage = (event) => resolve(event.data);
          child.onerror = () => reject(new Error('Local shared-worker startup failed'));
          setTimeout(
            () => reject(new Error('Local shared-worker startup timeout')),
            10000,
          );
        });
        Reflect.set(window, 'retainedChildPort', child.port);
        return { ...packet, value };
      });
      await page.waitForTimeout(3000);
      const observed = traffic.slice(first);
      rows.push({
        browser: name,
        version: browser.version(),
        forcedAge,
        capabilities,
        controlTraffic,
        actionStarted,
        observationEnded: Date.now(),
        result,
        traffic: observed,
      });
      if (result.error) {
        failures.push(`${name}/${forcedAge}: ${result.error}`);
        console.log(name, forcedAge, result.error);
        await context.close();
        continue;
      }
      assert('issued' in result);
      assert(result.issued, 'No local URL issued');
      assert.equal(result.issued.trusted, true);
      assert.equal(
        result.issued.sourceURL,
        transport === 'direct' ? origin + '/sw.js' : null,
      );
      assert.equal(
        result.issued.sourceBrand,
        transport === 'direct' ? '[object ServiceWorker]' : '[object Null]',
      );
      assert.equal(result.actor?.type, 'sharedworker');
      assert.deepEqual(observed, [], 'Local issuing or startup emitted HTTP');
      console.log(
        name,
        forcedAge,
        'native shared-client issuing and local startup passed',
      );
      await context.close();
    } finally {
      await browser.close();
    }
  }
  observationsComplete = true;
  assert.deepEqual(failures, [], 'Native issuing prerequisite is unavailable');
  completed = true;
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const stable = runner.equals(await readFile(new URL(import.meta.url)));
  await writeFile(
    new URL(
      transport === 'direct'
        ? './local-shared-issuer.json'
        : './local-shared-issuer-port.json',
      import.meta.url,
    ),
    JSON.stringify(
      {
        completed: completed && stable,
        observationsComplete,
        transport,
        executableSelection:
          'Explicit bundled full executable; isolated browser contexts and Playwright background-service defaults.',
        failures,
        scope:
          'Native shared-worker client and Blob issuer prerequisite only. No production authentication, ownership, restart, stable reuse across windows or complete confinement is established.',
        runnerSHA256: createHash('sha256').update(runner).digest('hex'),
        runnerStable: stable,
        kernelSHA256: createHash('sha256').update(kernel).digest('hex'),
        serviceWorkerSHA256: createHash('sha256').update(worker).digest('hex'),
        rows,
      },
      null,
      2,
    ) + '\n',
  );
  assert(stable, 'Issuer fixture changed during execution');
}
