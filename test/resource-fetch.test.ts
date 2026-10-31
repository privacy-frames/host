import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { createHash } from 'node:crypto';
import { createResourceFetch } from '../src/runtime/resource-fetch.ts';

const originals = Object.getOwnPropertyDescriptors(Response.prototype);
afterEach(() => Object.defineProperties(Response.prototype, originals));
const tools = {
  accessor(object: object, key: PropertyKey, descriptor: PropertyDescriptor) {
    Object.defineProperty(object, key, {
      ...Object.getOwnPropertyDescriptor(object, key),
      ...descriptor,
      configurable: true,
    });
  },
  method(object: object, key: PropertyKey, value: Function) {
    Object.defineProperty(object, key, { value, writable: true, configurable: true });
  },
};
const url = 'https://runtime.test/app/value.json';
function packet(address = url) {
  return {
    url: address,
    status: 200,
    statusText: '',
    headers: [['content-type', 'application/json']],
    body: new TextEncoder().encode('{"value":42}').buffer,
  };
}

test('local fetch preserves native bodies, URL/type, cloning and request headers', async () => {
  const calls: { url: string; headers: [string, string][] }[] = [];
  const fetchResource = createResourceFetch(async (url, headers) => {
    calls.push({ url, headers });
    return packet();
  }, tools);
  const response = await fetchResource(
    new Request(url + '#local', { headers: { 'x-dummy': 'original' } }),
    { headers: { 'x-dummy': 'override' } },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, url);
  assert.equal(calls[0].headers[0][0], 'x-dummy');
  assert.equal(calls[0].headers[0][1], 'override');
  assert.equal(response.url, url);
  assert.equal(response.type, 'basic');
  assert.equal(response.status, 200);
  assert.equal(response.statusText, '');
  assert.equal(response.headers.get('content-type'), 'application/json');
  const clone = response.clone();
  assert.equal(clone.url, url);
  assert.equal(clone.type, 'basic');
  assert.deepEqual(await response.json(), { value: 42 });
  assert.deepEqual(await clone.json(), { value: 42 });
  await assert.rejects(response.text());
  assert.equal(new Response('ordinary').url, '');
  assert.equal(new Response('ordinary').type, 'default');
});

test('native byte streams remain usable for Wasm streaming', async () => {
  const fetchResource = createResourceFetch(
    async () => ({
      ...packet(),
      headers: [['content-type', 'application/wasm']],
      body: Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0]).buffer,
    }),
    tools,
  );
  const value = await WebAssembly.instantiateStreaming(fetchResource(url));
  assert(value.module instanceof WebAssembly.Module);
});

test('invalid method, body and aborted requests never start a read', async () => {
  let reads = 0;
  const fetchResource = createResourceFetch(async () => {
    reads++;
    return packet();
  }, tools);
  await assert.rejects(fetchResource(url, { method: 'POST', body: 'private' }));
  await assert.rejects(fetchResource(url, { method: 'GET', body: 'private' }));
  const controller = new AbortController();
  const reason = new Error('Cancelled before read');
  controller.abort(reason);
  await assert.rejects(fetchResource(url, { signal: controller.signal }), reason);
  assert.equal(reads, 0);
});

test('native local-Blob verification preserves matching and mismatching integrity', async () => {
  const value = packet();
  const integrity =
    'sha256-' + createHash('sha256').update(new Uint8Array(value.body)).digest('base64');
  const fetchResource = createResourceFetch(async () => value, tools);
  assert.deepEqual(await (await fetchResource(url, { integrity })).json(), { value: 42 });
  await assert.rejects(
    fetchResource(url, {
      integrity: 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    }),
    TypeError,
  );
});

test('abort rejects immediately while a local read is pending', async () => {
  let complete!: (value: unknown) => void;
  const fetchResource = createResourceFetch(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
    tools,
  );
  const controller = new AbortController();
  const response = fetchResource(url, { signal: controller.signal });
  const rejected = assert.rejects(response, /Cancelled pending read/);
  controller.abort(new Error('Cancelled pending read'));
  await rejected;
  complete(packet());
});

test('malformed or mismatched replies and read failures reject locally', async () => {
  const values = [
    null,
    [],
    { ...packet(), url: 'https://foreign.test/' },
    { ...packet(), status: 0 },
    { ...packet(), body: new Uint8Array(2) },
    { ...packet(), headers: [['invalid\nheader', 'value']] },
    { ...packet(), headers: [['too', 'many', 'items']] },
    Object.create(packet()),
  ];
  let reply: unknown;
  const fetchResource = createResourceFetch(async () => reply, tools);
  for (const value of values) {
    reply = value;
    await assert.rejects(fetchResource(url));
  }
});

test('local Blob and data reads keep native fetch without using the broker', async () => {
  const fetchResource = createResourceFetch(async () => {
    throw new Error('Broker must not be used');
  }, tools);
  assert.equal(await (await fetchResource('data:text/plain,local')).text(), 'local');
  const address = URL.createObjectURL(new Blob(['blob-local']));
  try {
    assert.equal(await (await fetchResource(address)).text(), 'blob-local');
  } finally {
    URL.revokeObjectURL(address);
  }
});
