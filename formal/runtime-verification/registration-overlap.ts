import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { launch } from '../../test/browser-profile.ts';

const script = `
const instance = crypto.randomUUID();
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('message', event => {
  event.waitUntil((async () => {
    if (event.data === 'claim') await self.clients.claim();
    event.ports[0].postMessage(instance);
    event.ports[0].close();
  })());
});
self.addEventListener('fetch', event => {
  if (new URL(event.request.url).pathname.endsWith('/cached'))
    event.respondWith(new Response(instance));
});`;
const traffic: Array<{ path: string; time: number }> = [];
const server = http.createServer((request, response) => {
  traffic.push({ path: request.url || '/', time: Date.now() });
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/sw.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(script);
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><link rel="icon" href="data:,">Overlap probe');
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const receipt = new URL('./registration-overlap.json', import.meta.url);
await rm(receipt, { force: true });
const rows: object[] = [];

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
      for (const overlap of ['absent', 'reused', 'distinct', 'ancestor'] as const) {
        for (const operation of ['fetch', 'srcdoc', 'blob-frame'] as const) {
          const context = await browser.newContext();
          try {
            const original = await context.newPage();
            await original.goto(origin + '/one/page');
            const oldInstance = await original.evaluate(async () => {
              const registration = await navigator.serviceWorker.register('/sw.js', {
                scope: '/one/',
                updateViaCache: 'none',
              });
              const deadline = Date.now() + 10_000;
              while (registration.active?.state !== 'activated') {
                if (Date.now() > deadline) throw new Error('Activation timed out');
                await new Promise((resolve) => setTimeout(resolve, 25));
              }
              const token = await new Promise<unknown>((resolve, reject) => {
                const channel = new MessageChannel();
                const timer = setTimeout(
                  () => reject(new Error('Claim timed out')),
                  10_000,
                );
                channel.port1.onmessage = (event) => {
                  clearTimeout(timer);
                  channel.port1.close();
                  resolve(event.data);
                };
                registration.active!.postMessage('claim', [channel.port2]);
              });
              while (!navigator.serviceWorker.controller) {
                if (Date.now() > deadline)
                  throw new Error('Controller delivery timed out');
                await new Promise((resolve) => setTimeout(resolve, 25));
              }
              Reflect.set(
                globalThis,
                '__originalController',
                navigator.serviceWorker.controller,
              );
              if (!(await registration.unregister()))
                throw new Error('Unregister failed');
              if (await navigator.serviceWorker.getRegistration(location.href))
                throw new Error('Original scope is still registered');
              return token;
            });
            assert.equal(typeof oldInstance, 'string');
            const setup = await context.newPage();
            await setup.goto(origin + '/two/setup');
            const secondInstance =
              overlap === 'absent'
                ? null
                : await setup.evaluate(
                    async (scope) => {
                      const registration = await navigator.serviceWorker.register(
                        '/sw.js',
                        {
                          scope,
                          updateViaCache: 'none',
                        },
                      );
                      const deadline = Date.now() + 10_000;
                      while (registration.active?.state !== 'activated') {
                        if (Date.now() > deadline)
                          throw new Error('Second activation timed out');
                        await new Promise((resolve) => setTimeout(resolve, 25));
                      }
                      // The second worker deliberately does not claim existing clients.
                      return await new Promise<unknown>((resolve, reject) => {
                        const channel = new MessageChannel();
                        const timer = setTimeout(
                          () => reject(new Error('Identity timed out')),
                          10_000,
                        );
                        channel.port1.onmessage = (event) => {
                          clearTimeout(timer);
                          channel.port1.close();
                          resolve(event.data);
                        };
                        registration.active!.postMessage('identity', [channel.port2]);
                      });
                    },
                    overlap === 'reused'
                      ? '/one/'
                      : overlap === 'ancestor'
                        ? '/'
                        : '/two/',
                  );
            if (secondInstance !== null) {
              assert.equal(typeof secondInstance, 'string');
              if (overlap !== 'reused') assert.notEqual(secondInstance, oldInstance);
            }
            const registrationScopes = await setup.evaluate(async () =>
              (await navigator.serviceWorker.getRegistrations()).map(
                (value) => value.scope,
              ),
            );
            assert.equal(
              registrationScopes.includes(origin + '/one/'),
              overlap === 'reused',
            );
            assert(
              await original.evaluate(
                () =>
                  navigator.serviceWorker.controller ===
                  Reflect.get(globalThis, '__originalController'),
              ),
            );
            let count = traffic.length;
            let changed = Date.now();
            const deadline = Date.now() + 20_000;
            while (Date.now() - changed < 3000) {
              assert(Date.now() < deadline, 'Setup did not become quiet');
              await original.waitForTimeout(250);
              if (count !== traffic.length) {
                count = traffic.length;
                changed = Date.now();
              }
            }
            const start = traffic.length;
            const actionStarted = Date.now();
            const result = await original.evaluate(async (operation) => {
              if (operation === 'fetch')
                return { body: await (await fetch('./cached')).text() };
              const frame = document.createElement('iframe');
              const blob =
                operation === 'blob-frame'
                  ? URL.createObjectURL(
                      new Blob(['<!doctype html>Local frame'], { type: 'text/html' }),
                    )
                  : undefined;
              try {
                await new Promise<void>((resolve, reject) => {
                  const timer = setTimeout(
                    () => reject(new Error('Frame timed out')),
                    10_000,
                  );
                  frame.onload = () => {
                    clearTimeout(timer);
                    resolve();
                  };
                  if (blob) frame.src = blob;
                  else frame.srcdoc = '<!doctype html>Local frame';
                  document.body.append(frame);
                });
                const child = frame.contentWindow;
                if (!child) throw new Error('Child window missing');
                const controller = child.navigator.serviceWorker.controller;
                return {
                  body: frame.contentDocument?.body.textContent,
                  childControllerURL: controller?.scriptURL || null,
                };
              } finally {
                frame.remove();
                if (blob) URL.revokeObjectURL(blob);
              }
            }, operation);
            assert.equal(
              result.body,
              operation === 'fetch' ? oldInstance : 'Local frame',
            );
            await original.waitForTimeout(3000);
            const requests = traffic.slice(start);
            assert(requests.every((request) => request.path === '/sw.js'));
            const row = {
              browser: profile.engine.name(),
              version: browser.version(),
              forcedStaleCheck: profile.stale,
              overlap,
              operation,
              oldInstance,
              secondInstance,
              registrationScopes,
              result,
              actionStarted,
              observationEnded: Date.now(),
              requests,
            };
            rows.push(row);
            console.log(JSON.stringify(row));
            assert.equal(
              requests.length > 0,
              profile.engine === firefox &&
                (overlap === 'reused' || overlap === 'ancestor') &&
                operation !== 'fetch',
              'Observed overlap behavior changed; review the browser contract',
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
  const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  await writeFile(
    receipt,
    JSON.stringify(
      {
        scope:
          'Native same-origin registration overlap after unregistering an existing controlled client. Identical worker script URLs, with absent, reused, distinct sibling and ancestor new scopes. The second worker does not claim clients. All four observed patterns are asserted. Not a production launch protocol or proof of scope isolation.',
        runnerSHA256: digest(await readFile(import.meta.filename)),
        browserProfileSHA256: digest(
          await readFile(new URL('../../test/browser-profile.ts', import.meta.url)),
        ),
        packageLockSHA256: digest(
          await readFile(new URL('../../package-lock.json', import.meta.url)),
        ),
        serviceWorkerSHA256: digest(new TextEncoder().encode(script)),
        observationMilliseconds: 3000,
        rows,
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
