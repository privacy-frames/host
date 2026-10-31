import assert from 'node:assert/strict';
import type { BrowserContext, Page } from 'playwright';

declare global {
  interface Window {
    closureFixtureWorker?: Worker;
    workerCloseFixture(
      id: unknown,
    ): Promise<{ ok: boolean; value?: { closed: boolean } }>;
    workerStateFixture(id: string): Promise<string | undefined>;
  }
}

/** Fixture-only native handles; none are included in the production host. */
export async function installWorkerClosureProbe(context: BrowserContext) {
  await context.addInitScript(() => {
    const apply = Reflect.apply;
    const container = navigator.serviceWorker;
    const controller = Object.getOwnPropertyDescriptor(
      ServiceWorkerContainer.prototype,
      'controller',
    )!.get!;
    const servicePost = ServiceWorker.prototype.postMessage;
    const databaseFactory = indexedDB;
    const openDatabase = IDBFactory.prototype.open;
    const transaction = IDBDatabase.prototype.transaction;
    const objectStore = IDBTransaction.prototype.objectStore;
    const index = IDBObjectStore.prototype.index;
    const read = IDBIndex.prototype.get;
    const closeDatabase = IDBDatabase.prototype.close;
    window.workerCloseFixture = (id) =>
      new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(
          () => reject(new Error('Worker close reply timed out')),
          5000,
        );
        channel.port1.onmessage = (event) => {
          clearTimeout(timer);
          channel.port1.close();
          resolve(event.data);
        };
        apply(servicePost, apply(controller, container, []), [
          {
            type: 'privacy-worker-close',
            id,
            parent: 'forged-parent',
            application: 'forged-app',
          },
          [channel.port2],
        ]);
      });
    window.workerStateFixture = (id) =>
      new Promise((resolve, reject) => {
        const request: IDBOpenDBRequest = apply(openDatabase, databaseFactory, [
          'privacy-frames-browser-contexts-v1:http://127.0.0.1:4211/runtime/',
          1,
        ]);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const tx: IDBTransaction = apply(transaction, database, [
            'contexts',
            'readonly',
          ]);
          const records: IDBObjectStore = apply(objectStore, tx, ['contexts']);
          const contextIndex: IDBIndex = apply(index, records, ['context']);
          const result: IDBRequest<unknown> = apply(read, contextIndex, [id]);
          result.onerror = () => reject(result.error);
          result.onsuccess = () => {
            const value = result.result;
            apply(closeDatabase, database, []);
            if (
              !value ||
              typeof value !== 'object' ||
              !('identity' in value) ||
              !value.identity ||
              typeof value.identity !== 'object' ||
              !('state' in value.identity) ||
              typeof value.identity.state !== 'string'
            )
              return reject(new Error('Native worker binding unavailable'));
            resolve(value.identity.state);
          };
        };
      });
  });
}

export async function checkWorkerClosure(
  app: Page,
  context: BrowserContext,
  traffic: readonly object[],
) {
  // These fixture-only native handles inspect the actual durable binding;
  // they are captured before preparation and never shipped in the host.
  const workerCreated = app.waitForEvent('worker');
  await app.evaluate(async () => {
    const worker = new Worker('worker.js');
    window.closureFixtureWorker = worker;
    await new Promise<void>((resolve, reject) => {
      worker.onmessage = () => resolve();
      worker.onerror = (event) => reject(new Error(event.message));
      setTimeout(() => reject(new Error('Closure fixture startup timed out')), 8000);
      worker.postMessage({});
    });
  });
  const closingWorker = await workerCreated;
  const closingID = new URL(closingWorker.url()).pathname.match(
    /__contexts\/([a-f0-9-]{36})\//,
  )?.[1];
  assert(closingID);
  assert.equal(
    await app.evaluate((id) => window.workerStateFixture(id), closingID),
    'preparing',
  );
  const sibling = await context.newPage();
  await sibling.goto(app.url(), { waitUntil: 'commit' });
  await sibling.waitForFunction(() => Reflect.get(globalThis, 'workerFixtureReady'));
  const wrongOwner = await sibling.evaluate(
    (id) => window.workerCloseFixture(id),
    closingID,
  );
  assert.deepEqual(wrongOwner, { ok: true, value: { closed: false } });
  assert.equal(
    await app.evaluate((id) => window.workerStateFixture(id), closingID),
    'preparing',
  );
  assert.equal(
    (await app.evaluate(() => window.workerCloseFixture('invalid'))).ok,
    false,
  );
  await sibling.close();
  let trafficCount = traffic.length;
  let quietSince = Date.now();
  const quietDeadline = Date.now() + 20000;
  while (Date.now() - quietSince < 3000) {
    assert(Date.now() < quietDeadline, 'Worker closure setup did not become quiet');
    await app.waitForTimeout(100);
    if (trafficCount !== traffic.length) {
      trafficCount = traffic.length;
      quietSince = Date.now();
    }
  }
  await app.evaluate(() => window.closureFixtureWorker?.terminate());
  const closeDeadline = Date.now() + 5000;
  while (
    (await app.evaluate((id) => window.workerStateFixture(id), closingID)) !== 'closed'
  ) {
    assert(
      Date.now() < closeDeadline,
      'Factory termination did not close native binding',
    );
    await app.waitForTimeout(25);
  }
  await app.waitForTimeout(1000);
  const closureTraffic = traffic.slice(trafficCount);
  assert.deepEqual(closureTraffic, [], 'Window worker closure emitted HTTP');
  const closure = {
    id: closingID,
    wrongOwner,
    state: 'closed',
    observationMilliseconds: 1000,
    requests: closureTraffic,
  };
  return closure;
}
