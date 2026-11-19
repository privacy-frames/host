import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';

const bundle = await build({
  entryPoints: ['test/fixtures/guest-resource-hints.ts'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
});
const requested: string[] = [];
const sink = createServer((request, response) => {
  requested.push(request.url ?? '/');
  response.writeHead(200, {
    'Content-Type': 'text/javascript',
    'Access-Control-Allow-Origin': '*',
  });
  response.end('globalThis.unexpectedNativeExecution = true;');
});
const server = createServer((request, response) => {
  response.writeHead(200, {
    'Content-Type': request.url === '/fixture.js' ? 'text/javascript' : 'text/html',
  });
  response.end(
    request.url === '/fixture.js'
      ? bundle.outputFiles[0].contents
      : '<!doctype html><script type="module" src="/fixture.js"></script>',
  );
});
await Promise.all([
  new Promise<void>((resolve) => sink.listen(0, '127.0.0.1', resolve)),
  new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)),
]);
const address = server.address(),
  sinkAddress = sink.address();
assert(
  address &&
    typeof address === 'object' &&
    sinkAddress &&
    typeof sinkAddress === 'object',
);
const receipts = [];
try {
  for (const [name, type] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const) {
    requested.length = 0;
    const browser = await type.launch();
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(
        `http://127.0.0.1:${address.port}/#${encodeURIComponent('http://127.0.0.1:' + sinkAddress.port)}`,
      );
      await page.waitForFunction(() => Reflect.has(globalThis, 'resourceHintResult'));
      const result = await page.evaluate(() =>
        Reflect.get(globalThis, 'resourceHintResult'),
      );
      receipts.push({
        browser: name,
        version: browser.version(),
        result,
        requested: [...requested],
        errors,
      });
      console.log(JSON.stringify(receipts.at(-1)));
      assert.equal(result.error, undefined);
      assert.deepEqual(result.first, ['load']);
      assert.equal(result.noNativeHref, true);
      assert.equal(result.noPreloadExecution, true);
      assert.equal(result.deduplicated, true);
      assert.deepEqual(result.changed, ['load', 'load', 'error']);
      assert.equal(result.cancelled, true);
      assert.equal(result.detached, true);
      assert.deepEqual(result.detachedEvents, ['load']);
      assert.deepEqual(result.evaluated, ['b']);
      assert.deepEqual(result.errors, []);
      assert.equal(result.nativeExecution, undefined);
      assert.deepEqual(requested, ['/native-control.js']);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  }
} finally {
  await Promise.all(
    [sink, server].map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  await mkdir('results/guest-runtime', { recursive: true });
  await writeFile(
    'results/guest-runtime/resource-hints.json',
    JSON.stringify({ completed: new Date().toISOString(), receipts }, null, 2) + '\n',
  );
}
