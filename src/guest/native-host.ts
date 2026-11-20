import {
  NativePolicy,
  NativePolicyError,
  type NativeCallable,
  type NativeConstructor,
  type NativeContract,
  type NativeResult,
} from './native-policy.ts';
import type { GuestHost } from './protocol.ts';

export interface NativeHostOptions {
  name: string;
  registry: NativePolicy;
  owns(target: object): boolean;
  /** Classify only reviewed native producers/brands; never invoke unknown getters. */
  admit(target: object): boolean;
  /** Admit reference results according to this family's semantic contracts. */
  result(value: unknown, contract: NativeContract): unknown;
  prototype(target: object): object | null;
  functionPrototype: object;
  /** Translate a private prototype boundary to its reviewed physical declaration. */
  propertyTarget?(target: object): object;
  isAbsent?(target: object, key: PropertyKey): boolean;
  /** Reviewed families can avoid traversing untrusted physical prototype chains. */
  hasProperty?(target: object, key: PropertyKey): boolean;
  /** Trusted adapters may associate argument decoding with the exposed identity. */
  callablePublished?(target: Function, contract: NativeContract): void;
}
export interface NativeHost extends GuestHost {
  captureCallableShape(id: string, target: Function): void;
  registerConstructor(target: Function, token: NativeConstructor): void;
  /** The trusted producer retains this exact native identity (for example a funcref). */
  registerCallable(target: Function, token: NativeCallable): void;
}

const descriptor = Object.getOwnPropertyDescriptor;
const object = (value: unknown): value is object =>
  value !== null && (typeof value === 'object' || typeof value === 'function');

/** Converts private NativePolicy tokens into stable GuestHost values. This codec
 * grants no member authority: registration, brands and result admission belong to
 * the supplied reviewed family. Its wrappers never expose native callable tokens. */
export function createNativeHost(options: NativeHostOptions): NativeHost {
  const { registry, name } = options;
  const wrappers = new WeakMap<NativeCallable, Function>();
  const tokens = new WeakMap<Function, NativeCallable>();
  const shapes = new Map<string, { name: string; length: number }>();
  const wrapperDescriptors = new WeakMap<
    Function,
    ReadonlyMap<PropertyKey, PropertyDescriptor>
  >();
  const constructors = new Map<Function, NativeConstructor>();
  const constructorTargets = new Map<NativeConstructor, Function>();
  const constructorCalls = new WeakMap<Function, NativeCallable>();
  const isWrapper = (target: object) =>
    typeof target === 'function' && tokens.has(target);
  const isConstructor = (target: object) =>
    typeof target === 'function' && constructors.has(target);
  const physical = (target: object) => options.propertyTarget?.(target) ?? target;

  const has = (target: object, key: PropertyKey) =>
    options.hasProperty?.(target, key) ?? Reflect.has(target, key);

  function ensure(target: object): void {
    if (!isWrapper(target) && !isConstructor(target) && !options.admit(target))
      throw new NativePolicyError(
        'access',
        name,
        undefined,
        'unclassified native object',
      );
  }
  function publish(target: Function, token: NativeCallable): void {
    if (tokens.has(target) || wrappers.has(token))
      throw new TypeError('Callable already belongs to ' + name);
    const metadata = new Map<PropertyKey, PropertyDescriptor>();
    for (const key of ['name', 'length']) {
      const captured = descriptor(target, key);
      if (
        !captured ||
        !('value' in captured) ||
        typeof captured.value !== (key === 'name' ? 'string' : 'number')
      )
        throw new NativePolicyError(
          'publish',
          name + ' callable',
          key,
          'metadata is not a native data descriptor',
        );
      metadata.set(key, Object.freeze({ ...captured }));
    }
    wrapperDescriptors.set(target, metadata);
    tokens.set(target, token);
    wrappers.set(token, target);
    options.callablePublished?.(target, token.contract);
  }
  function unwrap(result: NativeResult): unknown {
    if (result.kind === 'constructor') {
      const target = constructorTargets.get(result.construct);
      if (!target) throw new TypeError(name + ' constructor token has no owner');
      return target;
    }
    if (result.kind === 'value') return options.result(result.value, result.contract);
    if (result.construct) {
      const target = constructorTargets.get(result.construct);
      if (!target) throw new TypeError(name + ' callable constructor has no owner');
      const previous = constructorCalls.get(target);
      if (previous && previous !== result.callable)
        throw new TypeError(name + ' constructor has multiple call contracts');
      if (!previous) {
        constructorCalls.set(target, result.callable);
        options.callablePublished?.(target, result.callable.contract);
      }
      return target;
    }
    let wrapper = wrappers.get(result.callable);
    if (!wrapper) {
      const token = result.callable;
      wrapper = {
        invoke(this: unknown, ...args: unknown[]) {
          if (object(this)) options.admit(this);
          return unwrap(registry.call(token, this, args));
        },
      }.invoke;
      const shape = shapes.get(token.contract.id);
      if (shape) {
        Object.defineProperty(wrapper, 'name', { value: shape.name, configurable: true });
        Object.defineProperty(wrapper, 'length', {
          value: shape.length,
          configurable: true,
        });
      }
      publish(wrapper, token);
    }
    return wrapper;
  }

  return {
    registerCallable: publish,
    captureCallableShape(id, target) {
      const name: unknown = descriptor(target, 'name')?.value;
      const length: unknown = descriptor(target, 'length')?.value;
      shapes.set(id, {
        name: typeof name === 'string' ? name : '',
        length: typeof length === 'number' ? length : 0,
      });
    },
    registerConstructor(target, token) {
      if (constructors.has(target) || constructorTargets.has(token))
        throw new TypeError('Constructor already belongs to ' + name);
      constructors.set(target, token);
      constructorTargets.set(token, target);
    },
    owns(target) {
      return isWrapper(target) || isConstructor(target) || options.owns(target);
    },
    get(target, key) {
      ensure(target);
      if (isWrapper(target)) {
        if (key === 'name' || key === 'length')
          return wrapperDescriptors.get(target as Function)?.get(key)?.value;
        if (!has(target, key)) return undefined;
        throw new NativePolicyError(
          'get',
          name + ' callable',
          key,
          'unreviewed callable member',
        );
      }
      const owner = physical(target);
      if (options.isAbsent?.(owner, key) || !has(owner, key)) return undefined;
      return unwrap(registry.read(owner, key));
    },
    set(target, key, value) {
      ensure(target);
      return isWrapper(target) ? false : registry.write(target, key, value);
    },
    call(target, receiver, args) {
      const token = constructors.has(target)
        ? constructorCalls.get(target)
        : tokens.get(target);
      if (constructors.has(target) && !token)
        throw new TypeError(name + ' constructors require new');
      if (!token)
        throw new NativePolicyError('call', name, undefined, 'unregistered callable');
      if (object(receiver)) options.admit(receiver);
      return unwrap(registry.call(token, receiver, args));
    },
    construct(target, args) {
      const token = constructors.get(target);
      if (!token)
        throw new NativePolicyError(
          'construct',
          name,
          undefined,
          'unregistered constructor',
        );
      const value = unwrap(registry.construct(token, args));
      if (!object(value)) throw new TypeError(name + ' constructor returned no object');
      return value;
    },
    delete: () => false,
    settable: () => false,
    ownKeys(target) {
      ensure(target);
      return isWrapper(target)
        ? Reflect.ownKeys(target).filter((key) => key === 'name' || key === 'length')
        : registry
            .keys(physical(target))
            .map((key) => (typeof key === 'number' ? String(key) : key));
    },
    descriptor(target, key) {
      ensure(target);
      if (isWrapper(target))
        return key === 'name' || key === 'length'
          ? wrapperDescriptors.get(target as Function)?.get(key)
          : undefined;
      const result = registry.descriptor(physical(target), key);
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
      return isWrapper(target) || isConstructor(target)
        ? options.functionPrototype
        : options.prototype(target);
    },
  };
}
