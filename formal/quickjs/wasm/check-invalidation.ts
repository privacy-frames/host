/** Execute the actual TS owner against the compiled C; changed source stays in a VM. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';
import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core';
import type { IndexedAccess } from '../../../src/guest/indexed-access.ts';
import { captureQuickJSVariant } from '../../../src/guest/quickjs.ts';
import { memoryAccessors } from '../../../src/guest/wasm-accessors.ts';
import type { IndexedEmscriptenModule } from '../../../vendor/quickjs/generated/engine.mjs';

const root = new URL('../../../', import.meta.url);
const inputs = [
  'src/guest/indexed-access.ts',
  'src/guest/quickjs.ts',
  'src/guest/wasm-accessors.ts',
  'vendor/quickjs/upstream/quickjs.c',
  'vendor/quickjs/c/interface.c',
  'vendor/quickjs/generated/engine.wasm',
  'vendor/quickjs/generated/engine.mjs',
  'vendor/quickjs/generated/build.json',
  'package-lock.json',
  'formal/quickjs/wasm/check-invalidation.ts',
];
const digest = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const hashes = async () =>
  Object.fromEntries(
    await Promise.all(
      inputs.map(async (path) => [path, digest(await readFile(new URL(path, root)))]),
    ),
  );

function load(source: string): typeof IndexedAccess {
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: { IndexedAccess?: typeof IndexedAccess } = {};
  const context = createContext({
    exports,
    require(specifier: string) {
      assert.equal(specifier, './wasm-accessors.ts');
      return { memoryAccessors };
    },
  });
  new Script(code, { filename: 'actual-indexed-access.cjs' }).runInContext(context);
  assert(exports.IndexedAccess);
  return exports.IndexedAccess;
}

async function probe(Owner: typeof IndexedAccess, mode: 'shadow' | 'native') {
  let raw: IndexedEmscriptenModule | undefined;
  const compiled = await WebAssembly.compile(
    await readFile(new URL('vendor/quickjs/generated/engine.wasm', root)),
  );
  const module = await newQuickJSWASMModuleFromVariant(
    newVariant(
      captureQuickJSVariant((value) => {
        raw = value;
      }),
      { wasmModule: compiled },
    ),
  );
  assert(raw);
  const context = module.newContext();
  const native = raw;
  const records = new Map<number, number>();
  const slots = new Set<number>();
  const owner = new Owner({
    cwrap(...args: Parameters<typeof native.cwrap>) {
      const call = native.cwrap(...args);
      return (...values: number[]) => {
        if (args[0] === 'QTS_FreeIndexedProxyAccess') {
          assert.equal(
            records.get(values[1]),
            values[0],
            'free uses the original rooted proxy/control pair',
          );
          records.delete(values[1]);
        }
        const result = call(...values);
        if (args[0] === 'QTS_NewIndexedProxyAccess' && result) {
          assert(!records.has(result), 'control allocation is uniquely owned');
          records.set(result, values[0]);
        }
        return result;
      };
    },
    addFunction(fn, signature) {
      const slot = native.addFunction(fn, signature);
      assert(!slots.has(slot));
      slots.add(slot);
      return slot;
    },
    removeFunction(slot) {
      assert.equal(
        records.size,
        0,
        'all records are unlinked before a table slot is released',
      );
      assert(slots.delete(slot), 'each acquired function-table slot is released once');
      native.removeFunction(slot);
    },
  });
  const proxy = context.unwrapResult(
    context.evalCode(`
    globalThis.proxy = new Proxy({}, { get() { throw Error('ordinary path'); } }); proxy;
  `),
  );
  const view = context.unwrapResult(context.evalCode('new Uint8Array(8)'));
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 2 });
  const buffer = mode === 'native' ? memory.buffer : new ArrayBuffer(8);
  const target = new Uint8Array(buffer, 0, 8);
  try {
    if (mode === 'native') {
      owner.rememberMemory(memory, buffer);
      owner.attachMemory(target, proxy, buffer);
    } else {
      owner.attachShadow(target, proxy, view, buffer);
    }
    const written = context.unwrapResult(context.evalCode('proxy[0] = 37; proxy[0]'));
    assert.equal(context.dump(written), 37);
    written.dispose();
    if (mode === 'native') {
      memory.grow(1);
      assert.equal(buffer.byteLength, 0, 'growth detaches the previous unshared buffer');
    }
    owner.invalidate();
    const result = context.evalCode('proxy[0]');
    const revoked = !!result.error;
    if (result.error) {
      assert.match(String(context.dump(result.error)?.message), /ordinary path/);
      result.error.dispose();
    } else {
      result.value.dispose();
    }
    return revoked;
  } finally {
    // The fault control keeps both borrowed roots live until the real unlink/free.
    owner.dispose();
    assert.equal(records.size, 0, 'terminal disposal releases every acquired record');
    assert.equal(slots.size, 0, 'terminal disposal releases every acquired slot');
    view.dispose();
    proxy.dispose();
    context.dispose();
  }
}

const before = await hashes();
const source = await readFile(new URL('src/guest/indexed-access.ts', root), 'utf8');
const anchor = '    this.disable(entry.pointer);\n    entry.active = false;';
assert.equal(source.split(anchor).length, 2, 'one actual deactivate disable anchor');
const changed = source.replace(anchor, '    entry.active = false;');
const actual = load(source);
const faulty = load(changed);
const observations = [];
for (const mode of ['shadow', 'native'] as const) {
  assert.equal(
    await probe(actual, mode),
    true,
    mode + ': actual owner revokes the access epoch',
  );
  assert.equal(
    await probe(faulty, mode),
    false,
    mode + ': omitted-disable control is detected',
  );
  observations.push({ mode, productionRevoked: true, omittedDisableRevoked: false });
}
assert.deepEqual(await hashes(), before, 'scoped source remains stable during the run');
await writeFile(
  new URL('results/quickjs-confinement/wasm-authority-invalidation.json', root),
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      scope:
        'Actual TypeScript IndexedAccess invalidation executed with SDK roots and compiled C',
      node: process.version,
      sourceHashes: before,
      control: {
        name: 'omit actual deactivate disable call in verification-only VM',
        sourceHash: digest(changed),
      },
      observations,
      remainingPremises: [
        'TypeScript erasure, Node VM instrumentation, SDK and C-to-Wasm compilation are trusted',
        'The engine must call invalidation at each necessary entry/exit/reentry barrier',
        'These two execution traces do not establish arbitrary caller histories or every detach mechanism',
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Actual shadow epoch and native-growth invalidation passed; omitted-disable controls retain access and are detected.',
);
