import { ResourceUnavailableError } from '../src/installation/resource-capture.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadWebsite } from '../src/installation/import-website.ts';
import { compileDocumentContent } from '../src/runtime/contexts/document-content.ts';

const source = 'https://publisher.test/application/';
const address = (path: string) => new URL(path, source).href;

async function withFetch(fetcher: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

test('partial capture retains the successful dependency graph and records transport failures', async () => {
  const requested: string[] = [];
  await withFetch(
    async (input) => {
      const url = String(input);
      requested.push(url);
      if (url === source)
        return new Response(
          '<!doctype html><title>Partial app</title><link rel="stylesheet" href="site.css"><script src="working.js"></script><script src="analytics.js" onerror="window.analyticsFailed=true"></script><script type="module" src="missing-module.js"></script><img src="broken.png">',
          { headers: { 'content-type': 'text/html' } },
        );
      if (url === address('working.js'))
        return new Response('window.applicationStarted=true;', {
          headers: { 'content-type': 'text/javascript' },
        });
      if (url === address('site.css'))
        return new Response('body{background:url(missing.png)}', {
          headers: { 'content-type': 'text/css' },
        });
      if (url === address('analytics.js')) throw new TypeError('CORS failure');
      if (url === address('broken.png')) return new Response(null, { status: 204 });
      return new Response('Missing', { status: 404 });
    },
    async () => {
      const app = await downloadWebsite({ url: source });
      assert.deepEqual(
        app.resources.map((item) => item.url).sort(),
        [source, address('working.js'), address('site.css')].sort(),
      );
      const failures = app.capture.unavailableResources ?? [];
      assert(
        failures.some(
          (item) => item.url === address('analytics.js') && item.reason === 'network',
        ),
      );
      assert(
        failures.some(
          (item) =>
            item.url === address('missing-module.js') &&
            item.reason === 'http' &&
            item.status === 404,
        ),
      );
      assert(
        failures.some(
          (item) => item.url === address('broken.png') && item.reason === 'body',
        ),
      );
      assert.equal(requested.filter((url) => url === address('analytics.js')).length, 1);
      const entry = app.resources.find((item) => item.url === source)!;
      const content = compileDocumentContent({
        kind: 'html',
        text: new TextDecoder().decode(entry.bytes),
        sourceURL: source,
        aliases: app.resources.map((item) => [
          item.url,
          'https://runtime.test/' + item.path,
        ]),
        unavailableURLs: failures.map((item) => item.url),
      });
      assert.equal(
        content.scripts.filter((item) => item.source.kind === 'resource').length,
        1,
      );
      assert.equal(
        content.scripts.filter((item) => item.source.kind === 'unavailable').length,
        2,
      );
      assert(!JSON.stringify(content).includes('CORS failure'));
    },
  );
});

test('the entry document remains mandatory even though dependencies are best effort', async () => {
  for (const failure of ['network', 'http'])
    await withFetch(
      async () => {
        if (failure === 'network') throw new TypeError('Unavailable');
        return new Response('Missing', { status: 404 });
      },
      async () => {
        await assert.rejects(downloadWebsite({ url: source }), ResourceUnavailableError);
      },
    );
});

test('capture retains markup as data without executing application code', async () => {
  await withFetch(
    async () =>
      new Response('<a href="javascript:throw new Error(1)">Link</a>', {
        headers: { 'content-type': 'text/html' },
      }),
    async () => {
      const installation = await downloadWebsite({ url: source });
      assert(installation.resources.some((resource) => resource.path === 'index.html'));
    },
  );
});

test('partial capture does not swallow unsupported script or module analysis errors', async () => {
  for (const body of [
    '<script type="unrecognized" src="unsafe.js"></script>',
    '<script type="module">import value from "unmapped-package";</script>',
  ])
    await withFetch(
      async () =>
        new Response(body, {
          headers: { 'content-type': 'text/html' },
        }),
      async () => {
        await assert.rejects(downloadWebsite({ url: source }));
      },
    );
});
