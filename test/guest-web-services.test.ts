import assert from 'node:assert/strict';
import test from 'node:test';
import { GuestResources } from '../src/guest/resources.ts';
import { createGuestWebServices } from '../src/guest/web-services.ts';

const bytes = (text: string) => new TextEncoder().encode(text).buffer;
const nativeGlobal = globalThis as typeof globalThis & WorkerGlobalScope;

function resources(): GuestResources {
  return new GuestResources({
    application: 'fixture',
    generation: 'fixture',
    sourceURL: 'https://publisher.example/app/',
    documentBase: 'https://publisher.example/app/',
    runtimeURL: 'https://runtime.example/',
    applicationURL: 'https://runtime.example/fixture/app/',
    engineWasm: new ArrayBuffer(0),
    resources: [
      {
        url: 'https://publisher.example/app/value.txt',
        path: 'value.txt',
        contentType: 'text/plain;charset=utf-8',
        bytes: bytes('local text'),
      },
      {
        url: 'https://publisher.example/app/value.json',
        path: 'value.json',
        contentType: 'application/json',
        bytes: bytes('{"answer":42}'),
      },
      {
        url: 'https://publisher.example/app/bad.json',
        path: 'bad.json',
        contentType: 'application/json',
        bytes: bytes('bad'),
      },
    ],
  });
}

test('asynchronous local XHR preserves ready-state, handlers, headers and response identity', async () => {
  const services = createGuestWebServices({
    resources: resources(),
    nativeGlobal,
    application: 'fixture',
  });
  const xhr = new services.XMLHttpRequest();
  const states: number[] = [];
  const events: string[] = [];
  xhr.onreadystatechange = function () {
    states.push(this.readyState);
  };
  for (const type of ['loadstart', 'progress', 'load', 'loadend'])
    xhr.addEventListener(type, () => events.push(type));
  const completed = new Promise<void>((resolve) => (xhr.onloadend = () => resolve()));
  xhr.open('get', 'value.json#fragment');
  xhr.responseType = 'json';
  xhr.send();
  await completed;
  assert.deepEqual(states, [1, 2, 3, 4]);
  assert.deepEqual(events, ['loadstart', 'progress', 'load', 'loadend']);
  assert.deepEqual(xhr.response, { answer: 42 });
  assert.equal(xhr.response, xhr.response);
  assert.equal(xhr.responseURL, 'https://publisher.example/app/value.json');
  assert.equal(xhr.status, 200);
  assert.equal(xhr.statusText, 'OK');
  assert.equal(xhr.getResponseHeader('content-type'), 'application/json');
  assert.equal(xhr.getAllResponseHeaders(), 'content-type: application/json\r\n');
  assert.throws(() => xhr.responseText, { name: 'InvalidStateError' });
  services.dispose();
});

test('synchronous catalog reads complete before send returns', () => {
  const services = createGuestWebServices({
    resources: resources(),
    nativeGlobal,
    application: 'fixture',
  });
  const xhr = new services.XMLHttpRequest();
  const states: number[] = [];
  xhr.onreadystatechange = () => states.push(xhr.readyState);
  xhr.open('GET', 'value.txt', false);
  xhr.send();
  assert.equal(xhr.readyState, xhr.DONE);
  assert.equal(xhr.responseText, 'local text');
  assert.deepEqual(states, [xhr.OPENED, xhr.DONE]);
  xhr.open('HEAD', 'value.txt', false);
  xhr.send();
  assert.equal(xhr.responseText, '');
  services.dispose();
});

test('missing local resources fail without a network fallback', async () => {
  const services = createGuestWebServices({
    resources: resources(),
    nativeGlobal,
    application: 'fixture',
  });
  const xhr = new services.XMLHttpRequest();
  const events: string[] = [];
  for (const type of ['error', 'load', 'loadend'])
    xhr.addEventListener(type, () => events.push(type));
  const completed = new Promise<void>((resolve) => (xhr.onloadend = () => resolve()));
  xhr.open('GET', 'https://missing.example/private');
  xhr.send();
  await completed;
  assert.deepEqual(events, ['error', 'loadend']);
  assert.equal(xhr.status, 0);
  assert.equal(xhr.responseURL, '');
  assert.equal(xhr.responseText, '');
  const synchronous = new services.XMLHttpRequest();
  synchronous.open('GET', 'https://missing.example/private', false);
  assert.throws(() => synchronous.send(), { name: 'NetworkError' });
  await assert.rejects(
    services.fetch('https://missing.example/private'),
    /not installed/,
  );
  services.dispose();
});

test('response types use catalog bytes and invalid JSON becomes null', async () => {
  const services = createGuestWebServices({
    resources: resources(),
    nativeGlobal,
    application: 'fixture',
  });
  for (const type of ['arraybuffer', 'blob', 'json'] as const) {
    const xhr = new services.XMLHttpRequest();
    xhr.open('GET', type === 'json' ? 'bad.json' : 'value.txt', false);
    xhr.responseType = type;
    xhr.send();
    if (type === 'arraybuffer') {
      assert(xhr.response instanceof ArrayBuffer);
      assert.equal(new TextDecoder().decode(xhr.response), 'local text');
    } else if (type === 'blob') {
      assert(xhr.response instanceof Blob);
      assert.equal(await xhr.response.text(), 'local text');
    } else assert.equal(xhr.response, null);
  }
  services.dispose();
});

test('abort prevents queued resource completion and resets request state', async () => {
  const services = createGuestWebServices({
    resources: resources(),
    nativeGlobal,
    application: 'fixture',
  });
  const xhr = new services.XMLHttpRequest();
  const events: string[] = [];
  for (const type of ['abort', 'load', 'loadend'])
    xhr.addEventListener(type, () => events.push(type));
  xhr.open('GET', 'value.txt');
  xhr.send();
  xhr.abort();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(events, ['abort', 'loadend']);
  assert.equal(xhr.readyState, xhr.UNSENT);
  assert.equal(xhr.status, 0);
  assert.equal(xhr.responseText, '');
  services.dispose();
});

test('request timeout ends a stalled local read', async () => {
  class PendingResources extends GuestResources {
    override fetch(): Promise<Response> {
      return new Promise(() => {});
    }
  }
  const services = createGuestWebServices({
    resources: new PendingResources(resources().catalog),
    nativeGlobal,
    application: 'fixture',
  });
  const xhr = new services.XMLHttpRequest();
  const completed = new Promise<void>((resolve) => (xhr.ontimeout = () => resolve()));
  xhr.open('GET', 'value.txt');
  xhr.timeout = 5;
  xhr.send();
  await completed;
  assert.equal(xhr.readyState, xhr.DONE);
  assert.equal(xhr.status, 0);
  services.dispose();
});

test('local fetch exposes logical URL, native Response brand, clone and cancellation', async () => {
  const services = createGuestWebServices({
    resources: resources(),
    nativeGlobal,
    application: 'fixture',
  });
  const response = await services.fetch('value.txt#fragment');
  assert.equal(response.url, 'https://publisher.example/app/value.txt');
  assert(response instanceof Response);
  const copy = response.clone();
  assert.equal(copy.url, response.url);
  assert.equal(await Response.prototype.text.call(response), 'local text');
  assert.equal(await copy.text(), 'local text');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(services.fetch('value.txt', { signal: controller.signal }), {
    name: 'AbortError',
  });
  services.dispose();
});

test('navigator exposes facts and denied permissions without native authority records', async () => {
  const services = createGuestWebServices({
    resources: resources(),
    nativeGlobal,
    application: 'fixture',
  });
  const navigator = services.navigator;
  assert(!('serviceWorker' in navigator));
  assert(!('credentials' in navigator));
  assert.equal(navigator.sendBeacon('https://missing.example/', 'private'), false);
  assert.equal(navigator.cookieEnabled, false);
  const camera = await navigator.permissions.query({ name: 'camera' });
  assert.equal(camera.state, 'denied');
  assert(!('permission' in camera));
  assert.equal(Reflect.set(camera, 'state', 'granted'), false);
  assert.equal(Reflect.set(navigator, 'userAgent', 'forged'), false);
  services.dispose();
  await assert.rejects(services.fetch('value.txt'), { name: 'InvalidStateError' });
});
