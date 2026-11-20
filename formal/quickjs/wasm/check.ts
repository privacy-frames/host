import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '../../..');
const output = resolve(root, 'results/quickjs-confinement/wasm-authority.json');
const sourcePath = 'src/guest/wasm-accessors.ts';
const source = await readFile(resolve(root, sourcePath), 'utf8');
const hash = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const captured: { bytes: Uint8Array<ArrayBuffer>; module: WebAssembly.Module }[] = [];

// Record the bytes passed by the actual emitter to the standard Wasm validator.
// The VM is verification instrumentation, not an application isolation boundary.
class RecordingModule extends WebAssembly.Module {
  constructor(bytes: Uint8Array<ArrayBuffer>) {
    super(bytes);
    captured.push({ bytes: Uint8Array.from(bytes), module: this });
  }
}
const instrumentedWasm = Object.create(WebAssembly);
Object.defineProperty(instrumentedWasm, 'Module', { value: RecordingModule });
const exports: Record<string, unknown> = {};
const context = createContext({
  WebAssembly: instrumentedWasm,
  exports,
  Uint8Array,
});
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    removeComments: false,
  },
  reportDiagnostics: true,
});
assert.deepEqual(compiled.diagnostics, []);
runInContext(compiled.outputText, context, { filename: sourcePath });
interface Accessors {
  read(address: number): number;
  write(address: number, value: number): void;
  kind: number;
}
const accessors: unknown = exports.memoryAccessors;
assert(typeof accessors === 'function');
const create = (memory: WebAssembly.Memory, name: string): Accessors | undefined => {
  const result: unknown = Reflect.apply(accessors, undefined, [memory, name]);
  if (result === undefined) return;
  assert(result && typeof result === 'object');
  assert('read' in result && typeof result.read === 'function');
  assert('write' in result && typeof result.write === 'function');
  assert('kind' in result && typeof result.kind === 'number');
  const read = result.read;
  const write = result.write;
  return {
    read(address) {
      const value: unknown = Reflect.apply(read, undefined, [address]);
      assert(typeof value === 'number');
      return value;
    },
    write(address, value) {
      assert.equal(Reflect.apply(write, undefined, [address, value]), undefined);
    },
    kind: result.kind,
  };
};

class Reader {
  private offset = 0;
  constructor(readonly bytes: Uint8Array<ArrayBuffer>) {}
  get remaining(): number {
    return this.bytes.length - this.offset;
  }
  byte(): number {
    assert(this.remaining > 0, 'Truncated Wasm section');
    return this.bytes[this.offset++];
  }
  unsigned(): number {
    let result = 0;
    for (let shift = 0; shift <= 28; shift += 7) {
      const byte = this.byte();
      assert(shift < 28 || byte <= 15, 'Integer exceeds u32');
      result += (byte & 0x7f) * 2 ** shift;
      if (!(byte & 0x80)) {
        assert(shift === 0 || byte !== 0, 'Non-canonical LEB integer');
        return result;
      }
    }
    throw new Error('Overlong LEB integer');
  }
  bytesOf(length: number): Uint8Array<ArrayBuffer> {
    assert(length <= this.remaining, 'Truncated Wasm body');
    const bytes = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }
  name(): string {
    const bytes = this.bytesOf(this.unsigned());
    assert(
      bytes.every((byte) => byte < 128),
      'Expected ASCII interface name',
    );
    return String.fromCharCode(...bytes);
  }
  finished(): void {
    assert.equal(this.remaining, 0, 'Trailing Wasm bytes');
  }
}
interface Family {
  name: string;
  load: number;
  store: number;
  shift: number;
  conversion?: number;
  floating?: boolean;
  clamp?: boolean;
  constructor:
    | typeof Uint8Array
    | typeof Int8Array
    | typeof Uint8ClampedArray
    | typeof Uint16Array
    | typeof Int16Array
    | typeof Uint32Array
    | typeof Int32Array
    | typeof Float32Array
    | typeof Float64Array;
}
const families: readonly Family[] = [
  {
    name: 'Int8Array',
    load: 0x2c,
    store: 0x3a,
    shift: 0,
    conversion: 0xb7,
    constructor: Int8Array,
  },
  {
    name: 'Uint8Array',
    load: 0x2d,
    store: 0x3a,
    shift: 0,
    conversion: 0xb8,
    constructor: Uint8Array,
  },
  {
    name: 'Uint8ClampedArray',
    load: 0x2d,
    store: 0x3a,
    shift: 0,
    conversion: 0xb8,
    clamp: true,
    constructor: Uint8ClampedArray,
  },
  {
    name: 'Int16Array',
    load: 0x2e,
    store: 0x3b,
    shift: 1,
    conversion: 0xb7,
    constructor: Int16Array,
  },
  {
    name: 'Uint16Array',
    load: 0x2f,
    store: 0x3b,
    shift: 1,
    conversion: 0xb8,
    constructor: Uint16Array,
  },
  {
    name: 'Int32Array',
    load: 0x28,
    store: 0x36,
    shift: 2,
    conversion: 0xb7,
    constructor: Int32Array,
  },
  {
    name: 'Uint32Array',
    load: 0x28,
    store: 0x36,
    shift: 2,
    conversion: 0xb8,
    constructor: Uint32Array,
  },
  {
    name: 'Float32Array',
    load: 0x2a,
    store: 0x38,
    shift: 2,
    conversion: 0xbb,
    floating: true,
    constructor: Float32Array,
  },
  {
    name: 'Float64Array',
    load: 0x2b,
    store: 0x39,
    shift: 3,
    floating: true,
    constructor: Float64Array,
  },
];

function checkModule(bytes: Uint8Array<ArrayBuffer>, family: Family) {
  const reader = new Reader(bytes);
  assert.deepEqual(Array.from(reader.bytesOf(8)), [0, 97, 115, 109, 1, 0, 0, 0]);
  const sections = new Map<number, Uint8Array<ArrayBuffer>>();
  for (const expected of [1, 2, 3, 7, 10]) {
    assert.equal(reader.byte(), expected, 'Unreviewed Wasm section');
    sections.set(expected, reader.bytesOf(reader.unsigned()));
  }
  reader.finished();
  const types = new Reader(sections.get(1)!);
  assert.deepEqual(
    Array.from(types.bytesOf(types.remaining)),
    [2, 0x60, 1, 0x7f, 1, 0x7c, 0x60, 2, 0x7f, 0x7c, 0],
  );
  const imports = new Reader(sections.get(2)!);
  assert.equal(imports.unsigned(), 1);
  assert.equal(imports.name(), 'env');
  assert.equal(imports.name(), 'memory');
  assert.equal(imports.byte(), 2, 'Only a memory import is permitted');
  assert.equal(imports.byte(), 0, 'Only unshared wasm32 memory is permitted');
  assert.equal(imports.unsigned(), 1);
  imports.finished();
  assert.deepEqual(Array.from(sections.get(3)!), [2, 0, 1]);
  const exports = new Reader(sections.get(7)!);
  assert.equal(exports.unsigned(), 2);
  for (const [name, index] of [
    ['read', 0],
    ['write', 1],
  ] as const) {
    assert.equal(exports.name(), name);
    assert.equal(exports.byte(), 0);
    assert.equal(exports.unsigned(), index);
  }
  exports.finished();
  const code = new Reader(sections.get(10)!);
  assert.equal(code.unsigned(), 2);
  const read = [0, 0x20, 0, family.load, family.shift, 0];
  if (family.conversion !== undefined) read.push(family.conversion);
  read.push(0x0b);
  const write = [0, 0x20, 0, 0x20, 1];
  if (!family.floating) write.push(0xaa);
  else if (family.shift === 2) write.push(0xb6);
  write.push(family.store, family.shift, 0, 0x0b);
  assert.deepEqual(Array.from(code.bytesOf(code.unsigned())), read);
  assert.deepEqual(Array.from(code.bytesOf(code.unsigned())), write);
  code.finished();
}

function unsigned(value: number): number[] {
  const bytes: number[] = [];
  do {
    let byte = value % 128;
    value = Math.floor(value / 128);
    if (value) byte |= 0x80;
    bytes.push(byte);
  } while (value);
  return bytes;
}
function rewriteSection(
  original: Uint8Array<ArrayBuffer>,
  target: number,
  replace: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  const reader = new Reader(original);
  const output = Array.from(reader.bytesOf(8));
  while (reader.remaining) {
    const id = reader.byte();
    const bytes = reader.bytesOf(reader.unsigned());
    const replacement = id === target ? replace(bytes) : bytes;
    output.push(id, ...unsigned(replacement.length), ...replacement);
  }
  return new Uint8Array(output);
}

const application = new WebAssembly.Memory({ initial: 1, maximum: 2 });
const unrelated = new WebAssembly.Memory({ initial: 1, maximum: 2 });
new Uint8Array(unrelated.buffer).fill(0xa5);
const observations = [];
for (const family of families) {
  const before = captured.length;
  const functions = create(application, family.name);
  assert(functions);
  assert.equal(captured.length, before + 1, 'Each supported family must emit one module');
  const module = captured.at(-1)!;
  checkModule(module.bytes, family);
  assert.deepEqual(WebAssembly.Module.imports(module.module), [
    { module: 'env', name: 'memory', kind: 'memory' },
  ]);
  assert.deepEqual(WebAssembly.Module.exports(module.module), [
    { name: 'read', kind: 'function' },
    { name: 'write', kind: 'function' },
  ]);
  assert.equal(
    functions.kind,
    family.shift | ((family.floating ? 2 : family.clamp ? 1 : 0) << 2),
  );
  const view = new family.constructor(application.buffer, 16, 4);
  const expected = new family.constructor(1);
  const value = family.floating ? 0.25 : family.clamp ? 7 : -7;
  expected[0] = value;
  functions.write(16, value);
  assert(Object.is(view[0], expected[0]));
  assert(Object.is(functions.read(16), expected[0]));
  const second = create(unrelated, family.name);
  assert(second);
  assert.equal(
    captured.length,
    before + 1,
    'Compiled module is reused, not memory binding',
  );
  second.write(16, 3);
  assert.equal(functions.read(16), expected[0]);
  assert.equal(second.read(16), 3);
  assert.throws(() => functions.read(0xffffffff), WebAssembly.RuntimeError);
  assert.throws(() => functions.write(0xffffffff, 1), WebAssembly.RuntimeError);
  const saved = Uint8Array.from(module.bytes);
  const withHostImport = rewriteSection(saved, 2, (payload) => {
    const replacement = Array.from(payload);
    assert.equal(replacement[0], 1);
    replacement[0] = 2;
    // An unused imported function is valid Wasm but adds host authority.
    replacement.push(3, 101, 110, 118, 8, 99, 97, 108, 108, 98, 97, 99, 107, 0, 0);
    return new Uint8Array(replacement);
  });
  assert(WebAssembly.validate(withHostImport));
  assert.throws(() => checkModule(withHostImport, family));
  const withNoop = rewriteSection(saved, 10, (payload) => {
    const code = new Reader(payload);
    assert.equal(code.unsigned(), 2);
    const readBody = code.bytesOf(code.unsigned());
    const writeBody = code.bytesOf(code.unsigned());
    code.finished();
    return new Uint8Array([
      2,
      ...unsigned(readBody.length + 1),
      ...readBody.slice(0, -1),
      0x01,
      0x0b,
      ...unsigned(writeBody.length),
      ...writeBody,
    ]);
  });
  assert(WebAssembly.validate(withNoop));
  assert.throws(() => checkModule(withNoop, family));
  observations.push({
    family: family.name,
    moduleSHA256: hash(saved),
    bytes: saved.length,
    imports: WebAssembly.Module.imports(module.module),
    exports: WebAssembly.Module.exports(module.module),
    memoryBindingsIndependent: true,
    outOfBoundsTraps: true,
    validExtraHostImportRejected: true,
    validInstructionDriftRejected: true,
  });
}
assert.equal(create(application, 'BigInt64Array'), undefined);
assert.equal(create(application, 'Float16Array'), undefined);
assert.equal(create(new WebAssembly.Memory({ initial: 0 }), 'Uint8Array'), undefined);
const sourceHashes: Record<string, string> = {};
for (const path of [
  sourcePath,
  'src/guest/indexed-access.ts',
  'src/guest/native-wasm.ts',
  'src/guest/engine.ts',
  'vendor/quickjs/upstream/quickjs.c',
  'vendor/quickjs/c/interface.c',
])
  sourceHashes[path] = hash(await readFile(resolve(root, path)));
await mkdir(resolve(root, 'results/quickjs-confinement'), { recursive: true });
await writeFile(
  output,
  JSON.stringify(
    {
      scope:
        'Structural verification of modules emitted by the actual TypeScript accessor generator; local native-memory binding controls. Not a proof of C lifetime or the whole runtime.',
      node: process.version,
      typescript: ts.version,
      assumptions: [
        'Standard WebAssembly validation/execution and memory import isolation are trusted.',
        'The strict decoder and TypeScript erasure/instrumentation are trusted verification code.',
        'Only one unshared wasm32 memory is imported; no host function, table, global or second memory is admitted.',
      ],
      sourceHashes,
      runnerSHA256: hash(await readFile(import.meta.filename)),
      compiledSHA256: hash(compiled.outputText),
      observations,
      remaining: [
        'Production caller ownership of the exact application Memory object.',
        'C control-record/borrowed-handle lifetime and host function-table slot lifetime.',
        'Initialization, invalidation and disposal across reentry, detachment and native calls.',
      ],
      completed: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
console.log('All nine actual accessor modules have only application-memory authority.');
