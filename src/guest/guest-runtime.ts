import type { IdentityState } from './identity.ts';

/** This function is compiled once as trusted code, then evaluated inside QuickJS. */
export function installGuestRuntime(
  allocateIdentity: (state: IdentityState) => number | undefined,
) {
  const guestGlobal = globalThis;
  const dispatch: (...arguments_: unknown[]) => unknown = Reflect.get(
    globalThis,
    '__privacyHostDispatch',
  );
  Reflect.deleteProperty(globalThis, '__privacyHostDispatch');

  const createObject = Object.create;
  const RangeErrorConstructor = RangeError;
  const objectPrototype = Object.prototype;
  const functionPrototype = Function.prototype;
  const reflectGet = Reflect.get;
  const reflectSet = Reflect.set;
  const reflectDefine = Reflect.defineProperty;
  const reflectDelete = Reflect.deleteProperty;
  const reflectApply = Reflect.apply;
  const reflectConstruct = Reflect.construct;
  const getDescriptor = Object.getOwnPropertyDescriptor;
  const defineProperty = Object.defineProperty;
  const getPrototype = Object.getPrototypeOf;
  const setPrototype = Object.setPrototypeOf;
  const ownKeys = Reflect.ownKeys;
  const arrayIsArray = Array.isArray;
  const bufferIsView = ArrayBuffer.isView;
  const speciesSymbol = Symbol.species;
  const hasInstanceSymbol = Symbol.hasInstance;
  const ordinaryHasInstance = Function.prototype[Symbol.hasInstance];
  const StringValue = String;
  const NumberValue = Number;
  const DataViewConstructor = DataView;
  const viewConstructors = {
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
  const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
  const typedBuffer = getDescriptor(typedArrayPrototype, 'buffer')!.get!;
  const typedOffset = getDescriptor(typedArrayPrototype, 'byteOffset')!.get!;
  const typedLength = getDescriptor(typedArrayPrototype, 'length')!.get!;
  const typedBytes = getDescriptor(typedArrayPrototype, 'byteLength')!.get!;
  const typedName = getDescriptor(typedArrayPrototype, Symbol.toStringTag)!.get!;
  const dataBuffer = getDescriptor(DataView.prototype, 'buffer')!.get!;
  const dataOffset = getDescriptor(DataView.prototype, 'byteOffset')!.get!;
  const dataBytes = getDescriptor(DataView.prototype, 'byteLength')!.get!;
  const bufferLength = getDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
  const bufferTransfer: Function = Reflect.get(ArrayBuffer.prototype, 'transfer');
  const dateGetTime = Date.prototype.getTime;
  const Uint8 = Uint8Array;
  const mapGet = Map.prototype.get;
  const mapSet = Map.prototype.set;
  const mapHas = Map.prototype.has;
  const mapDelete = Map.prototype.delete;
  const mapForEach = Map.prototype.forEach;
  const setForEach = Set.prototype.forEach;
  const setHas = Set.prototype.has;
  const regexpSource = getDescriptor(RegExp.prototype, 'source')!.get!;
  const setAdd = Set.prototype.add;
  const weakGet = WeakMap.prototype.get;
  const weakSet = WeakMap.prototype.set;
  const weakHas = WeakMap.prototype.has;
  const MapConstructor = Map;
  const WeakMapConstructor = WeakMap;
  const ProxyConstructor = Proxy;
  const PromiseConstructor = Promise;
  const promiseThen = Promise.prototype.then;
  const SetConstructor = Set;
  const RegExpConstructor = RegExp;
  const DateConstructor = Date;
  const SymbolConstructor = Symbol;
  const getNames = Object.getOwnPropertyNames;
  const symbolFor = Symbol.keyFor;
  const makeSymbolFor = Symbol.for;
  const parseJSON = JSON.parse;
  const stringifyJSON = JSON.stringify;
  const arrayPush = Array.prototype.push;
  const byteSet = Uint8Array.prototype.set;

  class InternalMap<K, V> {
    private store = new MapConstructor<K, V>();
    get(key: K): V | undefined {
      return reflectApply(mapGet, this.store, [key]);
    }
    set(key: K, value: V): void {
      reflectApply(mapSet, this.store, [key, value]);
    }
    has(key: K): boolean {
      return reflectApply(mapHas, this.store, [key]);
    }
    delete(key: K): boolean {
      return reflectApply(mapDelete, this.store, [key]);
    }
  }
  class InternalSet<K> {
    private store = new InternalMap<K, true>();
    has(value: K): boolean {
      return this.store.has(value);
    }
    add(value: K): void {
      this.store.set(value, true);
    }
    delete(value: K): boolean {
      return this.store.delete(value);
    }
  }
  class InternalWeakMap<K extends object, V> {
    private store = new WeakMapConstructor<K, V>();
    get(key: K): V | undefined {
      return reflectApply(weakGet, this.store, [key]);
    }
    set(key: K, value: V): void {
      reflectApply(weakSet, this.store, [key, value]);
    }
    has(key: K): boolean {
      return reflectApply(weakHas, this.store, [key]);
    }
  }
  const hostIds = new InternalWeakMap<object, number>();
  const wasmImportFunctions = new InternalWeakMap<object, true>();
  const indexGetters = new InternalWeakMap<Function, PropertyKey>();
  const indexConstructors = new InternalMap<string, Function>();
  for (const name of [
    'Int8Array',
    'Uint8Array',
    'Uint8ClampedArray',
    'Int16Array',
    'Uint16Array',
    'Int32Array',
    'Uint32Array',
    'Float16Array',
    'Float32Array',
    'Float64Array',
    'BigInt64Array',
    'BigUint64Array',
  ]) {
    const constructor = reflectGet(guestGlobal, name);
    if (typeof constructor === 'function') indexConstructors.set(name, constructor);
  }
  let indexEpoch: object = createObject(null);
  let indexCacheEnabled = true;
  const guestIds = new InternalWeakMap<object, number>();
  const proxies = new InternalMap<number, object>();
  const records = new InternalWeakMap<object, ProxyRecord>();
  const nativeSymbols = new InternalMap<symbol, number>();
  const guestSymbols = new InternalMap<symbol, number>();
  const guestIdentity: IdentityState = { next: 1 };
  const nextGuestIdentity = (): number => {
    const identity = allocateIdentity(guestIdentity);
    if (identity === undefined)
      throw new RangeErrorConstructor('Guest identities exhausted');
    return identity;
  };

  interface ProxyRecord {
    id: number;
    target: object;
    proxy: object;
    local: InternalSet<PropertyKey>;
    own: InternalMap<PropertyKey, boolean>;
    callable: boolean;
    prototypeObject: boolean;
    parent: object | null | undefined;
    parentOverridden: boolean;
    binary: string;
    indexed: boolean;
    index?: {
      epoch: object;
      view: object;
      length: number;
      byteLength: number;
      byteOffset: number;
      lengthOwn: boolean;
      byteLengthOwn: boolean;
      byteOffsetOwn: boolean;
    };
  }

  const key = (value: PropertyKey): string => {
    if (typeof value !== 'symbol') return 'string:' + StringValue(value);
    const native = nativeSymbols.get(value);
    if (native !== undefined) return 'native:' + native;
    for (const name of getNames(SymbolConstructor)) {
      if (reflectGet(SymbolConstructor, name) === value) return 'well-known:' + name;
    }
    const registry = symbolFor(value);
    if (registry !== undefined) return 'registry:' + registry;
    let id = guestSymbols.get(value);
    if (id === undefined) {
      id = nextGuestIdentity();
      guestSymbols.set(value, id);
    }
    return 'guest-symbol:' + id;
  };

  const native = (
    operation: string,
    id: number,
    property?: PropertyKey,
    ...args: unknown[]
  ) => dispatch(operation, id, property === undefined ? '' : key(property), ...args);

  const indexState = (record: ProxyRecord): ProxyRecord['index'] => {
    if (!record.indexed || !indexCacheEnabled) return;
    if (record.index?.epoch === indexEpoch) return record.index;
    const info = native('index-shadow', record.id) as
      | {
          buffer: ArrayBuffer;
          name: string;
          byteOffset: number;
          byteLength: number;
          length: number;
          lengthOwn: boolean;
          byteLengthOwn: boolean;
          byteOffsetOwn: boolean;
        }
      | undefined;
    if (!info) {
      record.indexed = false;
      return;
    }
    const constructor = indexConstructors.get(info.name);
    if (!constructor) {
      record.indexed = false;
      return;
    }
    record.index = {
      epoch: indexEpoch,
      view: reflectConstruct(constructor, [info.buffer, info.byteOffset, info.length]),
      length: info.length,
      byteLength: info.byteLength,
      byteOffset: info.byteOffset,
      lengthOwn: info.lengthOwn,
      byteLengthOwn: info.byteLengthOwn,
      byteOffsetOwn: info.byteOffsetOwn,
    };
    native('index-attach', record.id, undefined, record.index.view);
    return record.index;
  };
  const validIndex = (property: PropertyKey): number | undefined => {
    if (typeof property !== 'string' || property === '-0' || property === '') return;
    const index = NumberValue(property);
    if (index >= 0 && index % 1 === 0 && StringValue(index) === property) return index;
  };
  const geometryGetter = (record: ProxyRecord, property: PropertyKey): boolean => {
    let prototype = parent(record);
    const visited = new InternalSet<object>();
    while (prototype && !visited.has(prototype)) {
      if (records.has(prototype)) return false;
      visited.add(prototype);
      const descriptor = getDescriptor(prototype, property);
      if (descriptor)
        return !!descriptor.get && indexGetters.get(descriptor.get) === property;
      prototype = getPrototype(prototype);
    }
    return false;
  };
  const parent = (record: ProxyRecord): object | null => {
    if (record.parent === undefined) {
      record.parent = native('prototype', record.id) as object | null;
    }
    return record.parent;
  };

  // Browser prototypes are represented by guest objects. Only their local
  // overrides participate here; native getters must run on the original receiver.
  const localDescriptor = (
    record: ProxyRecord,
    property: PropertyKey,
  ): PropertyDescriptor | null | undefined => {
    let current: object | null = record.proxy;
    const visited = new InternalSet<object>();
    while (current && !visited.has(current)) {
      visited.add(current);
      const entry = records.get(current);
      if (entry) {
        if (entry.local.has(property))
          return getDescriptor(entry.target, property) ?? null;
        let own = entry.prototypeObject ? entry.own.get(property) : undefined;
        if (own === undefined) {
          own = !!native('own', entry.id, property);
          if (entry.prototypeObject) entry.own.set(property, own);
        }
        if (own) return undefined;
        current = parent(entry);
      } else {
        if (current === objectPrototype) {
          return getDescriptor(current, property);
        }
        if (current === functionPrototype) return undefined;
        const descriptor = getDescriptor(current, property);
        if (descriptor) return descriptor;
        current = getPrototype(current);
      }
    }
    return undefined;
  };

  const readDescriptor = (descriptor: PropertyDescriptor, receiver: unknown): unknown =>
    descriptor.get ? reflectApply(descriptor.get, receiver, []) : descriptor.value;

  const createHost = (
    id: number,
    callable: boolean,
    constructable: boolean,
    name: string,
    prototypeObject: boolean,
    binary = '',
    indexed = false,
  ): object => {
    const existing = proxies.get(id);
    if (existing) return existing;

    const target = callable
      ? constructable
        ? function () {}
        : (..._arguments: unknown[]) => undefined
      : createObject(null);
    if (callable) defineProperty(target, 'name', { value: name, configurable: true });

    const record: ProxyRecord = {
      id,
      target,
      proxy: target,
      local: new InternalSet(),
      own: new InternalMap(),
      callable,
      prototypeObject,
      parent: undefined,
      parentOverridden: false,
      binary,
      indexed,
      index: undefined,
    };
    const handler: ProxyHandler<object> = {
      get(_target, property, receiver) {
        const index = validIndex(property);
        if (index !== undefined && record.indexed && indexCacheEnabled) {
          const shadow = indexState(record);
          if (shadow && index < shadow.length) return reflectGet(shadow.view, property);
        }
        if (
          record.binary === 'view' &&
          typeof property === 'string' &&
          (StringValue(NumberValue(property)) === property || property === '-0')
        )
          return native('get', id, property);
        const own = getDescriptor(target, property);
        if (own && !own.configurable && 'value' in own && !own.writable) return own.value;
        if (record.local.has(property) && own) return readDescriptor(own, receiver);
        if (
          record.indexed &&
          indexCacheEnabled &&
          (property === 'length' ||
            property === 'byteLength' ||
            property === 'byteOffset') &&
          geometryGetter(record, property)
        ) {
          const shadow = indexState(record);
          if (
            shadow &&
            !shadow[(property + 'Own') as 'lengthOwn' | 'byteLengthOwn' | 'byteOffsetOwn']
          )
            return shadow[property];
        }
        if (record.binary && property === 'constructor')
          return reflectGet(parent(record)!, property, receiver);
        if (property === '__proto__') return parent(record);
        if (
          callable &&
          (property === 'call' ||
            property === 'apply' ||
            property === 'bind' ||
            property === 'constructor')
        )
          return reflectGet(functionPrototype, property, receiver);
        if (property === hasInstanceSymbol && callable)
          return reflectGet(functionPrototype, property, receiver);
        const local = localDescriptor(record, property);
        if (local === null) return undefined;
        if (local) return readDescriptor(local, receiver);
        return native('get', id, property);
      },
      set(_target, property, value, receiver) {
        const index = validIndex(property);
        if (
          index !== undefined &&
          record.indexed &&
          indexCacheEnabled &&
          (value === null ||
            (typeof value !== 'object' &&
              typeof value !== 'function' &&
              typeof value !== 'symbol'))
        ) {
          const shadow = indexState(record);
          if (shadow && index < shadow.length) {
            const written = reflectSet(shadow.view, property, value, shadow.view);
            if (written) native('index-dirty', record.id);
            return written;
          }
        }
        if (
          record.binary === 'view' &&
          typeof property === 'string' &&
          (StringValue(NumberValue(property)) === property || property === '-0')
        )
          return !!native('set', id, property, value);
        if (property === '__proto__') {
          if (
            value === null ||
            typeof value === 'object' ||
            typeof value === 'function'
          ) {
            record.parent = value;
            record.parentOverridden = true;
          }
          return true;
        }
        const local = localDescriptor(record, property);
        if (local === null) {
          record.local.add(property);
          return reflectSet(target, property, value, target);
        }
        if (local?.set) {
          reflectApply(local.set, receiver, [value]);
          return true;
        }
        if (local && !('value' in local)) return false;
        if (
          record.prototypeObject ||
          callable ||
          property === 'constructor' ||
          record.local.has(property)
        ) {
          record.local.add(property);
          return reflectSet(target, property, value, target);
        }
        if (native('has', id, property) || native('settable', id, property))
          return !!native('set', id, property, value);
        record.local.add(property);
        return reflectSet(target, property, value, target);
      },
      defineProperty(_target, property, descriptor) {
        if (
          record.binary === 'view' &&
          typeof property === 'string' &&
          (StringValue(NumberValue(property)) === property || property === '-0')
        )
          return !!native('define', id, property, descriptor);
        record.local.add(property);
        return reflectDefine(target, property, descriptor);
      },
      deleteProperty(_target, property) {
        if (record.local.has(property)) {
          const deleted = reflectDelete(target, property);
          if (deleted) record.local.delete(property);
          return deleted;
        }
        if (record.prototypeObject || callable) {
          const descriptor = getDescriptor(target, property);
          if (descriptor && !descriptor.configurable) return false;
          reflectDelete(target, property);
          record.local.add(property);
          return true;
        }
        return !!native('delete', id, property);
      },
      has(_target, property) {
        if (
          record.binary === 'view' &&
          typeof property === 'string' &&
          (StringValue(NumberValue(property)) === property || property === '-0')
        )
          return !!native('own', id, property);
        const local = localDescriptor(record, property);
        return local !== undefined ? local !== null : !!native('has', id, property);
      },
      ownKeys() {
        const result: (string | symbol)[] = [];
        const keys = new InternalSet<string | symbol>();
        const append = (input: (string | symbol)[]) => {
          for (let index = 0; index < input.length; index++) {
            const key = input[index];
            if (record.local.has(key) && !getDescriptor(target, key)) continue;
            if (keys.has(key)) continue;
            keys.add(key);
            reflectApply(arrayPush, result, [key]);
          }
        };
        append(ownKeys(target));
        append(native('keys', id) as (string | symbol)[]);
        return result;
      },
      getOwnPropertyDescriptor(_target, property) {
        const own = getDescriptor(target, property);
        if (record.local.has(property) && !own) return undefined;
        if (own && (!own.configurable || record.local.has(property))) return own;
        const descriptor = native('descriptor', id, property) as
          PropertyDescriptor | undefined;
        return descriptor ? { ...descriptor, configurable: true } : own;
      },
      getPrototypeOf() {
        return parent(record);
      },
      setPrototypeOf(_target, value) {
        record.parent = value;
        record.parentOverridden = true;
        return true;
      },
      preventExtensions() {
        // A live native surface cannot honestly become a fixed guest snapshot.
        return false;
      },
      apply(_target, receiver, args) {
        return native('call', id, undefined, receiver, args);
      },
      construct(_target, args, newTarget) {
        const value = native('construct', id, undefined, args, newTarget) as object;
        if (newTarget !== proxy) {
          const prototype = reflectGet(newTarget, 'prototype');
          if (
            prototype &&
            (typeof prototype === 'object' || typeof prototype === 'function')
          )
            setPrototype(value, prototype);
        }
        return value;
      },
    };
    setPrototype(handler, null);
    const proxy = new ProxyConstructor(target, handler);
    record.proxy = proxy;
    records.set(proxy, record);
    hostIds.set(proxy, id);
    proxies.set(id, proxy);
    if (constructable) {
      const prototype = native('get', id, 'prototype');
      if (prototype && typeof prototype === 'object')
        defineProperty(target, 'prototype', { value: prototype, writable: false });
    }
    return proxy;
  };

  const tryGuestId = (value: object): number | undefined => {
    let id = guestIds.get(value);
    if (id === undefined) {
      id = allocateIdentity(guestIdentity);
      if (id !== undefined) guestIds.set(value, id);
    }
    return id;
  };
  const guestId = (value: object): number => {
    const id = tryGuestId(value);
    if (id === undefined) throw new RangeErrorConstructor('Guest identities exhausted');
    return id;
  };

  const kind = (value: unknown): string => {
    if (value === null) return 'null';
    if (typeof value !== 'object' && typeof value !== 'function') return typeof value;
    if (hostIds.has(value)) return 'host';
    if (typeof value === 'function') return 'function';
    if (arrayIsArray(value)) return 'array';
    if (bufferIsView(value)) return 'view';
    try {
      reflectApply(bufferLength, value, []);
      return 'buffer';
    } catch {}
    if (reflectApply(ordinaryHasInstance, PromiseConstructor, [value])) return 'promise';
    try {
      reflectApply(mapHas, value, [undefined]);
      return 'map';
    } catch {}
    try {
      reflectApply(setHas, value, [undefined]);
      return 'set';
    } catch {}
    try {
      reflectApply(regexpSource, value, []);
      return 'regexp';
    } catch {}
    try {
      reflectApply(dateGetTime, value, []);
      return 'date';
    } catch {}
    return 'object';
  };

  const viewInfo = (value: ArrayBufferView) => {
    try {
      const buffer = reflectApply(dataBuffer, value, []);
      return {
        buffer,
        offset: reflectApply(dataOffset, value, []),
        byteLength: reflectApply(dataBytes, value, []),
        name: 'DataView',
      };
    } catch {}
    return {
      buffer: reflectApply(typedBuffer, value, []),
      offset: reflectApply(typedOffset, value, []),
      byteLength: reflectApply(typedBytes, value, []),
      name: reflectApply(typedName, value, []),
      length: reflectApply(typedLength, value, []),
    };
  };

  return {
    isWasmImport: (value: object) => wasmImportFunctions.has(value),
    setIndexCacheEnabled: (enabled: boolean) => {
      indexCacheEnabled = enabled;
    },
    invalidateIndexShadows: () => {
      indexEpoch = createObject(null);
    },
    captureIndexGetters(aliases: { Uint8Array: { prototype: object } }) {
      const prototype = getPrototype(aliases.Uint8Array.prototype)!;
      for (const property of ['length', 'byteLength', 'byteOffset']) {
        const getter = getDescriptor(prototype, property)?.get;
        if (getter) indexGetters.set(getter, property);
      }
    },
    binaryHooks: () => ({
      binaryKind: (value: unknown) =>
        value && (typeof value === 'object' || typeof value === 'function')
          ? (records.get(value)?.binary ?? '')
          : '',
      constructorOf: (value: object) => reflectGet(value, 'constructor'),
      speciesOf: (value: object) => reflectGet(value, speciesSymbol),
    }),
    captureWasmImports(
      imports: object,
      descriptors: { module: string; name: string; kind: string }[],
    ) {
      if (
        imports !== undefined &&
        (imports === null ||
          (typeof imports !== 'object' && typeof imports !== 'function'))
      )
        throw new TypeError('Wasm imports must be an object');
      const captured = createObject(null);
      let next = 0;
      for (let index = 0; index < descriptors.length; index++) {
        const module = descriptors[index].module;
        if (getDescriptor(captured, module)) continue;
        defineProperty(captured, module, {
          // Native instantiation reads namespaces in import declaration order,
          // including repeated module/name pairs whose kinds can differ.
          get() {
            const item = descriptors[next++];
            const namespace = reflectGet(imports, module);
            const protectedNamespace = createObject(null);
            defineProperty(protectedNamespace, item.name, {
              get() {
                const value = reflectGet(namespace, item.name);
                if (item.kind !== 'function' || typeof value !== 'function') return value;
                // A host proxy decoded directly would reveal its raw native
                // function. A guest closure keeps each call on the policy path.
                const callback = (...args: unknown[]) =>
                  reflectApply(value, undefined, args);
                wasmImportFunctions.set(callback, true);
                return callback;
              },
              configurable: true,
            });
            return protectedNamespace;
          },
          configurable: true,
        });
      }
      return captured;
    },
    defineGlobal(name: string, value: unknown) {
      defineProperty(guestGlobal, name, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    },
    parseString: (value: string) => parseJSON(value),
    stringifyString: (value: string) => stringifyJSON(value),
    makeSymbol: (description: string | undefined) => SymbolConstructor(description),
    makeSymbolFor: (key: string) => reflectApply(makeSymbolFor, SymbolConstructor, [key]),
    createHost,
    kind,
    key,
    guestId,
    tryGuestId,
    hostId: (value: object) => hostIds.get(value),
    registerHost(value: object, id: number) {
      hostIds.set(value, id);
      proxies.set(id, value);
    },
    objectPrototype,
    functionPrototype,
    registerSymbol(value: symbol, id: number) {
      nativeSymbols.set(value, id);
    },
    viewInfo,
    dateTime: (value: Date) => reflectApply(dateGetTime, value, []),
    objectKeys(value: object) {
      if (arrayIsArray(value)) return ownKeys(value);
      const result: PropertyKey[] = [];
      const seen = new InternalSet<PropertyKey>();
      let current: object | null = value;
      while (current && current !== objectPrototype && current !== functionPrototype) {
        for (const key of ownKeys(current)) {
          if ((key === 'constructor' && current !== value) || seen.has(key)) continue;
          seen.add(key);
          reflectApply(arrayPush, result, [key]);
        }
        current = getPrototype(current);
      }
      return result;
    },
    propertyEnumerable: (value: object, key: PropertyKey) =>
      !!getDescriptor(value, key)?.enumerable,
    objectGet: (value: object, property: PropertyKey) => reflectGet(value, property),
    objectSet: (target: object, property: PropertyKey, value: unknown) =>
      reflectSet(target, property, value),
    setPrototype: (value: object, prototype: object | null) =>
      setPrototype(value, prototype),
    apply: (fn: (...args: unknown[]) => unknown, receiver: unknown, args: unknown[]) =>
      reflectApply(fn, receiver, args),
    construct: (fn: new (...args: unknown[]) => object, args: unknown[]) =>
      reflectConstruct(fn, args),
    writeBuffer(target: ArrayBuffer, source: ArrayBuffer) {
      reflectApply(byteSet, new Uint8(target), [new Uint8(source)]);
    },
    detachBuffer: (value: ArrayBuffer) => reflectApply(bufferTransfer, value, [0]),
    bufferSize: (value: ArrayBuffer) => reflectApply(bufferLength, value, []),
    bufferDetached(value: ArrayBuffer) {
      try {
        new Uint8(value);
        return false;
      } catch {
        return true;
      }
    },
    makeDate: (value: number) => new DateConstructor(value),
    makeRegExp: (source: string, flags: string) => new RegExpConstructor(source, flags),
    errorInfo(value: unknown) {
      const read = (key: string) => {
        try {
          const field =
            value && (typeof value === 'object' || typeof value === 'function')
              ? reflectGet(value, key)
              : undefined;
          return typeof field === 'string' ? field : '';
        } catch {
          return '';
        }
      };
      let fallback = 'Guest execution failed';
      try {
        fallback = StringValue(value);
      } catch {}
      return {
        name: read('name') || 'Error',
        message: read('message') || fallback,
        stack: read('stack'),
      };
    },
    makeMap: () => new MapConstructor(),
    makeSet: () => new SetConstructor(),
    setAdd: (value: Set<unknown>, item: unknown) => reflectApply(setAdd, value, [item]),
    observePromise(
      value: Promise<unknown>,
      resolve: (value: unknown) => void,
      reject: (error: unknown) => void,
    ) {
      return reflectApply(promiseThen, value, [resolve, reject]);
    },
    makeView(buffer: ArrayBuffer, name: string, offset: number, length: number) {
      if (name === 'DataView') return new DataViewConstructor(buffer, offset, length);
      const Constructor = reflectGet(viewConstructors, name);
      return new Constructor(buffer, offset, length);
    },
    mapEntries(value: Map<unknown, unknown>) {
      const result: unknown[][] = [];
      reflectApply(mapForEach, value, [
        (entry: unknown, key: unknown) => reflectApply(arrayPush, result, [[key, entry]]),
      ]);
      return result;
    },
    setEntries(value: Set<unknown>) {
      const result: unknown[] = [];
      reflectApply(setForEach, value, [
        (entry: unknown) => reflectApply(arrayPush, result, [entry]),
      ]);
      return result;
    },
    mapGet: (value: Map<unknown, unknown>, key: unknown) =>
      reflectApply(mapGet, value, [key]),
    mapSet: (value: Map<unknown, unknown>, key: unknown, item: unknown) =>
      reflectApply(mapSet, value, [key, item]),
  };
}
