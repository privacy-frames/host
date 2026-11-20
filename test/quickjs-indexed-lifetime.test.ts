import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core';
import { IndexedAccess } from '../src/guest/indexed-access.ts';
import { captureQuickJSVariant } from '../src/guest/quickjs.ts';
import type { IndexedEmscriptenModule } from '../vendor/quickjs/generated/engine.mjs';

const compiled = await WebAssembly.compile(
  await readFile(new URL('../vendor/quickjs/generated/engine.wasm', import.meta.url)),
);

async function fixture() {
  let raw: IndexedEmscriptenModule | undefined;
  const module = await newQuickJSWASMModuleFromVariant(
    newVariant(
      captureQuickJSVariant((instance) => {
        raw = instance;
      }),
      { wasmModule: compiled },
    ),
  );
  assert(raw);
  const native = raw;
  const slots = new Set<number>();
  const events: string[] = [];
  let failSecondSlot = false;
  let slotCalls = 0;
  const indexed = new IndexedAccess({
    cwrap(...args: Parameters<typeof native.cwrap>) {
      const fn = native.cwrap(...args);
      return (...values: number[]) => {
        events.push(args[0]);
        return fn(...values);
      };
    },
    addFunction(fn, signature) {
      if (failSecondSlot && ++slotCalls === 2) throw new Error('slot allocation failed');
      const slot = native.addFunction(fn, signature);
      assert(!slots.has(slot));
      slots.add(slot);
      return slot;
    },
    removeFunction(slot) {
      assert(slots.delete(slot), 'each acquired slot is released exactly once');
      native.removeFunction(slot);
    },
  });
  const context = module.newContext();
  const evaluate = (source: string) => context.unwrapResult(context.evalCode(source));
  const proxy = evaluate(
    'globalThis.proxy = new Proxy({}, { get() { throw Error("disabled"); } }); proxy',
  );
  const view = evaluate('new Uint8Array(8)');
  const buffer = new ArrayBuffer(8);
  const target = new Uint8Array(buffer);
  return {
    indexed,
    context,
    proxy,
    view,
    buffer,
    target,
    events,
    slots,
    evaluate,
    failSlots() {
      failSecondSlot = true;
    },
    dispose() {
      indexed.dispose();
      view.dispose();
      proxy.dispose();
      context.dispose();
      assert.equal(slots.size, 0);
    },
  };
}

test('failed proxy retention allocates no C record and the same proxy can retry', async (t) => {
  const f = await fixture();
  try {
    const mock = t.mock.method(f.proxy, 'dup', () => {
      throw new Error('duplicate failed');
    });
    assert.throws(
      () => f.indexed.attachShadow(f.target, f.proxy, f.view, f.buffer),
      /duplicate failed/,
    );
    assert(!f.events.includes('QTS_NewIndexedProxyAccess'));
    mock.mock.restore();
    f.indexed.attachShadow(f.target, f.proxy, f.view, f.buffer);
    const value = f.evaluate('proxy[0] = 17; proxy[0]');
    assert.equal(f.context.dump(value), 17);
    value.dispose();
  } finally {
    f.dispose();
  }
});

test('failed replacement duplication leaves the old rooted view usable and cleanup valid', async (t) => {
  const f = await fixture();
  const replacement = f.evaluate('new Uint8Array(8)');
  try {
    f.indexed.attachShadow(f.target, f.proxy, f.view, f.buffer);
    t.mock.method(replacement, 'dup', () => {
      throw new Error('replacement failed');
    });
    assert.throws(
      () => f.indexed.attachShadow(f.target, f.proxy, replacement, f.buffer),
      /replacement failed/,
    );
    const value = f.evaluate('proxy[0] = 29; proxy[0]');
    assert.equal(f.context.dump(value), 29);
    value.dispose();
  } finally {
    replacement.dispose();
    f.dispose();
  }
});

test('failed second function-slot allocation releases the first and permits retry', async () => {
  const f = await fixture();
  const memory = new WebAssembly.Memory({ initial: 1 });
  const target = new Uint8Array(memory.buffer, 0, 8);
  try {
    f.indexed.rememberMemory(memory, memory.buffer);
    f.failSlots();
    assert.throws(
      () => f.indexed.attachMemory(target, f.proxy, memory.buffer),
      /slot allocation failed/,
    );
    assert.equal(f.slots.size, 0);
    f.indexed.attachMemory(target, f.proxy, memory.buffer);
    assert.equal(f.slots.size, 2);
    const value = f.evaluate('proxy[0] = 41; proxy[0]');
    assert.equal(f.context.dump(value), 41);
    assert.equal(target[0], 41);
    value.dispose();
  } finally {
    f.dispose();
  }
});

test('C rejects a non-view replacement, disables access, and releases the paired record once', async () => {
  const f = await fixture();
  try {
    f.indexed.attachShadow(f.target, f.proxy, f.view, f.buffer);
    assert.throws(
      () => f.indexed.attachShadow(f.target, f.proxy, f.proxy, f.buffer),
      /real typed-array/,
    );
    const result = f.context.evalCode('proxy[0]');
    assert(result.error, 'rejected replacement leaves the ordinary proxy path active');
    result.error.dispose();
    f.indexed.attachShadow(f.target, f.proxy, f.view, f.buffer);
  } finally {
    f.dispose();
  }
  assert.equal(f.events.filter((name) => name === 'QTS_NewIndexedProxyAccess').length, 1);
  assert.equal(
    f.events.filter((name) => name === 'QTS_FreeIndexedProxyAccess').length,
    1,
  );
});

test('terminal disposal unlinks C records before releasing borrowed roots and table entries', async (t) => {
  const f = await fixture();
  const originalProxyDup = f.proxy.dup.bind(f.proxy);
  const originalViewDup = f.view.dup.bind(f.view);
  t.mock.method(f.proxy, 'dup', () => {
    const retained = originalProxyDup();
    const dispose = retained.dispose.bind(retained);
    t.mock.method(retained, 'dispose', () => {
      f.events.push('dispose retained proxy');
      dispose();
    });
    return retained;
  });
  t.mock.method(f.view, 'dup', () => {
    const retained = originalViewDup();
    const dispose = retained.dispose.bind(retained);
    t.mock.method(retained, 'dispose', () => {
      f.events.push('dispose borrowed view');
      dispose();
    });
    return retained;
  });
  try {
    f.indexed.attachShadow(f.target, f.proxy, f.view, f.buffer);
    f.indexed.dispose();
    const unlink = f.events.indexOf('QTS_FreeIndexedProxyAccess');
    assert(unlink >= 0);
    assert(unlink < f.events.indexOf('dispose borrowed view'));
    assert(unlink < f.events.indexOf('dispose retained proxy'));
  } finally {
    f.dispose();
  }
});
