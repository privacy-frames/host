import { GuestEngine } from '../src/guest/engine.ts';
import type { GuestHost } from '../src/guest/protocol.ts';

declare global {
  var guestPrimordialResults: { checks?: Record<string, unknown>; error?: string };
}

// This fixture tests engine bookkeeping with an explicitly permissive local
// host. It does not claim to exercise the browser-effect policy.
const host: GuestHost = {
  get: (target, key) => Reflect.get(target, key),
  set: (target, key, value) => Reflect.set(target, key, value),
  delete: (target, key) => Reflect.deleteProperty(target, key),
  call: (target, receiver, args) => Reflect.apply(target, receiver, args),
  construct: (target, args) => Reflect.construct(target, args),
  ownKeys: (target) => Reflect.ownKeys(target),
  descriptor: (target, key) => Object.getOwnPropertyDescriptor(target, key),
  prototype: (target) => Object.getPrototypeOf(target),
};
class Box {
  value = 7;
}
async function evaluate(source: string) {
  const engine = await GuestEngine.create({ host, wasmURL: '/quickjs.wasm' });
  engine.set('makeBox', () => new Box());
  engine.set('box', new Box());
  engine.set('echo', (value: unknown) => value);
  try {
    return engine.evaluate(`(() => { ${source} })()`, 'fixture:primordials');
  } catch (error) {
    return { error: String(error) };
  } finally {
    engine.dispose();
  }
}

try {
  const checks: Record<string, unknown> = {};
  checks.capturedOperations = await evaluate(`
    const saved = [Object.create, Reflect.defineProperty, Reflect.deleteProperty,
      Array.prototype.includes, String];
    const fail = () => { throw new Error('mutable operation was invoked'); };
    Object.create = fail;
    Reflect.defineProperty = fail;
    Reflect.deleteProperty = fail;
    Array.prototype.includes = fail;
    globalThis.String = fail;
    try {
      const created = makeBox();
      Object.defineProperty(created, 'localValue', { value: 11, configurable: true });
      const value = created.value + created.localValue;
      const deleted = delete created.localValue;
      return value === 18 && deleted && !('localValue' in created);
    } finally {
      Object.create = saved[0]; Reflect.defineProperty = saved[1];
      Reflect.deleteProperty = saved[2]; Array.prototype.includes = saved[3];
      globalThis.String = saved[4];
    }
  `);
  checks.privateProxyHandler = await evaluate(`
    let consulted = 0;
    Object.defineProperty(Object.prototype, 'isExtensible', {
      get() { consulted++; throw new Error('inherited proxy handler'); },
      configurable: true,
    });
    try { return Object.isExtensible(box) && consulted === 0; }
    finally { delete Object.prototype.isExtensible; }
  `);
  checks.privateIndexRecord = await evaluate(`
    const view = new Uint8Array(new ArrayBuffer(8, {}));
    let consulted = 0;
    Object.defineProperty(Object.prototype, 'index', {
      get() { consulted++; throw new Error('inherited private index read'); },
      set() { consulted++; throw new Error('inherited private index write'); },
      configurable: true,
    });
    try { view[0] = 17; return view[0] === 17 && consulted === 0; }
    finally { delete Object.prototype.index; }
  `);
  checks.binaryConstructorHandler = await evaluate(`
    let consulted = 0;
    Object.defineProperty(Object.prototype, 'get', {
      get() { consulted++; throw new Error('inherited binary constructor handler'); },
      configurable: true,
    });
    try {
      const bytes = new Uint8Array(4);
      bytes[0] = 11;
      return bytes.length === 4 && bytes[0] === 11 && consulted === 0;
    } finally { delete Object.prototype.get; }
  `);
  checks.thrownReference = await evaluate(`
    const sentinel = new Proxy({}, {
      getPrototypeOf() { throw new Error('Thrown prototype was inspected'); },
    });
    const input = new Proxy({}, { getPrototypeOf() { throw sentinel; } });
    let caught;
    try { echo(input); } catch (error) { caught = error; }
    return caught === sentinel && makeBox().value === 7;
  `);
  checks.classification = await evaluate(`
    let consulted = 0;
    const constructors = [Promise, Map, Set, RegExp];
    for (const constructor of constructors) Object.defineProperty(constructor,
      Symbol.hasInstance, {
        value() { consulted++; return false; },
        configurable: true,
      });
    try {
      echo({});
      if (consulted !== 0) throw new Error('application hasInstance');
      return echo(new Map([['answer', 42]])).get('answer') === 42 &&
        echo(new Set([3])).has(3) && echo(/test/).source === 'test' && consulted === 0;
    } finally {
      for (const constructor of constructors) delete constructor[Symbol.hasInstance];
    }
  `);
  globalThis.guestPrimordialResults = { checks };
} catch (error) {
  globalThis.guestPrimordialResults = { error: String(error) };
}
