import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { createServer, type Server, type RequestListener } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, firefox, type Browser } from 'playwright';

const root = new URL('../', import.meta.url);
const sources = [
  'src/runtime/authority.ts',
  'src/runtime/worker.ts',
  'src/bridge/connect.ts',
  'test/guest-management-authority.ts',
];
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const inputHashes = Object.fromEntries(
  await Promise.all(
    sources.map(async (path) => [path, hash(await readFile(new URL(path, root)))]),
  ),
);
async function compile(entry: string, fault = false) {
  const output = await build({
    entryPoints: [new URL(entry, root).pathname],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    define: { __BUILD_ID__: '"authority-browser-fixture"' },
    plugins: fault
      ? [
          {
            name: 'remove-origin-control',
            setup(builder) {
              builder.onLoad(
                { filter: /\/runtime\/authority\.ts$/ },
                async ({ path }) => {
                  const source = await readFile(path, 'utf8');
                  const anchor = ' &&\n    claims.allowedOrigin';
                  assert.equal(source.split(anchor).length, 2);
                  return { loader: 'ts', contents: source.replace(anchor, '') };
                },
              );
            },
          },
        ]
      : [],
  });
  return output.outputFiles[0].contents;
}
const [worker, connect, unguarded] = await Promise.all([
  compile('src/runtime/worker.ts'),
  compile('src/bridge/connect.ts'),
  compile('src/bridge/connect.ts', true),
]);
let managerOrigin = '';
let fault = false;
const servers: Server[] = [];
async function listen(handler: RequestListener) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}
const runtimeOrigin = await listen((request, response) => {
  const path = new URL(request.url || '/', 'http://local').pathname;
  response.setHeader(
    'Content-Type',
    path.endsWith('.js')
      ? 'text/javascript'
      : path.endsWith('.json')
        ? 'application/json'
        : 'text/html',
  );
  response.end(
    path === '/sw.js'
      ? worker
      : path === '/connect.js'
        ? fault
          ? unguarded
          : connect
        : path === '/config.json'
          ? JSON.stringify({ managerOrigins: [managerOrigin] })
          : path === '/connect.html'
            ? '<!doctype html><p id="status"></p><button id="reconnect" hidden></button><script src="connect.js"></script>'
            : path === '/preexisting.html'
              ? '<!doctype html>Untrusted role fixture loaded before worker control.'
              : '<!doctype html>Trusted asset placeholder: this fixture never starts application code.',
  );
});
managerOrigin = await listen((_request, response) =>
  response.end('<!doctype html><title>Allowed manager fixture</title>'),
);
const unrelatedOrigin = await listen((_request, response) =>
  response.end('<!doctype html><title>Unrelated parent fixture</title>'),
);
const results: unknown[] = [];
async function exercise(
  browser: Browser,
  name: string,
  origin: string,
  removal: boolean,
) {
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => {
      const observations: { trusted: boolean; origin: string }[] = [];
      Object.defineProperty(window, '__authorityObservations', { value: observations });
      window.addEventListener('message', (event) =>
        observations.push({ trusted: event.isTrusted, origin: event.origin }),
      );
    });
    // Existing document deliberately has no service-worker policy. It tests Client
    // role authorization, not whether guest JavaScript can obtain native APIs.
    const application = await context.newPage();
    await application.goto(runtimeOrigin + '/preexisting.html');
    const page = await context.newPage();
    await page.goto(origin);
    const navigation = page.waitForEvent('framenavigated', {
      predicate: (frame) => frame.url() === runtimeOrigin + '/connect.html',
    });
    await page.evaluate((runtime) => {
      const frame = document.createElement('iframe');
      frame.src = runtime + '/connect.html';
      document.body.append(frame);
    }, runtimeOrigin);
    const frame = await navigation;
    await frame.waitForFunction(
      () => document.documentElement.dataset.runtimeState === 'ready',
    );
    await application.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
            once: true,
          }),
        );
    });
    const forbidden = await application.evaluate(async () => {
      const channel = new MessageChannel();
      const reply = new Promise<{ ok: boolean; error?: string }>((resolve) => {
        channel.port1.onmessage = (event) => resolve(event.data);
      });
      navigator.serviceWorker.controller!.postMessage(
        { operation: 'list', role: 'manager', url: location.origin + '/connect.html' },
        [channel.port2],
      );
      return reply;
    });
    assert.equal(forbidden.ok, false);
    assert.match(forbidden.error || '', /Trusted manager bridge required/);
    const before = await frame.evaluate(
      () =>
        (window as unknown as { __authorityObservations: unknown[] })
          .__authorityObservations.length,
    );
    const received = await page.evaluate(async (runtime) => {
      const channel = new MessageChannel();
      const replies: unknown[] = [];
      Object.defineProperty(window, '__authorityPort', { value: channel.port1 });
      Object.defineProperty(window, '__authorityReplies', { value: replies });
      channel.port1.onmessage = (event) => replies.push(event.data);
      document
        .querySelector('iframe')!
        .contentWindow!.postMessage({ type: 'pf-connect' }, runtime, [channel.port2]);
      return true;
    }, runtimeOrigin);
    assert(received);
    await frame.waitForFunction(
      (count) =>
        (window as unknown as { __authorityObservations: unknown[] })
          .__authorityObservations.length > count,
      before,
    );
    const observed = await frame.evaluate(() =>
      (
        window as unknown as {
          __authorityObservations: { trusted: boolean; origin: string }[];
        }
      ).__authorityObservations.at(-1),
    );
    assert.deepEqual(observed, { trusted: true, origin });
    const accepted = origin === managerOrigin || removal;
    if (accepted) {
      await page.waitForFunction(() =>
        (
          window as unknown as { __authorityReplies: { type?: string }[] }
        ).__authorityReplies.some((item) => item.type === 'pf-ready'),
      );
      await page.evaluate(() =>
        (
          window as unknown as { __authorityPort: MessagePort }
        ).__authorityPort.postMessage({ id: 1, operation: 'list' }),
      );
      await page.waitForFunction(() =>
        (
          window as unknown as { __authorityReplies: { id?: number }[] }
        ).__authorityReplies.some((item) => item.id === 1),
      );
      const reply = await page.evaluate(() =>
        (
          window as unknown as {
            __authorityReplies: { id?: number; ok?: boolean; value?: unknown }[];
          }
        ).__authorityReplies.find((item) => item.id === 1),
      );
      assert.equal(reply?.ok, true);
      assert.deepEqual(reply?.value, []);
    } else {
      await page.waitForTimeout(150);
      assert.deepEqual(
        await page.evaluate(
          () =>
            (window as unknown as { __authorityReplies: unknown[] }).__authorityReplies,
        ),
        [],
      );
    }
    results.push({
      browser: name,
      parentOrigin: origin,
      originGuardRemoved: removal,
      nativeEventObserved: observed,
      accepted,
      applicationClientDenied: true,
    });
  } finally {
    await context.close();
  }
}
try {
  for (const [name, engine] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const) {
    const browser = await engine.launch({ headless: true });
    try {
      fault = false;
      await exercise(browser, name, managerOrigin, false);
      await exercise(browser, name, unrelatedOrigin, false);
      fault = true;
      await exercise(browser, name, unrelatedOrigin, true);
    } finally {
      await browser.close();
    }
  }
  for (const [path, expected] of Object.entries(inputHashes))
    assert.equal(
      hash(await readFile(new URL(path, root))),
      expected,
      'Source changed during browser test',
    );
  await mkdir(new URL('results/quickjs-confinement/', root), { recursive: true });
  await writeFile(
    new URL('results/quickjs-confinement/management-browser.json', root),
    JSON.stringify(
      {
        scope:
          'Actual production connect and service-worker bundles in Chromium/Firefox, native cross-origin MessageEvent/ports and Clients.get, actual IndexedDB list. Trusted asset placeholders never execute guest code. Origin removal is a temporary bundle only.',
        inputHashes,
        bundleHashes: {
          worker: hash(worker),
          connect: hash(connect),
          originRemoved: hash(unguarded),
        },
        results,
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'Native management authority: both browsers accepted allowed parent, denied unrelated parent and application Client, and detected removed origin guard.',
  );
} finally {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
}
