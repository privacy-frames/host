import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  RELEASE_SYNC,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSRuntime,
  type QuickJSDeferredPromise,
} from 'quickjs-emscripten';
import { installGuestRuntime } from './guest-runtime.ts';
import resolveURI from '@jridgewell/resolve-uri';
import type { GuestEngineOptions, GuestEvaluationMode, GuestHost } from './protocol.ts';

interface RetainedGuest {
  id: number;
  handle: QuickJSHandle;
  value: object;
}

interface BufferMirror {
  native: ArrayBuffer;
  guest: QuickJSHandle;
}

const modules = new Map<string, Promise<WebAssembly.Module>>();
const wellKnownSymbols = new Map<symbol, string>();
const arrayBufferLength = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'byteLength',
)!.get!;
const isArrayBuffer = (value: unknown): value is ArrayBuffer => {
  if (!value || typeof value !== 'object') return false;
  try {
    Reflect.apply(arrayBufferLength, value, []);
    return true;
  } catch {
    return false;
  }
};
for (const key of Object.getOwnPropertyNames(Symbol)) {
  const value: unknown = Reflect.get(Symbol, key);
  if (typeof value === 'symbol') wellKnownSymbols.set(value, key);
}

const intrinsicNames = [
  'Object',
  'Function',
  'Array',
  'Boolean',
  'Number',
  'String',
  'Symbol',
  'BigInt',
  'Date',
  'RegExp',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Promise',
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'AggregateError',
  'ArrayBuffer',
  'DataView',
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array',
] as const;

const viewConstructors = new Map<string, Function>([
  ['DataView', DataView],
  ['Int8Array', Int8Array],
  ['Uint8Array', Uint8Array],
  ['Uint8ClampedArray', Uint8ClampedArray],
  ['Int16Array', Int16Array],
  ['Uint16Array', Uint16Array],
  ['Int32Array', Int32Array],
  ['Uint32Array', Uint32Array],
  ['Float32Array', Float32Array],
  ['Float64Array', Float64Array],
  ['BigInt64Array', BigInt64Array],
  ['BigUint64Array', BigUint64Array],
]);

/**
 * One persistent guest realm. All browser authority enters through GuestHost;
 * handles, callbacks and native identities remain owned by this instance.
 */
export class GuestEngine {
  readonly context: QuickJSContext;
  readonly runtime: QuickJSRuntime;
  private readonly host: GuestHost;
  private readonly options: GuestEngineOptions;
  private readonly helpers = new Map<string, QuickJSHandle>();
  private readonly nativeIds = new WeakMap<object, number>();
  private readonly nativeObjects = new Map<number, object>();
  private readonly nativeHandles = new Map<object, QuickJSHandle>();
  private readonly guestObjects = new Map<number, RetainedGuest>();
  private readonly guestHandles = new WeakMap<object, QuickJSHandle>();
  private readonly symbolIds = new Map<symbol, number>();
  private readonly symbols = new Map<number, symbol>();
  private readonly symbolHandles = new Map<symbol, QuickJSHandle>();
  private readonly guestSymbols = new Map<string, symbol>();
  private readonly buffers = new Map<ArrayBuffer, BufferMirror>();
  private readonly promises = new Set<QuickJSDeferredPromise>();
  private readonly pendingPromises = new Set<(error: Error) => void>();
  private readonly disposers = new Set<() => void>();
  private nextNative = 1;
  private nextSymbol = 1;
  private depth = 0;
  private pumping = false;
  private scheduled = false;
  private syncing = false;
  private closed = false;

  private constructor(context: QuickJSContext, options: GuestEngineOptions) {
    this.context = context;
    this.runtime = context.runtime;
    this.host = options.host;
    this.options = options;
    this.runtime.setMemoryLimit(options.memoryLimit ?? 512 * 1024 * 1024);
    this.runtime.setMaxStackSize(options.stackSize ?? 2 * 1024 * 1024);
  }

  static async create(options: GuestEngineOptions): Promise<GuestEngine> {
    let module = options.wasmModule;
    if (!module) {
      if (!options.wasmURL) throw new Error('Trusted JavaScript engine URL is required');
      let loading = modules.get(options.wasmURL);
      if (!loading) {
        loading = fetch(options.wasmURL).then(async (response) => {
          if (!response.ok) throw new Error('Trusted JavaScript engine is unavailable');
          return WebAssembly.compile(await response.arrayBuffer());
        });
        modules.set(options.wasmURL, loading);
      }
      module = await loading;
    }
    const wasm = await newQuickJSWASMModuleFromVariant(
      newVariant(RELEASE_SYNC, { wasmModule: module }),
    );
    const runtime = wasm.newRuntime();
    const engine = new GuestEngine(runtime.newContext(), options);
    try {
      engine.initialize();
      return engine;
    } catch (error) {
      engine.dispose();
      throw error;
    }
  }

  private initialize(): void {
    for (const [native, name] of wellKnownSymbols)
      this.symbolHandles.set(native, this.context.getWellKnownSymbol(name));
    const bridge = this.context.newFunction('__privacyHostDispatch', (...arguments_) => {
      try {
        return this.dispatch(arguments_);
      } catch (error) {
        return { error: this.exception(error) };
      }
    });
    this.context.setProp(this.context.global, '__privacyHostDispatch', bridge);
    bridge.dispose();
    const helpers = this.unwrap(
      this.context.evalCode(`(${installGuestRuntime.toString()})()`, 'privacy:bindings'),
    );
    try {
      const names = this.context.getOwnPropertyNames(helpers).unwrap();
      try {
        for (const name of names)
          this.helpers.set(
            this.context.getString(name),
            this.context.getProp(helpers, name),
          );
      } finally {
        names.dispose();
      }
    } finally {
      helpers.dispose();
    }

    for (const source of new Set([globalThis, this.options.globalObject ?? globalThis])) {
      for (const name of intrinsicNames) {
        const native: unknown = Reflect.get(source, name);
        const guest = this.context.getProp(this.context.global, name);
        if (
          typeof native === 'function' &&
          this.context.typeof(guest) === 'function' &&
          !this.nativeHandles.has(native)
        ) {
          this.nativeHandles.set(native, guest.dup());
          const nativePrototype: unknown = Reflect.get(native, 'prototype');
          if (nativePrototype && typeof nativePrototype === 'object') {
            const prototype = this.context.getProp(guest, 'prototype');
            this.nativeHandles.set(nativePrototype, prototype);
          }
        }
        guest.dispose();
      }
    }

    // Async/generator constructors are reachable through a native callback's
    // prototype even when native Function itself was never exposed.
    const dynamicFunctions = [
      {
        native: Object.getPrototypeOf(async function () {}).constructor,
        source: 'Object.getPrototypeOf(async function(){}).constructor',
      },
      {
        native: Object.getPrototypeOf(function* () {}).constructor,
        source: 'Object.getPrototypeOf(function*(){}).constructor',
      },
      {
        native: Object.getPrototypeOf(async function* () {}).constructor,
        source: 'Object.getPrototypeOf(async function*(){}).constructor',
      },
    ];
    for (const { native, source } of dynamicFunctions) {
      const guest = this.unwrap(this.context.evalCode(source, 'privacy:intrinsics'));
      this.nativeHandles.set(native, guest);
      this.nativeHandles.set(native.prototype, this.context.getProp(guest, 'prototype'));
    }

    if (this.options.globalObject) {
      this.aliasGlobal(this.options.globalObject);
      const nativePrototype = this.host.prototype(this.options.globalObject);
      if (nativePrototype) {
        const prototype = this.encode(nativePrototype);
        this.helper('setPrototype', [this.context.global, prototype]).dispose();
        prototype.dispose();
      }
    }
    const catalog = this.options.modules ?? new Map<string, string>();
    this.runtime.setModuleLoader(
      (name) => {
        const source = catalog.get(name);
        if (source === undefined) throw new Error('Module is not installed: ' + name);
        return source;
      },
      (base, name) => {
        if (catalog.has(name)) return name;
        const resolved = this.options.resolveModule
          ? this.options.resolveModule(name, base)
          : typeof URL === 'function'
            ? new URL(name, base).href
            : resolveURI(name, base);
        if (!catalog.has(resolved))
          throw new Error('Module is not installed: ' + resolved);
        return resolved;
      },
    );
    // No shared application memory is advertised until cross-engine storage is qualified.
    this.context.setProp(
      this.context.global,
      'SharedArrayBuffer',
      this.context.undefined,
    );
    this.context.setProp(this.context.global, 'Atomics', this.context.undefined);
    this.context.setProp(this.context.global, 'WebAssembly', this.context.undefined);
  }

  private aliasGlobal(value: object): void {
    const id = this.registerNative(value);
    this.nativeHandles.set(value, this.context.global.dup());
    const handle = this.context.newNumber(id);
    this.helper('registerHost', [this.context.global, handle]).dispose();
    handle.dispose();
  }

  /** Evaluate original application source inside the guest, never native eval. */
  evaluate(
    source: string,
    filename = 'application.js',
    mode: GuestEvaluationMode = 'global',
  ): unknown {
    this.assertOpen();
    return this.enter(() => {
      const result = this.unwrap(this.context.evalCode(source, filename, { type: mode }));
      try {
        return this.decode(result);
      } finally {
        result.dispose();
      }
    });
  }

  get(name: string): unknown {
    this.assertOpen();
    return this.enter(() => {
      const value = this.context.getProp(this.context.global, name);
      try {
        return this.decode(value);
      } finally {
        value.dispose();
      }
    });
  }

  set(name: string, value: unknown): void {
    this.assertOpen();
    const handle = this.encode(value);
    try {
      const key = this.context.newString(name);
      try {
        this.helper('defineGlobal', [key, handle]).dispose();
      } finally {
        key.dispose();
      }
    } finally {
      handle.dispose();
    }
  }

  /** Install a dynamic native property without making the whole native global visible. */
  bind(name: string, target: object, key: PropertyKey = name): void {
    this.context.defineProp(this.context.global, name, {
      configurable: true,
      enumerable: true,
      get: () => this.encode(this.host.get(target, key)),
      set: (value) => {
        this.syncBuffers('into-native');
        try {
          if (!this.host.set(target, key, this.decode(value)))
            throw new TypeError('Property is read only');
        } finally {
          this.syncBuffers('into-guest');
        }
      },
    });
  }

  call(fn: Function, arguments_: unknown[] = [], receiver?: unknown): unknown {
    return Reflect.apply(fn, receiver, arguments_);
  }

  /** Keep host listeners/resources alive until explicit realm disposal. */
  onDispose(dispose: () => void): () => void {
    this.disposers.add(dispose);
    return () => this.disposers.delete(dispose);
  }

  /** Native transfer validation must succeed before detaching the guest source. */
  detachTransferred(transfer: readonly Transferable[]): void {
    for (const value of transfer) {
      if (!isArrayBuffer(value)) continue;
      const mirror = this.buffers.get(value);
      if (!mirror) continue;
      const detached = this.helper('bufferDetached', [mirror.guest]);
      const alreadyDetached = this.context.getNumber(detached) !== 0;
      detached.dispose();
      if (!alreadyDetached) this.helper('detachBuffer', [mirror.guest]).dispose();
      this.buffers.delete(value);
      mirror.guest.dispose();
    }
  }

  drainJobs(): void {
    if (this.closed || this.pumping || this.depth) return;
    this.pumping = true;
    try {
      // The pinned SDK patch refreshes output pointers after Wasm memory growth.
      // See patches/quickjs-emscripten-core+0.32.0.patch and upstream issue #240.
      const jobs = this.runtime.executePendingJobs(1000);
      if (jobs.error) {
        const error = this.guestError(jobs.error);
        jobs.error.dispose();
        this.report(error);
      }
      if (this.runtime.hasPendingJob()) this.scheduleJobs();
    } finally {
      this.pumping = false;
    }
  }

  private scheduleJobs(): void {
    if (this.closed || this.scheduled) return;
    this.scheduled = true;
    const schedule =
      typeof queueMicrotask === 'function'
        ? queueMicrotask
        : (callback: () => void) => {
            void Promise.resolve().then(callback);
          };
    schedule(() => {
      this.scheduled = false;
      this.drainJobs();
    });
  }

  private enter<T>(action: () => T): T {
    this.assertOpen();
    this.syncBuffers('into-guest');
    this.depth++;
    try {
      return action();
    } finally {
      this.depth--;
      this.syncBuffers('into-native');
      if (!this.depth) {
        this.scheduleJobs();
      }
    }
  }

  private dispatch(arguments_: QuickJSHandle[]): QuickJSHandle {
    this.assertOpen();
    const [operationHandle, idHandle, keyHandle, ...input] = arguments_;
    const operation = this.context.getString(operationHandle);
    const id = this.context.getNumber(idHandle);
    const target = this.nativeObjects.get(id);
    if (!target) throw new Error('Unknown native object');
    const encodedKey = this.context.getString(keyHandle);
    const key = this.propertyKey(encodedKey);
    // Native reads only retrieve references/values. Flush binary mirrors where
    // native code can consume or mutate them, rather than at each property lookup.
    const effects =
      operation === 'call' ||
      operation === 'construct' ||
      operation === 'set' ||
      operation === 'delete';
    if (effects) this.syncBuffers('into-native');
    let result: unknown;
    try {
      switch (operation) {
        case 'get':
          result = this.host.get(target, key);
          break;
        case 'set':
          result = this.host.set(target, key, this.decode(input[0]));
          break;
        case 'delete':
          result = this.host.delete?.(target, key) ?? false;
          break;
        case 'has':
          result = this.has(target, key);
          break;
        case 'own':
          result = this.host.descriptor(target, key) !== undefined;
          break;
        case 'settable':
          result = this.host.settable?.(target, key) ?? false;
          break;
        case 'keys':
          result = this.host.ownKeys(target);
          break;
        case 'prototype':
          result = this.host.prototype(target);
          break;
        case 'descriptor': {
          const descriptor = this.host.descriptor(target, key);
          return descriptor ? this.encodeRecord(descriptor) : this.context.undefined;
        }
        case 'call': {
          if (typeof target !== 'function')
            throw new TypeError('Native object is not callable');
          const receiver = this.decode(input[0]);
          const args = this.decodeArguments(input[1]);
          result = this.host.call(target, receiver, args);
          break;
        }
        case 'construct': {
          if (typeof target !== 'function')
            throw new TypeError('Native object is not a constructor');
          const args = this.decodeArguments(input[0]);
          result = this.host.construct(target, args);
          break;
        }
        default:
          throw new Error('Unknown guest operation');
      }
    } finally {
      if (effects) this.syncBuffers('into-guest');
    }
    return this.encode(result);
  }

  private has(target: object, key: PropertyKey): boolean {
    const visited = new Set<object>();
    let current: object | null = target;
    while (current && !visited.has(current)) {
      visited.add(current);
      if (this.host.descriptor(current, key)) return true;
      current = this.host.prototype(current);
    }
    return false;
  }

  private registerNative(value: object): number {
    let id = this.nativeIds.get(value);
    if (!id) {
      id = this.nextNative++;
      this.nativeIds.set(value, id);
      this.nativeObjects.set(id, value);
    }
    return id;
  }

  private propertyKey(encoded: string): PropertyKey {
    if (encoded.startsWith('string:')) return encoded.slice(7);
    if (encoded.startsWith('well-known:')) {
      const value: unknown = Reflect.get(Symbol, encoded.slice(11));
      if (typeof value === 'symbol') return value;
    }
    if (encoded.startsWith('registry:')) return Symbol.for(encoded.slice(9));
    if (encoded.startsWith('native:')) {
      const value = this.symbols.get(Number(encoded.slice(7)));
      if (value) return value;
    }
    if (encoded.startsWith('guest-symbol:')) {
      let symbol = this.guestSymbols.get(encoded);
      if (!symbol) {
        symbol = Symbol();
        this.guestSymbols.set(encoded, symbol);
      }
      return symbol;
    }
    if (encoded === '') return '';
    throw new TypeError('Unknown native property key');
  }

  private encode(value: unknown, seen = new Map<object, QuickJSHandle>()): QuickJSHandle {
    if (value === undefined) return this.context.undefined;
    if (value === null) return this.context.null;
    if (typeof value === 'boolean') return value ? this.context.true : this.context.false;
    if (typeof value === 'number') return this.context.newNumber(value);
    if (typeof value === 'string') return this.context.newString(value);
    if (typeof value === 'bigint') return this.context.newBigInt(value);
    if (typeof value === 'symbol') return this.encodeSymbol(value);
    const object = value as object;
    const original = this.guestHandles.get(object);
    if (original) return original.dup();
    const cached = this.nativeHandles.get(object) ?? seen.get(object);
    if (cached) return cached.dup();
    if (isArrayBuffer(value)) return this.encodeBuffer(value);
    if (ArrayBuffer.isView(value)) return this.encodeView(value);
    if (
      value instanceof Promise ||
      Object.prototype.toString.call(value) === '[object Promise]'
    ) {
      const deferred = this.context.newPromise();
      this.promises.add(deferred);
      this.nativeHandles.set(value, deferred.handle.dup());
      void Promise.resolve(value)
        .then(
          (result) => {
            if (this.closed) return;
            const encoded = this.encode(result);
            deferred.resolve(encoded);
            encoded.dispose();
            this.scheduleJobs();
          },
          (error: unknown) => {
            if (this.closed) return;
            const encoded = this.encode(error);
            deferred.reject(encoded);
            encoded.dispose();
            this.scheduleJobs();
          },
        )
        .finally(() => {
          this.promises.delete(deferred);
          deferred.dispose();
        });
      return deferred.handle.dup();
    }
    if (Array.isArray(value)) {
      const result = this.context.newArray();
      seen.set(value, result);
      this.nativeHandles.set(value, result.dup());
      for (let index = 0; index < value.length; index++) {
        if (!Object.hasOwn(value, index)) continue;
        const item = this.encode(value[index], seen);
        this.context.setProp(result, index, item);
        item.dispose();
      }
      const length = this.context.newNumber(value.length);
      this.context.setProp(result, 'length', length);
      length.dispose();
      return result;
    }
    const constructorDescriptor = Object.getOwnPropertyDescriptor(object, 'constructor');
    const constructor = constructorDescriptor?.value;
    const prototypeObject =
      typeof constructor === 'function' && constructor.prototype === object;
    const prototype = Object.getPrototypeOf(object);
    const sourceObject: unknown =
      this.options.globalObject && Reflect.get(this.options.globalObject, 'Object');
    const sourcePrototype =
      typeof sourceObject === 'function' ? sourceObject.prototype : undefined;
    const plain =
      prototype === null ||
      prototype === Object.prototype ||
      prototype === sourcePrototype;
    const descriptors = plain ? Object.getOwnPropertyDescriptors(object) : {};
    const liveFacade = Object.values(descriptors).some(
      (descriptor) => !('value' in descriptor) || !descriptor.enumerable,
    );
    if (!prototypeObject && plain && !liveFacade) {
      const result = this.context.newObject();
      seen.set(object, result);
      this.nativeHandles.set(object, result.dup());
      for (const key of Reflect.ownKeys(object)) {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        if (!descriptor?.enumerable) continue;
        const item = this.encode(Reflect.get(object, key), seen);
        const property =
          typeof key === 'symbol' ? this.encodeSymbol(key) : this.context.newString(key);
        this.context.setProp(result, property, item);
        property.dispose();
        item.dispose();
      }
      return result;
    }
    if (value instanceof Map) {
      const result = this.helper('makeMap', []);
      seen.set(value, result);
      for (const [key, item] of value) {
        const keyHandle = this.encode(key, seen);
        const valueHandle = this.encode(item, seen);
        this.helper('mapSet', [result, keyHandle, valueHandle]).dispose();
        keyHandle.dispose();
        valueHandle.dispose();
      }
      return result;
    }
    if (value instanceof Set) {
      const result = this.helper('makeSet', []);
      seen.set(value, result);
      for (const item of value) {
        const itemHandle = this.encode(item, seen);
        this.helper('setAdd', [result, itemHandle]).dispose();
        itemHandle.dispose();
      }
      return result;
    }
    if (value instanceof RegExp) {
      const source = this.context.newString(value.source);
      const flags = this.context.newString(value.flags);
      try {
        return this.helper('makeRegExp', [source, flags]);
      } finally {
        source.dispose();
        flags.dispose();
      }
    }
    if (value instanceof Date) {
      const time = this.context.newNumber(value.getTime());
      try {
        return this.helper('makeDate', [time]);
      } finally {
        time.dispose();
      }
    }
    const id = this.registerNative(object);
    let constructable = false;
    if (typeof value === 'function') {
      try {
        Reflect.construct(String, [], value);
        constructable = true;
      } catch {}
    }
    const arguments_ = [
      this.context.newNumber(id),
      typeof value === 'function' ? this.context.true : this.context.false,
      constructable ? this.context.true : this.context.false,
      this.context.newString(typeof value === 'function' ? value.name : ''),
      prototypeObject ? this.context.true : this.context.false,
    ];
    try {
      const result = this.helper('createHost', arguments_);
      this.nativeHandles.set(object, result.dup());
      return result;
    } finally {
      for (const argument of arguments_) argument.dispose();
    }
  }

  private encodeRecord(value: PropertyDescriptor): QuickJSHandle {
    const result = this.context.newObject();
    for (const [key, item] of Object.entries(value)) {
      const encoded = this.encode(item);
      this.context.setProp(result, key, encoded);
      encoded.dispose();
    }
    return result;
  }

  private encodeSymbol(value: symbol): QuickJSHandle {
    const cached = this.symbolHandles.get(value);
    if (cached) return cached.dup();
    const known = wellKnownSymbols.get(value);
    if (known) return this.context.getWellKnownSymbol(known);
    const registry = Symbol.keyFor(value);
    if (registry !== undefined) return this.context.newSymbolFor(registry);
    const id = this.nextSymbol++;
    this.symbolIds.set(value, id);
    this.symbols.set(id, value);
    const result = this.context.newUniqueSymbol(value.description ?? '');
    const idHandle = this.context.newNumber(id);
    this.helper('registerSymbol', [result, idHandle]).dispose();
    idHandle.dispose();
    this.symbolHandles.set(value, result.dup());
    return result;
  }

  private encodeBuffer(value: ArrayBuffer): QuickJSHandle {
    const existing = this.buffers.get(value);
    if (existing) return existing.guest.dup();
    const result = this.context.newArrayBuffer(value);
    this.buffers.set(value, { native: value, guest: result.dup() });
    this.nativeHandles.set(value, result.dup());
    const id = this.helper('guestId', [result]);
    this.retainGuest(this.context.getNumber(id), result.dup(), value);
    id.dispose();
    return result;
  }

  private encodeView(value: ArrayBufferView): QuickJSHandle {
    if (!isArrayBuffer(value.buffer))
      throw new TypeError('Shared memory is not supported');
    const buffer = this.encodeBuffer(value.buffer);
    const name = this.context.newString(
      value instanceof DataView
        ? 'DataView'
        : Object.prototype.toString.call(value).slice(8, -1),
    );
    const offset = this.context.newNumber(value.byteOffset);
    const length = this.context.newNumber(
      value instanceof DataView ? value.byteLength : Reflect.get(value, 'length'),
    );
    try {
      const result = this.helper('makeView', [buffer, name, offset, length]);
      this.nativeHandles.set(value, result.dup());
      const id = this.helper('guestId', [result]);
      this.retainGuest(this.context.getNumber(id), result.dup(), value);
      id.dispose();
      return result;
    } finally {
      buffer.dispose();
      name.dispose();
      offset.dispose();
      length.dispose();
    }
  }

  private decode(value: QuickJSHandle, seen = new Map<number, unknown>()): unknown {
    const type = this.context.typeof(value);
    if (type === 'undefined') return undefined;
    if (type === 'string') return this.context.getString(value);
    if (type === 'number') return this.context.getNumber(value);
    if (type === 'boolean') return this.context.getNumber(value) !== 0;
    if (type === 'bigint') return this.context.getBigInt(value);
    if (type === 'symbol') {
      const encoded = this.helper('key', [value]);
      try {
        const symbol = this.propertyKey(this.context.getString(encoded));
        if (typeof symbol === 'symbol' && !this.symbolHandles.has(symbol))
          this.symbolHandles.set(symbol, value.dup());
        return symbol;
      } finally {
        encoded.dispose();
      }
    }
    const kindHandle = this.helper('kind', [value]);
    const kind = this.context.getString(kindHandle);
    kindHandle.dispose();
    if (kind === 'null') return null;
    if (kind === 'host') {
      const id = this.helper('hostId', [value]);
      try {
        return this.nativeObjects.get(this.context.getNumber(id));
      } finally {
        id.dispose();
      }
    }
    const idHandle = this.helper('guestId', [value]);
    const id = this.context.getNumber(idHandle);
    idHandle.dispose();
    if (seen.has(id)) return seen.get(id);
    const previous = this.guestObjects.get(id);
    if (kind === 'function') {
      if (previous) return previous.value;
      const engine = this;
      const handle = value.dup();
      const callable = function (this: unknown, ...arguments_: unknown[]): unknown {
        return engine.invoke(handle, this, arguments_, new.target !== undefined);
      };
      this.retainGuest(id, handle, callable);
      return callable;
    }
    if (kind === 'buffer') {
      if (previous && isArrayBuffer(previous.value)) return previous.value;
      const bytes = this.context.getArrayBuffer(value);
      const buffer = Uint8Array.from(bytes.value).buffer;
      bytes.dispose();
      this.retainGuest(id, value.dup(), buffer);
      this.buffers.set(buffer, { native: buffer, guest: value.dup() });
      return buffer;
    }
    if (kind === 'view') return this.decodeView(value, id, seen);
    if (kind === 'promise') {
      if (previous) return previous.value;
      let resolvePromise: (value: unknown) => void;
      let rejectPromise: (error: Error) => void;
      const promise = new Promise<unknown>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });
      this.pendingPromises.add(rejectPromise!);
      const resolve = this.context.newFunction('resolve', (result) => {
        if (this.closed) return;
        this.pendingPromises.delete(rejectPromise);
        try {
          resolvePromise(this.decode(result));
        } catch (error) {
          rejectPromise(error instanceof Error ? error : new Error(String(error)));
        }
      });
      const reject = this.context.newFunction('reject', (error) => {
        if (this.closed) return;
        this.pendingPromises.delete(rejectPromise);
        rejectPromise(this.guestError(error));
      });
      try {
        this.helper('observePromise', [value, resolve, reject]).dispose();
      } finally {
        resolve.dispose();
        reject.dispose();
      }
      this.retainGuest(id, value.dup(), promise);
      void promise.catch((error: unknown) => {
        if (!this.closed)
          this.report(error instanceof Error ? error : new Error(String(error)));
      });
      this.scheduleJobs();
      return promise;
    }
    if (kind === 'date') {
      const time = this.helper('dateTime', [value]);
      try {
        return new Date(this.context.getNumber(time));
      } finally {
        time.dispose();
      }
    }
    if (kind === 'map' || kind === 'set') {
      const result =
        previous?.value instanceof Map || previous?.value instanceof Set
          ? previous.value
          : kind === 'map'
            ? new Map<unknown, unknown>()
            : new Set<unknown>();
      result.clear();
      seen.set(id, result);
      if (!previous) this.retainGuest(id, value.dup(), result);
      const entries = this.helper(kind === 'map' ? 'mapEntries' : 'setEntries', [value]);
      try {
        const decoded = this.decode(entries, seen);
        if (!Array.isArray(decoded)) throw new TypeError('Invalid collection data');
        if (result instanceof Map) {
          for (const pair of decoded) {
            if (!Array.isArray(pair)) throw new TypeError('Invalid map entry');
            result.set(pair[0], pair[1]);
          }
        } else for (const item of decoded) result.add(item);
        return result;
      } finally {
        entries.dispose();
      }
    }
    if (kind === 'regexp') {
      const source = this.context.getProp(value, 'source');
      const flags = this.context.getProp(value, 'flags');
      try {
        return new RegExp(this.context.getString(source), this.context.getString(flags));
      } finally {
        source.dispose();
        flags.dispose();
      }
    }
    const result: unknown[] | Record<PropertyKey, unknown> = previous
      ? (previous.value as unknown[] | Record<PropertyKey, unknown>)
      : kind === 'array'
        ? []
        : Object.create(null);
    seen.set(id, result);
    if (!previous) this.retainGuest(id, value.dup(), result);
    for (const key of Reflect.ownKeys(result))
      if (key !== 'length') Reflect.deleteProperty(result, key);
    if (Array.isArray(result)) result.length = 0;
    const keyArray = this.helper('objectKeys', [value]);
    const keyCount = this.context.getProp(keyArray, 'length');
    const length = this.context.getNumber(keyCount);
    keyCount.dispose();
    try {
      for (let index = 0; index < length; index++) {
        const key = this.context.getProp(keyArray, index);
        const name =
          this.context.typeof(key) === 'symbol'
            ? this.decode(key)
            : this.context.getString(key);
        if (typeof name !== 'string' && typeof name !== 'symbol') {
          key.dispose();
          continue;
        }
        if (kind === 'array' && name === 'length') {
          key.dispose();
          continue;
        }
        const item = this.context.getProp(value, key);
        const enumerableHandle = this.helper('propertyEnumerable', [value, key]);
        const enumerable = this.context.getNumber(enumerableHandle) !== 0;
        enumerableHandle.dispose();
        try {
          Reflect.defineProperty(result, name, {
            value: this.decode(item, seen),
            enumerable,
            configurable: true,
            writable: true,
          });
        } finally {
          item.dispose();
          key.dispose();
        }
      }
    } finally {
      keyArray.dispose();
    }
    if (kind === 'array') {
      const count = this.context.getProp(value, 'length');
      Reflect.set(result, 'length', this.context.getNumber(count));
      count.dispose();
    }
    return result;
  }

  private decodeView(
    value: QuickJSHandle,
    id: number,
    seen: Map<number, unknown>,
  ): ArrayBufferView {
    const previous = this.guestObjects.get(id);
    if (previous && ArrayBuffer.isView(previous.value)) return previous.value;
    const info = this.helper('viewInfo', [value]);
    const bufferHandle = this.context.getProp(info, 'buffer');
    const buffer = this.decode(bufferHandle, seen);
    bufferHandle.dispose();
    if (!isArrayBuffer(buffer)) {
      info.dispose();
      throw new TypeError('Shared buffers are not supported');
    }
    const nameHandle = this.context.getProp(info, 'name');
    const name = this.context.getString(nameHandle);
    nameHandle.dispose();
    const offsetHandle = this.context.getProp(info, 'offset');
    const offset = this.context.getNumber(offsetHandle);
    offsetHandle.dispose();
    const lengthHandle = this.context.getProp(
      info,
      name === 'DataView' ? 'byteLength' : 'length',
    );
    const length = this.context.getNumber(lengthHandle);
    lengthHandle.dispose();
    info.dispose();
    const Constructor = viewConstructors.get(name);
    if (!Constructor) throw new TypeError('Unknown binary view');
    const view: unknown = Reflect.construct(Constructor, [buffer, offset, length]);
    if (!ArrayBuffer.isView(view)) throw new TypeError('Invalid binary view');
    this.retainGuest(id, value.dup(), view);
    return view;
  }

  private retainGuest(id: number, handle: QuickJSHandle, value: object): void {
    const previous = this.guestObjects.get(id);
    if (previous) {
      // A repeatedly thrown guest exception can acquire several native Error
      // wrappers. Keep one owned handle instead of losing the previous retain.
      handle.dispose();
      this.guestHandles.set(value, previous.handle);
      return;
    }
    this.guestObjects.set(id, { id, handle, value });
    this.guestHandles.set(value, handle);
  }

  private decodeArguments(value: QuickJSHandle): unknown[] {
    const kind = this.helper('kind', [value]);
    const isArray = this.context.getString(kind) === 'array';
    kind.dispose();
    if (!isArray) throw new TypeError('Native arguments must be an array');
    const count = this.context.getProp(value, 'length');
    const length = this.context.getNumber(count);
    count.dispose();
    const result: unknown[] = [];
    const seen = new Map<number, unknown>();
    for (let index = 0; index < length; index++) {
      const item = this.context.getProp(value, index);
      try {
        result.push(this.decode(item, seen));
      } finally {
        item.dispose();
      }
    }
    return result;
  }

  private encodeArguments(values: unknown[]): QuickJSHandle {
    const result = this.context.newArray();
    const seen = new Map<object, QuickJSHandle>();
    for (let index = 0; index < values.length; index++) {
      const item = this.encode(values[index], seen);
      this.context.setProp(result, index, item);
      item.dispose();
    }
    return result;
  }

  private invoke(
    handle: QuickJSHandle,
    receiver: unknown,
    arguments_: unknown[],
    construct: boolean,
  ): unknown {
    return this.enter(() => {
      const thisHandle = this.encode(receiver);
      const args = this.encodeArguments(arguments_);
      try {
        const value = construct
          ? this.helper('construct', [handle, args])
          : this.helper('apply', [handle, thisHandle, args]);
        try {
          return this.decode(value);
        } finally {
          value.dispose();
        }
      } finally {
        thisHandle.dispose();
        args.dispose();
      }
    });
  }

  private syncBuffers(direction: 'into-guest' | 'into-native'): void {
    if (this.syncing || this.closed || !this.helpers.size) return;
    this.syncing = true;
    try {
      for (const mirror of this.buffers.values()) {
        let nativeDetached = false;
        try {
          new Uint8Array(mirror.native);
        } catch {
          nativeDetached = true;
        }
        const detached = this.helper('bufferDetached', [mirror.guest]);
        const guestDetached = this.context.getNumber(detached) !== 0;
        detached.dispose();
        if (nativeDetached && !guestDetached) {
          this.helper('detachBuffer', [mirror.guest]).dispose();
        }
        if (guestDetached && !nativeDetached) {
          structuredClone(mirror.native, { transfer: [mirror.native] });
        }
        if (nativeDetached || guestDetached) {
          this.buffers.delete(mirror.native);
          mirror.guest.dispose();
          continue;
        }
        if (!mirror.native.byteLength) continue;
        const size = this.helper('bufferSize', [mirror.guest]);
        const guestLength = this.context.getNumber(size);
        size.dispose();
        if (!guestLength || guestLength !== mirror.native.byteLength) continue;
        if (direction === 'into-guest') {
          const source = this.context.newArrayBuffer(mirror.native);
          this.helper('writeBuffer', [mirror.guest, source]).dispose();
          source.dispose();
        } else {
          const bytes = this.context.getArrayBuffer(mirror.guest);
          new Uint8Array(mirror.native).set(bytes.value);
          bytes.dispose();
        }
      }
    } finally {
      this.syncing = false;
    }
  }

  private helper(name: string, arguments_: QuickJSHandle[]): QuickJSHandle {
    const helper = this.helpers.get(name);
    if (!helper) throw new Error('Guest binding helper is unavailable: ' + name);
    return this.unwrap(
      this.context.callFunction(helper, this.context.undefined, ...arguments_),
    );
  }

  private unwrap(result: {
    value?: QuickJSHandle;
    error?: QuickJSHandle;
  }): QuickJSHandle {
    if (result.error) {
      const error = this.guestError(result.error);
      result.error.dispose();
      throw error;
    }
    if (!result.value) throw new Error('Missing guest result');
    return result.value;
  }

  private guestError(handle: QuickJSHandle): Error {
    const info = this.helpers.has('errorInfo')
      ? this.helper('errorInfo', [handle])
      : handle.dup();
    const read = (key: string) => {
      const value = this.context.getProp(info, key);
      try {
        return this.context.typeof(value) === 'string'
          ? this.context.getString(value)
          : '';
      } finally {
        value.dispose();
      }
    };
    const error = new Error(read('message') || 'Guest execution failed');
    error.name = read('name') || 'Error';
    const stack = read('stack');
    if (stack) error.stack = stack;
    info.dispose();
    if (
      this.helpers.has('guestId') &&
      ['object', 'function'].includes(this.context.typeof(handle))
    ) {
      const kind = this.helper('kind', [handle]);
      const isObject = this.context.getString(kind) !== 'null';
      kind.dispose();
      if (isObject) {
        const id = this.helper('guestId', [handle]);
        this.retainGuest(this.context.getNumber(id), handle.dup(), error);
        id.dispose();
      }
    }
    return error;
  }

  private exception(error: unknown): QuickJSHandle {
    if (error && (typeof error === 'object' || typeof error === 'function')) {
      const original = this.guestHandles.get(error);
      if (original) return original.dup();
    }
    try {
      return this.encode(error);
    } catch {
      return this.context.newError(new Error('Native operation failed'));
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('Application context is closed');
  }

  private report(error: Error): void {
    if (this.options.onError) this.options.onError(error);
    else console.error(error);
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const reject of this.pendingPromises)
      reject(new Error('Application context is closed'));
    this.pendingPromises.clear();
    for (const dispose of this.disposers) {
      try {
        dispose();
      } catch (error) {
        this.report(error instanceof Error ? error : new Error(String(error)));
      }
    }
    for (const handle of this.helpers.values()) if (handle.alive) handle.dispose();
    for (const handle of this.nativeHandles.values()) if (handle.alive) handle.dispose();
    for (const { handle } of this.guestObjects.values())
      if (handle.alive) handle.dispose();
    for (const handle of this.symbolHandles.values()) if (handle.alive) handle.dispose();
    for (const { guest } of this.buffers.values()) if (guest.alive) guest.dispose();
    for (const promise of this.promises) promise.dispose();
    this.helpers.clear();
    this.nativeHandles.clear();
    this.nativeObjects.clear();
    this.guestObjects.clear();
    this.symbolHandles.clear();
    this.buffers.clear();
    this.promises.clear();
    this.context.dispose();
    this.runtime.dispose();
  }
}
