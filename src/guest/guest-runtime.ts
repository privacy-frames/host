/** This function is compiled once as trusted code, then evaluated inside QuickJS. */
export function installGuestRuntime() {
  const dispatch: (...arguments_: unknown[]) => unknown = Reflect.get(
    globalThis,
    '__privacyHostDispatch',
  );
  Reflect.deleteProperty(globalThis, '__privacyHostDispatch');

  const objectPrototype = Object.prototype;
  const functionPrototype = Function.prototype;
  const reflectGet = Reflect.get;
  const reflectSet = Reflect.set;
  const reflectApply = Reflect.apply;
  const reflectConstruct = Reflect.construct;
  const getDescriptor = Object.getOwnPropertyDescriptor;
  const defineProperty = Object.defineProperty;
  const getPrototype = Object.getPrototypeOf;
  const setPrototype = Object.setPrototypeOf;
  const ownKeys = Reflect.ownKeys;
  const arrayIsArray = Array.isArray;
  const bufferIsView = ArrayBuffer.isView;
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
  const setAdd = Set.prototype.add;
  const weakGet = WeakMap.prototype.get;
  const weakSet = WeakMap.prototype.set;
  const weakHas = WeakMap.prototype.has;
  const MapConstructor = Map;
  const WeakMapConstructor = WeakMap;
  const PromiseConstructor = Promise;
  const SetConstructor = Set;
  const RegExpConstructor = RegExp;
  const DateConstructor = Date;
  const ObjectConstructor = Object;
  const SymbolConstructor = Symbol;
  const getNames = Object.getOwnPropertyNames;
  const symbolFor = Symbol.keyFor;
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
  const guestIds = new InternalWeakMap<object, number>();
  const proxies = new InternalMap<number, object>();
  const records = new InternalWeakMap<object, ProxyRecord>();
  const nativeSymbols = new InternalMap<symbol, number>();
  const guestSymbols = new InternalMap<symbol, number>();
  const objectDefaults = new InternalMap<PropertyKey, PropertyDescriptor | undefined>();
  for (const key of ownKeys(objectPrototype))
    objectDefaults.set(key, getDescriptor(objectPrototype, key));
  let nextGuest = 1;

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
  }

  const key = (value: PropertyKey): string => {
    if (typeof value !== 'symbol') return 'string:' + String(value);
    const native = nativeSymbols.get(value);
    if (native !== undefined) return 'native:' + native;
    for (const name of getNames(SymbolConstructor)) {
      if (reflectGet(SymbolConstructor, name) === value) return 'well-known:' + name;
    }
    const registry = symbolFor(value);
    if (registry !== undefined) return 'registry:' + registry;
    let id = guestSymbols.get(value);
    if (id === undefined) {
      id = nextGuest++;
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
          const descriptor = getDescriptor(current, property);
          const initial = objectDefaults.get(property);
          if (descriptor?.value === initial?.value && descriptor?.get === initial?.get)
            return undefined;
          return descriptor;
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
  ): object => {
    const existing = proxies.get(id);
    if (existing) return existing;

    const target = callable
      ? constructable
        ? function () {}
        : (..._arguments: unknown[]) => undefined
      : ObjectConstructor.create(null);
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
    };
    const proxy = new Proxy(target, {
      get(_target, property, receiver) {
        const own = getDescriptor(target, property);
        if (own && !own.configurable && 'value' in own && !own.writable) return own.value;
        if (record.local.has(property) && own) return readDescriptor(own, receiver);
        if (property === '__proto__') return parent(record);
        if (
          callable &&
          ['call', 'apply', 'bind', 'constructor'].includes(String(property))
        )
          return reflectGet(functionPrototype, property, receiver);
        if (property === Symbol.hasInstance && callable)
          return reflectGet(functionPrototype, property, receiver);
        const local = localDescriptor(record, property);
        if (local === null) return undefined;
        if (local) return readDescriptor(local, receiver);
        return native('get', id, property);
      },
      set(_target, property, value, receiver) {
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
        record.local.add(property);
        return Reflect.defineProperty(target, property, descriptor);
      },
      deleteProperty(_target, property) {
        if (record.local.has(property)) {
          const deleted = Reflect.deleteProperty(target, property);
          if (deleted) record.local.delete(property);
          return deleted;
        }
        if (record.prototypeObject || callable) {
          const descriptor = getDescriptor(target, property);
          if (descriptor && !descriptor.configurable) return false;
          Reflect.deleteProperty(target, property);
          record.local.add(property);
          return true;
        }
        return !!native('delete', id, property);
      },
      has(_target, property) {
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
        const value = native('construct', id, undefined, args) as object;
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
    });
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

  const guestId = (value: object): number => {
    let id = guestIds.get(value);
    if (id === undefined) {
      id = nextGuest++;
      guestIds.set(value, id);
    }
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
    if (value instanceof PromiseConstructor) return 'promise';
    if (value instanceof MapConstructor) return 'map';
    if (value instanceof SetConstructor) return 'set';
    if (value instanceof RegExpConstructor) return 'regexp';
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
    createHost,
    kind,
    key,
    guestId,
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
        fallback = String(value);
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
    makeView(buffer: ArrayBuffer, name: string, offset: number, length: number) {
      if (name === 'DataView') return new DataView(buffer, offset, length);
      const Constructor = reflectGet(globalThis, name);
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
