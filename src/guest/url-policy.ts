import {
  NativePolicy,
  NativePolicyError,
  type NativeCallable,
  type NativeConstructor,
  type NativeContract,
  type NativeMemberRule,
  type NativeReadOperation,
  type NativeResult,
} from './native-policy.ts';
import type { GuestHost } from './protocol.ts';

export interface GuestURLPolicyOptions {
  URL: typeof URL;
  URLSearchParams: typeof URLSearchParams;
  createObjectURL(value: unknown): string;
  revokeObjectURL(value: string): void;
}
export interface GuestURLPolicy extends GuestHost {
  readonly URL: typeof URL;
  readonly URLSearchParams: typeof URLSearchParams;
  /** Admit only standalone URL values from this policy's supplied native realm. */
  admit(value: unknown): boolean;
}

const apply = Reflect.apply;
const construct = Reflect.construct;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const nativeString = String;
const object = (value: unknown): value is object =>
  value !== null && (typeof value === 'object' || typeof value === 'function');
const text = (value: unknown): string => {
  if (typeof value === 'symbol') throw new TypeError('A symbol is not a URL string');
  return nativeString(value);
};
const readNative = ({ receiver, descriptor }: NativeReadOperation): unknown =>
  descriptor.get ? apply(descriptor.get, receiver, []) : descriptor.value;

/** Standalone URL parsing/manipulation is local. Object-URL registration is
 * supplied by the resource owner; URL values do not grant navigation authority. */
export function createGuestURLPolicy(options: GuestURLPolicyOptions): GuestURLPolicy {
  const registry = new NativePolicy();
  const nativeURL = options.URL;
  const nativeParams = options.URLSearchParams;
  const urlPrototype = nativeURL.prototype;
  const paramsPrototype = nativeParams.prototype;
  const objectPrototype = prototype(urlPrototype);
  const functionPrototype = prototype(nativeURL);
  const href = descriptor(urlPrototype, 'href')?.get;
  const size = descriptor(paramsPrototype, 'size')?.get;
  const paramsText = descriptor(paramsPrototype, 'toString')?.value;
  if (!href || typeof paramsText !== 'function')
    throw new TypeError('Required native URL brands are unavailable');

  const owned = new WeakSet<object>([
    nativeURL,
    nativeParams,
    urlPrototype,
    paramsPrototype,
  ]);
  const otherBrands = new WeakSet<object>();
  const iteratorPrototypes = new Set<object>();
  const iteratorContracts = new Set<string>();
  const wrappers = new WeakMap<NativeCallable, Function>();
  const wrapperTokens = new WeakMap<Function, NativeCallable>();
  const wrapperDescriptors = new WeakMap<
    Function,
    ReadonlyMap<PropertyKey, PropertyDescriptor>
  >();
  const constructors = new Map<Function, NativeConstructor>();
  const constructorTargets = new Map<NativeConstructor, Function>();
  const metadata = new Map<string, { name: string; length: number }>();
  const knownAbsent = new WeakMap<object, Set<PropertyKey>>();

  function contract(
    id: string,
    result: NativeContract['result'] = 'data',
    callbacks: NativeContract['callbacks'] = 'none',
    effect: NativeContract['effect'] = 'local-data',
  ): NativeContract {
    return { id, result, callbacks, effect };
  }

  function branded(value: unknown, getter: Function): boolean {
    if (!object(value)) return false;
    try {
      apply(getter, value, []);
      return true;
    } catch {
      return false;
    }
  }

  function admit(value: unknown): boolean {
    if (!object(value)) return false;
    if (owned.has(value)) return true;
    if (!branded(value, href!) && !branded(value, size ?? paramsText)) return false;
    if (prototype(value) !== urlPrototype && prototype(value) !== paramsPrototype)
      throw new NativePolicyError(
        'admit',
        'URL',
        undefined,
        'value belongs to another native realm or prototype',
      );
    registry.admitObject(value);
    owned.add(value);
    return true;
  }

  function ensure(target: object): void {
    if (!admit(target))
      throw new NativePolicyError(
        'access',
        'URL',
        undefined,
        'unclassified native object',
      );
  }

  function metadataFor(id: string, target: Function): void {
    const name: unknown = descriptor(target, 'name')?.value;
    const length: unknown = descriptor(target, 'length')?.value;
    metadata.set(id, {
      name: typeof name === 'string' ? name : '',
      length: typeof length === 'number' ? length : 0,
    });
  }

  function unwrap(result: NativeResult): unknown {
    if (result.kind === 'constructor') {
      const target = constructorTargets.get(result.construct);
      if (!target) throw new TypeError('URL constructor token has no owner');
      return target;
    }
    if (result.kind === 'callable') {
      let wrapper = wrappers.get(result.callable);
      if (!wrapper) {
        const token = result.callable;
        wrapper = {
          invoke(this: unknown, ...args: unknown[]) {
            return unwrap(registry.call(token, this, args));
          },
        }.invoke;
        const shape = metadata.get(token.contract.id);
        if (shape) {
          Object.defineProperty(wrapper, 'name', {
            value: shape.name,
            configurable: true,
          });
          Object.defineProperty(wrapper, 'length', {
            value: shape.length,
            configurable: true,
          });
        }
        wrapperDescriptors.set(
          wrapper,
          new Map(
            ['name', 'length'].map((key) => [
              key,
              Object.freeze({ ...descriptor(wrapper!, key) }),
            ]),
          ),
        );
        wrappers.set(token, wrapper);
        wrapperTokens.set(wrapper, token);
        owned.add(wrapper);
      }
      return wrapper;
    }
    const value = result.value;
    if (result.contract.result === 'reference' && object(value) && !owned.has(value)) {
      if (
        iteratorContracts.has(result.contract.id) &&
        iteratorPrototypes.has(prototype(value))
      ) {
        registry.admitObject(value);
        owned.add(value);
      } else if (!admit(value)) {
        throw new NativePolicyError(
          'return',
          result.contract.id,
          undefined,
          'unexpected reference result',
        );
      }
    }
    return value;
  }

  const absent = (owner: object, key: PropertyKey) => {
    let keys = knownAbsent.get(owner);
    if (!keys) knownAbsent.set(owner, (keys = new Set()));
    keys.add(key);
  };
  function member(owner: object, key: PropertyKey): PropertyDescriptor | undefined {
    const captured = descriptor(owner, key);
    if (!captured) absent(owner, key);
    return captured;
  }
  function dataMember(
    owner: object,
    family: string,
    key: PropertyKey,
    result: NativeContract['result'] = 'data',
  ): NativeMemberRule[] {
    const captured = member(owner, key);
    if (!captured) return [];
    if (!('value' in captured))
      throw new TypeError('URL data member has an accessor: ' + String(key));
    return [
      {
        key,
        read: {
          contract: contract(`${family}.${String(key)}`, result),
          read: readNative,
        },
      },
    ];
  }
  function accessor(key: string): NativeMemberRule[] {
    const captured = member(urlPrototype, key);
    if (!captured) return [];
    if (!captured.get) throw new TypeError('URL attribute has no native getter: ' + key);
    const getContract = contract(
      `URL.${key}.get`,
      key === 'searchParams' ? 'reference' : 'data',
    );
    metadataFor(getContract.id, captured.get);
    const rule: NativeMemberRule = {
      key,
      read: { contract: getContract, read: readNative },
      ...(captured.set
        ? {
            write: {
              contract: contract(`URL.${key}.set`, 'none'),
              write: ({ receiver, value, descriptor }) => {
                apply(descriptor.set!, receiver, [value]);
                return true;
              },
            },
          }
        : {}),
    };
    if (captured.set) metadataFor(`URL.${key}.set`, captured.set);
    return [rule];
  }

  const callNative = ({
    target,
    receiver,
    arguments: args,
  }: {
    target: Function;
    receiver: unknown;
    arguments: readonly unknown[];
  }) => apply(target, receiver, args);
  function method(
    owner: object,
    family: string,
    key: PropertyKey,
    result: NativeContract['result'] = 'data',
    callbacks: NativeContract['callbacks'] = 'none',
    canonical?: string,
  ): NativeMemberRule[] {
    const captured = member(owner, key);
    if (!captured) return [];
    if (typeof captured.value !== 'function')
      throw new TypeError('URL method is not a native function: ' + String(key));
    const id = canonical ?? `${family}.${String(key)}`;
    metadataFor(id, captured.value);
    if (result === 'reference') iteratorContracts.add(id);
    return [
      { key, call: { contract: contract(id, result, callbacks), call: callNative } },
    ];
  }

  registry.registerPrototype(urlPrototype, {
    name: 'URL',
    accepts: (value) => value === urlPrototype || branded(value, href),
    members: [
      ...dataMember(urlPrototype, 'URL', 'constructor', 'callable'),
      ...dataMember(urlPrototype, 'URL', Symbol.toStringTag),
      ...[
        'href',
        'origin',
        'protocol',
        'username',
        'password',
        'host',
        'hostname',
        'port',
        'pathname',
        'search',
        'searchParams',
        'hash',
      ].flatMap(accessor),
      ...method(urlPrototype, 'URL', 'toString'),
      ...method(urlPrototype, 'URL', 'toJSON'),
    ],
  });
  const paramsMethods = [
    'append',
    'delete',
    'get',
    'getAll',
    'has',
    'set',
    'sort',
    'toString',
  ];
  const entries = descriptor(paramsPrototype, 'entries')?.value;
  const iterator = descriptor(paramsPrototype, Symbol.iterator)?.value;
  registry.registerPrototype(paramsPrototype, {
    name: 'URLSearchParams',
    accepts: (value) => value === paramsPrototype || branded(value, size ?? paramsText),
    members: [
      ...dataMember(paramsPrototype, 'URLSearchParams', 'constructor', 'callable'),
      ...dataMember(paramsPrototype, 'URLSearchParams', Symbol.toStringTag),
      ...(size
        ? [
            {
              key: 'size',
              read: { contract: contract('URLSearchParams.size.get'), read: readNative },
            },
          ]
        : []),
      ...paramsMethods.flatMap((key) => method(paramsPrototype, 'URLSearchParams', key)),
      ...method(paramsPrototype, 'URLSearchParams', 'forEach', 'none', 'guest'),
      ...['entries', 'keys', 'values'].flatMap((key) =>
        method(paramsPrototype, 'URLSearchParams', key, 'reference'),
      ),
      ...method(
        paramsPrototype,
        'URLSearchParams',
        Symbol.iterator,
        'reference',
        'none',
        iterator === entries ? 'URLSearchParams.entries' : undefined,
      ),
    ],
  });
  if (size) metadataFor('URLSearchParams.size.get', size);

  // Capture the standard iterator family using a fresh empty native parameter list.
  // This is trusted setup, never a probe of an application-selected iterator.
  if (typeof entries !== 'function')
    throw new TypeError('URLSearchParams iteration is unavailable');
  const iteratorPrototype = prototype(apply(entries, construct(nativeParams, []), []));
  const iteratorBase = prototype(iteratorPrototype);
  registry.registerPrototype(iteratorBase, {
    name: 'URLSearchParams iterator base',
    members: [
      ...method(iteratorBase, 'URLSearchParamsIterator', Symbol.iterator, 'reference'),
    ],
  });
  registry.registerPrototype(iteratorPrototype, {
    name: 'URLSearchParams iterator',
    members: [
      ...method(iteratorPrototype, 'URLSearchParamsIterator', 'next'),
      ...dataMember(iteratorPrototype, 'URLSearchParamsIterator', Symbol.toStringTag),
    ],
  });
  // The shared Iterator prototype also belongs to other native families. Expose
  // a private boundary object so this domain never claims that shared object.
  const iteratorBoundary: object = Object.create(iteratorBase);
  registry.admitObject(iteratorBoundary);
  owned.add(iteratorBoundary);
  owned.add(iteratorPrototype);
  iteratorPrototypes.add(iteratorPrototype);

  for (const [family, target] of [
    ['URL', nativeURL],
    ['URLSearchParams', nativeParams],
  ] as const) {
    const token = registry.registerConstructor(target, {
      contract: contract(`${family}.constructor`, 'reference'),
      construct: (constructor, args) => construct(constructor, args),
    });
    constructors.set(target, token);
    constructorTargets.set(token, target);
    const members = ['name', 'length'].flatMap((key) => dataMember(target, family, key));
    members.push(...dataMember(target, family, 'prototype', 'reference'));
    if (target === nativeURL) {
      for (const key of ['canParse', 'parse'] as const) {
        const captured = member(target, key);
        if (!captured) continue;
        if (typeof captured.value !== 'function')
          throw new TypeError('URL static method is not callable');
        metadataFor(`URL.${key}`, captured.value);
        members.push({
          key,
          call: {
            contract: contract(`URL.${key}`, key === 'parse' ? 'reference' : 'data'),
            receiver: 'ignored',
            call: callNative,
          },
        });
      }
      for (const key of ['createObjectURL', 'revokeObjectURL'] as const) {
        const captured = member(target, key);
        if (!captured) continue;
        if (typeof captured.value !== 'function')
          throw new TypeError('URL object resource method is not callable');
        metadataFor(`URL.${key}`, captured.value);
        members.push({
          key,
          call: {
            contract: contract(
              `URL.${key}`,
              key === 'createObjectURL' ? 'data' : 'none',
              'none',
              'local-resource',
            ),
            receiver: 'ignored',
            call: ({ arguments: args }) => {
              if (!args.length) throw new TypeError('Missing object URL argument');
              if (key === 'createObjectURL') return options.createObjectURL(args[0]);
              return options.revokeObjectURL(text(args[0]));
            },
          },
        });
      }
    }
    registry.registerFacade(target, { name: family + ' constructor', members });
  }

  return {
    URL: nativeURL,
    URLSearchParams: nativeParams,
    admit,
    owns(target) {
      if (owned.has(target)) return true;
      // Native URL slots cannot be acquired by changing a prototype. Remember
      // other brands without repeating throwing native brand checks per access.
      // Private wrappers admitted later still win through the owned check above.
      if (otherBrands.has(target)) return false;
      if (branded(target, href) || branded(target, size ?? paramsText)) return true;
      otherBrands.add(target);
      return false;
    },
    get(target, key) {
      ensure(target);
      if (wrapperTokens.has(target as Function)) {
        if (key === 'name' || key === 'length')
          return wrapperDescriptors.get(target as Function)?.get(key)?.value;
        if (!Reflect.has(target, key)) return undefined;
        throw new NativePolicyError(
          'get',
          'URL callable',
          key,
          'unreviewed callable member',
        );
      }
      const physical = target === iteratorBoundary ? iteratorBase : target;
      if (knownAbsent.get(physical)?.has(key) || !Reflect.has(physical, key))
        return undefined;
      return unwrap(registry.read(physical, key));
    },
    set(target, key, value) {
      ensure(target);
      if (wrapperTokens.has(target as Function)) return false;
      return registry.write(target, key, value);
    },
    call(target, receiver, args) {
      const token = wrapperTokens.get(target);
      if (constructors.has(target)) throw new TypeError('URL constructors require new');
      if (!token)
        throw new NativePolicyError('call', 'URL', undefined, 'unregistered callable');
      if (object(receiver)) admit(receiver);
      return unwrap(registry.call(token, receiver, args));
    },
    construct(target, args) {
      const token = constructors.get(target);
      if (!token)
        throw new NativePolicyError(
          'construct',
          'URL',
          undefined,
          'unregistered constructor',
        );
      const value = unwrap(registry.construct(token, args));
      if (!object(value)) throw new TypeError('URL constructor returned no object');
      return value;
    },
    delete: () => false,
    settable: () => false,
    ownKeys(target) {
      ensure(target);
      return wrapperTokens.has(target as Function)
        ? Reflect.ownKeys(target).filter((key) => key === 'name' || key === 'length')
        : registry
            .keys(target === iteratorBoundary ? iteratorBase : target)
            .map((key) => (typeof key === 'number' ? String(key) : key));
    },
    descriptor(target, key) {
      ensure(target);
      if (wrapperTokens.has(target as Function))
        return key === 'name' || key === 'length'
          ? wrapperDescriptors.get(target as Function)?.get(key)
          : undefined;
      const result = registry.descriptor(
        target === iteratorBoundary ? iteratorBase : target,
        key,
      );
      if (!result) return;
      return {
        configurable: result.configurable,
        enumerable: result.enumerable,
        ...('value' in result
          ? { writable: result.writable, value: unwrap(result.value!) }
          : {
              get: result.get
                ? (unwrap({ kind: 'callable', callable: result.get }) as () => unknown)
                : undefined,
              set: result.set
                ? (unwrap({ kind: 'callable', callable: result.set }) as (
                    value: unknown,
                  ) => void)
                : undefined,
            }),
      };
    },
    prototype(target) {
      ensure(target);
      if (constructors.has(target as Function) || wrapperTokens.has(target as Function))
        return functionPrototype;
      if (
        target === urlPrototype ||
        target === paramsPrototype ||
        target === iteratorBoundary
      )
        return objectPrototype;
      if (target === iteratorPrototype) return iteratorBoundary;
      return registry.prototype(target);
    },
  };
}
