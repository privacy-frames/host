import { GuestEngine } from '../src/guest/engine.ts';
import type { GuestHost } from '../src/guest/protocol.ts';

declare global {
  var guestEngineResults: Record<string, unknown> | undefined;
}

const host: GuestHost = {
  get: (target, key) => Reflect.get(target, key),
  set: (target, key, value) => Reflect.set(target, key, value),
  call: (target, receiver, arguments_) => Reflect.apply(target, receiver, arguments_),
  construct: (target, arguments_) => Reflect.construct(target, arguments_),
  ownKeys: (target) => Reflect.ownKeys(target),
  descriptor: (target, key) => Object.getOwnPropertyDescriptor(target, key),
  prototype: (target) => Object.getPrototypeOf(target),
};

try {
  const errors: string[] = [];
  const engine = await GuestEngine.create({
    host,
    wasmURL: '/quickjs.wasm',
    globalObject: window,
    modules: new Map([['https://example.test/value.js', 'export const value = 42;']]),
    onError: (error) => errors.push(error.message),
  });
  engine.set('window', window);
  engine.set('self', window);
  engine.set('document', document);
  engine.set('Element', Element);
  engine.set('HTMLElement', HTMLElement);
  engine.set('Event', Event);
  engine.set('CustomEvent', CustomEvent);
  engine.set('URL', URL);
  engine.set('console', console);
  engine.set('nativePromise', () => Promise.resolve({ answer: 42 }));
  engine.set('nativeAsync', async () => 1);
  engine.set('nativeGenerator', function* () {
    yield 1;
  });
  engine.set('fillBytes', (bytes: Uint8Array) => bytes.fill(9));
  engine.set('nativeBuffer', new Uint8Array([1, 2, 3, 4]));
  engine.set('nativeThrow', () => {
    throw new Error('native failure');
  });
  engine.set('invokeSync', (callback: () => unknown) => callback());
  engine.set('nestedBytes', (bytes: Uint8Array, callback: () => unknown) => {
    bytes[0] = 3;
    callback();
    const written = bytes[1];
    bytes[2] = 5;
    return written;
  });
  engine.set('throwAfterWrite', (bytes: Uint8Array) => {
    bytes[0] = 8;
    throw new Error('after write');
  });
  engine.set('cloneNative', (value: unknown) => structuredClone(value));
  engine.set('transferNative', (value: unknown, transfer: Transferable[]) => {
    const cloned = structuredClone(value, { transfer });
    engine.detachTransferred(transfer);
    return cloned;
  });
  const parent = document.createElement('div');
  parent.id = 'fixture';
  document.body.append(parent);
  const result = engine.evaluate(`
    globalThis.trace = [];
    const parent = document.getElementById('fixture');
    const button = document.createElement('button');
    parent.appendChild(button);
    Element.prototype.describe = function () { return this.nodeName; };
    button.customState = { value: 7 };
    button.addEventListener('inner', event => {
      trace.push('inner');
      event.preventDefault();
    });
    button.addEventListener('outer', event => {
      trace.push('outer');
      trace.push(button.dispatchEvent(new Event('inner', { cancelable: true })));
      event.preventDefault();
    });
    const cancellation = button.dispatchEvent(new Event('outer', { cancelable: true }));
    const bytes = new Uint8Array([1, 2, 3]);
    fillBytes(bytes);
    nativeBuffer[0] = 8;
    const flush = parent.nodeName;
    let error = '';
    try { nativeThrow(); } catch (caught) { error = caught.message; }
    ({
      globalIdentity: window === self && window === globalThis,
      identity: parent.firstChild === button && button.parentNode === parent,
      cancellation, trace,
      prototype: button.describe(),
      prototypeIdentity: Object.getPrototypeOf(button) === HTMLElement.prototype || button instanceof HTMLElement,
      expando: parent.firstChild.customState.value,
      list: Array.from(parent.querySelectorAll('button')).map(node => node === button),
      bytes: Array.from(bytes),
      nativeBuffer: Array.from(nativeBuffer),
      constructor: button.describe.constructor('return typeof process')(),
      url: new URL('/hello', 'https://example.test/').href,
      error,
    });
  `);
  const advanced = engine.evaluate(`
    (() => {
    const original = new Error('identity');
    let sameError = false;
    try { invokeSync(() => { throw original; }); } catch (error) { sameError = error === original; }
    const cyclic = { number: 4 }; cyclic.self = cyclic;
    const map = new Map([[cyclic, new Set([1,2])]]);
    const copiedMap = cloneNative(map);
    const copiedKey = Array.from(copiedMap.keys())[0];
    const unique = Symbol('private');
    const node = document.getElementById('fixture');
    node[unique] = 'symbol data';
    const detail = { local: 9 };
    const custom = new CustomEvent('custom', { detail });
    class Listener { handleEvent(event) { detail.received = event.detail === detail; } }
    node.addEventListener('custom', new Listener());
    node.dispatchEvent(custom);
    const disguised = new Uint8Array([4,5]);
    Object.defineProperty(disguised, Symbol.toStringTag, { value: 'Function' });
    fillBytes(disguised);
    const nested = new Uint8Array([1,2,0]);
    let callbackRead = 0;
    const nativeRead = nestedBytes(nested, () => { callbackRead = nested[0]; nested[1] = 4; });
    const throwing = new Uint8Array([1]);
    try { throwAfterWrite(throwing); } catch {}
    const buffer = new ArrayBuffer(4);
    const bytes = new Uint8Array(buffer); bytes.set([1,2,3,4]);
    const retained = new DataView(buffer,1,2);
    const transferred = transferNative({ buffer, view: bytes, retained }, [buffer]);
    let dataViewDetached = false;
    try { retained.byteLength; } catch (error) { dataViewDetached = error instanceof TypeError; }
    return ({
      sameError,
      map: copiedMap instanceof Map && copiedKey === copiedKey.self && copiedMap.get(copiedKey) instanceof Set,
      symbol: node[unique],
      detailIdentity: detail.received,
      binaryBrand: Array.from(disguised),
      nestedBytes: [callbackRead, nativeRead, ...nested],
      throwingWrite: throwing[0],
      sender: buffer.byteLength === 0 && bytes.byteLength === 0 && dataViewDetached,
      receiver: transferred.buffer === transferred.view.buffer && transferred.buffer === transferred.retained.buffer,
      bytes: Array.from(transferred.view),
    });
    })();
  `);
  engine.evaluate(
    `nativePromise().then(value => { globalThis.promiseAnswer = value.answer; });`,
  );
  engine.evaluate(
    `Object.getPrototypeOf(nativeAsync).constructor('return typeof navigator')().then(value => { globalThis.asyncCompilerRealm = value; });`,
  );
  engine.drainJobs();
  await new Promise((resolve) => setTimeout(resolve, 0));
  engine.drainJobs();
  const module = engine.evaluate(
    `import { value } from './value.js'; globalThis.moduleAnswer = value;`,
    'https://example.test/main.js',
    'module',
  );
  engine.drainJobs();
  await module;
  const additional = {
    promise: engine.get('promiseAnswer'),
    asyncCompilerRealm: engine.get('asyncCompilerRealm'),
    generatorCompilerRealm: engine.evaluate(
      `Object.getPrototypeOf(nativeGenerator).constructor('yield typeof navigator')().next().value`,
    ),
    module: engine.get('moduleAnswer'),
    nativePrototype: Object.hasOwn(Element.prototype, 'describe'),
    errors,
  };
  engine.dispose();
  globalThis.guestEngineResults = { result, additional, advanced };
} catch (error) {
  globalThis.guestEngineResults = {
    error: String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
}
