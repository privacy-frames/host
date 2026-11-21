import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSRuntime,
  type QuickJSDeferredPromise,
  type QuickJSArrayBufferBacking,
} from 'quickjs-emscripten-core';
import { captureQuickJSVariant } from './quickjs.ts';
import { IndexedAccess } from './indexed-access.ts';
import type { IndexedEmscriptenModule } from '../../vendor/quickjs/generated/engine.mjs';
import { installGuestRuntime } from './guest-runtime.ts';
import { allocateIdentity, type IdentityState } from './identity.ts';
import { installGuestRegExpLegacy } from './legacy-regexp.ts';
import resolveURI from '@jridgewell/resolve-uri';
import type { GuestEngineOptions, GuestEvaluationMode, GuestHost } from './protocol.ts';
import { NativeBinary } from './native-binary.ts';
import { installGuestBinary } from './guest-binary.ts';
import { createNativeWasm } from './native-wasm.ts';

interface RetainedGuest {
  id: number;
  handle: QuickJSHandle;
  value: object;
}

interface IndexShadow {
  native: ArrayBuffer;
  bytes: number;
  backing: QuickJSArrayBufferBacking;
  epoch: object;
}

// This is a performance cache, not an application allocation limit. Stores that
// do not fit retain native access; Wasm memory access never needs this cache.
const indexShadowBudget = 128 * 1024 * 1024;

interface BufferMirror {
  native: ArrayBuffer;
  guest: QuickJSHandle;
  backing?: QuickJSArrayBufferBacking;
}

const modules = new Map<string, Promise<WebAssembly.Module>>();
const requiresStringEncoding = /\0|[\ud800-\udfff]/u;
const requiresStringRecovery = /\ufffd|[\ud800-\udfff]/u;
const wellKnownSymbols = new Map<symbol, string>();
const arrayBufferIsView = ArrayBuffer.isView;
const arrayBufferLength = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'byteLength',
)!.get!;
const arrayBufferResizable = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'resizable',
)?.get;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayBuffer = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'buffer',
)!.get!;
const typedArrayLength = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'length',
)!.get!;
const typedArrayOffset = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteOffset',
)!.get!;
const typedArrayByteLength = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteLength',
)!.get!;
const typedArrayName = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  Symbol.toStringTag,
)!.get!;
const arrayBufferKinds = new WeakMap<object, boolean>();
const isArrayBuffer = (value: unknown): value is ArrayBuffer => {
  if (!value || typeof value !== 'object') return false;
  const cached = arrayBufferKinds.get(value);
  if (cached !== undefined) return cached;
  let matches = false;
  try {
    Reflect.apply(arrayBufferLength, value, []);
    matches = true;
  } catch {}
  arrayBufferKinds.set(value, matches);
  return matches;
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
  private readonly binary = new NativeBinary();
  private readonly owners = new WeakMap<object, GuestHost>();
  private wasm?: ReturnType<typeof createNativeWasm>;
  private readonly options: GuestEngineOptions;
  private readonly helpers = new Map<string, QuickJSHandle>();
  private readonly nativeIds = new WeakMap<object, number>();
  private readonly nativeObjects = new Map<number, object>();
  private readonly nativeHandles = new Map<object, QuickJSHandle>();
  private readonly guestObjects = new Map<number, RetainedGuest>();
  private readonly importReferences = new Map<number, RetainedGuest>();
  private readonly guestHandles = new WeakMap<object, QuickJSHandle>();
  private readonly symbolIds = new Map<symbol, number>();
  private readonly symbols = new Map<number, symbol>();
  private readonly symbolHandles = new Map<symbol, QuickJSHandle>();
  private readonly guestSymbols = new Map<string, symbol>();
  private readonly buffers = new Map<ArrayBuffer, BufferMirror>();
  private readonly wasmBuffers = new WeakSet<ArrayBuffer>();
  private readonly indexShadows = new Map<ArrayBuffer, IndexShadow>();
  private indexEpoch: object = Object.create(null);
  private wasmDepth = 0;
  private wasmDeferralAllowed = false;
  private readonly promises = new Set<QuickJSDeferredPromise>();
  private readonly pendingPromises = new Set<(error: Error) => void>();
  private readonly disposers = new Set<() => void>();
  private readonly nativeIdentity: IdentityState = { next: 1 };
  private readonly symbolIdentity: IdentityState = { next: 1 };
  private depth = 0;
  private pumping = false;
  private scheduled = false;
  private syncing = false;
  private closed = false;
  private disposed = false;

  private constructor(
    context: QuickJSContext,
    options: GuestEngineOptions,
    private readonly indexed: IndexedAccess,
  ) {
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
    let raw: IndexedEmscriptenModule | undefined;
    const wasm = await newQuickJSWASMModuleFromVariant(
      newVariant(
        captureQuickJSVariant((instance) => {
          raw = instance;
        }),
        { wasmModule: module },
      ),
    );
    if (!raw) throw new Error('Trusted engine instance was not captured');
    const runtime = wasm.newRuntime();
    const engine = new GuestEngine(runtime.newContext(), options, new IndexedAccess(raw));
    try {
      engine.initialize();
      return engine;
    } catch (error) {
      engine.dispose();
      throw error;
    }
  }

  private initialize(): void {
    this.unwrap(
      this.context.evalCode(
        `(${installGuestRegExpLegacy.toString()})();`,
        'privacy:legacy-regexp',
        { type: 'global', strict: true },
      ),
    ).dispose();
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
      this.context.evalCode(
        `(${installGuestRuntime.toString()})(${allocateIdentity.toString()})`,
        'privacy:bindings',
        { type: 'global', strict: true },
      ),
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
          if (
            nativePrototype &&
            (typeof nativePrototype === 'object' || typeof nativePrototype === 'function')
          ) {
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
    this.installBinary();
    this.wasm = createNativeWasm({
      runWasm: (action, deferOrdinary = false) => this.runWasm(action, deferOrdinary),
      retainBuffer: (buffer) => {
        if (isArrayBuffer(buffer)) this.wasmBuffers.add(buffer);
        this.binary.retainBuffer(buffer);
      },
      retainMemory: (memory, buffer) => {
        if (this.indexed.hasMemory(buffer)) return;
        this.flushIndexShadows();
        this.invalidateIndexShadows();
        this.indexed.rememberMemory(memory, buffer);
        if (
          !isArrayBuffer(buffer) ||
          this.buffers.has(buffer) ||
          (arrayBufferResizable && Reflect.apply(arrayBufferResizable, buffer, []))
        )
          return;
        for (const [target, handle] of this.nativeHandles) {
          let targetBuffer: unknown;
          try {
            targetBuffer = Reflect.apply(typedArrayBuffer, target, []);
          } catch {
            continue;
          }
          if (targetBuffer === buffer) this.indexed.attachMemory(target, handle, buffer);
        }
      },
      captureImports: (imports, descriptors) => {
        const input = this.encode(imports);
        const description = this.encode(descriptors);
        try {
          const result = this.helper('captureWasmImports', [input, description]);
          try {
            const captured = this.decode(result);
            if (!captured || typeof captured !== 'object')
              throw new TypeError('Wasm imports must form a namespace object');
            return captured;
          } finally {
            result.dispose();
          }
        } finally {
          input.dispose();
          description.dispose();
        }
      },
    });
    this.set('WebAssembly', this.wasm.namespace);
  }

  private installBinary(): void {
    const installer = this.unwrap(
      this.context.evalCode(`(${installGuestBinary.toString()})`, 'privacy:binary', {
        type: 'global',
        strict: true,
      }),
    );
    const bindings = this.encode(this.binary.bindings);
    const hooks = this.helper('binaryHooks', []);
    this.helpers.set('binaryConstructorOf', this.context.getProp(hooks, 'constructorOf'));
    this.helpers.set('binarySpeciesOf', this.context.getProp(hooks, 'speciesOf'));
    try {
      const aliases = this.unwrap(
        this.context.callFunction(installer, this.context.undefined, bindings, hooks),
      );
      try {
        this.helper('captureIndexGetters', [aliases]).dispose();
        for (const [name, native] of this.binary.aliases()) {
          const constructor = this.context.getProp(aliases, name);
          if (this.context.typeof(constructor) !== 'function') {
            constructor.dispose();
            continue;
          }
          this.nativeHandles.get(native)?.dispose();
          this.nativeHandles.set(native, constructor.dup());
          const prototype = this.context.getProp(constructor, 'prototype');
          this.nativeHandles.get(native.prototype)?.dispose();
          this.nativeHandles.set(native.prototype, prototype);
          constructor.dispose();
        }
      } finally {
        aliases.dispose();
      }
    } finally {
      installer.dispose();
      bindings.dispose();
      hooks.dispose();
    }
  }

  /** Identify a previously decoded guest reference without invoking guest code. */
  ownsGuestValue(value: object): boolean {
    return !this.closed && this.guestHandles.has(value);
  }

  /** Only identities already crossing this engine's reference boundary qualify.
   * Recognition must not encode a new value or ask a default native owner. */
  recognizesCallable(value: unknown): value is Function {
    return (
      !this.closed &&
      typeof value === 'function' &&
      (this.guestHandles.has(value) || this.nativeHandles.has(value))
    );
  }

  private owner(target: object): GuestHost {
    const known = this.owners.get(target);
    if (known) return known;
    if (this.host.owns?.(target)) {
      this.owners.set(target, this.host);
      return this.host;
    }
    if (this.binary.owns(target)) {
      this.owners.set(target, this.binary);
      return this.binary;
    }
    const owner = this.wasm?.owns(target) ? this.wasm : this.host;
    // Ordinary binary values can later be retained as external memory. Their
    // ownership must be reconsidered; native DOM/Wasm brands remain immutable.
    if (owner !== this.host || (!isArrayBuffer(target) && !arrayBufferIsView(target)))
      this.owners.set(target, owner);
    return owner;
  }

  private readBinaryProperty(name: string, value: unknown): unknown {
    return this.enter(() => {
      const encoded = this.encode(value);
      try {
        const result = this.helper(name, [encoded]);
        try {
          return this.decode(result);
        } finally {
          result.dispose();
        }
      } finally {
        encoded.dispose();
      }
    });
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
    return this.readGuestProperty(this.context.global, name);
  }

  set(name: string, value: unknown): void {
    this.enter(() => {
      const handle = this.encode(value);
      try {
        const key = this.encodeString(name);
        try {
          this.helper('defineGlobal', [key, handle]).dispose();
        } finally {
          key.dispose();
        }
      } finally {
        handle.dispose();
      }
    });
  }

  /** Install a dynamic native property without making the whole native global visible. */
  bind(name: string, target: object, key: PropertyKey = name): void {
    this.context.defineProp(this.context.global, name, {
      configurable: true,
      enumerable: true,
      get: () => {
        this.assertOpen();
        return this.encode(this.host.get(target, key));
      },
      set: (value) => {
        this.assertOpen();
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
    if (!this.recognizesCallable(fn))
      throw new TypeError('Callable has no recorded engine owner');
    // Decoded guest wrappers retain their existing entry and deferral behavior.
    if (this.guestHandles.has(fn)) return Reflect.apply(fn, receiver, arguments_);
    return this.invoke(this.nativeHandles.get(fn)!, receiver, arguments_, false);
  }

  /** Read guest class metadata without bypassing guest property policies. */
  property(value: unknown, key: PropertyKey): unknown {
    return this.enter(() => {
      const object = this.encode(value);
      const property =
        typeof key === 'symbol' ? this.encodeSymbol(key) : this.encodeString(String(key));
      try {
        const result = this.helper('objectGet', [object, property]);
        try {
          return this.decode(result);
        } finally {
          result.dispose();
        }
      } finally {
        object.dispose();
        property.dispose();
      }
    });
  }

  construct(constructor: Function, arguments_: unknown[] = []): object {
    return Reflect.construct(constructor, arguments_);
  }

  /** Associate a trusted native platform wrapper with its existing guest identity. */
  alias(native: object, guest: unknown): void {
    const handle = this.encode(guest);
    this.nativeHandles.get(native)?.dispose();
    this.nativeHandles.set(native, handle);
  }

  /** Keep host listeners/resources alive until explicit realm disposal. */
  onDispose(dispose: () => void): () => void {
    this.disposers.add(dispose);
    return () => this.disposers.delete(dispose);
  }

  /** Native transfer validation must succeed before detaching the guest source. */
  detachTransferred(transfer: readonly unknown[]): void {
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
      this.flushIndexShadows();
      this.invalidateIndexShadows();
      this.syncBuffers('into-guest');
      // The pinned SDK patch refreshes output pointers after Wasm memory growth.
      // See patches/quickjs-emscripten-core+0.32.0.patch and upstream issue #240.
      const jobs = this.runtime.executePendingJobs(1000);
      if (jobs.error) {
        let error: Error;
        try {
          error = this.guestError(jobs.error);
        } finally {
          jobs.error.dispose();
        }
        this.report(error);
      }
      if (this.runtime.hasPendingJob()) this.scheduleJobs();
    } finally {
      try {
        this.flushIndexShadows();
        this.invalidateIndexShadows();
        this.syncBuffers('into-native');
      } finally {
        this.pumping = false;
        this.finishDisposalIfIdle();
      }
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

  private enter<T>(action: () => T, skipOrdinary = false): T {
    this.assertOpen();
    this.flushIndexShadows();
    this.invalidateIndexShadows();
    if (!skipOrdinary) this.syncBuffers('into-guest');
    this.depth++;
    try {
      return action();
    } finally {
      this.depth--;
      try {
        this.flushIndexShadows();
        this.invalidateIndexShadows();
        if (!skipOrdinary || !this.canDeferOrdinary()) this.syncBuffers('into-native');
        if (!this.depth) this.scheduleJobs();
      } finally {
        this.finishDisposalIfIdle();
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
    const encodedKey = this.readString(keyHandle);
    const key = this.propertyKey(encodedKey);
    const host = this.owner(target);
    if (operation === 'index-shadow') return this.prepareIndexShadow(target);
    if (operation === 'index-dirty') {
      this.indexed.dirty(target);
      return this.context.undefined;
    }
    if (operation === 'index-attach') {
      const buffer = this.indexedBuffer(target);
      const proxy = this.nativeHandles.get(target);
      if (buffer && proxy) this.indexed.attachShadow(target, proxy, input[0], buffer);
      return this.context.undefined;
    }
    this.flushIndexShadows();
    const copyWithin =
      this.canDeferOrdinary() && operation === 'call' && typeof target === 'function'
        ? this.primitiveCopyWithinCall(target, input)
        : undefined;
    // Native reads only retrieve references/values. Flush binary mirrors where
    // native code can consume or mutate them, rather than at each property lookup.
    const effects =
      operation === 'call' ||
      operation === 'construct' ||
      operation === 'set' ||
      operation === 'delete' ||
      operation === 'define';
    const primitiveIndexWrite =
      operation === 'set' &&
      this.binary.view(target) &&
      typeof key === 'string' &&
      (String(Number(key)) === key || key === '-0') &&
      !['object', 'function'].includes(this.context.typeof(input[0]));
    const synchronize = effects && !primitiveIndexWrite && !copyWithin;
    if (synchronize) this.syncBuffers('into-native');
    let result: unknown;
    let nativeActionStarted = false;
    try {
      switch (operation) {
        case 'get':
          result = host.get(target, key);
          break;
        case 'set': {
          const value = this.decode(input[0]);
          this.flushIndexShadows();
          if (synchronize) this.syncBuffers('into-native');
          nativeActionStarted = true;
          result = host.set(target, key, value);
          break;
        }
        case 'delete':
          nativeActionStarted = true;
          result = host.delete?.(target, key) ?? false;
          break;
        case 'define': {
          if (!this.binary.view(target))
            throw new TypeError('Only native view indices are delegated');
          const value = this.decode(input[0]);
          if (!value || typeof value !== 'object')
            throw new TypeError('Invalid descriptor');
          this.flushIndexShadows();
          if (synchronize) this.syncBuffers('into-native');
          nativeActionStarted = true;
          result = this.binary.define(target, key, value);
          break;
        }
        case 'has':
          result = this.has(target, key);
          break;
        case 'own':
          result = host.descriptor(target, key) !== undefined;
          break;
        case 'settable':
          result = host.settable?.(target, key) ?? false;
          break;
        case 'keys':
          result = host.ownKeys(target);
          break;
        case 'prototype':
          result = host.prototype(target);
          break;
        case 'descriptor': {
          const descriptor = host.descriptor(target, key);
          return descriptor ? this.encodeRecord(descriptor) : this.context.undefined;
        }
        case 'call': {
          if (typeof target !== 'function')
            throw new TypeError('Native object is not callable');
          const receiver = copyWithin ? copyWithin.receiver : this.decode(input[0]);
          const args = copyWithin
            ? copyWithin.args
            : this.decodeArguments(input[1], this.wasm?.importsArgument(target));
          this.flushIndexShadows();
          if (synchronize) this.syncBuffers('into-native');
          nativeActionStarted = true;
          result = host.call(target, receiver, args);
          break;
        }
        case 'construct': {
          if (typeof target !== 'function')
            throw new TypeError('Native object is not a constructor');
          const args = this.decodeArguments(input[0], this.wasm?.importsArgument(target));
          const newTarget = input[1] ? this.decode(input[1]) : undefined;
          this.flushIndexShadows();
          if (synchronize) this.syncBuffers('into-native');
          nativeActionStarted = true;
          result = host.construct(
            target,
            args,
            typeof newTarget === 'function' ? newTarget : undefined,
          );
          break;
        }
        default:
          throw new Error('Unknown guest operation');
      }
    } finally {
      if (effects && !nativeActionStarted) {
        // Argument getters may have changed guest bytes before throwing. Preserve
        // those changes rather than refreshing them from the old native copy.
        this.flushIndexShadows();
        if (synchronize) this.syncBuffers('into-native');
      }
      this.invalidateIndexShadows();
      if (synchronize && nativeActionStarted) this.syncBuffers('into-guest');
    }
    return this.encode(result);
  }

  private has(target: object, key: PropertyKey): boolean {
    const visited = new Set<object>();
    let current: object | null = target;
    while (current && !visited.has(current)) {
      visited.add(current);
      const host = this.owner(current);
      if (host.descriptor(current, key)) return true;
      current = host.prototype(current);
    }
    return false;
  }

  private registerNative(value: object): number {
    let id = this.nativeIds.get(value);
    if (!id) {
      id = allocateIdentity(this.nativeIdentity);
      if (id === undefined) throw new RangeError('Native identities exhausted');
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
    if (typeof value === 'string') return this.encodeString(value);
    if (typeof value === 'bigint') return this.context.newBigInt(value);
    if (typeof value === 'symbol') return this.encodeSymbol(value);
    const object = value as object;
    const original = this.guestHandles.get(object);
    if (original) return original.dup();
    const cached = this.nativeHandles.get(object) ?? seen.get(object);
    if (cached) return cached.dup();
    if (isArrayBuffer(value) && !this.binary.buffer(value))
      return this.encodeBuffer(value);
    if (arrayBufferIsView(value) && !this.binary.view(value))
      return this.encodeView(value);
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
            this.enter(() => {
              const encoded = this.encode(result);
              try {
                deferred.resolve(encoded);
              } finally {
                encoded.dispose();
              }
            });
          },
          (error: unknown) => {
            if (this.closed) return;
            this.enter(() => {
              const encoded = this.encode(error);
              try {
                deferred.reject(encoded);
              } finally {
                encoded.dispose();
              }
            });
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
          typeof key === 'symbol' ? this.encodeSymbol(key) : this.encodeString(key);
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
      const source = this.encodeString(value.source);
      const flags = this.encodeString(value.flags);
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
      this.encodeString(typeof value === 'function' ? value.name : ''),
      prototypeObject ? this.context.true : this.context.false,
      this.encodeString(
        this.binary.buffer(value) ? 'buffer' : this.binary.view(value) ? 'view' : '',
      ),
      this.indexedBuffer(object) ? this.context.true : this.context.false,
    ];
    try {
      const result = this.helper('createHost', arguments_);
      const retained = result.dup();
      this.nativeHandles.set(object, retained);
      try {
        if (this.binary.view(object)) {
          let buffer: unknown;
          try {
            buffer = Reflect.apply(typedArrayBuffer, object, []);
          } catch {}
          if (
            isArrayBuffer(buffer) &&
            !this.buffers.has(buffer) &&
            !(arrayBufferResizable && Reflect.apply(arrayBufferResizable, buffer, []))
          )
            this.indexed.attachMemory(object, retained, buffer);
        }
        if (this.binary.view(object) || this.binary.buffer(object))
          this.binary.bindConstructor(
            object,
            () => this.readBinaryProperty('binaryConstructorOf', object),
            (constructor) => this.readBinaryProperty('binarySpeciesOf', constructor),
          );
        return result;
      } catch (error) {
        this.nativeHandles.get(object)?.dispose();
        this.nativeHandles.delete(object);
        result.dispose();
        throw error;
      }
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

  private encodeString(value: string): QuickJSHandle {
    if (!requiresStringEncoding.test(value)) return this.context.newString(value);
    const json = this.context.newString(JSON.stringify(value));
    try {
      return this.helper('parseString', [json]);
    } finally {
      json.dispose();
    }
  }

  private readString(value: QuickJSHandle): string {
    const result = this.context.getString(value);
    const property = this.context.getProp(value, 'length');
    let length: number;
    try {
      length = this.context.getNumber(property);
    } finally {
      property.dispose();
    }
    if (result.length === length && !requiresStringRecovery.test(result)) return result;
    // The SDK's C-string API terminates at NUL and may normalize lone surrogates.
    const json = this.helper('stringifyString', [value]);
    try {
      return JSON.parse(this.context.getString(json)) as string;
    } finally {
      json.dispose();
    }
  }

  private encodeSymbol(value: symbol): QuickJSHandle {
    const cached = this.symbolHandles.get(value);
    if (cached) return cached.dup();
    const known = wellKnownSymbols.get(value);
    if (known) return this.context.getWellKnownSymbol(known);
    const registry = Symbol.keyFor(value);
    if (registry !== undefined) {
      const key = this.encodeString(registry);
      try {
        return this.helper('makeSymbolFor', [key]);
      } finally {
        key.dispose();
      }
    }
    const id = allocateIdentity(this.symbolIdentity);
    if (id === undefined) throw new RangeError('Symbol identities exhausted');
    this.symbolIds.set(value, id);
    this.symbols.set(id, value);
    const description = this.encode(value.description);
    const result = this.helper('makeSymbol', [description]);
    description.dispose();
    const idHandle = this.context.newNumber(id);
    this.helper('registerSymbol', [result, idHandle]).dispose();
    idHandle.dispose();
    this.symbolHandles.set(value, result.dup());
    return result;
  }

  private encodeBuffer(value: ArrayBuffer): QuickJSHandle {
    const existing = this.buffers.get(value);
    if (existing) return existing.guest.dup();
    const backing = this.context.newArrayBufferBacking(value);
    // The backing API closes over this original handle; callers receive dupes.
    const result = backing.handle.dup();
    this.buffers.set(value, { native: value, guest: backing.handle, backing });
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
    if (type === 'string') return this.readString(value);
    if (type === 'number') return this.context.getNumber(value);
    if (type === 'boolean') return this.context.getNumber(value) !== 0;
    if (type === 'bigint') return this.context.getBigInt(value);
    if (type === 'symbol') {
      const encoded = this.helper('key', [value]);
      try {
        const symbol = this.propertyKey(this.readString(encoded));
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
      const tagged = this.helper('isWasmImport', [value]);
      const wasmImport = this.context.getNumber(tagged) !== 0;
      tagged.dispose();
      const callable = function (this: unknown, ...arguments_: unknown[]): unknown {
        return engine.invoke(
          handle,
          this,
          arguments_,
          new.target !== undefined,
          wasmImport,
        );
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
    if (kind === 'regexp')
      return new RegExp(
        String(this.readGuestProperty(value, 'source')),
        String(this.readGuestProperty(value, 'flags')),
      );
    const result: unknown[] | Record<PropertyKey, unknown> = previous
      ? (previous.value as unknown[] | Record<PropertyKey, unknown>)
      : kind === 'array'
        ? []
        : Object.create(null);
    seen.set(id, result);
    const retained = previous ?? this.retainGuest(id, value.dup(), result);
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
          this.context.typeof(key) === 'symbol' ? this.decode(key) : this.readString(key);
        if (typeof name !== 'string' && typeof name !== 'symbol') {
          key.dispose();
          continue;
        }
        if (kind === 'array' && name === 'length') {
          key.dispose();
          continue;
        }
        try {
          const enumerableHandle = this.helper('propertyEnumerable', [value, key]);
          const enumerable = this.context.getNumber(enumerableHandle) !== 0;
          enumerableHandle.dispose();
          if (!enumerable) {
            // Cloning ignores hidden fields; callback dictionaries may read
            // inherited methods. Defer those reads until a native API asks.
            Reflect.defineProperty(result, name, {
              get: () => this.readGuestProperty(retained.handle, name),
              set: (next: unknown) =>
                this.writeGuestProperty(retained.handle, name, next),
              enumerable: false,
              configurable: true,
            });
            continue;
          }
          const item = this.helper('objectGet', [value, key]);
          try {
            Reflect.defineProperty(result, name, {
              value: this.decode(item, seen),
              enumerable: true,
              configurable: true,
              writable: true,
            });
          } finally {
            item.dispose();
          }
        } finally {
          key.dispose();
        }
      }
    } finally {
      keyArray.dispose();
    }
    if (kind === 'array') {
      const lengthKey = this.context.newString('length');
      const count = this.helper('objectGet', [value, lengthKey]);
      lengthKey.dispose();
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
    if (previous && arrayBufferIsView(previous.value)) return previous.value;
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
    if (!arrayBufferIsView(view)) throw new TypeError('Invalid binary view');
    this.retainGuest(id, value.dup(), view);
    return view;
  }

  private readGuestProperty(handle: QuickJSHandle, key: PropertyKey): unknown {
    return this.enter(() => {
      const property = this.encode(key);
      try {
        const value = this.helper('objectGet', [handle, property]);
        try {
          return this.decode(value);
        } finally {
          value.dispose();
        }
      } finally {
        property.dispose();
      }
    });
  }

  private writeGuestProperty(
    handle: QuickJSHandle,
    key: PropertyKey,
    value: unknown,
  ): void {
    this.enter(() => {
      const property = this.encode(key);
      const next = this.encode(value);
      try {
        const written = this.helper('objectSet', [handle, property, next]);
        try {
          if (!this.context.getNumber(written))
            throw new TypeError('Property is read only');
        } finally {
          written.dispose();
        }
      } finally {
        property.dispose();
        next.dispose();
      }
    });
  }

  private retainGuest(id: number, handle: QuickJSHandle, value: object): RetainedGuest {
    const previous = this.guestObjects.get(id);
    if (previous) {
      // A repeatedly thrown guest exception can acquire several native Error
      // wrappers. Keep one owned handle instead of losing the previous retain.
      handle.dispose();
      this.guestHandles.set(value, previous.handle);
      return previous;
    }
    const retained = { id, handle, value };
    this.guestObjects.set(id, retained);
    this.guestHandles.set(value, handle);
    return retained;
  }

  /** Wasm import namespaces must stay lazy until native declaration-order reads. */
  private decodeReference(value: QuickJSHandle): unknown {
    const kindHandle = this.helper('kind', [value]);
    const kind = this.context.getString(kindHandle);
    kindHandle.dispose();
    if (kind === 'host' || kind === 'null' || this.context.typeof(value) !== 'object')
      return this.decode(value);
    const idHandle = this.helper('guestId', [value]);
    const id = this.context.getNumber(idHandle);
    idHandle.dispose();
    const previous = this.guestObjects.get(id) ?? this.importReferences.get(id);
    if (previous) return previous.value;
    const reference: object = Object.create(null);
    const handle = value.dup();
    this.importReferences.set(id, { id, handle, value: reference });
    this.guestHandles.set(reference, handle);
    return reference;
  }

  private decodeArguments(value: QuickJSHandle, opaqueIndex?: number): unknown[] {
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
        result.push(
          index === opaqueIndex ? this.decodeReference(item) : this.decode(item, seen),
        );
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
    wasmImport = false,
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
    }, wasmImport && this.canDeferOrdinary());
  }

  private hostReference(value: QuickJSHandle): object | undefined {
    const id = this.helper('hostId', [value]);
    try {
      return this.context.typeof(id) === 'number'
        ? this.nativeObjects.get(this.context.getNumber(id))
        : undefined;
    } finally {
      id.dispose();
    }
  }

  /** Inspect protocol-owned dense rest arrays without running argument coercions. */
  private primitiveArguments(value: QuickJSHandle): unknown[] | undefined {
    const length = this.context.getProp(value, 'length');
    const count = this.context.getNumber(length);
    length.dispose();
    const result: unknown[] = [];
    for (let i = 0; i < count; i++) {
      const item = this.context.getProp(value, i);
      try {
        if (
          ['object', 'function', 'symbol'].includes(this.context.typeof(item)) &&
          !this.context.eq(item, this.context.null)
        )
          return;
        result.push(this.decode(item));
      } finally {
        item.dispose();
      }
    }
    return result;
  }

  private primitiveCopyWithinCall(
    target: Function,
    input: QuickJSHandle[],
  ): { receiver: object; args: unknown[] } | undefined {
    if (!this.binary.owns(target)) return;
    let receiver: object;
    let args: unknown[] | undefined;
    if (target === this.binary.bindings.invoke) {
      // This captured arrow binding ignores its JS receiver. The actual native
      // typed-array receiver is argument 3, not the private guest binding record.
      receiver = this.binary.bindings;
      const length = this.context.getProp(input[1], 'length');
      const count = this.context.getNumber(length);
      length.dispose();
      if (count !== 5) return;
      const handles = Array.from({ length: 5 }, (_, i) =>
        this.context.getProp(input[1], i),
      );
      try {
        if (handles.slice(0, 3).some((value) => this.context.typeof(value) !== 'string'))
          return;
        const view = this.hostReference(handles[3]);
        if (!view) return;
        const indices = this.primitiveArguments(handles[4]);
        if (!indices) return;
        args = [
          this.readString(handles[0]),
          this.readString(handles[1]),
          this.readString(handles[2]),
          view,
          indices,
        ];
      } finally {
        for (const handle of handles) handle.dispose();
      }
    } else {
      const view = this.hostReference(input[0]);
      if (!view) return;
      receiver = view;
      args = this.primitiveArguments(input[1]);
    }
    if (!args) return;
    const buffer = this.binary.copyWithinBuffer(target, receiver, args);
    if (!buffer || (isArrayBuffer(buffer) && this.buffers.has(buffer))) return;
    return { receiver, args };
  }

  private indexedBuffer(value: object): ArrayBuffer | undefined {
    if (!arrayBufferIsView(value)) return;
    try {
      const buffer: unknown = Reflect.apply(typedArrayBuffer, value, []);
      return isArrayBuffer(buffer) &&
        this.binary.buffer(buffer) &&
        !this.indexed.hasMemory(buffer) &&
        !(arrayBufferResizable && Reflect.apply(arrayBufferResizable, buffer, [])) &&
        !this.buffers.has(buffer)
        ? buffer
        : undefined;
    } catch {
      return;
    }
  }

  private prepareIndexShadow(target: object): QuickJSHandle {
    this.flushIndexShadows();
    const buffer = this.indexedBuffer(target);
    if (!buffer) return this.context.undefined;
    const bytes: number = Reflect.apply(arrayBufferLength, buffer, []);
    if (!bytes || bytes > indexShadowBudget) return this.context.undefined;
    let shadow = this.indexShadows.get(buffer);
    if (!shadow) {
      let used = 0;
      for (const cached of this.indexShadows.values()) used += cached.bytes;
      for (const cached of this.indexShadows.values()) {
        if (used + bytes <= indexShadowBudget) break;
        if (cached.epoch === this.indexEpoch) continue;
        this.indexed.releaseShadow(cached.native);
        this.helper('detachBuffer', [cached.backing.handle]).dispose();
        cached.backing.handle.dispose();
        this.indexShadows.delete(cached.native);
        used -= cached.bytes;
      }
      if (used + bytes > indexShadowBudget) return this.context.undefined;
      shadow = {
        native: buffer,
        bytes,
        backing: this.context.newArrayBufferBacking(buffer),
        epoch: this.indexEpoch,
      };
      this.indexShadows.set(buffer, shadow);
    } else if (shadow.epoch !== this.indexEpoch) {
      shadow.backing.writeFrom(new Uint8Array(buffer));
      shadow.epoch = this.indexEpoch;
    }
    // No public prototype setter may intercept the private backing buffer.
    const result = this.context.newObject(this.context.null);
    this.context.setProp(result, 'buffer', shadow.backing.handle);
    const fields = {
      name: Reflect.apply(typedArrayName, target, []),
      length: Reflect.apply(typedArrayLength, target, []),
      byteLength: Reflect.apply(typedArrayByteLength, target, []),
      byteOffset: Reflect.apply(typedArrayOffset, target, []),
      lengthOwn: Object.hasOwn(target, 'length'),
      byteLengthOwn: Object.hasOwn(target, 'byteLength'),
      byteOffsetOwn: Object.hasOwn(target, 'byteOffset'),
    };
    for (const [key, value] of Object.entries(fields)) {
      const encoded = this.encode(value);
      this.context.setProp(result, key, encoded);
      encoded.dispose();
    }
    return result;
  }

  /** Publish staged indexed writes before handing control to native code. */
  private flushIndexShadows(): void {
    if (!this.helpers.size || this.closed) return;
    for (const buffer of this.indexed.dirtyBuffers()) {
      const shadow = this.indexShadows.get(buffer);
      if (!shadow) continue;
      let target: Uint8Array;
      try {
        target = new Uint8Array(buffer);
      } catch {
        continue;
      }
      shadow.backing.readInto(target);
    }
  }

  /** End an access epoch so later indexed reads observe native mutations. */
  private invalidateIndexShadows(): void {
    if (!this.helpers.size || this.closed) return;
    this.indexed.invalidate();
    this.helper('invalidateIndexShadows', []).dispose();
    this.indexEpoch = Object.create(null);
  }

  private setIndexCacheEnabled(enabled: boolean): void {
    this.helper('setIndexCacheEnabled', [
      enabled ? this.context.true : this.context.false,
    ]).dispose();
  }

  private canDeferOrdinary(): boolean {
    if (!this.wasmDepth || !this.wasmDeferralAllowed || !this.wasm?.canDeferOrdinary())
      return false;
    for (const buffer of this.buffers.keys())
      if (this.wasmBuffers.has(buffer)) return false;
    return true;
  }

  /** Only proven instance execution with disjoint native memory can defer copies. */
  private runWasm<T>(action: () => T, allowDeferral: boolean): T {
    const outer = this.wasmDepth === 0;
    const previousAllowance = this.wasmDeferralAllowed;
    const nextAllowance = outer ? allowDeferral : previousAllowance && allowDeferral;
    const needsEntryBarrier = outer || !nextAllowance || !this.canDeferOrdinary();
    if (needsEntryBarrier) {
      this.flushIndexShadows();
      this.invalidateIndexShadows();
      this.syncBuffers('into-native');
    }
    if (outer) this.setIndexCacheEnabled(false);
    this.wasmDeferralAllowed = nextAllowance;
    this.wasmDepth++;
    try {
      return action();
    } finally {
      const deferred = this.canDeferOrdinary();
      try {
        if (!deferred) this.syncBuffers('into-guest');
        else if (outer) this.syncBuffers('into-native');
      } finally {
        this.wasmDepth--;
        this.wasmDeferralAllowed = previousAllowance;
        try {
          this.invalidateIndexShadows();
          if (outer && !this.closed) this.setIndexCacheEnabled(true);
        } finally {
          this.finishDisposalIfIdle();
        }
      }
    }
  }

  private syncBuffers(direction: 'into-guest' | 'into-native'): void {
    if (this.syncing || this.closed || !this.helpers.size) return;
    if (direction === 'into-native') this.flushIndexShadows();
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
        if (mirror.backing) {
          const bytes = new Uint8Array(mirror.native);
          if (direction === 'into-guest') mirror.backing.writeFrom(bytes);
          else mirror.backing.readInto(bytes);
          continue;
        }
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
      let error: Error;
      try {
        error = this.guestError(result.error);
      } finally {
        result.error.dispose();
      }
      throw error;
    }
    if (!result.value) throw new Error('Missing guest result');
    return result.value;
  }

  private guestError(handle: QuickJSHandle): Error {
    const info = this.helpers.has('errorInfo')
      ? this.helper('errorInfo', [handle])
      : handle.dup();
    try {
      const read = (key: string) => {
        const value = this.context.getProp(info, key);
        try {
          return this.context.typeof(value) === 'string' ? this.readString(value) : '';
        } finally {
          value.dispose();
        }
      };
      const error = new Error(read('message') || 'Guest execution failed');
      error.name = read('name') || 'Error';
      const stack = read('stack');
      if (stack) error.stack = stack;
      if (
        this.helpers.has('tryGuestId') &&
        ['object', 'function'].includes(this.context.typeof(handle)) &&
        !this.context.eq(handle, this.context.null)
      ) {
        // Error conversion must not inspect a thrown object's prototype or require
        // another identity after exhaustion. Both operations can throw recursively.
        const id = this.helper('tryGuestId', [handle]);
        try {
          if (this.context.typeof(id) === 'number')
            this.retainGuest(this.context.getNumber(id), handle.dup(), error);
        } finally {
          id.dispose();
        }
      }
      return error;
    } finally {
      info.dispose();
    }
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
    this.finishDisposalIfIdle();
  }

  /** Logical close rejects new entries immediately. Physical release waits until
   * every engine-owned guest/job/Wasm stack has returned to its caller. */
  private finishDisposalIfIdle(): void {
    if (!this.closed || this.disposed) return;
    if (this.depth || this.pumping || this.wasmDepth) return;
    this.disposed = true;
    for (const reject of this.pendingPromises)
      reject(new Error('Application context is closed'));
    this.pendingPromises.clear();
    // Diagnostics may throw any value; release owned resources before propagating it.
    let reportingFailed = false;
    let reportingFailure: unknown;
    for (const dispose of this.disposers) {
      try {
        dispose();
      } catch (error) {
        try {
          this.report(error instanceof Error ? error : new Error(String(error)));
        } catch (failure) {
          if (!reportingFailed) {
            reportingFailed = true;
            reportingFailure = failure;
          }
        }
      }
    }
    this.disposers.clear();
    this.indexed.dispose();
    for (const handle of this.helpers.values()) if (handle.alive) handle.dispose();
    for (const handle of this.nativeHandles.values()) if (handle.alive) handle.dispose();
    for (const { handle } of this.guestObjects.values())
      if (handle.alive) handle.dispose();
    for (const { handle } of this.importReferences.values())
      if (handle.alive) handle.dispose();
    for (const handle of this.symbolHandles.values()) if (handle.alive) handle.dispose();
    for (const { guest } of this.buffers.values()) if (guest.alive) guest.dispose();
    for (const shadow of this.indexShadows.values())
      if (shadow.backing.handle.alive) shadow.backing.handle.dispose();
    for (const promise of this.promises) promise.dispose();
    this.helpers.clear();
    this.nativeHandles.clear();
    this.nativeObjects.clear();
    this.guestObjects.clear();
    this.importReferences.clear();
    this.symbolHandles.clear();
    this.buffers.clear();
    this.indexShadows.clear();
    this.promises.clear();
    this.context.dispose();
    this.runtime.dispose();
    if (reportingFailed) throw reportingFailure;
  }
}
