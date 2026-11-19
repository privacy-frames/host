import type { GuestHost } from './protocol.ts';

export interface NativeWasmOptions {
  /** Read only declared imports through the guest's property policy. The decoded
   * input may be a native Window alias; never read its properties in this realm. */
  captureImports(
    imports: unknown,
    descriptors: WebAssembly.ModuleImportDescriptor[],
  ): object;
  /** Preserve actual native memory identity, including buffers imported from workers. */
  retainBuffer(buffer: ArrayBufferLike): void;
  /** The Memory has passed the captured native brand check. */
  retainMemory?(memory: object, buffer: ArrayBufferLike): void;
  /** Enter synchronous Wasm execution; imported guest callbacks reenter this scope. */
  runWasm<T>(action: () => T, deferOrdinary: boolean): T;
}

export interface NativeWasmDomain extends GuestHost {
  readonly namespace: object;
  owns(target: object): boolean;
  importsArgument(target: Function): number | undefined;
  canDeferOrdinary(): boolean;
}

type WasmKind =
  'Module' | 'Instance' | 'Memory' | 'Table' | 'Global' | 'Tag' | 'Exception';

const native = WebAssembly;
const apply = Reflect.apply;
const construct: (target: Function, args: unknown[]) => object = Reflect.construct;
const get = Reflect.get;
const set = Reflect.set;
const ownKeys = Reflect.ownKeys;
const descriptor = Object.getOwnPropertyDescriptor;
const define = Object.defineProperty;
const prototype = Object.getPrototypeOf;
const responseStatus =
  typeof Response === 'function'
    ? descriptor(Response.prototype, 'status')!.get!
    : undefined;
const memoryBuffer = descriptor(native.Memory.prototype, 'buffer')!.get!;
const memoryBufferMethods = new Set<Function>();
for (const name of ['toFixedLengthBuffer', 'toResizableBuffer']) {
  const method: unknown = descriptor(native.Memory.prototype, name)?.value;
  if (typeof method === 'function') memoryBufferMethods.add(method);
}
const instanceExports = descriptor(native.Instance.prototype, 'exports')!.get!;
const tableLength = descriptor(native.Table.prototype, 'length')!.get!;
const globalValue = descriptor(native.Global.prototype, 'value')!.get!;
const moduleImports = native.Module.imports;
const moduleExports = native.Module.exports;
const compile = native.compile;
const compileStreaming = native.compileStreaming;
const instantiate = native.instantiate;
const validate = native.validate;
const arrayBufferLength = descriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const sharedBufferLength =
  typeof SharedArrayBuffer === 'function'
    ? descriptor(SharedArrayBuffer.prototype, 'byteLength')!.get!
    : undefined;

const object = (value: unknown): value is object =>
  value !== null && (typeof value === 'object' || typeof value === 'function');

/** Native execution has only the import capabilities captured by the owner.
 * Every constructor reference and borrowed descriptor stays in this domain. */
export function createNativeWasm(options: NativeWasmOptions): NativeWasmDomain {
  const namespace: Record<PropertyKey, unknown> = Object.create(prototype(native));
  const owned = new WeakSet<object>([namespace]);
  const prototypes = new WeakSet<object>();
  const kinds = new WeakMap<object, WasmKind | false>();
  const replacements = new Map<Function, Function>();
  const methods = new Map<Function, Function>();
  const importArguments = new WeakMap<Function, number>();
  // A native funcref table distinguishes exported Wasm functions from arbitrary
  // externrefs. Marking an arbitrary returned JS constructor domain-owned would
  // bypass the browser host's constructor policy.
  const functionProbe = new native.Table({ element: 'anyfunc', initial: 1 });
  const probeSet = native.Table.prototype.set;
  const functionKinds = new WeakMap<Function, boolean>();
  const createdInstances = new WeakSet<object>();
  const localFunctions = new WeakSet<Function>();
  const localTables = new WeakSet<object>();
  let foreignCode = false;
  const tableGet = native.Table.prototype.get;
  const exceptionIs =
    typeof native.Exception === 'function' ? native.Exception.prototype.is : undefined;
  const probeTag =
    typeof native.Tag === 'function' ? new native.Tag({ parameters: [] }) : undefined;
  const probeException =
    probeTag && typeof native.Exception === 'function'
      ? new native.Exception(probeTag, [])
      : undefined;

  function accepts(value: object, check: Function): boolean {
    try {
      apply(check, value, []);
      return true;
    } catch {
      return false;
    }
  }

  function kind(value: object): WasmKind | false {
    if (typeof value === 'function') return false;
    const known = kinds.get(value);
    if (known !== undefined) return known;
    let found: WasmKind | false = false;
    if (accepts(value, memoryBuffer)) found = 'Memory';
    else if (accepts(value, instanceExports)) found = 'Instance';
    else if (accepts(value, tableLength)) found = 'Table';
    else if (accepts(value, globalValue)) found = 'Global';
    else {
      try {
        apply(moduleExports, native.Module, [value]);
        found = 'Module';
      } catch {}
    }
    if (!found && exceptionIs && probeTag && probeException) {
      try {
        apply(exceptionIs, value, [probeTag]);
        found = 'Exception';
      } catch {}
      if (!found) {
        try {
          apply(exceptionIs, probeException, [value]);
          found = 'Tag';
        } catch {}
      }
    }
    kinds.set(value, found);
    return found;
  }

  function wasmFunction(value: Function): boolean {
    const known = functionKinds.get(value);
    if (known !== undefined) return known;
    let found = false;
    try {
      apply(probeSet, functionProbe, [0, value]);
      apply(probeSet, functionProbe, [0, null]);
      found = true;
    } catch {}
    functionKinds.set(value, found);
    return found;
  }

  function retainMemory(value: object): void {
    if (kind(value) !== 'Memory') return;
    const buffer: ArrayBufferLike = apply(memoryBuffer, value, []);
    options.retainBuffer(buffer);
    options.retainMemory?.(value, buffer);
  }

  function buffer(value: unknown): value is ArrayBufferLike {
    if (!object(value)) return false;
    return (
      accepts(value, arrayBufferLength) ||
      !!(sharedBufferLength && accepts(value, sharedBufferLength))
    );
  }

  function remember(value: object): object;
  function remember(value: unknown): unknown;
  function remember(value: unknown): unknown {
    if (!object(value)) return value;
    if (typeof value === 'function') {
      const replacement = replacements.get(value) || methods.get(value);
      if (replacement) return replacement;
      if (!owned.has(value) && wasmFunction(value)) {
        owned.add(value);
        if (!localFunctions.has(value)) foreignCode = true;
      }
      return value;
    }
    if (owned.has(value)) return value;
    const type = kind(value);
    if (!type) return value;
    owned.add(value);
    if (type === 'Table' && !localTables.has(value)) foreignCode = true;
    if (type === 'Memory') retainMemory(value);
    if (type === 'Instance') {
      const exports: WebAssembly.Exports = apply(instanceExports, value, []);
      owned.add(exports);
      if (createdInstances.has(value)) {
        for (const key of ownKeys(exports)) {
          const exported = get(exports, key);
          if (typeof exported === 'function') localFunctions.add(exported);
          else if (object(exported) && kind(exported) === 'Table')
            localTables.add(exported);
        }
      }
      for (const key of ownKeys(exports)) remember(get(exports, key));
    }
    return value;
  }

  function capture(module: unknown, imports: unknown): object {
    // This native static method validates the Module brand before any import
    // property is read. The owner performs all subsequent reads inside QuickJS.
    const descriptors: WebAssembly.ModuleImportDescriptor[] = apply(
      moduleImports,
      native.Module,
      [module],
    );
    const captured = options.captureImports(imports, descriptors);
    return new Proxy(captured, {
      get(target, key) {
        const namespace = get(target, key);
        if (!object(namespace)) return namespace;
        return new Proxy(namespace, {
          get(target, key) {
            // Observe the actual declaration-order Get, without reading an
            // application getter twice. Memory aliases can disable deferral.
            return remember(get(target, key));
          },
        });
      },
    });
  }

  function created(value: object): object {
    createdInstances.add(value);
    return remember(value);
  }

  function createInstance(module: unknown, imports: unknown): object {
    const captured = capture(module, imports);
    return options.runWasm(
      () => created(construct(native.Instance, [module, captured])),
      !foreignCode,
    );
  }

  function copiedName(target: Function, source: Function): void {
    for (const name of ['name', 'length'] as const) {
      const property = descriptor(source, name);
      if (property) define(target, name, property);
    }
  }

  function method(original: Function): Function {
    const previous = methods.get(original);
    if (previous) return previous;
    const wrapped = {
      invoke(this: unknown, ...args: unknown[]) {
        const result: unknown = apply(original, this, args);
        if (
          original === tableGet &&
          object(this) &&
          localTables.has(this) &&
          !foreignCode &&
          typeof result === 'function' &&
          wasmFunction(result)
        )
          localFunctions.add(result);
        if (object(this) && kind(this) === 'Memory') {
          retainMemory(this);
          if (buffer(result)) {
            options.retainBuffer(result);
            if (memoryBufferMethods.has(original)) options.retainMemory?.(this, result);
          }
        }
        return remember(result);
      },
    }.invoke;
    copiedName(wrapped, original);
    methods.set(original, wrapped);
    owned.add(original);
    owned.add(wrapped);
    return wrapped;
  }

  const constructors = [
    'Module',
    'Instance',
    'Memory',
    'Table',
    'Global',
    'Tag',
    'Exception',
    'CompileError',
    'LinkError',
    'RuntimeError',
  ] as const;
  for (const name of constructors) {
    const original: unknown = get(native, name);
    if (typeof original !== 'function') continue;
    const replacement = function (this: unknown, ...args: unknown[]) {
      if (!new.target) return remember(apply(original, this, args));
      if (name === 'Instance') return createInstance(args[0], args[1]);
      const value = construct(original, args);
      if (name === 'Table') localTables.add(value);
      if (name === 'Tag' || name === 'Exception') kinds.set(value, name);
      return remember(value);
    };
    copiedName(replacement, original);
    replacements.set(original, replacement);
    if (name === 'Instance') {
      importArguments.set(original, 1);
      importArguments.set(replacement, 1);
    }
    owned.add(original);
    owned.add(replacement);
    const nativePrototype: unknown = get(original, 'prototype');
    if (object(nativePrototype)) {
      prototypes.add(nativePrototype);
      owned.add(nativePrototype);
      const property = descriptor(original, 'prototype');
      define(replacement, 'prototype', { ...property, value: nativePrototype });
      for (const key of ownKeys(nativePrototype)) {
        const member = descriptor(nativePrototype, key);
        for (const candidate of [member?.value, member?.get, member?.set])
          if (typeof candidate === 'function' && candidate !== original)
            method(candidate);
      }
    }
    for (const key of ownKeys(original)) {
      if (['prototype', 'name', 'length', 'arguments', 'caller'].includes(String(key)))
        continue;
      const property = descriptor(original, key);
      if (property)
        define(
          replacement,
          key,
          'value' in property
            ? {
                ...property,
                value:
                  typeof property.value === 'function'
                    ? method(property.value)
                    : property.value,
              }
            : {
                ...property,
                get: property.get ? (method(property.get) as () => unknown) : undefined,
                set: property.set
                  ? (method(property.set) as (value: unknown) => void)
                  : undefined,
              },
        );
    }
    define(namespace, name, { ...descriptor(native, name), value: replacement });
  }

  const functions = {
    async compile(...args: unknown[]) {
      return remember(await apply(compile, native, args));
    },
    validate(...args: unknown[]) {
      return apply(validate, native, args);
    },
    async instantiate(source: unknown, imports?: unknown, configuration?: unknown) {
      if (object(source) && kind(source) === 'Module')
        return created(
          await apply(instantiate, native, [source, capture(source, imports)]),
        );
      const module: WebAssembly.Module = await apply(compile, native, [
        source,
        configuration,
      ]);
      remember(module);
      const instance = created(
        await apply(instantiate, native, [module, capture(module, imports)]),
      );
      return { module, instance };
    },
    async compileStreaming(source: unknown, configuration?: unknown) {
      const response = await source;
      if (!responseStatus)
        throw new TypeError('Native Response streaming is unavailable');
      apply(responseStatus, response, []);
      return remember(await apply(compileStreaming, native, [response, configuration]));
    },
    async instantiateStreaming(
      source: unknown,
      imports?: unknown,
      configuration?: unknown,
    ) {
      const response = await source;
      // Native Response brand validation excludes URL strings and user-defined
      // pseudo-responses; native streaming compilation performs no URL fetch.
      if (!responseStatus)
        throw new TypeError('Native Response streaming is unavailable');
      apply(responseStatus, response, []);
      const module: WebAssembly.Module = await apply(compileStreaming, native, [
        response,
        configuration,
      ]);
      remember(module);
      const instance = created(
        await apply(instantiate, native, [module, capture(module, imports)]),
      );
      return { module, instance };
    },
  };
  for (const [name, fn] of Object.entries(functions)) {
    const original: unknown = get(native, name);
    if (typeof original !== 'function' || (name.endsWith('Streaming') && !responseStatus))
      continue;
    copiedName(fn, original);
    if (name === 'instantiate' || name === 'instantiateStreaming') {
      importArguments.set(original, 1);
      importArguments.set(fn, 1);
    }
    owned.add(fn);
    define(namespace, name, { ...descriptor(native, name), value: fn });
  }
  const tag: unknown = get(native, 'JSTag');
  if (object(tag)) {
    kinds.set(tag, 'Tag');
    owned.add(tag);
    define(namespace, 'JSTag', { ...descriptor(native, 'JSTag'), value: tag });
  }
  const label = descriptor(native, Symbol.toStringTag);
  if (label) define(namespace, Symbol.toStringTag, label);

  return {
    namespace,
    importsArgument: (target) => importArguments.get(target),
    canDeferOrdinary: () => !foreignCode,
    owns(target) {
      if (owned.has(target)) return true;
      if (typeof target === 'function' && !wasmFunction(target)) return false;
      const type = typeof target === 'function' || kind(target);
      if (type) {
        remember(target);
        return owned.has(target);
      }
      return false;
    },
    get(target, key) {
      const result = remember(get(target, key));
      if (kind(target) === 'Memory') {
        retainMemory(target);
        if (buffer(result)) options.retainBuffer(result);
      }
      return result;
    },
    set(target, key, value) {
      if (
        prototypes.has(target) ||
        key === '__proto__' ||
        key === 'constructor' ||
        key === 'prototype'
      )
        return false;
      return set(target, key, value);
    },
    delete(target, key) {
      return !prototypes.has(target) && Reflect.deleteProperty(target, key);
    },
    settable() {
      return false;
    },
    call(target, receiver, args) {
      const replacement = replacements.get(target) || methods.get(target) || target;
      const invoke = () => remember(apply(replacement, receiver, args));
      return wasmFunction(target)
        ? options.runWasm(invoke, localFunctions.has(target) && !foreignCode)
        : invoke();
    },
    construct(target, args) {
      const replacement = replacements.get(target) || target;
      // Constructor closures, including Instance, perform their own capture even
      // when passed around as native callable values rather than namespace fields.
      return construct(replacement, args);
    },
    ownKeys,
    descriptor(target, key) {
      const property = descriptor(target, key);
      if (!property) return;
      return 'value' in property
        ? { ...property, value: remember(property.value) }
        : {
            ...property,
            get: property.get ? (method(property.get) as () => unknown) : undefined,
            set: property.set
              ? (method(property.set) as (value: unknown) => void)
              : undefined,
          };
    },
    prototype(target) {
      const parent: object | null = prototype(target);
      return parent === null ? null : remember(parent);
    },
  };
}
