import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';

const output = new URL('../.tools/guest-history/', import.meta.url);
await mkdir(output, { recursive: true });
await build({
  entryPoints: [new URL('guest-history.browser.ts', import.meta.url).pathname],
  outfile: new URL('browser.js', output).pathname,
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
});
const bundle = await readFile(new URL('browser.js', output));
const wasm = await readFile(
  new URL('../vendor/quickjs/generated/engine.wasm', import.meta.url),
);
const server = createServer((request, response) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  response.setHeader(
    'Content-Type',
    pathname.endsWith('.wasm')
      ? 'application/wasm'
      : pathname.endsWith('.js')
        ? 'text/javascript'
        : 'text/html',
  );
  response.end(
    pathname === '/quickjs.wasm'
      ? wasm
      : pathname === '/browser.js'
        ? bundle
        : '<!doctype html><script type="module" src="/browser.js"></script>',
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;
const observations = [];
try {
  for (const [name, type] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const) {
    const browser = await type.launch({ headless: true });
    try {
      const rows = [];
      for (const mode of ['native', 'guest']) {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(
          origin +
            (mode === 'native'
              ? '/publisher/index.html?initial=1#boot'
              : '/installed/runtime.html?host=1#boot'),
        );
        await page.waitForFunction(() => globalThis.guestHistoryResult !== undefined);
        const initial = await page.evaluate(() => globalThis.guestHistoryResult);
        const steps = (initial!.result as { steps: number }).steps;
        console.log(name, mode, 'history steps', steps);
        const back = await page.evaluate(
          (steps) => globalThis.guestHistoryStep(-steps),
          steps,
        );
        const forward = await page.evaluate(
          (steps) => globalThis.guestHistoryStep(steps),
          steps,
        );
        await page.evaluate(() =>
          sessionStorage.setItem('history-fixture-reloaded', 'true'),
        );
        await page.reload();
        await page.waitForFunction(() => globalThis.guestHistoryResult !== undefined);
        const reloaded = await page.evaluate(() => globalThis.guestHistoryResult);
        rows.push({ mode, initial, reloaded, errors, back, forward });
        assert.deepEqual(errors, []);
        assert(initial && !initial.error, JSON.stringify(initial));
        assert(reloaded && !reloaded.error, JSON.stringify(reloaded));
        await page.close();
      }
      const native = rows[0],
        guest = rows[1];
      // Native fragment navigation may coalesce physical entries differently
      // from mediated hash assignments. Compare the logical journey and retain
      // each observed step count for the trusted back/forward controls.
      const { steps: guestSteps, ...guestInitial } = guest.initial!.result as Record<
        string,
        unknown
      >;
      const { steps: nativeSteps, ...nativeInitial } = native.initial!.result as Record<
        string,
        unknown
      >;
      assert.equal(typeof guestSteps, 'number');
      assert.equal(typeof nativeSteps, 'number');
      assert.deepEqual(guestInitial, nativeInitial);
      assert.deepEqual(guest.back, native.back);
      assert.deepEqual(guest.forward, native.forward);
      assert.deepEqual((guest.back as { state: unknown; popState: unknown }).state, {
        value: 1,
      });
      assert.deepEqual((guest.back as { state: unknown; popState: unknown }).popState, {
        value: 1,
      });
      assert.deepEqual(guest.reloaded!.result, native.reloaded!.result);
      const result = guest.initial!.result as Record<string, unknown>;
      assert.equal(result.refused, true);
      assert.equal(result.state, null);
      assert.equal(result.href, origin + '/publisher/alternate?document=3#changed');
      assert.equal(
        guest.initial!.physical,
        origin + '/installed/runtime.html?host=1#changed',
      );
      assert.equal(guest.reloaded!.physical, guest.initial!.physical);
      observations.push({ browser: name, version: browser.version(), rows });
      console.log(JSON.stringify(observations.at(-1)));
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await writeFile(
    new URL('../results/guest-history.json', import.meta.url),
    JSON.stringify(
      { bundleHash: createHash('sha256').update(bundle).digest('hex'), observations },
      null,
      2,
    ) + '\n',
  );
}
