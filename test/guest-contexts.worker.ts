import { GuestEngine } from '../src/guest/engine.ts';
import type { GuestHost } from '../src/guest/protocol.ts';
import { createGuestWorkers } from '../src/guest/contexts/worker-factory.ts';
import {
  startDedicatedWorker,
  startSharedWorker,
} from '../src/guest/contexts/worker-bootstrap.ts';
import type { GuestWorkerSessionFactory } from '../src/guest/contexts/types.ts';

const scope = self as unknown as DedicatedWorkerGlobalScope | SharedWorkerGlobalScope;
const createSession: GuestWorkerSessionFactory = async (initialization, owner) => {
  const modules = new Map(
    initialization.catalog.resources.map((resource) => [
      resource.url,
      new TextDecoder().decode(resource.bytes),
    ]),
  );
  let engine: GuestEngine;
  const host: GuestHost = {
    get: (target, key) => Reflect.get(target, key),
    set: (target, key, value) => Reflect.set(target, key, value),
    call(target, receiver, args) {
      const result = Reflect.apply(target, receiver, args);
      if (
        receiver instanceof MessagePort &&
        target === MessagePort.prototype.postMessage
      ) {
        const options = args[1];
        if (Array.isArray(options)) engine.detachTransferred(options);
      }
      return result;
    },
    construct: (target, args) => Reflect.construct(target, args),
    ownKeys: (target) => Reflect.ownKeys(target),
    descriptor: (target, key) => Reflect.getOwnPropertyDescriptor(target, key),
    prototype: (target) => Reflect.getPrototypeOf(target),
  };
  engine = await GuestEngine.create({
    wasmModule: await WebAssembly.compile(initialization.catalog.engineWasm),
    host,
    modules,
    globalObject: owner,
  });
  engine.set('self', owner);
  for (const name of ['onmessage', 'onconnect', 'onmessageerror'])
    engine.bind(name, owner);
  for (const name of ['addEventListener', 'removeEventListener', 'dispatchEvent']) {
    const fn = Reflect.get(owner, name);
    engine.set(name, fn.bind(owner));
  }
  engine.set('setTimeout', setTimeout);
  engine.set('Event', Event);
  engine.set('console', console);
  if ('postMessage' in owner)
    engine.set('postMessage', (value: unknown, transfer: Transferable[] = []) => {
      owner.postMessage(value, transfer);
      engine.detachTransferred(transfer);
    });
  const workers = createGuestWorkers({
    catalog: { ...initialization.catalog, documentBase: initialization.entryURL },
    prepare(entryURL, scriptType) {
      if (!modules.has(entryURL)) throw new TypeError('Worker source is not admitted');
      return { ...initialization, entryURL, scriptType };
    },
    commitTransfers: (transfer) => engine.detachTransferred(transfer),
  });
  engine.set('Worker', workers.Worker);
  engine.set('importScripts', (...urls: string[]) => {
    if (initialization.scriptType === 'module')
      throw new TypeError('Module workers cannot importScripts');
    for (const input of urls) {
      const url = new URL(input, initialization.entryURL).href;
      const source = modules.get(url);
      if (source === undefined) throw new TypeError('Worker import is not admitted');
      engine.evaluate(source, url);
    }
  });
  return {
    async start(entryURL, type) {
      const source = modules.get(entryURL);
      if (source === undefined) throw new TypeError('Missing worker entry');
      await engine.evaluate(source, entryURL, type === 'module' ? 'module' : 'global');
    },
    close() {
      workers.dispose();
      engine.dispose();
    },
  };
};
if ('onconnect' in scope)
  startSharedWorker(scope as SharedWorkerGlobalScope, createSession);
else startDedicatedWorker(scope as DedicatedWorkerGlobalScope, createSession);
