import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { createRequire } from 'node:module';
import type { BrowserType } from 'playwright';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(
  resolve(process.env.PLAYWRIGHT_PACKAGE ?? resolve(root, 'package.json')),
);
const {
  chromium,
  firefox,
}: { chromium: BrowserType; firefox: BrowserType } = require('playwright');
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url!, 'http://localhost').pathname;
    if (path === '/') {
      response.setHeader('content-type', 'text/html');
      response.end(
        '<!doctype html><html><body><script type="module" src="/browser.ts"></script></body></html>',
      );
      return;
    }
    if (path === '/pitch-main.js' || path === '/generated-guest.js') {
      const fixture =
        path === '/pitch-main.js'
          ? (process.env.PITCH_SOURCE ??
            '/home/damen/Projects/privacy-frames-research-app-service-workers/.scratch/app-sw-sources/pitch-main-current.js')
          : (process.env.GENERATED_SOURCE ??
            resolve(root, 'fixtures/generated-guest.js'));
      response.setHeader('content-type', 'text/javascript');
      response.end(await readFile(fixture));
      return;
    }
    const target = resolve(root, '.' + path);
    if (!target.startsWith(root + '/')) throw Error('invalid path');
    const source = await readFile(target);
    response.setHeader(
      'content-type',
      extname(target) === '.wasm' ? 'application/wasm' : 'text/javascript',
    );
    response.end(
      target.endsWith('.ts') ? stripTypeScriptTypes(source.toString()) : source,
    );
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
if (!address || typeof address === 'string') throw Error('missing address');
let failed = false;
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch({ headless: true });
    const page = await browser.newPage();
    const errors: string[] = [];
    const requests: string[] = [];
    page.on('pageerror', (error: Error) => errors.push(String(error)));
    page.on('request', (request: { url(): string }) => requests.push(request.url()));
    const suffix =
      process.env.CALLBACK_MODE === 'eval'
        ? '-nested-eval-control'
        : process.env.BUILD_VARIANT === 'intl'
          ? '-intl'
          : '';
    await page.goto(
      `http://127.0.0.1:${address.port}/${process.env.CALLBACK_MODE === 'eval' ? '?nested-eval-control' : ''}`,
    );
    try {
      await page.waitForFunction(() => 'probeReceipt' in globalThis, undefined, {
        timeout: 60000,
      });
      const receipt = await page.evaluate(() => globalThis.probeReceipt);
      const wasm = await stat(resolve(root, 'pkg/boa_browser_probe_bg.wasm'));
      const result = {
        date: new Date().toISOString(),
        browser: name,
        version: browser.version(),
        node: process.version,
        wasmBytes: wasm.size,
        wasmSha256: createHash('sha256')
          .update(await readFile(resolve(root, 'pkg/boa_browser_probe_bg.wasm')))
          .digest('hex'),
        generatedGuestSha256: createHash('sha256')
          .update(await readFile(resolve(root, 'fixtures/generated-guest.js')))
          .digest('hex'),
        cargoFeatures:
          process.env.BUILD_VARIANT === 'intl'
            ? ['float16', 'xsum', 'temporal', 'js', 'annex-b', 'intl_bundled']
            : ['float16', 'xsum', 'temporal', 'js', 'annex-b'],
        ...receipt,
        errors,
        requests,
      };
      await writeFile(
        resolve(root, `receipts/${name}${suffix}.json`),
        JSON.stringify(result, null, 2) + '\n',
      );
      const failures = receipt.receipts.filter(
        (item: { passed: boolean }) => !item.passed,
      );
      failed ||= errors.length > 0 || failures.length > 0;
      console.log(
        JSON.stringify({
          browser: name,
          version: browser.version(),
          probes: receipt.receipts.length,
          failures,
          errors,
          timingMs: receipt.timingMs,
        }),
      );
    } catch (error) {
      failed = true;
      console.log(JSON.stringify({ browser: name, error: String(error), errors }));
    }
    await browser.close();
  }
} finally {
  server.close();
}
if (failed) process.exitCode = 1;
