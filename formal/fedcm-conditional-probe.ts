import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { trustedPolicyPlugin } from '../scripts/trusted-policy.ts';
import { response as fixedResponse } from '../src/runtime/response-policy.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const historicalRevision = '2449929b26adc7dad41b54c9d4de2c4b3bdb0a69';
const historical = await fs.mkdtemp(join(tmpdir(), 'pf-fedcm-historical-'));
execFileSync('tar', ['-x', '-C', historical], {
  input: execFileSync('git', ['archive', historicalRevision], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  }),
});
await fs.symlink(join(root, 'node_modules'), join(historical, 'node_modules'), 'dir');
const { response: historicalResponse } = await import(
  pathToFileURL(join(historical, 'src/runtime/response-policy.ts')).href
);
let response = historicalResponse;
let origin;
const traffic = [];
let csp = 'self',
  permissionDenied = false;
async function compile(sourceRoot) {
  return await build({
    absWorkingDir: sourceRoot,
    stdin: {
      resolveDir: sourceRoot,
      loader: 'ts',
      contents: `
        import { prepareWindowRealm } from './src/runtime/contexts/window-realm.ts';
        const realm = prepareWindowRealm({
          application: 'fedcm-probe',
          applicationURL: location.origin + '/app/',
          scriptNonce: 'fixture',
          enableDocumentContexts: true,
        });
        realm.admitContent({
          installationGeneration: 'generation',
          aliases: [],
          source: location.origin + '/app/',
        });
        globalThis.prepared = true;
      `,
    },
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    plugins: [await trustedPolicyPlugin(sourceRoot)],
  });
}
const previous = await compile(historical),
  fixed = await compile(root);
let fixture = previous;
const sw = `
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
  const log = [];
  self.addEventListener('message', event => {
    if (event.data === 'events') event.ports[0].postMessage(log);
    if (event.data?.type === 'privacy-installed-resource') {
      event.ports[0].postMessage({ok:false,error:'SW blocked'});
      event.ports[0].close();
    }
    if (event.data?.type === 'privacy-publisher-rpc' && event.data.operation === 'status') {
      event.ports[0].postMessage({ok:true,value:null});
      event.ports[0].close();
    }
  });
  self.addEventListener('fetch', event => {
    log.push(event.request.url);
    const path = new URL(event.request.url).pathname;
    event.respondWith(
      path === '/app/' || path === '/fixture.js'
        ? fetch(event.request)
        : new Response('SW blocked', { status: 403 })
    );
  });
`;
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  traffic.push({ url: req.url, method: req.method, body });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.url === '/.well-known/web-identity')
    res.end(
      JSON.stringify({
        provider_urls: [origin + '/config.json'],
        accounts_endpoint: origin + '/accounts',
        login_url: origin + '/login',
      }),
    );
  else if (req.url === '/config.json')
    res.end(
      JSON.stringify({
        accounts_endpoint: '/accounts',
        id_assertion_endpoint: '/token',
        disconnect_endpoint: '/disconnect',
        login_url: origin + '/login',
      }),
    );
  else if (req.url === '/accounts')
    res.end(
      JSON.stringify({
        accounts: [
          {
            id: 'account',
            name: 'Test User',
            email: 'test@example.test',
            approved_clients: ['1'],
          },
        ],
      }),
    );
  else if (req.url === '/token') res.end(JSON.stringify({ token: 'test-token' }));
  else if (req.url === '/disconnect') res.end(JSON.stringify({ account_id: 'account' }));
  else if (req.url === '/sw.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(sw);
  } else if (req.url === '/fixture.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(fixture.outputFiles[0].text);
  } else {
    res.setHeader('Content-Type', 'text/html');
    if (req.url === '/app/') {
      const p = response('', 'text/html', 200, {
        scriptNonce: 'fixture',
        workerSource: origin + '/__contexts/',
        controllerSource: origin + '/sw.js',
        frameSource: origin + '/__contexts/',
      });
      for (const [k, v] of p.headers) res.setHeader(k, v);
      if (csp === 'none')
        res.setHeader(
          'Content-Security-Policy',
          p.headers
            .get('Content-Security-Policy')
            .replace("connect-src 'self' blob: data:", "connect-src 'none'"),
        );
      if (permissionDenied)
        res.setHeader(
          'Permissions-Policy',
          p.headers.get('Permissions-Policy') + ', identity-credentials-get=()',
        );
      res.end('<!doctype html><body><script src="/fixture.js" nonce="fixture"></script>');
    } else res.end('<!doctype html><title>FedCM native seed control</title>');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch().catch(async (error) => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(historical, { recursive: true, force: true });
  throw error;
});
const sourceHashes = Object.fromEntries(
  await Promise.all(
    [
      'src/runtime/response-policy.ts',
      'src/runtime/enforcement/effects.ts',
      'src/runtime/contexts/window-realm.ts',
      'scripts/trusted-policy.ts',
    ].map(async (path) => [
      path,
      createHash('sha256')
        .update(await fs.readFile(join(root, path)))
        .digest('hex'),
    ]),
  ),
);
const receipt = {
  origin,
  version: browser.version(),
  historicalRevision,
  fixedHEAD: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  runnerSHA256: createHash('sha256')
    .update(await fs.readFile(fileURLToPath(import.meta.url)))
    .digest('hex'),
  fixtureHashes: {
    historical: createHash('sha256')
      .update(previous.outputFiles[0].contents)
      .digest('hex'),
    fixed: createHash('sha256').update(fixed.outputFiles[0].contents).digest('hex'),
  },
  testedAt: new Date().toISOString(),
  sourceHashes,
  installedLockSHA256: createHash('sha256')
    .update(await fs.readFile(join(root, 'package-lock.json')))
    .digest('hex'),
  rows: [],
  traffic,
  scope:
    'Conditional seeded-browser FedCM state; native CDP account selection establishes the prerequisite, then actual prepareWindowRealm and actual generated headers run under an independently observed request-blocking service worker. This is not a fresh-profile installed-app reproduction.',
};
try {
  for (const kind of ['self', 'none', 'permission-denied', 'fixed']) {
    fixture = kind === 'fixed' ? fixed : previous;
    response = kind === 'fixed' ? fixedResponse : historicalResponse;
    csp = kind === 'none' ? 'none' : 'self';
    permissionDenied = kind === 'permission-denied';
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      page.on('console', (m) => console.log(kind, 'console', m.text()));
      page.on('pageerror', (e) => console.log(kind, 'PAGEERROR', e.message));
      await page.goto(origin);
      const session = await context.newCDPSession(page);
      await session.send('FedCm.enable', { disableRejectionDelay: true });
      session.on('FedCm.dialogShown', async (e) => {
        try {
          await session.send('FedCm.selectAccount', {
            dialogId: e.dialogId,
            accountIndex: 0,
          });
        } catch (e) {
          console.log(String(e));
        }
      });
      const freshStart = traffic.length;
      const fresh = await page.evaluate(async (origin) => {
        try {
          await IdentityCredential.disconnect({
            configURL: origin + '/config.json',
            clientId: '1',
            accountHint: 'account',
          });
          return 'resolved';
        } catch (e) {
          return e.name + ':' + e.message;
        }
      }, origin);
      assert.equal(
        traffic.length,
        freshStart,
        'Fresh disconnect unexpectedly reached network',
      );
      receipt.rows.push({
        kind,
        phase: 'fresh-disconnect',
        value: fresh,
        observed: traffic.slice(freshStart),
      });
      const seed = await page.evaluate(async (origin) => {
        try {
          return await Promise.race([
            navigator.credentials
              .get({
                identity: {
                  providers: [{ configURL: origin + '/config.json', clientId: '1' }],
                },
                mediation: 'required',
              })
              .then((c) => c.token),
            new Promise((r) => setTimeout(() => r('timeout'), 7000)),
          ]);
        } catch (e) {
          return e.name + ':' + e.message;
        }
      }, origin);
      if (seed !== 'test-token') throw Error('Native FedCM seed failed: ' + seed);
      await page.evaluate(async () => {
        await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller)
          await new Promise((r) =>
            navigator.serviceWorker.addEventListener('controllerchange', r, {
              once: true,
            }),
          );
      });
      await page.goto(origin + '/app/');
      await page.waitForFunction(() => globalThis.prepared);
      // Drain observed setup/update activity before the identity API action.
      // This is a measured interval, not proof that browser jobs have ended.
      let setupCount = traffic.length,
        unchangedSince = Date.now();
      const quietDeadline = Date.now() + 15000;
      while (Date.now() - unchangedSince < 3000) {
        assert(Date.now() < quietDeadline, 'FedCM setup did not become quiet');
        await page.waitForTimeout(100);
        if (traffic.length !== setupCount) {
          setupCount = traffic.length;
          unchangedSince = Date.now();
        }
      }
      const start = traffic.length;
      const outcome = await page.evaluate(async (origin) => {
        const data = { mode: privacyHost.mode, getDenied: false, ordinaryFetch: '' };
        try {
          await navigator.credentials.get({
            identity: {
              providers: [{ configURL: origin + '/config.json', clientId: '1' }],
            },
          });
        } catch (e) {
          data.getDenied = true;
        }
        try {
          data.ordinaryFetch = await (
            await fetch('/unknown-local?marker=ordinary-control')
          ).text();
        } catch (e) {
          data.ordinaryFetch = e.name;
        }
        try {
          await IdentityCredential.disconnect({
            configURL: origin + '/config.json',
            clientId: 'private-marker-' + location.port,
            accountHint: 'account',
          });
          data.disconnect = 'resolved';
        } catch (e) {
          data.disconnect = e.name + ':' + e.message;
        }
        return data;
      }, origin);
      const observed = traffic.slice(start);
      assert.equal(outcome.mode, 'network-isolated');
      assert.equal(outcome.getDenied, true);
      assert(!observed.some((item) => item.url.includes('ordinary-control')));
      if (kind === 'self') {
        assert.equal(outcome.disconnect, 'resolved');
        assert(
          observed.some(
            (item) =>
              item.url === '/disconnect' &&
              item.body.includes('client_id=private-marker-'),
          ),
        );
      } else {
        assert.deepEqual(observed, []);
        assert.match(
          outcome.disconnect,
          kind === 'fixed'
            ? /^SecurityError:/
            : kind === 'permission-denied'
              ? /^NotAllowedError:/
              : /^NetworkError:/,
        );
      }
      assert.equal(
        outcome.ordinaryFetch,
        kind === 'none' || kind === 'fixed' ? 'TypeError' : 'SW blocked',
      );
      receipt.rows.push({
        kind,
        phase: 'prepared-seeded-disconnect',
        source: kind === 'fixed' ? 'current-working-source' : historicalRevision,
        seed,
        outcome,
        observed,
      });
      console.log(JSON.stringify(receipt.rows.at(-1)));
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.mkdir(join(root, 'formal/evidence'), { recursive: true });
  await fs.writeFile(
    join(root, 'formal/evidence/fedcm-conditional.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  );
  await fs.rm(historical, { recursive: true, force: true });
}
