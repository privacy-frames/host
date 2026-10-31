import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import http from 'node:http';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, firefox, type Page, type Response } from 'playwright';
import { build, type PluginBuild } from 'esbuild';
import { trustedPolicyPlugin } from '../../scripts/trusted-policy.ts';
import { launch } from '../../test/browser-profile.ts';
import { servers } from '../../test/server.ts';
import { testProvenance } from '../../test/provenance.ts';

const root = resolve(import.meta.dirname, '../..');
const receiptPath = resolve(import.meta.dirname, 'installed-result.json');
await rm(receiptPath, { force: true });
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const navigation = await readFile(
  resolve(root, 'src/runtime/enforcement/document-exit.ts'),
  'utf8',
);
const needle = 'apply(prevent, event, []);';
assert.equal(navigation.split(needle).length, 2, 'Cancellation anchor changed');
async function guard(mutate: boolean) {
  let mutations = 0;
  const result = await build({
    absWorkingDir: root,
    entryPoints: [resolve(root, 'src/runtime/guard.ts')],
    bundle: true,
    write: false,
    banner: { js: '"use strict";' },
    format: 'iife',
    target: 'es2022',
    plugins: [
      await trustedPolicyPlugin(root),
      ...(mutate
        ? [
            {
              name: 'test-only-remove-root-navigation-cancellation',
              setup(builder: PluginBuild) {
                builder.onLoad(
                  { filter: /[/\\]enforcement[/\\]document-exit\.ts$/ },
                  async ({ path }) => {
                    const source = await readFile(path, 'utf8');
                    assert.equal(source, navigation);
                    mutations++;
                    return {
                      contents: source.replace(needle, 'void event;'),
                      loader: 'ts',
                    };
                  },
                );
              },
            },
          ]
        : []),
    ],
  });
  assert.equal(mutations, mutate ? 1 : 0);
  return result.outputFiles[0].contents;
}
const normal = await guard(false);
const altered = await guard(true);
assert(
  Buffer.from(normal).equals(await readFile(resolve(root, 'dist-runtime/guard.js'))),
  'Rebuilt baseline must equal the ordinary runtime build',
);
assert.notDeepEqual(normal, altered);

async function listen(server: http.Server) {
  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}
const receiverURL = 'http://127.0.0.1:4211/runtime/navigation-receiver';
const publisherRequests: string[] = [];
const applicationScript = `
navigation.addEventListener('navigate', event => {
  console.log('installed-navigation:' + JSON.stringify({
    trusted: event.isTrusted, cancelable: event.cancelable,
    prevented: event.defaultPrevented, sameDocument: event.destination.sameDocument,
    navigationType: event.navigationType
  }));
});
document.querySelector('#send').addEventListener('click', () => {
  const link = document.createElement('a');
  link.href = ${JSON.stringify(receiverURL + '?value=')} +
    encodeURIComponent(document.querySelector('#private').value);
  document.body.append(link);
  link.click();
});
document.querySelector('#ready').textContent = 'ready';
document.body.dataset.mode = globalThis.privacyHost?.mode || 'native';
`;
const publisher = http.createServer((request, response) => {
  publisherRequests.push(request.url || '/');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/main.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(applicationScript);
  } else if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      '<!doctype html><title>Installed navigation fixture</title>' +
        '<input id="private"><button id="send">Send</button><output id="ready"></output>' +
        '<script src="main.js"></script>',
    );
  } else {
    response.writeHead(404);
    response.end('absent');
  }
});
const publisherURL = (await listen(publisher)) + '/';
const runtimeFiles = new Map<string, Uint8Array>();
const host = await servers({ receiver: false, runtimeFiles });
const provenance = await testProvenance(import.meta.url);
const receipt = {
  scope:
    'Actual installation, service-worker-generated root shell, root guard and application-created same-window same-origin link. Trusted test setup deliberately enables real navigation preload after installation disables it. Synthetic data is entered only after startup. The altered build removes only navigate-event cancellation in the root guard. This is a configured preload stress test, not a deployed escape or all-navigation proof.',
  provenance,
  sourceSHA256: hash(Buffer.from(navigation)),
  normalGuardSHA256: hash(normal),
  alteredGuardSHA256: hash(altered),
  applicationScriptSHA256: hash(Buffer.from(applicationScript)),
  observationMilliseconds: 800,
  completed: false,
  browsers: [] as object[],
};
function observe(page: Page) {
  const events: unknown[] = [];
  page.on('console', (message) => {
    const prefix = 'installed-navigation:';
    if (message.text().startsWith(prefix))
      events.push(JSON.parse(message.text().slice(prefix.length)));
  });
  return { events };
}
try {
  for (const engine of [chromium, firefox]) {
    const browser = await launch(engine);
    try {
      const cases = [];
      for (const profile of ['native', 'normal', 'altered'] as const) {
        runtimeFiles.clear();
        if (profile === 'altered') runtimeFiles.set('/guard.js', altered);
        const context = await browser.newContext();
        try {
          let app: Page;
          let installationStatus: string | null = null;
          let preload:
            | {
                before: NavigationPreloadState;
                after: NavigationPreloadState;
                header: string;
              }
            | undefined;
          const observations = new Map<Page, ReturnType<typeof observe>>();
          const responses: Response[] = [];
          const requestFailures: { url: string; error: string | undefined }[] = [];
          context.on('response', (response) => responses.push(response));
          context.on('requestfailed', (request) =>
            requestFailures.push({
              url: request.url(),
              error: request.failure()?.errorText,
            }),
          );
          context.on('page', (page) => observations.set(page, observe(page)));
          if (profile === 'native') {
            app = await context.newPage();
          } else {
            const manager = await context.newPage();
            await manager.goto('http://127.0.0.1:4210/privacy-frames/');
            await manager.getByText('Ready to install.', { exact: true }).waitFor();
            await manager.locator('#app-url').fill(publisherURL);
            await manager.locator('#install button').click();
            await manager.waitForFunction(
              () =>
                /^(Installed |Installation refused:)/.test(
                  document.querySelector('#status')!.textContent!,
                ),
              {},
              { timeout: 120000 },
            );
            installationStatus = await manager.locator('#status').textContent();
            assert.match(installationStatus || '', /^Installed /);
            const bridge = manager
              .frames()
              .find((frame) =>
                frame.url().startsWith('http://127.0.0.1:4211/runtime/connect.html'),
              );
            assert(bridge, 'Trusted runtime bridge missing');
            preload = await bridge.evaluate(async () => {
              const registration = await navigator.serviceWorker.getRegistration();
              if (!registration?.navigationPreload)
                throw new Error('Native preload unavailable');
              const before = await registration.navigationPreload.getState();
              const header = 'installed-fixture-' + crypto.randomUUID();
              await registration.navigationPreload.setHeaderValue(header);
              await registration.navigationPreload.enable();
              return {
                before,
                after: await registration.navigationPreload.getState(),
                header,
              };
            });
            assert.equal(preload.before.enabled, false);
            assert.equal(preload.after.enabled, true);
            const opened = context.waitForEvent('page');
            await manager.locator('.app-card [data-app]').first().click();
            app = await opened;
          }
          const observed = observations.get(app);
          assert(observed);
          if (profile === 'native') await app.goto(publisherURL);
          await app.waitForFunction(
            () => document.querySelector('#ready')?.textContent === 'ready',
          );
          const before = app.url();
          const mode = await app.locator('body').getAttribute('data-mode');
          assert.equal(mode, profile === 'native' ? 'native' : 'network-isolated');
          let startup;
          if (profile !== 'native') {
            const guardResponse = responses.find(
              (response) =>
                response.url() === 'http://127.0.0.1:4211/runtime/guard.js' &&
                response.fromServiceWorker(),
            );
            const rootResponse = responses.find(
              (response) =>
                response.url() === before && response.request().isNavigationRequest(),
            );
            assert(guardResponse && rootResponse, 'Root startup responses missing');
            assert(guardResponse.fromServiceWorker());
            assert(rootResponse.fromServiceWorker());
            assert(
              !responses.some((response) =>
                new URL(response.url()).searchParams.has('host-content'),
              ),
              'Root content must not use the replaced HTTP endpoint',
            );
            const servedGuard = hash(await guardResponse.body());
            assert.equal(servedGuard, hash(profile === 'normal' ? normal : altered));
            const headers = await rootResponse.allHeaders();
            assert(headers['content-security-policy']?.includes("connect-src 'self'"));
            assert.equal(
              headers['connection-allowlist'],
              '(response-origin); redirects=block; webrtc=block',
            );
            startup = {
              rootFromServiceWorker: true,
              guardFromServiceWorker: true,
              contentTransport: 'message, inferred from rendered app and hashed guard',
              servedGuardSHA256: servedGuard,
              headers,
            };
          }
          const marker = `${engine.name()}-${profile}-${randomUUID()}`;
          await app.locator('#private').fill(marker);
          assert(!host.traffic.some((row) => row.path.includes(marker)));
          await app.locator('#send').click();
          await app.waitForTimeout(receipt.observationMilliseconds);
          const requests = host.traffic.filter((row) => row.path.includes(marker));
          if (profile === 'altered') {
            assert(requests.length > 0, 'Altered guard must expose a receiver request');
            assert(
              requests.some((request) => request.navigationPreload === preload?.header),
              'Receiver must observe the configured native preload header',
            );
          } else assert.equal(requests.length, profile === 'normal' ? 0 : 1);
          if (profile === 'native')
            assert.equal(requests[0].navigationPreload, undefined);
          assert.deepEqual(observed.events, [
            {
              trusted: true,
              cancelable: true,
              prevented: profile === 'normal',
              sameDocument: false,
              navigationType: 'push',
            },
          ]);
          if (profile === 'normal') assert.equal(app.url(), before);
          assert(
            requests.every(
              (row) =>
                row.port === 4211 &&
                row.path.startsWith('/runtime/navigation-receiver?value='),
            ),
          );
          assert(!publisherRequests.some((path) => path.includes(marker)));
          const navigationResponses = await Promise.all(
            responses
              .filter((response) => response.url().includes(marker))
              .map(async (response) => ({
                url: response.url(),
                status: response.status(),
                fromServiceWorker: response.fromServiceWorker(),
                navigationRequest: response.request().isNavigationRequest(),
              })),
          );
          cases.push({
            profile,
            installationStatus,
            preload,
            mode,
            startup,
            marker,
            before,
            after: app.url(),
            requests,
            navigationResponses,
            requestFailures: requestFailures.filter((request) =>
              request.url.includes(marker),
            ),
            eventObservations: observed.events,
          });
          console.log(
            `${engine.name()} ${profile}: receiver requests ${requests.length}`,
          );
        } finally {
          await context.close();
        }
      }
      receipt.browsers.push({ name: engine.name(), version: browser.version(), cases });
    } finally {
      await browser.close();
    }
  }
  const after = await testProvenance(import.meta.url);
  assert.equal(after.sourceSHA256, provenance.sourceSHA256, 'Source changed during test');
  assert.equal(after.runnerSHA256, provenance.runnerSHA256, 'Runner changed during test');
  assert.deepEqual(
    after.artifacts,
    provenance.artifacts,
    'Build artifacts changed during test',
  );
  receipt.completed = true;
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
} finally {
  await host.close();
  for (const server of [publisher]) {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
}
