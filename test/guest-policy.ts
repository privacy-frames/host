import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer, type Server } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';
import {
  borrowedWorkerImport,
  borrowedWorkerSource,
  guestPolicyCases,
} from './guest-policy-cases.ts';

const require = createRequire(import.meta.url);
const output = new URL('../.tools/guest-policy/', import.meta.url);
await mkdir(output, { recursive: true });
const wasm = await readFile(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm'));
await build({
  entryPoints: [new URL('../src/guest/worker-entry.ts', import.meta.url).pathname],
  outfile: new URL('worker.js', output).pathname,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
});
const worker = await readFile(new URL('worker.js', output));
await build({
  entryPoints: [new URL('./guest-policy.browser.ts', import.meta.url).pathname],
  outfile: new URL('browser.js', output).pathname,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  define: {
    __GUEST_ENGINE_BASE64__: JSON.stringify(wasm.toString('base64')),
    __GUEST_WORKER_BASE64__: JSON.stringify(worker.toString('base64')),
  },
});
const bundle = await readFile(new URL('browser.js', output));
const events: { url: string; method: string }[] = [];
const receiver = createServer((request, response) => {
  events.push({ url: request.url || '/', method: request.method || 'GET' });
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end('<!doctype html><title>Diagnostic receiver</title>');
});
const app = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname === '/browser.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(bundle);
    return;
  }
  if (url.pathname === '/installed/policy/__guest_worker__.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'wasm-unsafe-eval'; connect-src 'none'",
    );
    response.end(worker);
    return;
  }
  if (
    url.pathname === '/app/policy-worker.js' ||
    url.pathname === '/app/policy-import.js'
  ) {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(
      url.pathname.endsWith('policy-worker.js')
        ? borrowedWorkerSource
        : borrowedWorkerImport,
    );
    return;
  }
  if (url.pathname !== '/') {
    response.writeHead(404);
    response.end('Unavailable');
    return;
  }
  if (url.searchParams.get('mode') !== 'control') {
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'nonce-fixture-kernel' 'wasm-unsafe-eval'; connect-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: blob:; media-src 'self' data: blob:; worker-src 'self' blob:; frame-src 'self' about:; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts allow-same-origin allow-forms allow-popups",
    );
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('X-DNS-Prefetch-Control', 'off');
    response.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(self), geolocation=(), identity-credentials-get=(), attribution-reporting=()',
    );
  }
  response.setHeader('Content-Type', 'text/html');
  response.end(
    '<!doctype html><html><head></head><body><script nonce="fixture-kernel" type="module" src="/browser.js"></script></body></html>',
  );
});
const listen = (server: Server) =>
  new Promise<number>((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert(address && typeof address === 'object');
      resolve(address.port);
    }),
  );
const appPort = await listen(app);
const receiverPort = await listen(receiver);
const observations: Record<string, unknown>[] = [];
const failures: string[] = [];
const inactiveControls: string[] = [];
try {
  for (const [browserName, browserType] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const) {
    const browser = await browserType.launch({ headless: true });
    try {
      for (const fixture of guestPolicyCases) {
        for (const mode of ['control', 'protected']) {
          const page = await browser.newPage();
          const start = events.length;
          const marker = `${browserName}/${mode}/${fixture.name}`;
          const sink = `http://127.0.0.1:${receiverPort}/${marker}`;
          const url = new URL(`http://127.0.0.1:${appPort}/`);
          url.searchParams.set('mode', mode);
          url.searchParams.set('case', fixture.name);
          url.searchParams.set('receiver', sink);
          const errors: string[] = [];
          let navigations = 0;
          page.on('request', (request) => {
            if (request.isNavigationRequest() && request.frame() === page.mainFrame())
              navigations++;
          });
          page.on('pageerror', (error) => errors.push(error.message));
          let result: unknown;
          let interrupted: string | undefined;
          try {
            await page.goto(url.href);
            await page.waitForFunction(
              () => globalThis.guestPolicyResult !== undefined,
              undefined,
              { timeout: fixture.control === 'worker' ? 10000 : 2000 },
            );
            result = await page.evaluate(() => globalThis.guestPolicyResult);
          } catch (error) {
            interrupted = String(error).slice(0, 200);
          }
          const sent = events.slice(start).filter((event) => event.url.includes(marker));
          const observation = {
            browser: browserName,
            version: browser.version(),
            case: fixture.name,
            mode,
            result,
            interrupted,
            receiverRequests: sent,
            navigations,
            url: page.url(),
            errors,
          };
          observations.push(observation);
          console.log(JSON.stringify(observation));
          const record =
            result && typeof result === 'object'
              ? (result as Record<string, unknown>)
              : {};
          const native =
            record.native && typeof record.native === 'object'
              ? (record.native as Record<string, unknown>)
              : {};
          if (mode === 'protected') {
            if (
              fixture.control === 'reload' &&
              (navigations !== 1 ||
                !record.returned ||
                typeof record.returned !== 'object' ||
                !('blocked' in record.returned) ||
                record.returned.blocked !== 'SecurityError')
            )
              failures.push(
                `${browserName}/${fixture.name}: reload reached native navigation or was not denied`,
              );
            if (sent.length)
              failures.push(
                `${browserName}/${fixture.name}: receiver observed a request`,
              );
            if (record.error)
              failures.push(
                `${browserName}/${fixture.name}: fixture failed ${record.error}`,
              );
            if (record.nativeMarker !== undefined)
              failures.push(
                `${browserName}/${fixture.name}: native script marker executed`,
              );
            if (
              fixture.name.startsWith('meta-') &&
              /refresh/i.test(String(native.equiv || ''))
            )
              failures.push(
                `${browserName}/${fixture.name}: refresh control reached the native DOM`,
              );
            if (
              (fixture.name.startsWith('anchor-') ||
                fixture.name === 'svg-href' ||
                fixture.name === 'smil-href') &&
              [native.href, native.animatedHref].some(
                (value) =>
                  typeof value === 'string' &&
                  value.startsWith(`http://127.0.0.1:${receiverPort}`),
              )
            )
              failures.push(
                `${browserName}/${fixture.name}: external link reached native activation state`,
              );
            if (
              fixture.name === 'borrowed-innerhtml-setter' &&
              typeof native.src === 'string' &&
              native.src.startsWith(`http://127.0.0.1:${receiverPort}`)
            )
              failures.push(
                `${browserName}/${fixture.name}: raw external image URL reached native markup`,
              );
            if (
              fixture.name === 'foreign-window-source' &&
              (!record.returned ||
                typeof record.returned !== 'object' ||
                !('blocked' in record.returned) ||
                record.returned.blocked !== true)
            )
              failures.push(
                `${browserName}/${fixture.name}: unregistered foreign window was callable`,
              );
            if (fixture.control === 'script' && record.guestMarker !== fixture.name)
              failures.push(
                `${browserName}/${fixture.name}: admitted guest script did not execute`,
              );
            if (fixture.name === 'spellcheck-property' && native.spellcheck !== false)
              failures.push(`${browserName}/${fixture.name}: native spellcheck enabled`);
            if (
              fixture.name === 'writing-suggestions' &&
              native.writingSuggestions !== undefined &&
              native.writingSuggestions !== 'false' &&
              native.writingSuggestions !== false
            )
              failures.push(
                `${browserName}/${fixture.name}: native writing suggestions enabled`,
              );
            if (fixture.control === 'worker') {
              const returned =
                record.returned && typeof record.returned === 'object'
                  ? (record.returned as Record<string, unknown>)
                  : {};
              if (returned.wasm !== 'undefined')
                failures.push(
                  `${browserName}/${fixture.name}: borrowed import did not run in guest: ${JSON.stringify(returned)}`,
                );
            }
          } else {
            if (fixture.control === 'reload' && navigations < 2)
              failures.push(
                `${browserName}/${fixture.name}: unrestricted reload control did not make a second HTTP navigation`,
              );
            if (['navigation', 'request'].includes(fixture.control) && !sent.length) {
              if (fixture.name.startsWith('meta-') && native.equiv === 'refresh') {
                inactiveControls.push(
                  `${browserName}/${fixture.name}: native reflected-attribute mutation succeeded, but no automatic navigation occurred during observation`,
                );
              } else if (
                fixture.name === 'window-navigation' &&
                record.returned &&
                typeof record.returned === 'object' &&
                'available' in record.returned &&
                record.returned.available === false
              ) {
                inactiveControls.push(
                  `${browserName}/${fixture.name}: Navigation API unavailable`,
                );
              } else
                failures.push(
                  `${browserName}/${fixture.name}: unrestricted network control produced no request`,
                );
            }
            if (fixture.control === 'script' && record.nativeMarker !== fixture.name)
              failures.push(
                `${browserName}/${fixture.name}: unrestricted script control did not execute`,
              );
            if (fixture.control === 'worker') {
              const returned =
                record.returned && typeof record.returned === 'object'
                  ? (record.returned as Record<string, unknown>)
                  : {};
              if (returned.wasm !== 'object')
                failures.push(
                  `${browserName}/${fixture.name}: unrestricted worker control failed: ${JSON.stringify(returned)}`,
                );
            }
          }
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await Promise.all(
    [app, receiver].map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
}
await writeFile(
  new URL('../results/guest-policy.json', import.meta.url),
  JSON.stringify(
    {
      provenance: {
        head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        dirty:
          execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
            .length !== 0,
        kernelSha256: createHash('sha256').update(bundle).digest('hex'),
        workerSha256: createHash('sha256').update(worker).digest('hex'),
        engineSha256: createHash('sha256').update(wasm).digest('hex'),
      },
      observations,
      failures,
      inactiveControls,
    },
    null,
    2,
  ) + '\n',
);
assert.deepEqual(failures, []);
