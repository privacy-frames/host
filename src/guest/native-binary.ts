import type { GuestHost } from './protocol.ts';

const constructors = {
  ArrayBuffer,
  DataView,
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
};
const sharedConstructor: typeof SharedArrayBuffer | undefined = (() => {
  if (typeof SharedArrayBuffer === 'function') return SharedArrayBuffer;
  try {
    // Browsers may hide the global constructor while still permitting a shared
    // Wasm memory. Sharing between agents remains subject to browser isolation.
    const memory = new WebAssembly.Memory({ initial: 0, maximum: 0, shared: true });
    return Object.getPrototypeOf(memory.buffer).constructor;
  } catch {
    return undefined;
  }
})();
const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedBuffer = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer')!.get!;
const dataBuffer = Object.getOwnPropertyDescriptor(DataView.prototype, 'buffer')!.get!;
const sharedLength = sharedConstructor
  ? Object.getOwnPropertyDescriptor(sharedConstructor.prototype, 'byteLength')!.get!
  : undefined;
const bufferLength = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'byteLength',
)!.get!;
const apply = Reflect.apply;
const construct = Reflect.construct;
const get = Reflect.get;
const set = Reflect.set;
const descriptor = Object.getOwnPropertyDescriptor;
const keys = Reflect.ownKeys;
const prototype = Object.getPrototypeOf;
const isView = ArrayBuffer.isView;
const clone = globalThis.structuredClone;
const extensible = Object.isExtensible;
const atomics = new Map<PropertyKey, Function>(
  keys(Atomics).flatMap((key) => {
    const value = get(Atomics, key);
    return typeof value === 'function' ? [[key, value] as [PropertyKey, Function]] : [];
  }),
);

interface BinaryProperty {
  key: PropertyKey;
  method?: boolean;
  getter?: boolean;
  setter?: boolean;
  value?: unknown;
}

/** Native-backed stores stay outside the interpreter's private linear memory. */
export class NativeBinary implements GuestHost {
  private readonly retained = new WeakSet<object>();
  private readonly sharedBuffers = new WeakMap<object, boolean>();
  private readonly viewBuffers = new WeakMap<object, ArrayBufferLike>();
  private readonly functions = new WeakSet<object>();
  private readonly prototypes = new Set<object>();
  private readonly constructorHooks = new WeakSet<object>();
  private readonly methodReceivers = new WeakMap<object, object>();
  private readonly classes = new Map<string, Function>(Object.entries(constructors));
  private readonly descriptors = new Map<string, Map<PropertyKey, PropertyDescriptor>>();

  constructor() {
    if (sharedConstructor) this.classes.set('SharedArrayBuffer', sharedConstructor);
    const half: unknown = Reflect.get(globalThis, 'Float16Array');
    if (typeof half === 'function') this.classes.set('Float16Array', half);
    for (const [name, constructor] of this.classes)
      this.capture(name, constructor.prototype);
    this.capture('TypedArray', typedPrototype);
    for (const value of Object.values(this.bindings))
      if (typeof value === 'function') this.functions.add(value);
  }

  private capture(name: string, target: object): void {
    this.prototypes.add(target);
    const captured = new Map<PropertyKey, PropertyDescriptor>();
    for (const key of keys(target)) {
      const entry = descriptor(target, key)!;
      captured.set(key, entry);
      for (const value of [entry.value, entry.get, entry.set])
        if (typeof value === 'function') this.functions.add(value);
    }
    this.descriptors.set(name, captured);
  }

  retainBuffer(buffer: ArrayBufferLike): void {
    this.retained.add(buffer);
  }

  aliases(): [string, Function][] {
    return [...this.classes];
  }

  bindConstructor(
    view: object,
    read: () => unknown,
    species: (value: object) => unknown,
  ): void {
    if ((!isView(view) || view instanceof DataView) && !this.buffer(view)) return;
    if (this.constructorHooks.has(view)) return;
    let target: object = view;
    if (!extensible(target)) {
      if (!sharedLength || typeof clone !== 'function') return;
      try {
        apply(sharedLength, target, []);
      } catch {
        return;
      }
      // Some browsers can clone a non-extensible Wasm SAB into an extensible
      // wrapper for the same data block. When both wrappers are non-extensible,
      // retain native default species handling; see native-binary-compatibility.md.
      const alias: unknown = clone(target);
      if (!alias || typeof alias !== 'object' || !extensible(alias)) return;
      target = alias;
      this.methodReceivers.set(view, target);
    }
    Object.defineProperty(target, 'constructor', {
      get() {
        const constructor = read();
        if (
          constructor === null ||
          (typeof constructor !== 'object' && typeof constructor !== 'function')
        )
          return constructor;
        const carrier = Object.create(null);
        Object.defineProperty(carrier, Symbol.species, {
          get: () => species(constructor),
        });
        return carrier;
      },
      configurable: true,
    });
    this.constructorHooks.add(view);
  }

  buffer(value: unknown): value is ArrayBufferLike {
    if (!value || typeof value !== 'object') return false;
    if (this.retained.has(value)) return true;
    const known = this.sharedBuffers.get(value);
    if (known !== undefined) return known;
    if (!sharedLength) return false;
    try {
      apply(sharedLength, value, []);
      this.sharedBuffers.set(value, true);
      return true;
    } catch {
      this.sharedBuffers.set(value, false);
      return false;
    }
  }

  view(value: unknown): value is ArrayBufferView {
    if (!isView(value)) return false;
    let buffer = this.viewBuffers.get(value);
    if (!buffer) {
      try {
        buffer = apply(dataBuffer, value, []);
      } catch {
        buffer = apply(typedBuffer, value, []);
      }
      this.viewBuffers.set(value, buffer!);
    }
    return this.buffer(buffer);
  }

  owns(value: object): boolean {
    return (
      this.buffer(value) ||
      this.view(value) ||
      this.functions.has(value) ||
      this.prototypes.has(value)
    );
  }

  /** A branded copyWithin with primitive indices can only change this buffer.
   * Object coercion and other methods retain the engine's full synchronization. */
  copyWithinBuffer(
    target: Function,
    receiver: unknown,
    arguments_: unknown[],
  ): ArrayBufferLike | undefined {
    const method = this.descriptors.get('TypedArray')?.get('copyWithin')?.value;
    let view = receiver;
    let indices = arguments_;
    if (target === this.bindings.invoke) {
      const [name, key, operation, targetView, args] = arguments_;
      if (
        name !== 'TypedArray' ||
        key !== 'copyWithin' ||
        operation !== 'value' ||
        !Array.isArray(args)
      )
        return;
      view = targetView;
      indices = args;
    } else if (target !== method) return;

    if (
      indices.some(
        (value) =>
          value !== null && (typeof value === 'object' || typeof value === 'function'),
      )
    )
      return;
    try {
      return apply(typedBuffer, view, []);
    } catch {
      return;
    }
  }

  private retainResult(value: unknown): unknown {
    if (isView(value)) {
      let buffer: ArrayBufferLike;
      try {
        buffer = apply(dataBuffer, value, []);
      } catch {
        buffer = apply(typedBuffer, value, []);
      }
      this.retainBuffer(buffer);
    } else if (value && typeof value === 'object') {
      try {
        apply(bufferLength, value, []);
        this.retained.add(value);
      } catch {}
    }
    return value;
  }

  readonly bindings = {
    atomicKeys: () => [...atomics.keys()],
    atomic: (key: PropertyKey, arguments_: unknown[]) => {
      const method = atomics.get(key);
      if (!method) throw new TypeError('Atomic operation is unavailable');
      return apply(method, Atomics, arguments_);
    },
    descriptions: () =>
      [...this.descriptors].map(([name, entries]) => ({
        name,
        length: this.classes.get(name)?.length,
        bytes: this.classes.get(name)
          ? get(this.classes.get(name)!, 'BYTES_PER_ELEMENT')
          : undefined,
        available:
          name !== 'SharedArrayBuffer' || typeof SharedArrayBuffer === 'function',
        properties: [...entries]
          .filter(([key]) => key !== 'constructor')
          .map(([key, entry]): BinaryProperty => ({
            key,
            method: typeof entry.value === 'function',
            getter: !!entry.get,
            setter: !!entry.set,
            ...(typeof entry.value !== 'function' && 'value' in entry
              ? { value: entry.value }
              : {}),
          })),
      })),
    construct: (name: string, arguments_: unknown[]) => {
      const constructor = this.classes.get(name);
      if (!constructor) throw new TypeError('Binary constructor is unavailable');
      const value = construct(constructor, arguments_);
      if (isView(value)) this.retainResult(value);
      else this.retained.add(value);
      return value;
    },
    staticInvoke: (
      name: string,
      key: PropertyKey,
      receiver: unknown,
      arguments_: unknown[],
    ) => {
      const constructor = this.classes.get(name);
      if (!constructor || !['from', 'of'].includes(String(key)))
        throw new TypeError('Binary static operation is unavailable');
      const method: unknown = get(constructor, key);
      if (typeof method !== 'function')
        throw new TypeError('Binary static operation is unavailable');
      return this.retainResult(apply(method, this.receiver(receiver), arguments_));
    },
    invoke: (
      name: string,
      key: PropertyKey,
      kind: 'value' | 'get' | 'set',
      receiver: unknown,
      arguments_: unknown[],
    ) => {
      const entry = this.descriptors.get(name)?.get(key);
      const method = entry?.[kind];
      if (typeof method !== 'function')
        throw new TypeError('Binary operation is unavailable');
      return this.retainResult(apply(method, this.receiver(receiver), arguments_));
    },
  };

  get(target: object, key: PropertyKey): unknown {
    return get(target, key, target);
  }

  private receiver(value: unknown): unknown {
    return value && (typeof value === 'object' || typeof value === 'function')
      ? (this.methodReceivers.get(value) ?? value)
      : value;
  }
  set(target: object, key: PropertyKey, value: unknown): boolean {
    return set(target, key, value, target);
  }
  settable(target: object, key: PropertyKey): boolean {
    return (
      this.view(target) &&
      typeof key === 'string' &&
      (String(Number(key)) === key || key === '-0')
    );
  }
  delete(target: object, key: PropertyKey): boolean {
    if (key === 'constructor' && this.constructorHooks.has(target)) return true;
    return Reflect.deleteProperty(target, key);
  }
  define(target: object, key: PropertyKey, value: PropertyDescriptor): boolean {
    return Reflect.defineProperty(target, key, value);
  }
  descriptor(target: object, key: PropertyKey): PropertyDescriptor | undefined {
    if (key === 'constructor' && this.constructorHooks.has(target)) return undefined;
    return descriptor(target, key);
  }
  ownKeys(target: object): (string | symbol)[] {
    return keys(target).filter(
      (key) => key !== 'constructor' || !this.constructorHooks.has(target),
    );
  }
  prototype(target: object): object | null {
    return prototype(target);
  }
  call(target: Function, receiver: unknown, arguments_: unknown[]): unknown {
    return this.retainResult(apply(target, this.receiver(receiver), arguments_));
  }
  construct(): object {
    throw new TypeError('Binary methods are not constructors');
  }
}
