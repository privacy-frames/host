import test from 'node:test';
import assert from 'node:assert/strict';
import {
  documentRequestInput,
  parseDocumentRequest,
  readDocumentRequest,
} from '../src/runtime/contexts/document-request.ts';
import { applicationURL, resourceURL } from '../src/shared/runtime-url.ts';
import type { StoredInstallation } from '../src/runtime/storage.ts';

const runtime = new URL('https://runtime.test/runtime/');
const app: StoredInstallation = {
  id: 'documents-' + 'a'.repeat(64),
  generation: 'host-generation',
  manifest: { id: 'documents', name: 'Documents', entry: 'index.html' },
  source: 'https://publisher.test/app/',
  size: 1,
  installedAt: 'fixture',
  format: 'offline-resources-v1',
  capture: { additionalResources: [], unavailableResources: [] },
  resources: [
    {
      path: 'child.html',
      url: 'https://publisher.test/app/child.html',
      contentType: 'text/html',
      sha256: 'fixture',
    },
    {
      path: 'child.svg',
      url: 'https://publisher.test/app/child.svg',
      contentType: 'image/svg+xml',
      sha256: 'fixture',
    },
  ],
};

test('installed document requests select only the authenticated graph and generation', async () => {
  const reads: string[] = [];
  const store = {
    async getResource(id: string, path: string, generation: string) {
      assert.equal(id, app.id);
      assert.equal(generation, app.generation);
      reads.push(path);
      return new TextEncoder().encode(path.endsWith('.svg') ? '<svg/>' : '<p>HTML</p>')
        .buffer;
    },
  };
  for (const url of ['child.html', resourceURL(app, 'child.html', runtime).href]) {
    const value = await documentRequestInput(
      { source: { kind: 'url', url } },
      app,
      runtime,
      store,
    );
    assert.equal(value.kind, 'html');
    assert.equal(value.text, '<p>HTML</p>');
    assert.equal(value.sourceURL, app.resources[0].url);
    assert(
      value.aliases.every(([, target]) =>
        target.startsWith(applicationURL(app, runtime).href),
      ),
    );
  }
  const svg = await documentRequestInput(
    { source: { kind: 'url', url: app.resources[1].url } },
    app,
    runtime,
    store,
  );
  assert.equal(svg.kind, 'svg');
  for (const url of [
    'https://other.test/private.html',
    'https://runtime.test/runtime/another-app/child.html',
  ])
    await assert.rejects(
      documentRequestInput(
        { source: { kind: 'url', url }, application: 'other' },
        app,
        runtime,
        store,
      ),
      /not installed/,
    );
  assert.deepEqual(structuredClone(reads), ['child.html', 'child.html', 'child.svg']);
});

test('srcdoc, percent-encoded and base64 data documents remain local source text', async () => {
  const store = {
    async getResource(): Promise<ArrayBuffer> {
      throw new Error('No resource read expected');
    },
  };
  const inline = await documentRequestInput(
    {
      source: {
        kind: 'srcdoc',
        text: '<p>Local</p>',
        baseURL: 'https://publisher.test/assets/',
      },
    },
    app,
    runtime,
    store,
  );
  assert.equal(inline.baseURL, 'https://publisher.test/assets/');
  assert.equal(inline.text, '<p>Local</p>');
  const html = await documentRequestInput(
    {
      source: {
        kind: 'data',
        url: 'data:text/html;charset=utf-8,%3Cp%3E%C3%A6%3C%2Fp%3E#section',
      },
    },
    app,
    runtime,
    store,
  );
  assert.equal(html.kind, 'html');
  assert.equal(html.text, '<p>æ</p>');
  const svg = await documentRequestInput(
    { source: { kind: 'data', url: 'data:image/svg+xml;base64,' + btoa('<svg/>') } },
    app,
    runtime,
    store,
  );
  assert.equal(svg.kind, 'svg');
  assert.equal(svg.text, '<svg/>');
  await assert.rejects(
    documentRequestInput(
      { source: { kind: 'data', url: 'data:application/pdf;base64,AAAA' } },
      app,
      runtime,
      store,
    ),
    /Only HTML and SVG/,
  );
});

test('Blob documents require runtime origin and an explicit supported body type', async () => {
  const store = {
    async getResource(): Promise<ArrayBuffer> {
      throw new Error('Unexpected read');
    },
  };
  const value = await documentRequestInput(
    {
      source: { kind: 'blob', url: 'blob:https://runtime.test/fixture' },
      blobContent: { contentType: 'image/svg+xml', text: '<svg/>' },
    },
    app,
    runtime,
    store,
  );
  assert.equal(value.kind, 'svg');
  assert.equal(value.text, '<svg/>');
  await assert.rejects(
    documentRequestInput(
      {
        source: { kind: 'blob', url: 'blob:https://publisher.test/fixture' },
        blobContent: { contentType: 'text/html', text: '' },
      },
      app,
      runtime,
      store,
    ),
    /runtime-origin/,
  );
  await assert.rejects(
    documentRequestInput(
      {
        source: { kind: 'blob', url: 'blob:https://runtime.test/fixture' },
        blobContent: { contentType: 'application/javascript', text: '' },
      },
      app,
      runtime,
      store,
    ),
    /Only HTML and SVG/,
  );
});

test('request parsing accepts JSON data while malformed source accessors are not invoked', async () => {
  const value = await readDocumentRequest(
    new Request('https://runtime.test/register', {
      method: 'POST',
      body: JSON.stringify({ source: { kind: 'empty' } }),
    }),
  );
  assert.deepEqual(structuredClone(value), { source: { kind: 'empty' } });
  const firefoxRequest = new Request('https://runtime.test/register', {
    method: 'POST',
    body: JSON.stringify({ source: { kind: 'empty' } }),
  });
  Object.defineProperty(firefoxRequest, 'body', { value: null });
  assert.deepEqual(await readDocumentRequest(firefoxRequest), value);
  await assert.rejects(
    readDocumentRequest(
      new Request('https://runtime.test/register', { method: 'POST', body: '{' }),
    ),
  );
  let invoked = false;
  const request = {
    get source() {
      invoked = true;
      return { kind: 'empty' };
    },
  };
  await assert.rejects(
    documentRequestInput(request, app, runtime, {
      getResource: async () => new ArrayBuffer(0),
    }),
    /data properties/,
  );
  assert.equal(invoked, false);
});

test('installed secondary documents retain their captured base URL', async () => {
  const child = { ...app.resources[0], documentBase: 'https://publisher.test/assets/' };
  const scoped = { ...app, resources: [child, ...app.resources.slice(1)] };
  const input = await documentRequestInput(
    { source: { kind: 'url', url: child.url } },
    scoped,
    runtime,
    {
      async getResource() {
        return new TextEncoder().encode('<p>Child</p>').buffer;
      },
    },
  );
  assert.equal(input.sourceURL, child.url);
  assert.equal(input.baseURL, child.documentBase);
});

test('controller document payloads require JSON text and detach prototype-sensitive records', () => {
  const value = parseDocumentRequest(
    '{"source":{"kind":"empty"},"__proto__":{"application":"other"}}',
  );
  assert(value && typeof value === 'object');
  assert.equal(Object.getPrototypeOf(Object.getPrototypeOf(value)), null);
  assert.equal('application' in value, false);
  for (const invalid of [undefined, null, {}, '', '{'])
    assert.throws(() => parseDocumentRequest(invalid));
});
