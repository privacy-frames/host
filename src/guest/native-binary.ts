import type { GuestHost } from './protocol.ts';
import { createNativeHost, type NativeHost } from './native-host.ts';
import {
  NativePolicy,
  NativePolicyError,
  type NativeContract,
  type NativeMemberRule,
} from './native-policy.ts';

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
const typedName = descriptor(typedPrototype, Symbol.toStringTag)!.get!;
const object = (value: unknown): value is object => Object(value) === value;
const indexKey = (key: PropertyKey): key is string =>
  typeof key === 'string' && (String(Number(key)) === key || key === '-0');
const contract = (
  id: string,
  result: NativeContract['result'] = 'data',
  callbacks: NativeContract['callbacks'] = 'guest',
): NativeContract => ({ id, result, callbacks, effect: 'local-data' });
const readNative = ({
  receiver,
  descriptor,
}: {
  receiver: object;
  descriptor: Readonly<PropertyDescriptor>;
}) => (descriptor.get ? apply(descriptor.get, receiver, []) : descriptor.value);

const bufferMembers = [
  'byteLength',
  'maxByteLength',
  'resizable',
  'detached',
  'immutable',
  'slice',
  'resize',
  'transfer',
  'transferToFixedLength',
  'transferToImmutable',
  'sliceToImmutable',
  Symbol.toStringTag,
];
const sharedMembers = [
  'byteLength',
  'maxByteLength',
  'growable',
  'slice',
  'grow',
  Symbol.toStringTag,
];
const typedMembers = [
  'buffer',
  'byteLength',
  'byteOffset',
  'length',
  'entries',
  'keys',
  'values',
  'at',
  'copyWithin',
  'every',
  'fill',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'forEach',
  'includes',
  'indexOf',
  'join',
  'lastIndexOf',
  'map',
  'reverse',
  'reduce',
  'reduceRight',
  'set',
  'slice',
  'some',
  'sort',
  'subarray',
  'toReversed',
  'toSorted',
  'with',
  'toLocaleString',
  'toString',
  Symbol.toStringTag,
  Symbol.iterator,
];
const byteMethods = ['setFromBase64', 'setFromHex', 'toBase64', 'toHex'];
const dataMembers = [
  'buffer',
  'byteLength',
  'byteOffset',
  Symbol.toStringTag,
  ...[
    'Int8',
    'Uint8',
    'Int16',
    'Uint16',
    'Int32',
    'Uint32',
    'Float16',
    'Float32',
    'Float64',
    'BigInt64',
    'BigUint64',
  ].flatMap((kind) => ['get' + kind, 'set' + kind]),
];
const atomicMembers = [
  'load',
  'store',
  'add',
  'sub',
  'and',
  'or',
  'xor',
  'exchange',
  'compareExchange',
  'isLockFree',
  'wait',
  'waitAsync',
  'notify',
  'pause',
];

interface BinaryProperty {
  key: PropertyKey;
  method?: boolean;
  getter?: boolean;
  setter?: boolean;
  value?: unknown;
}

/** Native-backed stores retain browser identity. Only reviewed operations cross
 * this boundary; application prototypes remain in the guest runtime. */
export class NativeBinary implements GuestHost {
  private readonly retained = new WeakSet<object>();
  private readonly kinds = new WeakMap<object, string | false>();
  private readonly viewBuffers = new WeakMap<object, ArrayBufferLike>();
  private readonly constructorHooks = new WeakSet<object>();
  private readonly methodReceivers = new WeakMap<object, object>();
  private readonly classes = new Map<string, Function>(Object.entries(constructors));
  private readonly descriptors = new Map<string, Map<PropertyKey, PropertyDescriptor>>();
  private readonly anchors = new Map<string, object>();
  private readonly declarations = new Set<object>();
  private readonly presence = new WeakMap<object, Set<PropertyKey>>();
  private readonly metadata = new WeakMap<object, Map<string, PropertyDescriptor>>();
  private readonly iterators = new WeakSet<object>();
  private readonly registry = new NativePolicy();
  private readonly host: NativeHost;
  private readonly atomics = new Map<PropertyKey, Function>();
  private readonly statics = new Map<string, Map<PropertyKey, Function>>();
  private readonly classMetadata = new Map<
    string,
    { length?: number; bytes?: number; available: boolean }
  >();
  private readonly iteratorPrototype: object;
  private readonly iteratorBase: object;
  private readonly iteratorBoundary: object;
  private readonly iteratorParent: object;

  constructor() {
    if (sharedConstructor) this.classes.set('SharedArrayBuffer', sharedConstructor);
    const half: unknown = get(globalThis, 'Float16Array');
    if (typeof half === 'function') this.classes.set('Float16Array', half);
    this.iteratorPrototype = prototype(new Uint8Array(0).values());
    this.iteratorBase = prototype(this.iteratorPrototype);
    this.iteratorBoundary = Object.create(null);
    this.iteratorParent = Object.create(null);
    this.host = createNativeHost({
      registry: this.registry,
      name: 'Binary',
      functionPrototype: Function.prototype,
      owns: (value) =>
        this.declarations.has(value) ||
        this.iterators.has(value) ||
        this.buffer(value) ||
        this.view(value),
      admit: (value) => this.admit(value),
      result: (value, rule) => this.result(value, rule),
      hasProperty: (target, key) => this.has(target, key),
      propertyTarget: (target) =>
        target === this.iteratorBoundary
          ? this.iteratorPrototype
          : target === this.iteratorParent
            ? this.iteratorBase
            : target,
      prototype: (target) => {
        if (target === this.iteratorBoundary) return this.iteratorParent;
        if (target === this.iteratorParent) return Object.prototype;
        if (this.iterators.has(target)) return this.iteratorBoundary;
        return this.declarations.has(target)
          ? (this.registry.prototype(target) ?? Object.prototype)
          : this.registry.prototype(target);
      },
    });
    this.register(
      'TypedArray',
      typedPrototype,
      typedMembers,
      (value) => this.typedKind(value) !== undefined,
    );
    for (const [name, ctor] of this.classes) {
      const target = ctor.prototype;
      const length: unknown = descriptor(ctor, 'length')?.value;
      const bytes: unknown = descriptor(ctor, 'BYTES_PER_ELEMENT')?.value;
      this.classMetadata.set(name, {
        length: typeof length === 'number' ? length : undefined,
        bytes: typeof bytes === 'number' ? bytes : undefined,
        available:
          name !== 'SharedArrayBuffer' || typeof SharedArrayBuffer === 'function',
      });
      this.register(
        name,
        target,
        name === 'ArrayBuffer'
          ? bufferMembers
          : name === 'SharedArrayBuffer'
            ? sharedMembers
            : name === 'DataView'
              ? dataMembers
              : ['BYTES_PER_ELEMENT', ...(name === 'Uint8Array' ? byteMethods : [])],
        (value) => this.kind(value) === name,
      );
      const token = this.registry.registerConstructor(ctor, {
        contract: contract('Binary.' + name + '.construct', 'reference'),
        construct: (target, args) => construct(target, args),
      });
      this.host.registerConstructor(ctor, token);
      const members: NativeMemberRule[] = [];
      for (const key of [
        'name',
        'length',
        'prototype',
        'BYTES_PER_ELEMENT',
        Symbol.species,
      ]) {
        const captured = descriptor(ctor, key);
        if (!captured) continue;
        members.push({
          key,
          read: {
            contract: contract('Binary.' + name + '.' + String(key), 'data', 'none'),
            read: readNative,
          },
        });
      }
      this.registry.registerFacade(ctor, { name: 'Binary constructor ' + name, members });
      this.declarations.add(ctor);
      this.presence.set(ctor, new Set(members.map(({ key }) => key)));
      const statics = new Map<PropertyKey, Function>();
      for (const key of ['from', 'of']) {
        let owner: object | null = ctor;
        let captured: PropertyDescriptor | undefined;
        while (owner && !(captured = descriptor(owner, key))) owner = prototype(owner);
        if (captured?.get || captured?.set)
          throw new NativePolicyError(
            'register',
            'Binary static',
            key,
            'static operation is not a data function',
          );
        if (typeof captured?.value === 'function') statics.set(key, captured.value);
      }
      this.statics.set(name, statics);
    }
    this.register(
      'BinaryIteratorBase',
      this.iteratorBase,
      [Symbol.iterator],
      () => false,
      false,
    );
    this.register(
      'BinaryIterator',
      this.iteratorPrototype,
      ['next', Symbol.toStringTag],
      () => false,
      false,
    );
    // Shared native array-iterator prototypes are declarations, not ownership.
    this.declarations.delete(this.iteratorPrototype);
    this.declarations.delete(this.iteratorBase);
    this.declarations.add(this.iteratorBoundary);
    this.declarations.add(this.iteratorParent);
    const atomicRules: NativeMemberRule[] = [];
    for (const key of atomicMembers) {
      const captured = descriptor(Atomics, key);
      if (typeof captured?.value !== 'function') continue;
      const target: Function = captured.value;
      this.atomics.set(key, target);
      atomicRules.push({
        key,
        call: {
          contract: contract('Binary.Atomics.' + key),
          receiver: 'ignored',
          call: ({ target, arguments: args }) => apply(target, Atomics, args),
        },
      });
    }
    this.registry.registerFacade(Atomics, {
      name: 'Binary Atomics',
      members: atomicRules,
    });
    this.declarations.add(Atomics);
    this.presence.set(Atomics, new Set(this.atomics.keys()));
    for (const key of this.atomics.keys()) this.publish(Atomics, key);
    const bindingRules: NativeMemberRule[] = [];
    for (const key of [
      'atomicKeys',
      'atomic',
      'descriptions',
      'construct',
      'staticInvoke',
      'invoke',
    ] as const) {
      bindingRules.push({
        key,
        call: {
          contract: contract(
            'Binary.binding.' + key,
            key === 'construct' || key === 'staticInvoke'
              ? 'reference'
              : key === 'invoke'
                ? 'delegated'
                : 'data',
          ),
          receiver: 'ignored',
          call: ({ target, arguments: args }) => apply(target, undefined, args),
        },
      });
    }
    this.registry.registerFacade(this.bindings, {
      name: 'Private binary bindings',
      members: bindingRules,
    });
    this.declarations.add(this.bindings);
    this.presence.set(this.bindings, new Set(bindingRules.map(({ key }) => key)));
    for (const { key } of bindingRules) this.publish(this.bindings, key);
  }

  /** Internal-slot identity is immutable; geometry and descriptor checks remain live. */
  private kind(value: object): string | undefined {
    const known = this.kinds.get(value);
    if (known !== undefined) return known || undefined;
    let kind: string | undefined;
    if (isView(value)) {
      const typed: unknown = apply(typedName, value, []);
      kind = typeof typed === 'string' ? typed : 'DataView';
    } else {
      try {
        apply(bufferLength, value, []);
        kind = 'ArrayBuffer';
      } catch {}
      if (!kind && sharedLength)
        try {
          apply(sharedLength, value, []);
          kind = 'SharedArrayBuffer';
        } catch {}
    }
    this.kinds.set(value, kind ?? false);
    return kind;
  }
  private typedKind(value: unknown): string | undefined {
    if (!object(value)) return;
    const kind = this.kind(value);
    return kind &&
      kind !== 'ArrayBuffer' &&
      kind !== 'SharedArrayBuffer' &&
      kind !== 'DataView'
      ? kind
      : undefined;
  }
  private admit(value: object): boolean {
    if (this.declarations.has(value) || this.iterators.has(value)) return true;
    const kind = this.kind(value),
      anchor = kind && this.anchors.get(kind);
    if (!anchor) return false;
    this.registry.admitObject(value, anchor);
    return true;
  }
  private has(target: object, key: PropertyKey): boolean {
    const physical =
      target === this.iteratorBoundary
        ? this.iteratorPrototype
        : target === this.iteratorParent
          ? this.iteratorBase
          : target;
    const captured = this.presence.get(physical);
    if (captured) return captured.has(key) || descriptor(physical, key) !== undefined;
    if (typeof target === 'function')
      return (
        key === 'name' ||
        key === 'length' ||
        key === 'constructor' ||
        key === 'call' ||
        key === 'apply' ||
        key === 'bind'
      );
    if (this.iterators.has(target))
      return (
        this.presence.get(this.iteratorPrototype)?.has(key) ||
        descriptor(this.iteratorPrototype, key) !== undefined ||
        descriptor(this.iteratorBase, key) !== undefined
      );
    const kind = this.kind(target),
      anchor = kind && this.anchors.get(kind);
    if (!anchor) return false;
    if (this.presence.get(anchor)?.has(key)) return true;
    if (descriptor(target, key)) return true;
    for (
      let owner: object | null = anchor;
      owner && this.declarations.has(owner);
      owner = prototype(owner)
    )
      if (descriptor(owner, key)) return true;
    return false;
  }
  private publish(owner: object, key: PropertyKey): void {
    const rule = this.registry.read(owner, key);
    if (rule.kind !== 'callable')
      throw new TypeError('Binary member has no callable token');
    const target = descriptor(owner, key)?.value;
    if (typeof target !== 'function')
      throw new TypeError('Binary member is not a data function');
    this.host.registerCallable(target, rule.callable);
  }
  private register(
    name: string,
    target: object,
    requested: readonly PropertyKey[],
    accepts: (value: object) => boolean,
    anchor = true,
  ): void {
    const entries = new Map<PropertyKey, PropertyDescriptor>(),
      members: NativeMemberRule[] = [];
    const call = ({
      target,
      receiver,
      arguments: args,
    }: {
      target: Function;
      receiver: unknown;
      arguments: readonly unknown[];
    }) => apply(target, this.receiver(receiver), args);
    for (const key of ['constructor', ...requested]) {
      const captured = descriptor(target, key);
      if (!captured) continue;
      entries.set(key, captured);
      const id =
        'Binary.' + name + '.' + (key === Symbol.iterator ? 'values' : String(key));
      if (typeof captured.value === 'function' && key !== 'constructor')
        members.push({
          key,
          call: { contract: contract(id, this.operationResult(name, key)), call },
        });
      else
        members.push({
          key,
          read: {
            contract: contract(id, key === 'buffer' ? 'reference' : 'data', 'none'),
            read: readNative,
          },
        });
      if (captured.get) this.host.captureCallableShape(id, captured.get);
    }
    this.registry.registerPrototype(target, {
      name: 'Binary ' + name,
      ...(anchor
        ? { accepts: (value: object) => value === target || accepts(value) }
        : {}),
      members,
    });
    this.declarations.add(target);
    this.descriptors.set(name, entries);
    const inherited = prototype(target),
      presence = new Set(this.presence.get(inherited));
    for (const key of entries.keys()) presence.add(key);
    this.presence.set(target, presence);
    if (anchor) this.anchors.set(name, target);
    const published = new Set<Function>();
    for (const [key, captured] of entries)
      if (anchor && typeof captured.value === 'function' && key !== 'constructor') {
        if (!published.has(captured.value)) {
          this.publish(target, key);
          published.add(captured.value);
        }
      }
  }
  private operationResult(name: string, key: PropertyKey): NativeContract['result'] {
    if (key === 'reduce' || key === 'reduceRight') return 'delegated';
    if (name === 'TypedArray' && ['entries', 'keys', 'values'].includes(String(key)))
      return 'reference';
    if (name === 'TypedArray' && key === Symbol.iterator) return 'reference';
    if (name === 'BinaryIteratorBase' && key === Symbol.iterator) return 'reference';
    return [
      'slice',
      'sliceToImmutable',
      'transfer',
      'transferToFixedLength',
      'transferToImmutable',
      'map',
      'filter',
      'subarray',
      'toSorted',
      'toReversed',
      'with',
      'copyWithin',
      'fill',
      'reverse',
      'sort',
    ].includes(String(key))
      ? 'reference'
      : 'data';
  }

  private result(value: unknown, rule: NativeContract): unknown {
    if (
      rule.result === 'data' ||
      rule.result === 'none' ||
      rule.id === 'Binary.binding.invoke'
    )
      return value;
    if (
      object(value) &&
      (rule.id === 'Binary.TypedArray.entries' ||
        rule.id === 'Binary.TypedArray.keys' ||
        rule.id === 'Binary.TypedArray.values')
    ) {
      if (prototype(value) !== this.iteratorPrototype)
        throw new TypeError('Unexpected native binary iterator');
      this.registry.admitObject(value);
      this.iterators.add(value);
    }
    if (
      rule.result === 'reference' &&
      object(value) &&
      !this.iterators.has(value) &&
      !this.declarations.has(value) &&
      !this.kind(value)
    )
      throw new NativePolicyError(
        'return',
        rule.id,
        undefined,
        'unexpected binary reference',
      );
    return this.retainResult(value);
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
      this.admit(value);
    } else if (object(value)) {
      const kind = this.kind(value);
      if (kind === 'ArrayBuffer' || kind === 'SharedArrayBuffer')
        this.retainBuffer(value as ArrayBufferLike);
    }
    return value;
  }
  retainBuffer(buffer: ArrayBufferLike): void {
    this.retained.add(buffer);
    this.admit(buffer);
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
    this.admit(target);
    this.registry.registerFacade(target, {
      name: 'Private binary constructor hook',
      members: [{ key: 'constructor' }],
    });
    this.constructorHooks.add(view);
    this.constructorHooks.add(target);
  }
  buffer(value: unknown): value is ArrayBufferLike {
    return (
      object(value) &&
      (this.retained.has(value) || this.kind(value) === 'SharedArrayBuffer')
    );
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

  readonly bindings = {
    atomicKeys: () => [...this.atomics.keys()],
    atomic: (key: PropertyKey, args: unknown[]) => {
      const method = this.atomics.get(key);
      if (!method) throw new TypeError('Atomic operation is unavailable');
      return this.host.call(method, Atomics, args);
    },
    descriptions: () =>
      [...this.descriptors]
        .filter(([name]) => name !== 'BinaryIterator' && name !== 'BinaryIteratorBase')
        .map(([name, entries]) => ({
          name,
          length: this.classMetadata.get(name)?.length,
          bytes: this.classMetadata.get(name)?.bytes,
          available: this.classMetadata.get(name)?.available ?? true,
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
    construct: (name: string, args: unknown[]) => {
      const constructor = this.classes.get(name);
      if (!constructor) throw new TypeError('Binary constructor is unavailable');
      return this.host.construct(constructor, args);
    },
    staticInvoke: (
      name: string,
      key: PropertyKey,
      receiver: unknown,
      args: unknown[],
    ) => {
      const method = this.statics.get(name)?.get(key);
      if (!method) throw new TypeError('Binary static operation is unavailable');
      return this.retainResult(apply(method, this.receiver(receiver), args));
    },
    invoke: (
      name: string,
      key: PropertyKey,
      kind: 'value' | 'get' | 'set',
      receiver: unknown,
      args: unknown[],
    ) => {
      const owner = this.anchors.get(name);
      const entry = this.descriptors.get(name)?.get(key);
      if (!owner || !entry || typeof entry[kind] !== 'function')
        throw new TypeError('Binary operation is unavailable');
      if (object(receiver)) this.admit(receiver);
      if (kind === 'value') return this.host.call(entry.value, receiver, args);
      const operation = this.host.descriptor(owner, key)?.[kind];
      if (!operation) throw new TypeError('Binary accessor is unavailable');
      return this.host.call(operation, receiver, args);
    },
  };

  owns(value: object): boolean {
    return this.host.owns!(value);
  }
  private receiver(value: unknown): unknown {
    return object(value) ? (this.methodReceivers.get(value) ?? value) : value;
  }
  private dataView(target: object): boolean {
    return this.kind(target) === 'DataView';
  }
  private ownData(target: object, key: string): PropertyDescriptor | undefined {
    const expected = this.metadata.get(target)?.get(key);
    const actual = descriptor(target, key);
    if (!expected) {
      if (actual)
        throw new NativePolicyError(
          'access',
          'DataView',
          key,
          'unreviewed own numeric property',
        );
      return;
    }
    if (
      !actual ||
      actual.get !== expected.get ||
      actual.set !== expected.set ||
      actual.configurable !== expected.configurable ||
      actual.enumerable !== expected.enumerable ||
      actual.writable !== expected.writable
    )
      throw new NativePolicyError(
        'access',
        'DataView',
        key,
        'application descriptor changed outside the reviewed adapter',
      );
    return actual;
  }
  /** Ordinary own primitive data can shadow geometry without executing a getter
   * or granting authority to a function/object stored by another native producer. */
  private ownPrimitive(target: object, key: PropertyKey): PropertyDescriptor | undefined {
    if (indexKey(key) || !this.kind(target)) return;
    const own = descriptor(target, key);
    return own && 'value' in own && !object(own.value) ? own : undefined;
  }
  get(target: object, key: PropertyKey): unknown {
    const own = this.ownPrimitive(target, key);
    if (own) return own.value;
    if (indexKey(key) && this.admit(target)) {
      if (this.typedKind(target)) return get(target, key, target);
      if (this.dataView(target)) {
        const own = this.ownData(target, key);
        return own ? (own.get ? apply(own.get, target, []) : own.value) : undefined;
      }
    }
    return this.host.get(target, key);
  }
  set(target: object, key: PropertyKey, value: unknown): boolean {
    if (this.ownPrimitive(target, key))
      return !object(value) && set(target, key, value, target);
    if (indexKey(key) && this.admit(target)) {
      if (this.typedKind(target)) return set(target, key, value, target);
      if (this.dataView(target)) {
        const own = this.ownData(target, key);
        if (own?.set) {
          apply(own.set, target, [value]);
          return true;
        }
        if (own && (!('value' in own) || !own.writable)) return false;
        return this.define(
          target,
          key,
          own
            ? { ...own, value }
            : { value, writable: true, enumerable: true, configurable: true },
        );
      }
    }
    if (this.has(target, key)) return false;
    return this.host.set(target, key, value);
  }
  settable(target: object, key: PropertyKey): boolean {
    return this.view(target) && indexKey(key);
  }
  define(target: object, key: PropertyKey, value: PropertyDescriptor): boolean {
    if (!indexKey(key) || !this.admit(target)) return false;
    if (this.typedKind(target)) return Reflect.defineProperty(target, key, value);
    if (!this.dataView(target)) return false;
    this.ownData(target, key);
    if (!Reflect.defineProperty(target, key, value)) return false;
    let properties = this.metadata.get(target);
    if (!properties) this.metadata.set(target, (properties = new Map()));
    properties.set(key, descriptor(target, key)!);
    return true;
  }
  delete(target: object, key: PropertyKey): boolean {
    if (this.ownPrimitive(target, key)) return Reflect.deleteProperty(target, key);
    if (key === 'constructor' && this.constructorHooks.has(target)) return true;
    if (indexKey(key) && this.admit(target)) {
      if (this.typedKind(target)) return Reflect.deleteProperty(target, key);
      if (this.dataView(target)) {
        if (!this.ownData(target, key)) return true;
        if (!Reflect.deleteProperty(target, key)) return false;
        this.metadata.get(target)?.delete(key);
        return true;
      }
    }
    return this.has(target, key) ? false : true;
  }
  descriptor(target: object, key: PropertyKey): PropertyDescriptor | undefined {
    if (key === 'constructor' && this.constructorHooks.has(target)) return;
    const own = this.ownPrimitive(target, key);
    if (own) return own;
    if (indexKey(key) && this.admit(target)) {
      if (this.typedKind(target)) return descriptor(target, key);
      if (this.dataView(target)) return this.ownData(target, key);
    }
    return this.host.descriptor(target, key);
  }
  ownKeys(target: object): (string | symbol)[] {
    if (this.admit(target) && this.kind(target)) {
      const typed = !!this.typedKind(target);
      return keys(target).filter((key) =>
        indexKey(key)
          ? typed ||
            (!!this.metadata.get(target)?.has(key) && !!this.ownData(target, key))
          : !!this.ownPrimitive(target, key),
      );
    }
    return this.host
      .ownKeys(target)
      .filter((key) => key !== 'constructor' || !this.constructorHooks.has(target));
  }

  prototype(target: object): object | null {
    return this.host.prototype(target);
  }
  call(target: Function, receiver: unknown, args: unknown[]): unknown {
    return this.host.call(target, receiver, args);
  }
  construct(): object {
    throw new TypeError('Binary methods are not constructors');
  }
}
