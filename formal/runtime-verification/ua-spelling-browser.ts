import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net, { type Socket } from 'node:net';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { launchPersistent } from '../../test/browser-profile.ts';
import { servers } from '../../test/server.ts';
import { build } from 'esbuild';
import { trustedPolicyPlugin } from '../../scripts/trusted-policy.ts';
import { testProvenance } from '../../test/provenance.ts';
import { attemptSpellingChanges } from '../../test/fixtures/native-spelling.ts';

// All service connections go to the owned TLS receiver. Unknown proxy targets
// are rejected; this fixture never forwards a request to a spelling provider.
const marker = 'privacyframesconfidentialmarkerzzzz';
const started = new Date().toISOString();
const runner = await readFile(new URL(import.meta.url));
const provenance = await testProvenance(import.meta.url);
const directory = await mkdtemp(join(tmpdir(), 'pf-spelling-'));
const key = join(directory, 'key.pem');
const cert = join(directory, 'cert.pem');
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-subj',
    '/CN=www.googleapis.com',
    '-keyout',
    key,
    '-out',
    cert,
  ],
  { stdio: 'ignore' },
);
const sockets = new Set<Socket>();
const services: Array<{ path: string; bytes: number; containsMarker: boolean }> = [];
const connects: Array<{ host: string; accepted: boolean }> = [];
function track(socket: Socket) {
  sockets.add(socket);
  socket.once('close', () => sockets.delete(socket));
}
const receiver = https.createServer(
  { key: await readFile(key), cert: await readFile(cert) },
  (request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (part: string) => {
      body += part;
      if (body.length > 1024 * 1024) request.destroy();
    });
    request.on('end', () => {
      services.push({
        path: new URL(request.url || '/', 'https://local').pathname,
        bytes: Buffer.byteLength(body),
        containsMarker: body.includes(marker),
      });
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify({
          spellingCheckResponse: { misspellings: [] },
          result: { spellingCheckResponse: { misspellings: [] } },
        }),
      );
    });
  },
);
receiver.on('connection', track);
await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
const receiverAddress = receiver.address();
assert(receiverAddress && typeof receiverAddress !== 'string');
const receiverPort = receiverAddress.port;
const proxy = http.createServer((_request, response) => response.writeHead(403).end());
proxy.on('connection', track);
proxy.on('connect', (request, client, head) => {
  let host = '';
  try {
    host = new URL('https://' + request.url).hostname;
  } catch {}
  const accepted = [
    'www.googleapis.com',
    'spelling.googleapis.com',
    'spelling-us.googleapis.com',
    'spelling-eu.googleapis.com',
  ].includes(host);
  connects.push({ host, accepted });
  if (!accepted) {
    client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    return;
  }
  const upstream = net.connect(receiverPort, '127.0.0.1');
  track(upstream);
  upstream.once('connect', () => {
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) upstream.write(head);
    client.pipe(upstream);
    upstream.pipe(client);
  });
  upstream.on('error', () => client.destroy());
  client.on('error', () => upstream.destroy());
});
await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
const proxyAddress = proxy.address();
assert(proxyAddress && typeof proxyAddress !== 'string');
const pageServer = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://local');
  if (url.searchParams.get('strict') === '1')
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; connect-src 'none'; form-action 'none'",
    );
  response.setHeader('Content-Type', 'text/html');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.end(
    `<!doctype html><html lang="en"><title>Native spelling fixture</title><link rel="icon" href="data:,"><textarea id="text" lang="en-US" spellcheck="${url.searchParams.get('spell') || 'true'}"></textarea>`,
  );
});
pageServer.on('connection', track);
await new Promise<void>((resolve) => pageServer.listen(0, '127.0.0.1', resolve));
const pageAddress = pageServer.address();
assert(pageAddress && typeof pageAddress !== 'string');
const rows: object[] = [];
const faultPath = 'src/runtime/enforcement/native-attributes.ts';
const correctSource = await readFile(faultPath, 'utf8');
const correctSetter =
  'set(this: HTMLElement) {\n        return apply(spelling, this, [false]);\n      }';
assert.equal(
  correctSource.split(correctSetter).length,
  2,
  'Missing actual spelling setter',
);
const faultSource = correctSource.replace(
  correctSetter,
  'set(this: HTMLElement, value: unknown) {\n' +
    '        return apply(spelling, this, [value]);\n      }',
);
const faulty = await build({
  entryPoints: ['src/runtime/guard.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  banner: { js: '"use strict";' },
  define: { __BUILD_ID__: '"native-spelling-idl-fault"' },
  plugins: [
    await trustedPolicyPlugin(process.cwd()),
    {
      name: 'omit-native-spelling-IDL-mitigation',
      setup(builder) {
        builder.onLoad({ filter: /enforcement\/native-attributes\.ts$/ }, () => ({
          contents: faultSource,
          loader: 'ts',
        }));
      },
    },
  ],
});
const faultGuard = faulty.outputFiles[0].contents;
const runtimeFiles = new Map<string, Uint8Array>();
const runtime = await servers({ receiver: false, runtimeFiles });
let completed = false;
let failure: string | undefined;
try {
  for (const mode of [
    'native-control',
    'strict-csp',
    'runtime',
    'runtime-idl-fault',
    'attribute-disabled',
    'incognito',
  ]) {
    if (mode === 'runtime-idl-fault') runtimeFiles.set('/guard.js', faultGuard);
    else runtimeFiles.delete('/guard.js');
    const profile = join(directory, mode);
    await mkdir(join(profile, 'Default'), { recursive: true });
    await writeFile(
      join(profile, 'Default', 'Preferences'),
      JSON.stringify({
        browser: { enable_spellchecking: true },
        spellcheck: {
          dictionaries: ['en-US'],
          dictionary: 'en-US',
          use_spelling_service: true,
        },
        intl: { accept_languages: 'en-US,en' },
      }),
    );
    const context = await launchPersistent(chromium, profile, {
      executablePath: chromium.executablePath(),
      headless: process.env.PF_SPELLING_HEADFUL !== '1',
      proxy: {
        server: `http://127.0.0.1:${proxyAddress.port}`,
        bypass: '127.0.0.1,localhost',
      },
      args: ['--ignore-certificate-errors'],
      ignoreDefaultArgs: ['--disable-background-networking'],
      env: { ...process.env, GOOGLE_API_KEY: 'privacy-frames-local-fixture-key' },
      locale: 'en-US',
    });
    let incognito;
    try {
      const browser = context.browser();
      assert(browser);
      incognito = mode === 'incognito' ? await browser.newContext() : undefined;
      const activeContext = incognito || context;
      let page = await activeContext.newPage();
      const baseline = services.length;
      const connectBaseline = connects.length;
      const url = `http://127.0.0.1:${pageAddress.port}/?strict=${mode === 'native-control' ? '0' : '1'}&spell=${mode === 'attribute-disabled' ? 'false' : 'true'}`;
      if (mode.startsWith('runtime')) {
        await page.goto('http://127.0.0.1:4210/privacy-frames/');
        await page.getByText('Ready to install.', { exact: true }).waitFor();
        await page.locator('#app-url').fill(url);
        await page.locator('#install button').click();
        const installed = page.locator('[data-app]').first();
        await installed.waitFor();
        const opened = activeContext.waitForEvent('page');
        await installed.click();
        page = await opened;
      } else await page.goto(url);
      await page.locator('#text').waitFor();
      let attempts;
      if (mode === 'runtime') {
        attempts = await page.evaluate(attemptSpellingChanges);
        for (const attempt of attempts) {
          assert.equal(attempt.enabled, false, attempt.route + ' enabled spelling');
          assert.equal(attempt.error, undefined, attempt.route);
        }
      } else if (mode === 'runtime-idl-fault')
        await page.locator('#text').evaluate((element) => {
          if (!(element instanceof HTMLElement)) throw new Error('Missing HTML field');
          element.spellcheck = true;
        });
      await page.bringToFront();
      await page.locator('#text').focus();
      const reflection = await page.locator('#text').evaluate((element) => ({
        spellcheck: element instanceof HTMLElement && element.spellcheck,
        focused: document.hasFocus(),
      }));
      await page.keyboard.type(marker + ' ', { delay: 20 });
      const deadline = Date.now() + (mode === 'native-control' ? 20000 : 6000);
      while (
        Date.now() < deadline &&
        !services.slice(baseline).some((row) => row.containsMarker)
      )
        await page.waitForTimeout(250);
      const requests = services.slice(baseline);
      const markerRequests = requests.filter((row) => row.containsMarker);
      rows.push({
        mode,
        version: browser.version(),
        reflection,
        ...(attempts ? { attempts } : {}),
        requests,
        connects: connects.slice(connectBaseline),
        markerRequests: markerRequests.length,
      });
      console.log(mode, 'marker requests', markerRequests.length);
      if (
        mode === 'native-control' ||
        mode === 'strict-csp' ||
        mode === 'runtime-idl-fault'
      )
        assert(markerRequests.length > 0, 'Native remote-spelling control unavailable');
      else
        assert.equal(markerRequests.length, 0, 'Disabled spelling candidate sent text');
    } finally {
      await incognito?.close();
      await context.close();
    }
  }
  completed = true;
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  for (const socket of sockets) socket.destroy();
  await runtime.close();
  await Promise.all(
    [receiver, proxy, pageServer].map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
  const runnerAfter = await readFile(new URL(import.meta.url));
  const stable = runner.equals(runnerAfter);
  const after = await testProvenance(import.meta.url);
  const sourceStable = provenance.sourceSHA256 === after.sourceSHA256;
  const artifactsStable =
    JSON.stringify(provenance.artifacts) === JSON.stringify(after.artifacts);
  await writeFile(
    new URL('./ua-spelling-browser.json', import.meta.url),
    JSON.stringify(
      {
        completed: completed && stable && sourceStable && artifactsStable,
        started,
        finished: new Date().toISOString(),
        scope:
          'Owned browser-service comparison with synthetic text and a local TLS receiver. The actual runtime must remain quiet; a temporary build restoring the native spelling setter must transmit. Other browser configurations and services remain open.',
        wholeConfinementEstablished: false,
        receiver:
          'Loopback only; unknown proxy targets rejected; no service request forwarded upstream.',
        runnerSHA256: createHash('sha256').update(runner).digest('hex'),
        runnerStable: stable,
        provenance,
        sourceStable,
        artifactsStable,
        fault: {
          path: faultPath,
          sourceSHA256: createHash('sha256').update(correctSource).digest('hex'),
          alteredSourceSHA256: createHash('sha256').update(faultSource).digest('hex'),
          guardSHA256: createHash('sha256').update(faultGuard).digest('hex'),
          releaseArtifactsModified: false,
        },
        headful: process.env.PF_SPELLING_HEADFUL === '1',
        rows,
        ...(failure ? { failure } : {}),
      },
      null,
      2,
    ) + '\n',
  );
  await rm(directory, { recursive: true, force: true });
  assert(stable, 'Spelling fixture source changed during execution');
  assert(
    sourceStable && artifactsStable,
    'Runtime source or artifacts changed during execution',
  );
}
