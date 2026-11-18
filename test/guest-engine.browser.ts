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
  engine.set('URL', URL);
  engine.set('console', console);
  engine.set('nativePromise', () => Promise.resolve({ answer: 42 }));
  engine.set('fillBytes', (bytes: Uint8Array) => bytes.fill(9));
  engine.set('nativeBuffer', new Uint8Array([1, 2, 3, 4]));
  engine.set('nativeThrow', () => {
    throw new Error('native failure');
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
  engine.evaluate(
    `nativePromise().then(value => { globalThis.promiseAnswer = value.answer; });`,
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
    module: engine.get('moduleAnswer'),
    nativePrototype: Object.hasOwn(Element.prototype, 'describe'),
    errors,
  };
  engine.dispose();
  globalThis.guestEngineResults = { result, additional };
} catch (error) {
  globalThis.guestEngineResults = {
    error: String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
}
