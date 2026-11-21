import { nativeBrand } from './native-brand.ts';
import type { EventRegistrationOptions } from './event-policy.ts';
import {
  NativePolicyError,
  type NativeContract,
  type NativeMemberRule,
} from './native-policy.ts';

interface AbortRegistrationOptions extends EventRegistrationOptions {
  /** Records producer identity without choosing a base EventTarget anchor. */
  registerTarget(value: object): void;
  listener(receiver: object, callback: unknown): unknown;
}
const apply = Reflect.apply;
const descriptor = Object.getOwnPropertyDescriptor;
const object = (value: unknown): value is object =>
  value !== null && (typeof value === 'object' || typeof value === 'function');
const contract = (
  id: string,
  result: NativeContract['result'] = 'data',
  callbacks: NativeContract['callbacks'] = 'none',
): NativeContract => ({ id, result, callbacks, effect: 'local-data' });

/** Native abort algorithms remain native. Only reviewed producers give a signal
 * whole-object ownership; a borrowed operation establishes only its receiver brand. */
export function registerAbortFamily(options: AbortRegistrationOptions) {
  const { registry, owned } = options;
  const controller: unknown = Reflect.get(options.global, 'AbortController');
  const signal: unknown = Reflect.get(options.global, 'AbortSignal');
  if (typeof controller !== 'function' || typeof signal !== 'function')
    throw new TypeError('Native abort declarations unavailable');
  const controllerPrototype: unknown = descriptor(controller, 'prototype')?.value;
  const signalPrototype: unknown = descriptor(signal, 'prototype')?.value;
  if (!object(controllerPrototype) || !object(signalPrototype))
    throw new TypeError('Native abort prototypes unavailable');
  const signalGetter = descriptor(controllerPrototype, 'signal')?.get;
  const abortedGetter = descriptor(signalPrototype, 'aborted')?.get;
  if (!signalGetter || !abortedGetter)
    throw new TypeError('Native abort brands unavailable');
  const isController = nativeBrand<object>(signalGetter);
  const isSignal = nativeBrand<object>(abortedGetter);
  const controllers = new WeakSet<object>();
  const signals = new WeakSet<object>();
  const handlers = new WeakMap<object, { original: unknown; wrapped: unknown }>();

  function produceSignal(value: unknown): object {
    if (!isSignal(value))
      throw new TypeError('Abort producer returned another native family');
    registry.admitObject(value, signalPrototype as object);
    signals.add(value);
    owned.add(value);
    options.registerTarget(value);
    return value;
  }
  const readNative = ({
    receiver,
    descriptor: captured,
  }: {
    receiver: object;
    descriptor: Readonly<PropertyDescriptor>;
  }) => (captured.get ? apply(captured.get, receiver, []) : captured.value);
  function attribute(
    owner: object,
    family: string,
    key: string,
    result: NativeContract['result'] = 'data',
  ): NativeMemberRule {
    const captured = descriptor(owner, key);
    if (!captured?.get) throw new TypeError(family + '.' + key + ' getter unavailable');
    options.captureCallableShape(family + '.' + key + '.get', captured.get);
    return {
      key,
      read: {
        contract: contract(family + '.' + key + '.get', result),
        read:
          key === 'signal'
            ? (operation) => produceSignal(readNative(operation))
            : readNative,
      },
    };
  }
  function method(owner: object, family: string, key: string): NativeMemberRule {
    const captured = descriptor(owner, key)?.value;
    if (typeof captured !== 'function')
      throw new TypeError(family + '.' + key + ' method unavailable');
    options.captureCallableShape(family + '.' + key, captured);
    options.captureMethod(captured, owner, key);
    return {
      key,
      call: {
        contract: contract(
          family + '.' + key,
          'none',
          key === 'abort' ? 'guest' : 'none',
        ),
        call: ({ target, receiver, arguments: args }) => apply(target, receiver, args),
      },
    };
  }
  function metadata(owner: object, family: string, key: PropertyKey): NativeMemberRule[] {
    if (!descriptor(owner, key)) return [];
    return [
      {
        key,
        read: {
          contract: contract(
            family + '.' + String(key),
            key === 'constructor'
              ? 'callable'
              : key === 'prototype'
                ? 'reference'
                : 'data',
          ),
          read: readNative,
        },
      },
    ];
  }
  registry.registerPrototype(controllerPrototype, {
    name: 'AbortController',
    accepts: (value) => value === controllerPrototype || isController(value),
    members: [
      ...metadata(controllerPrototype, 'AbortController', 'constructor'),
      ...metadata(controllerPrototype, 'AbortController', Symbol.toStringTag),
      attribute(controllerPrototype, 'AbortController', 'signal', 'reference'),
      method(controllerPrototype, 'AbortController', 'abort'),
    ],
  });
  const handler = descriptor(signalPrototype, 'onabort');
  if (!handler?.get || !handler.set)
    throw new TypeError('Native abort handler unavailable');
  const readHandler = handler.get,
    writeHandler = handler.set;
  options.captureCallableShape('AbortSignal.onabort.get', readHandler);
  options.captureCallableShape('AbortSignal.onabort.set', writeHandler);
  registry.registerPrototype(signalPrototype, {
    name: 'AbortSignal',
    accepts: (value) => value === signalPrototype || isSignal(value),
    members: [
      ...metadata(signalPrototype, 'AbortSignal', 'constructor'),
      ...metadata(signalPrototype, 'AbortSignal', Symbol.toStringTag),
      attribute(signalPrototype, 'AbortSignal', 'aborted'),
      attribute(signalPrototype, 'AbortSignal', 'reason', 'delegated'),
      method(signalPrototype, 'AbortSignal', 'throwIfAborted'),
      {
        key: 'onabort',
        read: {
          contract: contract('AbortSignal.onabort.get', 'delegated'),
          read({ receiver }) {
            const current: unknown = apply(readHandler, receiver, []);
            const known = handlers.get(receiver);
            if (known && current === known.wrapped) return known.original;
            if (current === null) return null;
            throw new NativePolicyError(
              'get',
              'AbortSignal',
              'onabort',
              'handler has no recorded owner',
            );
          },
        },
        write: {
          contract: contract('AbortSignal.onabort.set', 'none', 'guest'),
          write({ receiver, value }) {
            const wrapped =
              typeof value === 'function' ? options.listener(receiver, value) : value;
            apply(writeHandler, receiver, [wrapped]);
            const current: unknown = apply(readHandler, receiver, []);
            handlers.set(receiver, {
              original:
                typeof value === 'function' && current === wrapped ? value : current,
              wrapped: current,
            });
            options.addCleanup(() => {
              if (apply(readHandler, receiver, []) === current)
                apply(writeHandler, receiver, [null]);
            });
            return true;
          },
        },
      },
    ],
  });
  owned.add(controllerPrototype);
  owned.add(signalPrototype);
  for (const [name, ctor, prototype] of [
    ['AbortController', controller, controllerPrototype],
    ['AbortSignal', signal, signalPrototype],
  ] as const) {
    const token = registry.registerConstructor(ctor, {
      contract: contract(name + '.constructor', 'reference'),
      construct(target, args) {
        const value: object = Reflect.construct(target, args);
        // Native AbortSignal construction throws; retain that behavior.
        if (name === 'AbortSignal') return produceSignal(value);
        if (!isController(value)) throw new TypeError('Unexpected native controller');
        registry.admitObject(value, prototype);
        controllers.add(value);
        owned.add(value);
        return value;
      },
    });
    options.registerConstructor(ctor, token);
    const members = ['name', 'length', 'prototype'].flatMap((key) =>
      metadata(ctor, name, key),
    );
    if (name === 'AbortSignal')
      for (const key of ['abort', 'timeout', 'any']) {
        const captured = descriptor(ctor, key);
        if (!captured) continue;
        if (typeof captured.value !== 'function')
          throw new TypeError('Abort static method is not a data function');
        options.captureCallableShape('AbortSignal.' + key, captured.value);
        options.captureMethod(captured.value, ctor, key);
        members.push({
          key,
          call: {
            contract: contract('AbortSignal.' + key, 'reference', 'guest'),
            receiver: 'ignored',
            call: ({ target, arguments: args }) =>
              produceSignal(apply(target, undefined, args)),
          },
        });
      }
    registry.registerFacade(ctor, { name: name + ' constructor', members });
    owned.add(ctor);
  }
  return {
    admitReceiver(value: object): boolean {
      if (owned.has(value)) return true;
      if (isSignal(value)) {
        registry.admitObject(value, signalPrototype);
        return true;
      }
      if (isController(value)) {
        registry.admitObject(value, controllerPrototype);
        return true;
      }
      return false;
    },
    admitProduced(value: unknown): boolean {
      return (
        object(value) &&
        (signals.has(value) ||
          controllers.has(value) ||
          value === signalPrototype ||
          value === controllerPrototype)
      );
    },
  };
}
