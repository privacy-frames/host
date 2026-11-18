import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';

const root = new URL('../', import.meta.url).pathname;
const bundle = await build({
  entryPoints: [root + 'test/fixtures/guest-parser.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
});
const requests: string[] = [];
const sinkRequests: string[] = [];
const sink = createServer((request, response) => {
  sinkRequests.push(request.url || '/');
  response.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
  response.end();
});
const server = createServer((request, response) => {
  requests.push(request.url || '/');
  if (request.url === '/fixture.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end(bundle.outputFiles[0].contents);
  } else if (request.url?.startsWith('/outside')) {
    response.writeHead(204);
    response.end();
  } else {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><script type="module" src="/fixture.js"></script>');
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
await new Promise<void>((resolve) => sink.listen(0, '127.0.0.1', resolve));
const address = server.address();
const sinkAddress = sink.address();
assert(address && typeof address === 'object');
assert(sinkAddress && typeof sinkAddress === 'object');
const external = `http://127.0.0.1:${sinkAddress.port}`;
const receipts = [];
try {
  for (const [name, type] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const) {
    requests.length = 0;
    sinkRequests.length = 0;
    const browser = await type.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      const browserRequests: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => browserRequests.push(request.url()));
      const base: string = `http://127.0.0.1:${address.port}`;
      await page.goto(base + '/#' + encodeURIComponent(external));
      await page.waitForFunction(() => 'parserResult' in globalThis);
      await page.waitForTimeout(50);
      const result = await page.evaluate(() => Reflect.get(globalThis, 'parserResult'));
      const observed = [...requests];
      receipts.push({
        browser: name,
        version: browser.version(),
        result,
        requests: observed,
        sinkRequests: [...sinkRequests],
        browserRequests: [...browserRequests],
        errors,
      });
      console.log(JSON.stringify(receipts.at(-1)));
      assert.equal(result.error, undefined);
      assert.equal(result.html.defaultView, true);
      assert.equal(result.html.contentType, 'text/html');
      assert.equal(result.html.doctype, 'html');
      assert.equal(result.html.base, 'https://publisher.invalid/app/');
      assert(result.html.mapped.startsWith('blob:' + base + '/'));
      assert.equal(result.html.unknown, 'data:application/octet-stream,');
      assert.equal(result.html.invalid, 'data:application/octet-stream,');
      assert.equal(
        result.html.sourceSet,
        result.html.mapped + ' 1x, data:application/octet-stream, 2x',
      );
      for (const key of [
        'handlerAbsent',
        'frameAbsent',
        'objectDataWithheld',
        'objectRetained',
        'objectAttributesWithheld',
        'embedRetained',
        'embedSourceWithheld',
        'refreshAbsent',
      ])
        assert.equal(result.html[key], true, key);
      assert.equal(result.inertObjectsAfterInsertion, true);
      assert.equal(result.html.customConstructorsBeforeAttachment, 0);
      assert.equal(result.html.frameHasNoContext, true);
      assert.equal(result.html.template, 'kept');
      assert.equal(result.html.jsonKept, '{"local":true}');
      assert.equal(result.html.scriptType, 'application/x-privacy-frames-inert');
      assert.equal(result.html.scriptMetadata.inert, true);
      assert.equal(result.html.scriptMetadata.code, 'globalThis.nativeScriptMarker=true');
      assert(!result.html.style.includes('marker='));
      assert.deepEqual(result.xml, {
        root: 'mxGraphModel',
        attribute: 'Keep',
        ID: '1',
        label: '<img src="https://outside.invalid/secret">',
        style: 'image=https://outside.invalid/data;',
        src: 'https://outside.invalid/data',
        doctype: 'mxGraphModel',
        systemId: 'https://outside.invalid/schema.dtd',
        cdataType: 4,
        cdata: 'a<b',
      });
      assert.equal(result.svg.namespace, 'http://www.w3.org/2000/svg');
      assert.equal(result.svg.gradientName, 'linearGradient');
      assert.equal(result.svg.viewBox, '0 0 10 10');
      assert.equal(result.svg.href, 'data:application/octet-stream,');
      assert.equal(result.svg.animation, 'data:application/octet-stream,');
      assert(result.svg.fill.includes('data:application/octet-stream,'));
      assert.equal(result.svg.dangerousAnimationWithheld, true);
      assert.equal(result.svg.baseWithheld, true);
      assert.equal(result.qualifiedAnimation, 'data:application/octet-stream,');
      assert.equal(result.baseAnimationWithheld, true);
      assert(result.stylesheetPI.includes('data:application/octet-stream,'));
      assert.equal(result.dtdSubset, 'parsererror');
      assert.deepEqual(result.publicDoctype, {
        publicId: '-//W3C//DTD SVG 1.1//EN',
        systemId: 'http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd',
      });
      assert.equal(result.malformed, 'parsererror');
      assert.equal(result.unknownEntity, 'parsererror');
      assert.equal(result.unsupported, true);
      assert.equal(result.nativeMarkersAbsent, true);
      assert.equal(result.scriptPositiveControl, true);
      assert.equal(result.nativeParsedScriptInertAfterInsertion, true);
      assert.deepEqual(errors, []);
      assert(sinkRequests.some((url) => url.includes('positive-control')));
      assert(
        sinkRequests.every(
          (url) => url.includes('native-control') || url.includes('positive-control'),
        ),
        JSON.stringify(sinkRequests),
      );
      assert(
        observed.every((url) => !url.startsWith('/outside')),
        JSON.stringify(observed),
      );
      assert(
        browserRequests.every(
          (url) =>
            url.startsWith(base + '/') ||
            (url.startsWith(external + '/') &&
              (url.includes('native-control') || url.includes('positive-control'))),
        ),
        JSON.stringify(browserRequests),
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => sink.close(() => resolve()));
}
await mkdir(root + 'results/guest-runtime', { recursive: true });
await writeFile(
  root + 'results/guest-runtime/parser.json',
  JSON.stringify(
    {
      completed: new Date().toISOString(),
      bundleSHA256: createHash('sha256')
        .update(bundle.outputFiles[0].contents)
        .digest('hex'),
      receipts,
    },
    null,
    2,
  ) + '\n',
);
