import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';

const bundle = await build({
  entryPoints: ['test/fixtures/guest-css.ts'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
});
const requests: string[] = [];
const sink = createServer((request, response) => {
  requests.push(request.url ?? '/');
  if (request.url === '/theme.css') {
    response.writeHead(200, { 'Content-Type': 'text/css' });
    response.end('.imported{border:3px solid rgb(1,2,3)}');
  } else {
    response.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    response.end('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>');
  }
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
  receiver = sink.address();
assert(
  address && typeof address === 'object' && receiver && typeof receiver === 'object',
);
const receipts = [];
try {
  for (const [name, type] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const) {
    requests.length = 0;
    const browser = await type.launch();
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(
        `http://127.0.0.1:${address.port}/#${encodeURIComponent('http://127.0.0.1:' + receiver.port)}`,
      );
      await page.waitForFunction(() => Reflect.has(globalThis, 'guestCSSResult'));
      const result = await page.evaluate(() => Reflect.get(globalThis, 'guestCSSResult'));
      receipts.push({
        browser: name,
        version: browser.version(),
        result,
        requests: [...requests],
        errors,
      });
      assert.equal(result.error, undefined);
      for (const key of ['display', 'width', 'height', 'border'])
        assert.equal(result.native[key], result.protected[key]);
      assert.equal(result.protected.display, 'grid');
      assert.equal(result.protected.width, '30px');
      assert.equal(result.protected.height, '11px');
      assert.equal(result.protected.border, '3px');
      assert(result.protected.background.includes('data:image/svg+xml'));
      assert.deepEqual(result.mapped, [
        `http://127.0.0.1:${receiver.port}/theme.css`,
        `http://127.0.0.1:${receiver.port}/image.svg`,
      ]);
      assert.deepEqual(requests.sort(), ['/image.svg', '/theme.css']);
      assert.deepEqual(errors, []);
      console.log(
        name + ' nested conditional styles and mediated resource requests passed',
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await Promise.all(
    [server, sink].map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  await mkdir('results/guest-runtime', { recursive: true });
  await writeFile(
    'results/guest-runtime/css.json',
    JSON.stringify({ completed: new Date().toISOString(), receipts }, null, 2) + '\n',
  );
}
