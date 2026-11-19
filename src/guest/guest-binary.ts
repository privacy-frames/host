interface BinaryDescription {
  name: string;
  length?: number;
  bytes?: number;
  available: boolean;
  properties: {
    key: PropertyKey;
    method?: boolean;
    getter?: boolean;
    setter?: boolean;
    value?: unknown;
  }[];
}

interface BinaryBindings {
  descriptions(): BinaryDescription[];
  construct(name: string, args: unknown[]): object;
  staticInvoke(
    name: string,
    key: PropertyKey,
    receiver: unknown,
    args: unknown[],
  ): unknown;
  invoke(
    name: string,
    key: PropertyKey,
    kind: 'value' | 'get' | 'set',
    receiver: unknown,
    args: unknown[],
  ): unknown;
  atomic(key: PropertyKey, args: unknown[]): unknown;
  atomicKeys(): PropertyKey[];
}

/** Executed inside QuickJS; native stores are reached only through private bindings. */
export function installGuestBinary(
  native: BinaryBindings,
  hooks: { binaryKind(value: unknown): string; nonTransferable(value: object): boolean },
) {
  const get = Reflect.get;
  const apply = Reflect.apply;
  const construct = Reflect.construct;
  const define = Object.defineProperty;
  const getDescriptor = Object.getOwnPropertyDescriptor;
  const setPrototype = Object.setPrototypeOf;
  const localBuffer = ArrayBuffer;
  const localIsView = ArrayBuffer.isView;
  const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
  const originals = new Map<string, Function>();
  const prototypes = new Map<string, object>([['TypedArray', typedPrototype]]);
  const descriptions = native.descriptions();
  const aliases: Record<string, Function> = {};

  for (const description of descriptions) {
    if (description.name === 'TypedArray') continue;
    const value: unknown = get(globalThis, description.name);
    if (typeof value === 'function') {
      originals.set(description.name, value);
      prototypes.set(description.name, value.prototype);
    } else {
      prototypes.set(
        description.name,
        Object.create(
          description.name === 'SharedArrayBuffer' ? Object.prototype : typedPrototype,
        ),
      );
    }
  }

  // Install a single public prototype per type. Local buffers call captured
  // QuickJS intrinsics; native views call the browser's branded operations.
  for (const description of descriptions) {
    const target = prototypes.get(description.name)!;
    const captured = new Map<PropertyKey, PropertyDescriptor>();
    for (const property of description.properties) {
      const original = getDescriptor(target, property.key);
      if (original) captured.set(property.key, original);
    }
    for (const property of description.properties) {
      const original = captured.get(property.key);
      const invoke = (
        kind: 'value' | 'get' | 'set',
        receiver: unknown,
        args: unknown[],
      ) => {
        if (
          description.name === 'ArrayBuffer' &&
          (property.key === 'transfer' || property.key === 'transferToFixedLength') &&
          receiver !== null &&
          (typeof receiver === 'object' || typeof receiver === 'function') &&
          hooks.nonTransferable(receiver)
        )
          throw new TypeError('WebAssembly memory buffers cannot be transferred');
        const method = original?.[kind];
        const mixedSet = property.key === 'set' && hooks.binaryKind(args[0]) === 'view';
        if (!hooks.binaryKind(receiver) && !mixedSet && typeof method === 'function')
          return apply(method, receiver, args);
        return native.invoke(description.name, property.key, kind, receiver, args);
      };
      if (property.method) {
        const method = {
          call(this: unknown, ...args: unknown[]) {
            return invoke('value', this, args);
          },
        }.call;
        define(target, property.key, {
          value: method,
          writable: true,
          configurable: true,
        });
      } else if (property.getter || property.setter) {
        define(target, property.key, {
          ...(property.getter
            ? {
                get: function (this: unknown) {
                  return invoke('get', this, []);
                },
              }
            : {}),
          ...(property.setter
            ? {
                set: function (this: unknown, value: unknown) {
                  invoke('set', this, [value]);
                },
              }
            : {}),
          configurable: true,
        });
      } else if (!original) {
        define(target, property.key, { value: property.value });
      }
    }
  }

  for (const description of descriptions) {
    const name = description.name;
    if (name === 'TypedArray') continue;
    const original = originals.get(name);
    const target =
      original ??
      function Binary() {
        throw new TypeError('Constructor requires new');
      };
    const publicPrototype = prototypes.get(name)!;
    if (!original) define(target, 'prototype', { value: publicPrototype });
    if (!original) {
      define(target, 'name', { value: name, configurable: true });
      define(target, 'length', { value: description.length ?? 1, configurable: true });
      if (description.bytes !== undefined)
        define(target, 'BYTES_PER_ELEMENT', { value: description.bytes });
      if (name !== 'SharedArrayBuffer')
        for (const key of ['from', 'of'])
          define(target, key, {
            value: {
              call(this: unknown, ...args: unknown[]) {
                return native.staticInvoke(name, key, this, args);
              },
            }.call,
            configurable: true,
            writable: true,
          });
    }
    const constructor = new Proxy(target, {
      construct(_target, args, newTarget) {
        const first = hooks.binaryKind(args[0]);
        const external =
          !original ||
          name === 'SharedArrayBuffer' ||
          first === 'buffer' ||
          first === 'view' ||
          (name === 'ArrayBuffer' && args[1] !== undefined);
        if (!external) return construct(original!, args, newTarget);
        const value = native.construct(name, args);
        const prototype = get(newTarget, 'prototype');
        if (prototype && typeof prototype === 'object') setPrototype(value, prototype);
        return value;
      },
    });
    define(publicPrototype, 'constructor', {
      value: constructor,
      writable: true,
      configurable: true,
    });
    aliases[name] = constructor;
    if (description.available)
      define(globalThis, name, {
        value: constructor,
        writable: true,
        configurable: true,
      });
    else
      define(globalThis, name, { value: undefined, writable: true, configurable: true });
  }
  define(localBuffer, 'isView', {
    value: (value: unknown) => localIsView(value) || hooks.binaryKind(value) === 'view',
    configurable: true,
    writable: true,
  });
  const atomics: Record<PropertyKey, unknown> = {};
  for (const key of native.atomicKeys())
    define(atomics, key, {
      value: {
        call(...args: unknown[]) {
          return native.atomic(key, args);
        },
      }.call,
      configurable: true,
      writable: true,
    });
  define(atomics, Symbol.toStringTag, { value: 'Atomics', configurable: true });
  define(globalThis, 'Atomics', { value: atomics, writable: true, configurable: true });
  return aliases;
}
