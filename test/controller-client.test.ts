import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

const bundle = buildSync({
  stdin: {
    contents: `
      import { createControllerClient } from './src/runtime/controller-client.ts';
      globalThis.host = createControllerClient();
    `,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
}).outputFiles[0].text;

function fixture() {
  const context = vm.createContext({});
  // A protocol fixture, not a model of browser service-worker lifetime. Actual
  // browser startup and publisher tests exercise the native transport separately.
  vm.runInContext(
    `
    let replyValue = {ok: true, value: {answer: 42}};
    let suppressReply = false;
    let throwSend = false;
    let timerCallback;
    let closed = 0;
    let privatePortExposures = 0;
    let transferred = 0;
    class EventTarget {
      #listener;
      addEventListener(type, listener) { this.#listener = listener; }
      deliver(event) { this.#listener(event); }
    }
    class MessageEvent {
      #data;
      constructor(data) { this.#data = data; }
      get data() { return this.#data; }
    }
    class MessagePort extends EventTarget {
      peer;
      start() {}
      close() { closed++; }
      postMessage(data) { this.peer.deliver(new MessageEvent(data)); }
    }
    const send = MessagePort.prototype.postMessage;
    class MessageChannel {
      #first = new MessagePort();
      #second = new MessagePort();
      constructor() { this.#first.peer = this.#second; this.#second.peer = this.#first; }
      get port1() { return this.#first; }
      get port2() { return this.#second; }
    }
    class ServiceWorker {
      postMessage(message, ports) {
        if (throwSend) throw new Error('send failed');
        for (const port of ports) transferred++;
        if (!suppressReply) Reflect.apply(send, ports[0], [replyValue]);
      }
    }
    const worker = new ServiceWorker();
    let active = worker;
    class ServiceWorkerContainer { get controller() { return active; } }
    const container = new ServiceWorkerContainer();
    class Navigator { get serviceWorker() { return container; } }
    globalThis.ServiceWorker = ServiceWorker;
    globalThis.ServiceWorkerContainer = ServiceWorkerContainer;
    globalThis.Navigator = Navigator;
    globalThis.MessageChannel = MessageChannel;
    globalThis.MessagePort = MessagePort;
    globalThis.MessageEvent = MessageEvent;
    globalThis.EventTarget = EventTarget;
    globalThis.navigator = new Navigator();
    globalThis.window = globalThis;
    globalThis.setTimeout = callback => { timerCallback = callback; return 1; };
    globalThis.clearTimeout = () => {};
  `,
    context,
  );
  vm.runInContext(bundle, context);
  return context;
}

test('private transport survives changed browser accessors and application iterators', async () => {
  const context = fixture();
  vm.runInContext(
    `
    for (const [prototype, key] of [
      [Navigator.prototype, 'serviceWorker'],
      [ServiceWorkerContainer.prototype, 'controller'],
      [MessageChannel.prototype, 'port1'],
      [MessageChannel.prototype, 'port2'],
      [MessageEvent.prototype, 'data'],
    ]) Object.defineProperty(prototype, key, {
      configurable: true,
      get() { privatePortExposures++; throw new Error('application getter'); }
    });
    EventTarget.prototype.addEventListener = () => { throw new Error('application add'); };
    ServiceWorker.prototype.postMessage = () => { throw new Error('application post'); };
    MessagePort.prototype.start = () => { throw new Error('application start'); };
    MessagePort.prototype.close = () => { throw new Error('application close'); };
    Array.prototype[Symbol.iterator] = function* () {
      privatePortExposures++;
      throw new Error('application iterator');
    };
  `,
    context,
  );
  const value = await vm.runInContext("host.request({type: 'read'})", context);
  assert.equal(value.answer, 42);
  assert.equal(vm.runInContext('privatePortExposures', context), 0);
  assert.equal(vm.runInContext('transferred', context), 1);
  assert.equal(vm.runInContext('closed', context), 1);
});

test('malformed or rejected replies fail instead of yielding host data', async () => {
  for (const expression of [
    'null',
    '42',
    '{}',
    "{ok: false, error: 'denied'}",
    "Object.create({ok: true, value: 'inherited'})",
  ]) {
    const context = fixture();
    vm.runInContext(`replyValue = ${expression}`, context);
    await assert.rejects(vm.runInContext("host.request({type: 'read'})", context));
    assert.equal(vm.runInContext('closed', context), 1);
  }
});

test('missing controller, send failure and timeout reject and close local ports', async () => {
  const missing = fixture();
  vm.runInContext('active = null', missing);
  await assert.rejects(
    vm.runInContext("host.request({type: 'read'})", missing),
    /controller is unavailable/,
  );
  const failed = fixture();
  vm.runInContext('throwSend = true', failed);
  await assert.rejects(
    vm.runInContext("host.request({type: 'read'})", failed),
    /send failed/,
  );
  assert.equal(vm.runInContext('closed', failed), 2);
  const timed = fixture();
  vm.runInContext('suppressReply = true', timed);
  const pending = vm.runInContext("host.request({type: 'read'})", timed);
  const rejected = assert.rejects(pending, /timed out/);
  vm.runInContext('timerCallback()', timed);
  await rejected;
  assert.equal(vm.runInContext('closed', timed), 1);
});
