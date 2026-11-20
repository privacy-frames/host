import type { GuestHost } from './protocol.ts';
import { createNativeHost } from './native-host.ts';
import {
  NativePolicy,
  NativePolicyError,
  type NativeContract,
  type NativeMemberRule,
  type NativeReadOperation,
  type NativeWriteOperation,
} from './native-policy.ts';

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

/** Native Wasm retains native function/memory identity; only declared local
 * descriptors and trusted native producers grant member/call authority. */
export function createNativeWasm(options: NativeWasmOptions): NativeWasmDomain {
  const namespace: Record<PropertyKey, unknown> = Object.create(prototype(native));
  const registry = new NativePolicy();
  const owned = new WeakSet<object>([namespace]);
  const declarations = new Set<object>();
  const kinds = new WeakMap<object, WasmKind | false>();
  const importArguments = new WeakMap<Function, number>();
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
      ? new native.Exception(probeTag, [], { traceStack: true })
      : undefined;
  const ownExceptionStack = probeException && descriptor(probeException, 'stack');
  const absent = new WeakMap<object, Set<PropertyKey>>();
  const kindPrototypes = new Map<WasmKind, object>();
  const presence = new WeakMap<object, Set<PropertyKey>>();
  const functionKeys = ownKeys(Function.prototype);
  function declarationPresence(target: object): void {
    const keys = new Set<PropertyKey>();
    for (let current: object | null = target; current; current = prototype(current))
      for (const key of ownKeys(current)) keys.add(key);
    presence.set(target, keys);
  }
  const contract = (
    id: string,
    result: NativeContract['result'] = 'data',
    callbacks: NativeContract['callbacks'] = 'none',
  ): NativeContract => ({ id, result, callbacks, effect: 'local-data' });
  const readExceptionStack = ({ receiver, descriptor }: NativeReadOperation): unknown =>
    descriptor.get ? apply(descriptor.get, receiver, []) : descriptor.value;
  const writeExceptionStack = ({
    receiver,
    value,
    descriptor,
  }: NativeWriteOperation): boolean => {
    apply(descriptor.set!, receiver, [value]);
    return true;
  };
  const host = createNativeHost({
    registry,
    name: 'WebAssembly',
    functionPrototype: Function.prototype,
    owns: (target) => owned.has(target),
    admit(target) {
      remember(target);
      return owned.has(target);
    },
    result: (value) => remember(value),
    isAbsent: (target, key) => {
      if (absent.get(target)?.has(key)) return true;
      const type = kind(target);
      const anchor = type && kindPrototypes.get(type);
      return !!anchor && (absent.get(anchor)?.has(key) ?? false);
    },
    // A branded foreign object's physical prototype is not an authority source.
    // Presence comes from captured local declarations, never a foreign has/get trap.
    hasProperty(target, key) {
      const known = presence.get(target);
      if (known) return known.has(key);
      const type = kind(target);
      const anchor = type && kindPrototypes.get(type);
      return !!anchor && (presence.get(anchor)?.has(key) ?? false);
    },
    prototype(target) {
      return declarations.has(target)
        ? target === native.CompileError.prototype ||
          target === native.LinkError.prototype ||
          target === native.RuntimeError.prototype
          ? Error.prototype
          : Object.prototype
        : registry.prototype(target);
    },
    callablePublished(target, rule) {
      if (
        rule.id === 'WebAssembly.instantiate' ||
        rule.id === 'WebAssembly.instantiateStreaming'
      )
        importArguments.set(target, 1);
    },
  });
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

  function publishFunction(target: Function): void {
    const producer = { invoke: target };
    const rule = contract('WebAssembly.exported-function', 'delegated', 'guest');
    registry.registerFacade(producer, {
      name: 'Wasm native function producer',
      members: [
        {
          key: 'invoke',
          call: {
            contract: rule,
            receiver: 'ignored',
            call: ({ target, arguments: args }) =>
              options.runWasm(
                () => remember(apply(target, undefined, args)),
                localFunctions.has(target) && !foreignCode,
              ),
          },
        },
      ],
    });
    const result = registry.read(producer, 'invoke');
    if (result.kind !== 'callable')
      throw new TypeError('Wasm producer did not publish a callable');
    presence.set(target, new Set([...ownKeys(target), ...functionKeys]));
    host.registerCallable(target, result.callable);
    owned.add(target);
  }
  function remember(value: object): object;
  function remember(value: unknown): unknown;
  function remember(value: unknown): unknown {
    if (!object(value) || owned.has(value)) return value;
    if (typeof value === 'function') {
      if (wasmFunction(value)) {
        if (!localFunctions.has(value)) foreignCode = true;
        publishFunction(value);
      }
      return value;
    }
    const type = kind(value);
    if (!type) return value;
    const anchor = kindPrototypes.get(type);
    if (!anchor)
      throw new NativePolicyError(
        'admit',
        'WebAssembly.' + type,
        undefined,
        'native family unavailable',
      );
    registry.admitObject(value, anchor);
    owned.add(value);
    if (type === 'Table' && !localTables.has(value)) foreignCode = true;
    if (type === 'Memory') retainMemory(value);
    if (type === 'Exception') {
      const stack = descriptor(value, 'stack');
      if (
        stack &&
        ownExceptionStack &&
        stack.get === ownExceptionStack.get &&
        stack.set === ownExceptionStack.set &&
        stack.configurable === ownExceptionStack.configurable &&
        stack.enumerable === ownExceptionStack.enumerable &&
        stack.writable === ownExceptionStack.writable
      ) {
        const id = 'WebAssembly.Exception.ownStack';
        if (stack.get) host.captureCallableShape(id + '.get', stack.get);
        if (stack.set) host.captureCallableShape(id + '.set', stack.set);
        registry.registerFacade(value, {
          name: 'Native Exception stack producer',
          members: [
            {
              key: 'stack',
              read: {
                contract: contract(id + '.get', 'delegated'),
                read: readExceptionStack,
              },
              ...(stack.set
                ? {
                    write: {
                      contract: contract(id + '.set', 'none'),
                      write: writeExceptionStack,
                    },
                  }
                : {}),
            },
          ],
        });
      }
    }
    if (type === 'Instance') {
      const exports: WebAssembly.Exports = apply(instanceExports, value, []);
      const members: NativeMemberRule[] = [];
      for (const key of ownKeys(exports)) {
        const field = descriptor(exports, key);
        if (!field || !('value' in field))
          throw new TypeError('Native Wasm export is not a data descriptor');
        const exported: unknown = field.value;
        if (createdInstances.has(value)) {
          if (typeof exported === 'function') localFunctions.add(exported);
          else if (object(exported) && kind(exported) === 'Table')
            localTables.add(exported);
        }
        members.push({
          key,
          read: {
            contract: contract('WebAssembly.export', 'delegated'),
            read: ({ descriptor }) => descriptor.value,
          },
        });
      }
      presence.set(exports, new Set(ownKeys(exports)));
      registry.registerFacade(exports, { name: 'WebAssembly native exports', members });
      owned.add(exports);
      for (const key of ownKeys(exports)) remember(descriptor(exports, key)?.value);
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

  const read = ({ receiver, descriptor }: NativeReadOperation): unknown =>
    descriptor.get ? apply(descriptor.get, receiver, []) : descriptor.value;
  function data(
    owner: object,
    id: string,
    key: PropertyKey,
    result: NativeContract['result'] = 'data',
  ): NativeMemberRule {
    if (!descriptor(owner, key))
      throw new TypeError('Native Wasm data member unavailable: ' + String(key));
    return { key, read: { contract: contract(id + '.' + String(key), result), read } };
  }
  function optional(owner: object, key: PropertyKey): PropertyDescriptor | undefined {
    const found = descriptor(owner, key);
    if (!found) {
      let keys = absent.get(owner);
      if (!keys) absent.set(owner, (keys = new Set()));
      keys.add(key);
    }
    return found;
  }
  function method(owner: object, family: string, key: string): NativeMemberRule[] {
    const field = optional(owner, key);
    if (!field) return [];
    if (typeof field.value !== 'function')
      throw new TypeError('Native Wasm method unavailable: ' + key);
    const rule = contract(family + '.' + key, 'delegated');
    host.captureCallableShape(rule.id, field.value);
    return [
      {
        key,
        call: {
          contract: rule,
          receiver: typeof owner === 'function' ? 'ignored' : 'family',
          call: ({ target, receiver, arguments: args }) => {
            const result: unknown = apply(target, receiver, args);
            if (
              target === tableGet &&
              object(receiver) &&
              localTables.has(receiver) &&
              !foreignCode &&
              typeof result === 'function' &&
              wasmFunction(result)
            )
              localFunctions.add(result);
            if (object(receiver) && kind(receiver) === 'Memory') {
              retainMemory(receiver);
              if (buffer(result)) {
                options.retainBuffer(result);
                if (memoryBufferMethods.has(target))
                  options.retainMemory?.(receiver, result);
              }
            }
            return remember(result);
          },
        },
      },
    ];
  }
  function attribute(owner: object, family: string, key: string): NativeMemberRule[] {
    const field = optional(owner, key);
    if (!field) return [];
    if (!field.get) throw new TypeError('Native Wasm getter unavailable: ' + key);
    const rule = contract(family + '.' + key + '.get', 'delegated');
    host.captureCallableShape(rule.id, field.get);
    if (field.set) host.captureCallableShape(family + '.' + key + '.set', field.set);
    return [
      {
        key,
        read: {
          contract: rule,
          read: (operation) => {
            const result = read(operation);
            if (kind(operation.receiver) === 'Memory') {
              retainMemory(operation.receiver);
              if (buffer(result)) options.retainBuffer(result);
            }
            return result;
          },
        },
        ...(field.set
          ? {
              write: {
                contract: contract(family + '.' + key + '.set', 'none'),
                write: ({
                  receiver,
                  value,
                  descriptor,
                }: {
                  receiver: object;
                  value: unknown;
                  descriptor: Readonly<PropertyDescriptor>;
                }) => {
                  apply(descriptor.set!, receiver, [value]);
                  return true;
                },
              },
            }
          : {}),
      },
    ];
  }
  const constructorNames = [
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
  const namespaceMembers: NativeMemberRule[] = [];
  for (const name of constructorNames) {
    const original: unknown = get(native, name);
    if (typeof original !== 'function') {
      optional(namespace, name);
      continue;
    }
    const nativePrototype: object = original.prototype;
    declarationPresence(nativePrototype);
    declarationPresence(original);
    declarations.add(nativePrototype);
    owned.add(nativePrototype);
    owned.add(original);
    const errorConstructor =
      name === 'CompileError' || name === 'LinkError' || name === 'RuntimeError';
    if (!errorConstructor) kindPrototypes.set(name, nativePrototype);
    const family = 'WebAssembly.' + name;
    registry.registerPrototype(nativePrototype, {
      name: family,
      accepts: (value) => value === nativePrototype || kind(value) === name,
      members: [
        data(nativePrototype, family, 'constructor', 'callable'),
        ...(descriptor(nativePrototype, Symbol.toStringTag)
          ? [data(nativePrototype, family, Symbol.toStringTag)]
          : []),
        ...(name === 'Instance' ? attribute(nativePrototype, family, 'exports') : []),
        ...(name === 'Memory'
          ? [
              ...attribute(nativePrototype, family, 'buffer'),
              ...['grow', 'toFixedLengthBuffer', 'toResizableBuffer'].flatMap((key) =>
                method(nativePrototype, family, key),
              ),
            ]
          : []),
        ...(name === 'Table'
          ? [
              ...attribute(nativePrototype, family, 'length'),
              ...['get', 'set', 'grow'].flatMap((key) =>
                method(nativePrototype, family, key),
              ),
            ]
          : []),
        ...(name === 'Global'
          ? [
              ...attribute(nativePrototype, family, 'value'),
              ...method(nativePrototype, family, 'valueOf'),
            ]
          : []),
        ...(name === 'Exception'
          ? [
              ...attribute(nativePrototype, family, 'stack'),
              ...['is', 'getArg'].flatMap((key) => method(nativePrototype, family, key)),
            ]
          : []),
        ...(errorConstructor
          ? [
              data(nativePrototype, family, 'name'),
              data(nativePrototype, family, 'message'),
            ]
          : []),
      ],
    });
    host.registerConstructor(
      original,
      registry.registerConstructor(original, {
        contract: contract(
          family + '.constructor',
          errorConstructor ? 'delegated' : 'reference',
        ),
        construct: (target, args) => {
          if (name === 'Instance') return createInstance(args[0], args[1]);
          const value = construct(target, [...args]);
          if (name === 'Table') localTables.add(value);
          if (name === 'Tag' || name === 'Exception') kinds.set(value, name);
          return remember(value);
        },
      }),
    );
    if (name === 'Instance') importArguments.set(original, 1);
    const members = [
      data(original, family, 'name'),
      data(original, family, 'length'),
      data(original, family, 'prototype', 'reference'),
    ];
    if (name === 'Module')
      for (const key of ['imports', 'exports', 'customSections'])
        members.push(...method(original, family, key));
    registry.registerFacade(original, { name: family + ' constructor', members });
    define(namespace, name, { ...descriptor(native, name), value: original });
    namespaceMembers.push(
      errorConstructor
        ? {
            key: name,
            call: {
              contract: contract(family + '.call', 'delegated'),
              receiver: 'ignored',
              call: ({ target, arguments: args }) => apply(target, undefined, args),
            },
          }
        : data(namespace, 'WebAssembly', name, 'callable'),
    );
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
    if (
      typeof original !== 'function' ||
      (name.endsWith('Streaming') && !responseStatus)
    ) {
      optional(namespace, name);
      continue;
    }
    copiedName(fn, original);
    const rule = contract(
      'WebAssembly.' + name,
      'delegated',
      name.startsWith('instantiate') ? 'guest' : 'none',
    );
    host.captureCallableShape(rule.id, original);
    define(namespace, name, { ...descriptor(native, name), value: fn });
    namespaceMembers.push({
      key: name,
      call: {
        contract: rule,
        receiver: 'ignored',
        call: ({ target, arguments: args }) => apply(target, undefined, args),
      },
    });
  }
  const tag: unknown = get(native, 'JSTag');
  if (object(tag)) {
    kinds.set(tag, 'Tag');
    remember(tag);
    define(namespace, 'JSTag', { ...descriptor(native, 'JSTag'), value: tag });
    namespaceMembers.push(data(namespace, 'WebAssembly', 'JSTag', 'reference'));
  } else optional(namespace, 'JSTag');
  const label = descriptor(native, Symbol.toStringTag);
  if (label) {
    define(namespace, Symbol.toStringTag, label);
    namespaceMembers.push(data(namespace, 'WebAssembly', Symbol.toStringTag));
  }
  for (const name of ['Function', 'Suspending', 'promising', 'SuspendError'])
    optional(namespace, name);
  declarationPresence(namespace);
  registry.registerFacade(namespace, {
    name: 'WebAssembly namespace',
    members: namespaceMembers,
  });
  return {
    ...host,
    namespace,
    importsArgument: (target) => importArguments.get(target),
    canDeferOrdinary: () => !foreignCode,
    owns(target) {
      if (host.owns!(target)) return true;
      if (typeof target === 'function' ? wasmFunction(target) : kind(target)) {
        remember(target);
        return owned.has(target);
      }
      return false;
    },
  };
}
