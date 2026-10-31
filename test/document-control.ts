import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox, type Page } from 'playwright';
import { launch } from './browser-profile.ts';
import { servers } from './server.ts';
import { testProvenance } from './provenance.ts';

interface Reply {
  ok: boolean;
  value?: unknown;
  error?: string;
}
interface Registration {
  id: string;
  parentToken: string;
  url: string;
}
declare global {
  interface Window {
    documentControlFixture(operation: string, payload: unknown): Promise<Reply>;
    mountDocumentFixture(url: string): void;
  }
}
// The production controller and native browser client identities are real. The
// child guard is inert so this fixture can order its configuration/consume calls.
// This does not establish preparation or publication of application authority.
const host = await servers({
  receiver: false,
  runtimeFiles: new Map([
    ['/document-guard.js', new TextEncoder().encode('/* controlled child fixture */')],
  ]),
});
const publisher = http.createServer((_request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>Document control</title><p id="ready">Ready</p>');
});
await new Promise<void>((resolve) => publisher.listen(0, '127.0.0.1', resolve));
const address = publisher.address();
assert(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}/`;
const provenance = await testProvenance(import.meta.url);
const rows: object[] = [];
function registration(value: unknown): Registration {
  assert(value && typeof value === 'object');
  assert('id' in value && typeof value.id === 'string');
  assert('parentToken' in value && typeof value.parentToken === 'string');
  assert('url' in value && typeof value.url === 'string');
  return { id: value.id, parentToken: value.parentToken, url: value.url };
}
async function call(page: Page, operation: string, payload: unknown): Promise<Reply> {
  return page.evaluate(
    ({ operation, payload }) => window.documentControlFixture(operation, payload),
    { operation, payload },
  );
}
try {
  for (const engine of [chromium, firefox]) {
    const browser = await launch(engine);
    try {
      const context = await browser.newContext();
      await context.addInitScript(() => {
        if (!('serviceWorker' in navigator)) return;
        const container = navigator.serviceWorker;
        const controller = Object.getOwnPropertyDescriptor(
          ServiceWorkerContainer.prototype,
          'controller',
        )!.get!;
        const apply = Reflect.apply;
        const post = ServiceWorker.prototype.postMessage;
        const NativeChannel = MessageChannel;
        const stringify = JSON.stringify;
        const timer = setTimeout;
        const clear = clearTimeout;
        const create = Document.prototype.createElement;
        const append = Node.prototype.appendChild;
        const attribute = Element.prototype.setAttribute;
        window.documentControlFixture = (operation, payload) =>
          new Promise((resolve, reject) => {
            const target = apply(controller, container, []);
            if (!target) return reject(new Error('Native controller missing'));
            const channel = new NativeChannel();
            const timeout = timer(
              () => reject(new Error('Fixture reply timed out')),
              5000,
            );
            channel.port1.onmessage = (event) => {
              clear(timeout);
              channel.port1.close();
              resolve(event.data);
            };
            apply(post, target, [
              {
                type: 'privacy-document-control',
                operation,
                payload: stringify(payload),
              },
              [channel.port2],
            ]);
          });
        window.mountDocumentFixture = (url) => {
          const frame = apply(create, document, ['iframe']);
          apply(attribute, frame, ['src', url]);
          apply(append, document.body, [frame]);
        };
      });
      const manager = await context.newPage();
      await manager.goto('http://127.0.0.1:4210/privacy-frames/');
      await manager.getByText('Ready to install.', { exact: true }).waitFor();
      await manager.locator('#app-url').fill(origin);
      await manager.locator('#install button').click();
      const installed = manager.locator('[data-app]').first();
      await installed.waitFor();
      const opened = context.waitForEvent('page');
      await installed.click();
      const parent = await opened;
      await parent.locator('#ready').waitFor();
      const sibling = await context.newPage();
      await sibling.goto(parent.url(), { waitUntil: 'commit' });
      await sibling.locator('#ready').waitFor();
      const unbound = await context.newPage();
      await unbound.goto('http://127.0.0.1:4211/runtime/');
      await unbound.waitForFunction(() => !!navigator.serviceWorker.controller);
      const source = { source: { kind: 'srcdoc', text: '<p>Private fixture</p>' } };
      assert.equal((await call(unbound, 'create', source)).ok, false);
      assert.equal(
        (
          await call(parent, 'create', {
            source: { kind: 'url', url: 'https://missing.invalid/' },
          })
        ).ok,
        false,
      );
      assert.equal(
        (await call(parent, 'create', { carrier: 'unknown', ...source })).ok,
        false,
      );
      const created = await call(parent, 'create', source);
      assert.equal(created.ok, true);
      const grant = registration(created.value);
      assert.equal((await call(parent, 'configuration', { id: grant.id })).ok, false);
      assert.equal((await call(parent, 'content', { id: grant.id })).ok, false);
      assert.equal((await call(sibling, 'close', grant)).ok, true);
      assert.deepEqual((await call(sibling, 'close', grant)).value, { closed: false });
      assert.deepEqual(
        (
          await call(parent, 'close', {
            ...grant,
            parentToken: '11111111-1111-4111-8111-111111111111',
          })
        ).value,
        { closed: false },
      );
      await parent.evaluate((url) => window.mountDocumentFixture(url), grant.url);
      const deadline = Date.now() + 10000;
      while (!parent.frames().some((frame) => frame.url() === grant.url)) {
        assert(Date.now() < deadline, 'Native child did not bind');
        await parent.waitForTimeout(50);
      }
      const child = parent.frames().find((frame) => frame.url() === grant.url)!;
      const childCall = (operation: string, payload: unknown = { id: grant.id }) =>
        child.evaluate(
          ({ operation, payload }) => window.documentControlFixture(operation, payload),
          { operation, payload },
        );
      assert.equal((await childCall('configuration')).ok, true);
      const replies = await Promise.all([childCall('content'), childCall('content')]);
      assert.equal(replies.filter((reply) => reply.ok).length, 1);
      const delivered = replies.find((reply) => reply.ok)!.value;
      assert(delivered && typeof delivered === 'object' && 'text' in delivered);
      assert.equal(delivered.text, '<p>Private fixture</p>');
      assert.equal((await childCall('configuration')).ok, false);
      const nestedReply = await childCall('create', source);
      assert.equal(
        nestedReply.ok,
        true,
        'The live child must accept this exact create request',
      );
      const nested = registration(nestedReply.value);
      assert.deepEqual((await childCall('close', nested)).value, { closed: true });
      // Isolate message-only actions from the native child-navigation phase.
      await parent.waitForTimeout(3000);
      const start = host.traffic.length;
      assert.deepEqual((await call(parent, 'close', grant)).value, { closed: true });
      assert.equal((await childCall('content')).ok, false);
      assert.equal((await childCall('create', source)).ok, false);
      const second = registration((await call(parent, 'create', source)).value);
      assert.deepEqual((await call(parent, 'close', second)).value, { closed: true });
      await parent.waitForTimeout(1000);
      const requests = host.traffic.slice(start);
      assert.deepEqual(requests, []);
      rows.push({
        browser: engine.name(),
        version: browser.version(),
        checks: [
          'unbound',
          'missing-resource',
          'surface',
          'parent-read',
          'wrong-parent',
          'wrong-token',
          'bound-child-configuration',
          'consume-once',
          'consumed-configuration',
          'live-child-create-control',
          'closed-child-valid-create',
          'message-only-no-http',
        ],
        concurrentConsumeAccepted: replies.filter((reply) => reply.ok).length,
        requests,
      });
      console.log(
        `${engine.name()}: actual client authorization, single consumption and local message controls passed`,
      );
      await context.close();
    } finally {
      await browser.close();
    }
  }
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    'results/contexts/document-control.json',
    JSON.stringify(
      {
        provenance,
        scope:
          'Actual built controller, native browser clients and real storage; inert child guard and test-only native handles; no preparation or complete confinement proof',
        rows,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await host.close();
  publisher.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    publisher.close((error) => (error ? reject(error) : resolve())),
  );
}
