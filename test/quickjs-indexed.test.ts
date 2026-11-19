import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core';
import { captureQuickJSVariant } from '../src/guest/quickjs.ts';
import { IndexedAccess } from '../src/guest/indexed-access.ts';
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
  const context = module.newContext();
  const indexed = new IndexedAccess(raw);
  const evaluate = (source: string) => {
    const result = context.unwrapResult(context.evalCode(source));
    try {
      return context.dump(result);
    } finally {
      result.dispose();
    }
  };
  const proxy = context.unwrapResult(
    context.evalCode(`
    globalThis.target = Object.create(null);
    globalThis.traps = 0;
    globalThis.proxy = new Proxy(target, {
      get() { traps++; throw new Error('ordinary get trap'); },
      set() { traps++; throw new Error('ordinary set trap'); },
    });
    proxy;
  `),
  );
  return {
    context,
    indexed,
    evaluate,
    proxy,
    dispose() {
      indexed.dispose();
      proxy.dispose();
      context.dispose();
    },
  };
}

test('native memory indexes use Wasm functions and preserve numeric conversions', async () => {
  const setup = await fixture();
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 3 });
  const families = [
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
  ];
  try {
    setup.indexed.rememberMemory(memory, memory.buffer);
    for (const Constructor of families) {
      const view = new Constructor(memory.buffer, 16, 8);
      // Each native target has a different trusted proxy/control record.
      const proxy = setup.context.unwrapResult(
        setup.context.evalCode(`new Proxy(target, {
        get() { traps++; throw new Error('ordinary get trap'); },
        set() { traps++; throw new Error('ordinary set trap'); }
      })`),
      );
      setup.context.setProp(setup.context.global, 'current', proxy);
      setup.indexed.attachMemory(view, proxy, memory.buffer);
      for (const value of [
        NaN,
        -Infinity,
        Infinity,
        -0,
        -257,
        0.5,
        1.5,
        2.5,
        2147483648,
        4294967297,
      ]) {
        const expected = new Constructor(1);
        expected[0] = value;
        const number = setup.context.newNumber(value);
        setup.context.setProp(setup.context.global, 'input', number);
        number.dispose();
        setup.evaluate('current[0] = input');
        assert(Object.is(view[0], expected[0]), Constructor.name + ': native write');
        assert(
          Object.is(setup.evaluate('current[0]'), expected[0]),
          Constructor.name + ': guest read',
        );
      }
      assert.equal(setup.evaluate('traps'), 0);
      assert.equal(
        setup.evaluate(`(() => { try { current['01']; } catch { return true; } })()`),
        true,
      );
      assert.equal(
        setup.evaluate(
          `(() => { try { Reflect.set(current, '0', 3, {}); } catch { return true; } })()`,
        ),
        true,
      );
      setup.evaluate('traps = 0');
      proxy.dispose(); // IndexedAccess retains the handle until disposal.
    }
    const data = new DataView(memory.buffer);
    for (const payload of [
      0xffffffffffffffffn,
      0xfff8000000000001n,
      0x7ff00000ffffffffn,
    ]) {
      data.setBigUint64(16, payload, true);
      assert.equal(setup.evaluate('typeof current[0]'), 'number');
      assert.equal(setup.evaluate('Number.isNaN(current[0])'), true);
    }
    setup.evaluate('new ArrayBuffer(48 * 1024 * 1024)');
    assert.equal(setup.evaluate('current[0]'), new Float64Array(memory.buffer, 16, 1)[0]);
    assert.equal(
      new Uint8Array(memory.buffer)[0],
      0,
      'view offsets stay within application memory',
    );
    memory.grow(1);
    setup.indexed.invalidate();
    assert.equal(
      setup.evaluate(`(() => { try { current[0]; } catch { return true; } })()`),
      true,
    );
  } finally {
    setup.dispose();
  }
});

test('private index caches report writes without exposing their backing', async () => {
  const setup = await fixture();
  const buffer = new ArrayBuffer(32);
  const native = new Uint8Array(buffer, 4, 8);
  const view = setup.context.unwrapResult(setup.context.evalCode('new Uint8Array(8)'));
  try {
    assert.throws(
      () => setup.indexed.attachShadow(native, setup.proxy, setup.proxy, buffer),
      /requires a real typed-array view/,
    );
    setup.indexed.attachShadow(native, setup.proxy, view, buffer);
    view.dispose();
    assert.equal(setup.evaluate('proxy[0] = 73; proxy[0]'), 73);
    assert.deepEqual([...setup.indexed.dirtyBuffers()], [buffer]);
    assert.equal(setup.indexed.dirtyBuffers().size, 0);
    assert.deepEqual(setup.evaluate('Reflect.ownKeys(proxy)'), []);
    assert.equal(
      setup.evaluate(`(() => { try { proxy.buffer; } catch { return true; } })()`),
      true,
    );
    setup.evaluate('new ArrayBuffer(48 * 1024 * 1024)');
    assert.equal(setup.evaluate('proxy[0]'), 73);
    setup.indexed.invalidate();
    assert.equal(
      setup.evaluate(`(() => { try { proxy[0]; } catch { return true; } })()`),
      true,
    );
    setup.indexed.releaseShadow(buffer);
    const replacement = setup.context.unwrapResult(
      setup.context.evalCode('new Uint8Array(8)'),
    );
    setup.indexed.attachShadow(native, setup.proxy, replacement, buffer);
    replacement.dispose();
    assert.equal(setup.evaluate('proxy[0] = 41; proxy[0]'), 41);
  } finally {
    if (view.alive) view.dispose();
    setup.dispose();
  }
});

test('acceleration retains Proxy invariants and does not affect application proxies', async () => {
  const setup = await fixture();
  const memory = new WebAssembly.Memory({ initial: 1 });
  const bytes = new Uint8Array(memory.buffer, 0, 4);
  bytes[0] = 7;
  try {
    setup.indexed.rememberMemory(memory, memory.buffer);
    setup.indexed.attachMemory(bytes, setup.proxy, memory.buffer);
    assert.equal(setup.evaluate('proxy[0]'), 7);
    assert.equal(setup.evaluate(`new Proxy({}, {get(){return 93}})[0]`), 93);
    setup.evaluate(
      `Object.defineProperty(target, '0', {value: 1, writable: false, configurable: false})`,
    );
    assert.equal(
      setup.evaluate(
        `(() => { try { proxy[0]; } catch(error) { return error instanceof TypeError; } })()`,
      ),
      true,
    );
    assert.equal(
      setup.evaluate(
        `(() => { try { proxy[0] = 11; } catch(error) { return error instanceof TypeError; } })()`,
      ),
      true,
    );
    assert.equal(bytes[0], 11, 'the underlying setter runs before the invariant check');
    const revocable = setup.context.unwrapResult(
      setup.context.evalCode(`
      globalThis.revocable = Proxy.revocable({}, {}); revocable.proxy;
    `),
    );
    setup.indexed.attachMemory(
      new Uint8Array(memory.buffer, 8, 4),
      revocable,
      memory.buffer,
    );
    setup.context.setProp(setup.context.global, 'revokedProxy', revocable);
    revocable.dispose();
    setup.evaluate('revocable.revoke()');
    assert.equal(
      setup.evaluate(
        `(() => { try { revokedProxy[0]; } catch(error) { return error instanceof TypeError; } })()`,
      ),
      true,
    );
  } finally {
    setup.dispose();
  }
});
