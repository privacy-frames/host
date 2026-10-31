import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { chromium, firefox, type Page } from 'playwright';
import { launch } from '../../test/browser-profile.ts';

interface Outcome {
  name: string;
  ok: boolean;
  at: number;
  error?: string;
  value?: unknown;
}
interface Snapshot {
  events: object[];
  outcomes: Outcome[];
}
declare global {
  interface Window {
    fenceStart(name: string, operation: 'update' | 'unregister'): void;
    fenceSnapshot(): Snapshot;
    fenceWait(): Promise<Snapshot>;
    fenceIdentity(): Promise<unknown>;
  }
}
const script = `
const instance=crypto.randomUUID();
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('message',event=>event.waitUntil((async()=>{
  if(event.data==='claim') await self.clients.claim();
  event.ports[0].postMessage(instance);event.ports[0].close();
})()));`;
const traffic: Array<{ path: string; time: number; held: boolean }> = [];
let gate:
  { entered(): void; release(): void; closed: boolean; held: boolean } | undefined;
function holdNext() {
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const current = { entered, release: () => {}, closed: false, held: false };
  gate = current;
  return { current, waiting };
}
const server = http.createServer((request, response) => {
  const selected = request.url === '/sw.js' && gate && !gate.held ? gate : undefined;
  traffic.push({ path: request.url || '/', time: Date.now(), held: Boolean(selected) });
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/sw.js') {
    response.setHeader('Content-Type', 'text/javascript');
    if (selected) {
      selected.held = true;
      response.on('close', () => {
        if (!response.writableEnded) selected.closed = true;
      });
      selected.release = () => {
        if (!response.destroyed) response.end(script);
      };
      selected.entered();
    } else response.end(script);
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><link rel="icon" href="data:,">Registration fence');
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const origin = 'http://127.0.0.1:' + address.port;
const receipt = new URL('./registration-fence.json', import.meta.url);
await rm(receipt, { force: true });
const rows: object[] = [];
let completed = false;
let failure: string | undefined;
async function bounded<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label + ' timed out')), 10000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function setup(page: Page) {
  await page.goto(origin + '/one/page');
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/one/',
      updateViaCache: 'none',
    });
    const deadline = Date.now() + 10000;
    while (registration.active?.state !== 'activated') {
      if (Date.now() > deadline) throw new Error('Activation timed out');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const controller = registration.active;
    if (!controller) throw new Error('Activated controller is absent');
    const identity = async (claim = false) =>
      new Promise<unknown>((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => reject(new Error('Identity timed out')), 5000);
        channel.port1.onmessage = (event) => {
          clearTimeout(timer);
          channel.port1.close();
          resolve(event.data);
        };
        controller.postMessage(claim ? 'claim' : 'identity', [channel.port2]);
      });
    const token = await identity(true);
    while (!navigator.serviceWorker.controller) {
      if (Date.now() > deadline) throw new Error('Control timed out');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const events: object[] = [],
      outcomes: Outcome[] = [],
      pending: Promise<void>[] = [];
    window.fenceStart = (name, operation) => {
      events.push({ name, operation, event: 'start', at: Date.now() });
      const promise =
        operation === 'update' ? registration.update() : registration.unregister();
      pending.push(
        promise.then(
          (value) => {
            outcomes.push({ name, ok: true, value, at: Date.now() });
          },
          (error) => {
            outcomes.push({ name, ok: false, error: String(error), at: Date.now() });
          },
        ),
      );
    };
    window.fenceSnapshot = () => ({ events: [...events], outcomes: [...outcomes] });
    window.fenceWait = async () => {
      await Promise.all(pending);
      return window.fenceSnapshot();
    };
    window.fenceIdentity = () => identity();
    return { token, scope: registration.scope };
  });
}
try {
  for (const profile of [
    { engine: chromium, stale: false },
    { engine: firefox, stale: false },
    { engine: firefox, stale: true },
  ]) {
    const browser = await launch(
      profile.engine,
      profile.stale
        ? { firefoxUserPrefs: { 'dom.serviceWorkers.testUpdateOverOneDay': true } }
        : {},
    );
    try {
      for (const mode of [
        'idle-unregister',
        'held-update-unregister',
        'held-update-control',
      ] as const) {
        const context = await browser.newContext();
        let held: ReturnType<typeof holdNext> | undefined;
        try {
          gate = undefined;
          const page = await context.newPage();
          const initial = await setup(page);
          await page.waitForTimeout(500);
          const start = traffic.length;
          let beforeRelease: Snapshot | undefined;
          let releasedAt: number | undefined;
          let unregisterBeforeRelease = false;
          if (mode === 'idle-unregister') {
            await page.evaluate(() => window.fenceStart('unregister', 'unregister'));
            await bounded(
              page.evaluate(() => window.fenceWait()),
              'Idle unregister',
            );
            await page.evaluate(() => window.fenceStart('update-after', 'update'));
          } else {
            held = holdNext();
            await page.evaluate(() => window.fenceStart('update-before', 'update'));
            await bounded(held.waiting, 'Independent update receiver');
            if (mode === 'held-update-unregister') {
              await page.evaluate(() => {
                window.fenceStart('unregister', 'unregister');
                window.fenceStart('update-after', 'update');
              });
            }
            await page.waitForTimeout(500);
            beforeRelease = await page.evaluate(() => window.fenceSnapshot());
            unregisterBeforeRelease = beforeRelease.outcomes.some(
              (value) => value.name === 'unregister',
            );
            assert(
              !beforeRelease.outcomes.some((value) => value.name === 'update-before'),
              'The held response did not keep its update pending',
            );
            assert.equal(
              unregisterBeforeRelease,
              false,
              'Unregistration settled before the held update completed',
            );
            releasedAt = Date.now();
            held.current.release();
            await bounded(
              page.evaluate(() => window.fenceWait()),
              'Held operations',
            );
            if (mode === 'held-update-control')
              await page.evaluate(() => window.fenceStart('update-after', 'update'));
          }
          const outcome = await bounded(
            page.evaluate(() => window.fenceWait()),
            'Final operations',
          );
          const registrations = await page.evaluate(async () =>
            (await navigator.serviceWorker.getRegistrations()).map(
              (value) => value.scope,
            ),
          );
          const retainedToken = await bounded(
            page.evaluate(() => window.fenceIdentity()),
            'Retained controller',
          );
          assert.equal(retainedToken, initial.token);
          await page.waitForTimeout(1000);
          const requests = traffic
            .slice(start)
            .filter((value) => value.path === '/sw.js');
          const unregistered = outcome.outcomes.find(
            (value) => value.name === 'unregister',
          );
          const later = outcome.outcomes.find((value) => value.name === 'update-after');
          assert(later);
          if (mode !== 'idle-unregister') {
            const earlier = outcome.outcomes.find(
              (value) => value.name === 'update-before',
            );
            assert.equal(earlier?.ok, true, 'Held update must complete successfully');
          }
          if (mode === 'held-update-control') {
            assert.equal(later.ok, true);
            assert(requests.length >= 2, 'Native follow-up update was not observed');
            assert(registrations.includes(initial.scope));
          } else {
            assert.equal(unregistered?.ok, true);
            assert.equal(unregistered.value, true);
            assert(!registrations.includes(initial.scope));
            if (mode === 'idle-unregister') {
              assert.equal(later.ok, false);
              assert.equal(requests.length, 0);
            } else {
              assert.equal(later.ok, false);
              assert.equal(requests.length, 1);
              assert(
                requests.some((value) => value.held),
                'Held update receiver did not observe the request',
              );
            }
          }
          rows.push({
            browser: profile.engine.name(),
            version: browser.version(),
            forcedStaleCheck: profile.stale,
            mode,
            initial,
            retainedToken,
            beforeRelease,
            releasedAt,
            unregisterBeforeRelease,
            connectionClosedBeforeRelease: held?.current.closed,
            registrations,
            outcome,
            requests,
          });
          console.log(
            profile.engine.name() +
              (profile.stale ? ' stale' : '') +
              ' ' +
              mode +
              ': ' +
              JSON.stringify({
                unregisterBeforeRelease,
                requests: requests.length,
                outcomes: outcome.outcomes,
              }),
          );
        } finally {
          held?.current.release();
          gate = undefined;
          await context.close();
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
  const hash = (bytes: Uint8Array | string) =>
    createHash('sha256').update(bytes).digest('hex');
  try {
    await writeFile(
      receipt,
      JSON.stringify(
        {
          scope:
            'Native same-scope update/unregister ordering with an independently observed HTTP response gate. Script request arrival precedes the gate; this is not interception before transmission, a production launch barrier or a whole-browser drain proof.',
          completed,
          failure,
          runnerSHA256: hash(await readFile(import.meta.filename)),
          browserProfileSHA256: hash(
            await readFile(new URL('../../test/browser-profile.ts', import.meta.url)),
          ),
          packageLockSHA256: hash(
            await readFile(new URL('../../package-lock.json', import.meta.url)),
          ),
          serviceWorkerSHA256: hash(script),
          observationMilliseconds: 1000,
          heldObservationMilliseconds: 500,
          rows,
          completedAt: completed ? new Date().toISOString() : null,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
