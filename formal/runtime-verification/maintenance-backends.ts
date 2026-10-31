import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { launch } from '../../test/browser-profile.ts';

const operations = [
  'idle',
  'fetch',
  'message',
  'worker',
  'module-worker',
  'blob-worker',
  'blob-module-worker',
  'blob-worker-fetch',
  'srcdoc',
  'blob-frame',
  'frame',
] as const;
type Operation = (typeof operations)[number];
const unregistered = process.env.PF_MAINTENANCE_UNREGISTER === '1';
const selectedOperations = unregistered
  ? operations.filter((operation) =>
      [
        'fetch',
        'message',
        'blob-worker',
        'blob-worker-fetch',
        'worker',
        'module-worker',
        'frame',
        'srcdoc',
        'blob-frame',
      ].includes(operation),
    )
  : operations;
const requests: Array<{ path: string; time: number }> = [];
const script = `
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => event.ports[0].postMessage('ready'));
self.addEventListener('fetch', event => {
  const path = new URL(event.request.url).pathname;
  if (path === '/worker.js') event.respondWith(new Response('postMessage("ready")', {
    headers: {'Content-Type': 'text/javascript'}
  }));
  if (path === '/cached') event.respondWith(new Response('cached'));
  if (path === '/frame') event.respondWith(new Response('<!doctype html>Local frame', {
    headers: {'Content-Type': 'text/html'}
  }));
});`;
const receiver = http.createServer((request, response) => {
  requests.push({ path: request.url || '/', time: Date.now() });
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/sw.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(script);
  } else if (request.url === '/cached') {
    // A distinctive unrestricted receiver response detects loss of interception.
    response.setHeader('Content-Type', 'text/plain');
    response.end('network-cached');
  } else if (request.url === '/worker.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end('postMessage("network-ready")');
  } else if (request.url === '/frame') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html>Network frame');
  } else if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><link rel="icon" href="data:,">Backend probe');
  } else {
    response.writeHead(404).end();
  }
});
const receipt = new URL(
  unregistered ? './maintenance-unregistered.json' : './maintenance-backends.json',
  import.meta.url,
);
await rm(receipt, { force: true });
await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
const address = receiver.address();
assert(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const rows: object[] = [];
let completed = false;
let failure: string | undefined;

try {
  for (const profile of [
    { engine: chromium, stale: false },
    { engine: firefox, stale: false },
    { engine: firefox, stale: true },
  ]) {
    const browser = await launch(
      profile.engine,
      profile.stale
        ? {
            firefoxUserPrefs: { 'dom.serviceWorkers.testUpdateOverOneDay': true },
          }
        : {},
    );
    try {
      for (const operation of selectedOperations) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          const context = await browser.newContext();
          try {
            const page = await context.newPage();
            page.setDefaultTimeout(15_000);
            await page.goto(origin);
            await page.evaluate(async () => {
              await navigator.serviceWorker.register('/sw.js', {
                updateViaCache: 'none',
              });
              await navigator.serviceWorker.ready;
              if (!navigator.serviceWorker.controller)
                await new Promise<void>((resolve) =>
                  navigator.serviceWorker.addEventListener(
                    'controllerchange',
                    () => resolve(),
                    { once: true },
                  ),
                );
            });
            if (unregistered)
              await page.evaluate(async () => {
                const registration = await navigator.serviceWorker.getRegistration();
                if (!registration || !(await registration.unregister()))
                  throw new Error('Unregister failed');
                if (!navigator.serviceWorker.controller)
                  throw new Error('Existing page lost its controller');
              });
            let count = requests.length;
            let changed = Date.now();
            const deadline = Date.now() + 20_000;
            while (Date.now() - changed < 3000) {
              assert(Date.now() < deadline, 'Setup did not become quiet');
              await page.waitForTimeout(250);
              if (count !== requests.length) {
                count = requests.length;
                changed = Date.now();
              }
            }
            const start = requests.length;
            const actionStarted = Date.now();
            const result = await page.evaluate(async (operation: Operation) => {
              if (operation === 'idle') return 'idle';
              if (operation === 'fetch') return (await fetch('/cached')).text();
              if (operation === 'message') {
                return await new Promise<string>((resolve, reject) => {
                  const channel = new MessageChannel();
                  const timer = setTimeout(
                    () => reject(new Error('Message timed out')),
                    10_000,
                  );
                  channel.port1.onmessage = (event) => {
                    clearTimeout(timer);
                    channel.port1.close();
                    resolve(event.data);
                  };
                  navigator.serviceWorker.controller!.postMessage('probe', [
                    channel.port2,
                  ]);
                });
              }
              if (
                operation === 'srcdoc' ||
                operation === 'blob-frame' ||
                operation === 'frame'
              ) {
                return await new Promise<string>((resolve, reject) => {
                  const frame = document.createElement('iframe');
                  const blob =
                    operation === 'blob-frame'
                      ? URL.createObjectURL(
                          new Blob(['<!doctype html>Local frame'], { type: 'text/html' }),
                        )
                      : undefined;
                  const timer = setTimeout(
                    () => reject(new Error('Frame timed out')),
                    10_000,
                  );
                  frame.onload = () => {
                    clearTimeout(timer);
                    const text = frame.contentDocument?.body.textContent;
                    frame.remove();
                    if (blob) URL.revokeObjectURL(blob);
                    resolve(text || '');
                  };
                  if (operation === 'srcdoc') frame.srcdoc = '<!doctype html>Local frame';
                  else frame.src = blob || '/frame';
                  document.body.append(frame);
                });
              }
              const blob = operation.startsWith('blob-')
                ? URL.createObjectURL(
                    new Blob(
                      [
                        operation === 'blob-worker-fetch'
                          ? `fetch(${JSON.stringify(location.origin + '/cached')}).then(r=>r.text()).then(postMessage)`
                          : 'postMessage("ready")',
                      ],
                      { type: 'text/javascript' },
                    ),
                  )
                : undefined;
              try {
                return await new Promise<string>((resolve, reject) => {
                  const worker = new Worker(blob || '/worker.js', {
                    type: operation.includes('module') ? 'module' : 'classic',
                  });
                  const timer = setTimeout(() => {
                    worker.terminate();
                    reject(new Error('Worker timed out'));
                  }, 10_000);
                  worker.onmessage = (event) => {
                    clearTimeout(timer);
                    worker.terminate();
                    resolve(event.data);
                  };
                  worker.onerror = (event) => {
                    clearTimeout(timer);
                    worker.terminate();
                    reject(new Error(event.message));
                  };
                });
              } finally {
                if (blob) URL.revokeObjectURL(blob);
              }
            }, operation);
            await page.waitForTimeout(3000);
            const observed = requests.slice(start);
            const lostWorkerOrFrame =
              unregistered && ['worker', 'module-worker', 'frame'].includes(operation);
            const lostBlobFetch =
              unregistered &&
              profile.engine === firefox &&
              operation === 'blob-worker-fetch';
            const lostInterception = lostWorkerOrFrame || lostBlobFetch;
            const expectedPath = lostWorkerOrFrame
              ? operation === 'frame'
                ? '/frame'
                : '/worker.js'
              : lostBlobFetch
                ? '/cached'
                : '/sw.js';
            assert(observed.every((request) => request.path === expectedPath));
            const expectedRequest = unregistered
              ? lostInterception
              : ['worker', 'module-worker', 'frame'].includes(operation) ||
                (profile.engine === firefox &&
                  (operation === 'srcdoc' ||
                    operation === 'blob-frame' ||
                    (profile.stale &&
                      (operation === 'fetch' || operation === 'blob-worker-fetch'))));
            assert.equal(
              result,
              lostWorkerOrFrame
                ? operation === 'frame'
                  ? 'Network frame'
                  : 'network-ready'
                : lostBlobFetch
                  ? 'network-cached'
                  : operation === 'idle'
                    ? 'idle'
                    : operation === 'fetch' || operation === 'blob-worker-fetch'
                      ? 'cached'
                      : operation.endsWith('frame') || operation === 'srcdoc'
                        ? 'Local frame'
                        : 'ready',
            );
            const row = {
              browser: profile.engine.name(),
              version: browser.version(),
              forcedStaleCheck: profile.stale,
              unregistered,
              operation,
              attempt,
              expectedRequest,
              result,
              actionStarted,
              observationEnded: Date.now(),
              requests: observed,
            };
            rows.push(row);
            console.log(JSON.stringify(row));
            if (!expectedRequest) {
              assert.equal(observed.length, 0, 'Unexpected native network effect');
              break;
            }
            if (observed.length > 0) break;
            assert(
              attempt < 3,
              'Known trigger had no positive observation in three fresh samples',
            );
          } finally {
            await context.close();
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
  completed = true;
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  try {
    await writeFile(
      receipt,
      JSON.stringify(
        {
          scope:
            'Native browser comparison of local context bootstraps, service-worker-mediated resources and message-only operations. The Firefox forced-stale profile uses an explicit testing preference, not natural 24-hour aging. The unregistered variant checks retained delivery and loss of interception. Known positive triggers use up to three fresh samples; omissions are recorded and a group without a positive observation fails. No production runtime repair is claimed.',
          completed,
          failure,
          browserProfileSHA256: createHash('sha256')
            .update(
              await readFile(new URL('../../test/browser-profile.ts', import.meta.url)),
            )
            .digest('hex'),
          packageLockSHA256: createHash('sha256')
            .update(await readFile(new URL('../../package-lock.json', import.meta.url)))
            .digest('hex'),
          runnerSHA256: createHash('sha256')
            .update(await readFile(import.meta.filename))
            .digest('hex'),
          observationMilliseconds: 3000,
          rows,
          completedAt: completed ? new Date().toISOString() : null,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    receiver.closeAllConnections();
    await new Promise<void>((resolve) => receiver.close(() => resolve()));
  }
}
