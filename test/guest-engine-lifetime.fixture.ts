import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GuestEngine } from '../src/guest/engine.ts';
import { DisposableResult } from 'quickjs-emscripten-core';
import type { GuestHost } from '../src/guest/protocol.ts';

const host: GuestHost = {
  get: Reflect.get,
  set: Reflect.set,
  delete: Reflect.deleteProperty,
  call: Reflect.apply,
  construct: Reflect.construct,
  ownKeys: Reflect.ownKeys,
  descriptor: Object.getOwnPropertyDescriptor,
  prototype: Object.getPrototypeOf,
};
const project = process.env.PF_LIFETIME_PROJECT;
assert(project);
const wasmModule = await WebAssembly.compile(
  await readFile(project + '/vendor/quickjs/generated/engine.wasm'),
);
const bytes = new Uint8Array(await readFile(project + '/test/fixtures/wasm/memory.wasm'));
const observations: Record<string, unknown>[] = [];

async function fixture() {
  const engine = await GuestEngine.create({ host, wasmModule, onError() {} });
  const indexed: { dispose(): void } = Reflect.get(engine, 'indexed');
  const dispose = indexed.dispose.bind(indexed);
  // Independent observation of the native SDK property call: engine counters
  // alone cannot detect an omitted entry wrapper around array encoding.
  let sdkPropertyDepth = 0;
  const setProp = engine.context.setProp.bind(engine.context);
  engine.context.setProp = (...args: Parameters<typeof setProp>) => {
    sdkPropertyDepth++;
    try {
      return setProp(...args);
    } finally {
      sdkPropertyDepth--;
    }
  };
  const releaseStates: { depth: number; pumping: boolean; wasmDepth: number }[] = [];
  indexed.dispose = () => {
    const state = {
      depth: Reflect.get(engine, 'depth'),
      pumping: Reflect.get(engine, 'pumping'),
      wasmDepth: Reflect.get(engine, 'wasmDepth'),
      sdkPropertyDepth,
    };
    if (state.depth || state.pumping || state.wasmDepth || state.sdkPropertyDepth)
      console.error('physical indexed release waits for every engine-owned stack');
    assert(
      !state.depth && !state.pumping && !state.wasmDepth && !state.sdkPropertyDepth,
      'physical indexed release waits for every engine-owned stack',
    );
    releaseStates.push(state);
    dispose();
  };
  const stopStates: Record<string, unknown>[] = [];
  engine.set('stop', () => {
    engine.dispose();
    assert.equal(
      Reflect.get(engine, 'closed'),
      true,
      'logical close happens synchronously',
    );
    assert.equal(
      engine.context.alive,
      true,
      'active close keeps SDK roots alive until unwind',
    );
    stopStates.push({
      depth: Reflect.get(engine, 'depth'),
      pumping: Reflect.get(engine, 'pumping'),
      wasmDepth: Reflect.get(engine, 'wasmDepth'),
    });
  });
  const live = { value: 0 };
  let nativeEffects = 0;
  Object.defineProperty(live, 'property', {
    get() {
      nativeEffects++;
      return 1;
    },
    set(_value) {
      nativeEffects++;
    },
  });
  engine.bind('liveProperty', live, 'property');
  const staleCallback = engine.evaluate('() => 91');
  assert.equal(typeof staleCallback, 'function');
  engine.set('plainBytes', bytes);
  return {
    engine,
    finish(name: string) {
      assert.equal(
        nativeEffects,
        0,
        'bound native operations are denied after logical close',
      );
      assert.equal(
        releaseStates.length,
        1,
        'one terminal cleanup releases indexed records',
      );
      assert.equal(engine.context.alive, false);
      assert.equal(engine.runtime.alive, false);
      engine.dispose();
      assert.equal(releaseStates.length, 1);
      assert.throws(
        () => Reflect.apply(staleCallback as Function, undefined, []),
        /context is closed/,
      );
      engine.drainJobs();
      observations.push({
        name,
        stopStates,
        releaseStates,
        nativeEffects,
        callbackRejected: true,
      });
    },
  };
}

const deniedEffects = `
  let getBlocked = false, setBlocked = false;
  try { liveProperty; } catch { getBlocked = true; }
  try { liveProperty = 1; } catch { setBlocked = true; }
  [getBlocked, setBlocked];
`;
for (const mode of [
  'evaluate',
  'set-encoding',
  'callback',
  'job',
  'wasm-import',
  'job-wasm-import',
] as const) {
  const { engine, finish } = await fixture();
  const wasm = `
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 3 });
    const instance = new WebAssembly.Instance(new WebAssembly.Module(plainBytes), {
      env: { memory, callback() { stop(); return 3; } },
    });
    instance.exports.roundtrip(4);
  `;
  const code = mode.includes('wasm') ? wasm + deniedEffects : 'stop();' + deniedEffects;
  if (mode === 'set-encoding') {
    engine.evaluate(`Object.defineProperty(Array.prototype, '0', {
      configurable: true, set() { stop(); },
    });`);
    engine.set('inbound', [1]);
  } else if (mode === 'evaluate' || mode === 'wasm-import') {
    assert.deepEqual(
      engine.evaluate(code),
      [true, true],
      'bound native operations are denied after logical close',
    );
  } else if (mode === 'callback') {
    const callback = engine.evaluate('() => {' + code + '}');
    assert.equal(typeof callback, 'function');
    Reflect.apply(callback as Function, undefined, []);
  } else {
    const promise = engine.evaluate('Promise.resolve().then(() => {' + code + '});');
    assert(promise instanceof Promise);
    const settled = promise.then(
      () => 'resolved',
      (error: unknown) => String(error),
    );
    engine.drainJobs();
    assert.match(await settled, /context is closed/);
  }
  finish(mode);
}

// Exercise drainJobs' actual error-conversion branch with a real SDK error root.
// Replacing the runtime result models its documented failure return, not a browser input.
{
  const { engine, finish } = await fixture();
  const error = engine.context.newError(new Error('job failed'));
  const execute = engine.runtime.executePendingJobs.bind(engine.runtime);
  const convert = Reflect.get(engine, 'guestError');
  const contextual = Object.assign(error, { context: engine.context });
  engine.runtime.executePendingJobs = () => DisposableResult.fail(contextual, () => {});
  Reflect.set(engine, 'guestError', () => {
    throw new Error('conversion failed');
  });
  assert.throws(() => engine.drainJobs(), /conversion failed/);
  assert.equal(error.alive, false, 'failed job error conversion releases its SDK root');
  engine.runtime.executePendingJobs = execute;
  Reflect.set(engine, 'guestError', convert);
  engine.dispose();
  finish('job-error-conversion');
}

console.log(JSON.stringify({ observations }));
