import assert from 'node:assert/strict';
import test from 'node:test';
import { createClassicScripts } from '../src/runtime/contexts/classic-scripts.ts';
import { workerResourceAliases } from '../src/runtime/contexts/worker-aliases.ts';
import { isJavaScriptMIME } from '../src/shared/javascript-mime.ts';
import type { Installation } from '../src/shared/types.ts';

const first = 'https://runtime.test/app/first.js';
const second = 'https://runtime.test/app/second.js';
const response = (body: string, type = 'text/javascript', status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': type } });

test('classic scripts retain bytes locally and resolve synchronously without later reads', async () => {
  const reads: string[] = [];
  const scripts = createClassicScripts([first, second], async (url) => {
    reads.push(url);
    return response(url, 'application/x-javascript; charset=utf-8');
  });
  assert.throws(() => scripts.resolve(first), { name: 'NetworkError' });
  const preparation = scripts.prepare();
  assert.equal(scripts.prepare(), preparation);
  await preparation;
  const firstBlob = scripts.resolve(first);
  const secondBlob = scripts.resolve(second);
  assert(firstBlob.startsWith('blob:') && secondBlob.startsWith('blob:'));
  assert.equal(await (await fetch(firstBlob)).text(), first);
  assert.equal(await (await fetch(secondBlob)).text(), second);
  assert.deepEqual(reads, [first, second]);
  assert.throws(() => scripts.resolve(first + '?unadmitted'), { name: 'NetworkError' });
  assert.deepEqual(reads, [first, second]);
  scripts.close();
  assert.throws(() => scripts.resolve(first), { name: 'NetworkError' });
  await assert.rejects(fetch(firstBlob));
  await assert.rejects(fetch(secondBlob));
});

test('failed classic preparation publishes no partial set and has no fallback', async () => {
  for (const failure of ['missing', 'mime', 'status']) {
    let reads = 0;
    const scripts = createClassicScripts([first, second], async (url) => {
      reads++;
      if (url === first) return response('first');
      if (failure === 'missing') throw new Error('Missing installed bytes');
      return failure === 'mime'
        ? response('second', 'text/plain')
        : response('second', 'text/javascript', 404);
    });
    await assert.rejects(scripts.prepare());
    assert.throws(() => scripts.resolve(first), { name: 'NetworkError' });
    await assert.rejects(scripts.prepare());
    assert.equal(reads, 2);
  }
});

test('only requested scripts are relocated and their local URL is reused', async () => {
  const relocated: string[] = [];
  const scripts = createClassicScripts(
    [first, second],
    async (url) => response(url),
    (body, url) => {
      relocated.push(url);
      return body;
    },
  );
  await scripts.prepare();
  assert.deepEqual(relocated, []);
  const source = scripts.resolve(first);
  assert.equal(scripts.resolve(first), source);
  assert.deepEqual(relocated, [first]);
  assert.equal(await (await fetch(source)).text(), first);
  scripts.close();
  assert.throws(() => scripts.resolve(second), { name: 'NetworkError' });
  assert.deepEqual(relocated, [first]);
});

test('closing during relocation prevents local URL publication', async () => {
  const scripts = createClassicScripts(
    [first],
    async () => response('first'),
    (body) => {
      scripts.close();
      return body;
    },
  );
  await scripts.prepare();
  assert.throws(() => scripts.resolve(first), { name: 'AbortError' });
  assert.throws(() => scripts.resolve(first), { name: 'NetworkError' });
});

test('closing during an awaited script read prevents late publication', async () => {
  let release!: (value: Response) => void;
  let reads = 0;
  const scripts = createClassicScripts([first, second], () => {
    reads++;
    return new Promise<Response>((resolve) => {
      release = resolve;
    });
  });
  const pending = scripts.prepare();
  scripts.close();
  release(response('first'));
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(reads, 1);
  assert.throws(() => scripts.resolve(first), { name: 'NetworkError' });
});

test('the admitted script index uses MIME semantics rather than publisher filenames', () => {
  const app: Installation = {
    format: 'offline-resources-v1',
    id: 'app-' + 'a'.repeat(64),
    source: 'https://publisher.test/',
    manifest: { id: 'app', name: 'App', entry: 'index.html' },
    resources: [
      { path: 'legacy.data', contentType: 'TEXT/X-JAVASCRIPT; charset=utf-8' },
      { path: 'fallback.js', contentType: '' },
      { path: 'not-script.js', contentType: 'text/plain' },
      { path: 'module.data', contentType: 'application/javascript' },
    ].map((resource) => ({
      ...resource,
      url: 'https://publisher.test/' + resource.path,
      sha256: 'a'.repeat(64),
    })),
    size: 0,
    installedAt: 'fixture',
    capture: { additionalResources: [], unavailableResources: [] },
  };
  const base = new URL('https://runtime.test/');
  const resources = new URL('https://runtime.test/context/resources/');
  const result = workerResourceAliases(app, resources, base);
  assert.deepEqual(
    result.scripts,
    ['legacy.data', 'fallback.js', 'module.data'].map(
      (path) => new URL(path, resources).href,
    ),
  );
  assert.equal(result.aliases.length, 4);
  assert(isJavaScriptMIME('text/javascript1.5'));
  assert(isJavaScriptMIME('application/x-ecmascript'));
  assert(!isJavaScriptMIME('module'));
  assert(!isJavaScriptMIME('application/json'));
  assert(isJavaScriptMIME('\tTEXT/JAVASCRIPT ; charset=utf-8'));
  assert(!isJavaScriptMIME('\u00a0text/javascript'));
  assert(!isJavaScriptMIME('text/javascript\v'));
});
