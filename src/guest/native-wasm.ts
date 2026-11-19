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
}

export interface NativeWasmDomain extends GuestHost {
  readonly namespace: object;
  owns(target: object): boolean;
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
  // A native funcref table distinguishes exported Wasm functions from arbitrary
  // externrefs. Marking an arbitrary returned JS constructor domain-owned would
  // bypass the browser host's constructor policy.
  const functionProbe = new native.Table({ element: 'anyfunc', initial: 1 });
  const probeSet = native.Table.prototype.set;
  const functionKinds = new WeakMap<Function, boolean>();
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
    if (kind(value) === 'Memory') options.retainBuffer(apply(memoryBuffer, value, []));
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
      if (!owned.has(value) && wasmFunction(value)) owned.add(value);
      return value;
    }
    if (owned.has(value)) return value;
    const type = kind(value);
    if (!type) return value;
    owned.add(value);
    if (type === 'Memory') retainMemory(value);
    if (type === 'Instance') {
      const exports: WebAssembly.Exports = apply(instanceExports, value, []);
      owned.add(exports);
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
    return options.captureImports(imports, descriptors);
  }

  function createInstance(module: unknown, imports: unknown): object {
    return remember(construct(native.Instance, [module, capture(module, imports)]));
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
        if (object(this) && kind(this) === 'Memory') {
          retainMemory(this);
          if (buffer(result)) options.retainBuffer(result);
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
      if (name === 'Tag' || name === 'Exception') kinds.set(value, name);
      return remember(value);
    };
    copiedName(replacement, original);
    replacements.set(original, replacement);
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
        return remember(
          await apply(instantiate, native, [source, capture(source, imports)]),
        );
      const module: WebAssembly.Module = await apply(compile, native, [
        source,
        configuration,
      ]);
      remember(module);
      const instance = remember(
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
      const instance = remember(
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
      return remember(apply(replacement, receiver, args));
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
