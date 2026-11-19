/** These modules import application memory only. They never receive the engine heap. */
const native = WebAssembly;
const instanceExports = Object.getOwnPropertyDescriptor(
  native.Instance.prototype,
  'exports',
)!.get!;

interface AccessorType {
  load: number;
  store: number;
  shift: number;
  conversion: number;
  floating?: boolean;
  clamp?: boolean;
}

const types = new Map<string, AccessorType>([
  ['Int8Array', { load: 0x2c, store: 0x3a, shift: 0, conversion: 0xb7 }],
  ['Uint8Array', { load: 0x2d, store: 0x3a, shift: 0, conversion: 0xb8 }],
  [
    'Uint8ClampedArray',
    { load: 0x2d, store: 0x3a, shift: 0, conversion: 0xb8, clamp: true },
  ],
  ['Int16Array', { load: 0x2e, store: 0x3b, shift: 1, conversion: 0xb7 }],
  ['Uint16Array', { load: 0x2f, store: 0x3b, shift: 1, conversion: 0xb8 }],
  ['Int32Array', { load: 0x28, store: 0x36, shift: 2, conversion: 0xb7 }],
  ['Uint32Array', { load: 0x28, store: 0x36, shift: 2, conversion: 0xb8 }],
  [
    'Float32Array',
    { load: 0x2a, store: 0x38, shift: 2, conversion: 0xbb, floating: true },
  ],
  ['Float64Array', { load: 0x2b, store: 0x39, shift: 3, conversion: 0, floating: true }],
]);
const modules = new Map<string, WebAssembly.Module>();

const vector = (items: number[][]): number[] => [items.length, ...items.flat()];
const name = (value: string): number[] => [
  value.length,
  ...Array.from(value, (character) => character.charCodeAt(0)),
];
const section = (id: number, bytes: number[]): number[] => [
  id,
  ...unsigned(bytes.length),
  ...bytes,
];

function unsigned(value: number): number[] {
  const bytes = [];
  do {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value) byte |= 0x80;
    bytes.push(byte);
  } while (value);
  return bytes;
}

function accessorModule(type: AccessorType): WebAssembly.Module {
  // read(i32 address) -> f64; write(i32 address, f64 value) -> void.
  // Integer values have already undergone ToInt32/ToUint8Clamp in QuickJS.
  const read = [0, 0x20, 0, type.load, type.shift, 0];
  if (type.conversion) read.push(type.conversion);
  read.push(0x0b);
  const write = [0, 0x20, 0, 0x20, 1];
  if (!type.floating)
    write.push(0xaa); // i32.trunc_f64_s on an exact int32 value.
  else if (type.shift === 2) write.push(0xb6); // f32.demote_f64.
  write.push(type.store, type.shift, 0, 0x0b);
  return new native.Module(
    new Uint8Array([
      0,
      97,
      115,
      109,
      1,
      0,
      0,
      0,
      ...section(
        1,
        vector([
          [0x60, 1, 0x7f, 1, 0x7c],
          [0x60, 2, 0x7f, 0x7c, 0],
        ]),
      ),
      ...section(2, vector([[...name('env'), ...name('memory'), 2, 0, 1]])),
      ...section(3, vector([[0], [1]])),
      ...section(
        7,
        vector([
          [...name('read'), 0, 0],
          [...name('write'), 0, 1],
        ]),
      ),
      ...section(
        10,
        vector([
          [...unsigned(read.length), ...read],
          [...unsigned(write.length), ...write],
        ]),
      ),
    ]),
  );
}

export interface NativeMemoryAccessors {
  read: Function;
  write: Function;
  kind: number;
}

/** The memory has already passed the native Memory brand check in NativeWasm. */
export function memoryAccessors(
  memory: object,
  typeName: string,
): NativeMemoryAccessors | undefined {
  const type = types.get(typeName);
  if (!type) return;
  let module = modules.get(typeName);
  if (!module) {
    module = accessorModule(type);
    modules.set(typeName, module);
  }
  let instance: object;
  try {
    instance = Reflect.construct(native.Instance, [module, { env: { memory } }]);
  } catch (error) {
    // A memory64 store cannot satisfy this wasm32 import. Keep its native path.
    if (error instanceof native.LinkError) return;
    throw error;
  }
  const exports: WebAssembly.Exports = Reflect.apply(instanceExports, instance, []);
  if (typeof exports.read !== 'function' || typeof exports.write !== 'function')
    throw new Error('Invalid trusted memory accessor module');
  return {
    read: exports.read,
    write: exports.write,
    kind: type.shift | ((type.floating ? 2 : type.clamp ? 1 : 0) << 2),
  };
}
