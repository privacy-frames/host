import { captureEventListenerArguments } from './event-listener-arguments.ts';
import { nativeBrand } from './native-brand.ts';
import {
  NativePolicy,
  NativePolicyError,
  type NativeConstructor,
  type NativeContract,
  type NativeMemberRule,
  type NativeReadOperation,
} from './native-policy.ts';

export interface EventFamilyOptions {
  isGuestValue(value: object): boolean;
  recognizesCallable(value: unknown): value is Function;
  call(callback: Function, receiver: unknown, args: readonly unknown[]): unknown;
  property(value: object, key: PropertyKey): unknown;
  /** Private document/window provenance, not a public brand or URL assertion. */
  isTargetReceiver(value: object): boolean;
  addCleanup(cleanup: () => void): void;
  dispatch(target: Function, receiver: unknown, args: readonly unknown[]): unknown;
  isWindowMessage(value: object): boolean;
}

export interface EventRegistrationOptions extends EventFamilyOptions {
  global: object;
  registry: NativePolicy;
  owned: WeakSet<object>;
  captureCallableShape(id: string, target: Function): void;
  registerConstructor(target: Function, token: NativeConstructor): void;
  captureMethod(target: Function, owner: object, key: PropertyKey): void;
}

interface EventDeclaration {
  name: string;
  prototype: object;
  accepts(value: unknown): value is object;
}

const apply = Reflect.apply;
const construct = Reflect.construct;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const object = (value: unknown): value is object =>
  value !== null && (typeof value === 'object' || typeof value === 'function');
const readNative = ({ receiver, descriptor }: NativeReadOperation): unknown =>
  descriptor.get ? apply(descriptor.get, receiver, []) : descriptor.value;
const contract = (
  id: string,
  result: NativeContract['result'] = 'data',
  callbacks: NativeContract['callbacks'] = 'none',
): NativeContract => ({ id, result, callbacks, effect: 'local-data' });

/** Explicit local event declarations. Other event subclasses and DOM families
 * retain their existing browser owner until their own contracts are supplied. */
export function registerEventFamily(options: EventRegistrationOptions) {
  const { registry, owned } = options;
  const targets = new WeakSet<object>();
  const events = new WeakSet<object>();
  const declarations = new Map<object, EventDeclaration>();
  const listeners = new WeakMap<object, WeakMap<object, EventListener>>();

  function constructor(
    name: string,
  ): { target: Function; prototype: object } | undefined {
    const target: unknown = Reflect.get(options.global, name);
    if (target === undefined) return;
    if (typeof target !== 'function') throw new TypeError(name + ' is not a constructor');
    const value: unknown = descriptor(target, 'prototype')?.value;
    if (!object(value)) throw new TypeError(name + ' has no native prototype');
    return { target, prototype: value };
  }
  const event = constructor('Event');
  const target = constructor('EventTarget');
  if (!event || !target) throw new TypeError('Native event declarations unavailable');
  const eventType = descriptor(event.prototype, 'type')?.get;
  if (!eventType) throw new TypeError('Native Event brand unavailable');
  const isEvent = nativeBrand<object>(eventType);
  const removeListener = descriptor(target.prototype, 'removeEventListener')?.value;
  if (typeof removeListener !== 'function')
    throw new TypeError('Native listener removal unavailable');

  const acceptsTarget = (value: object) =>
    targets.has(value) || options.isTargetReceiver(value);

  function admitEvent(value: unknown): boolean {
    if (!object(value)) return false;
    if (events.has(value)) return true;
    const declaration = declarations.get(prototype(value));
    if (!declaration || !declaration.accepts(value)) return false;
    registry.admitObject(value, declaration.prototype);
    const trusted = descriptor(value, 'isTrusted');
    if (trusted) {
      if (!trusted.get || trusted.set || 'value' in trusted)
        throw new NativePolicyError(
          'admit',
          declaration.name,
          'isTrusted',
          'unexpected own event descriptor',
        );
      const id = 'Event.isTrusted.get';
      options.captureCallableShape(id, trusted.get);
      registry.registerFacade(value, {
        name: declaration.name + ' instance',
        members: [
          { key: 'isTrusted', read: { contract: contract(id), read: readEvent } },
        ],
      });
    }
    events.add(value);
    owned.add(value);
    return true;
  }

  function admitReceiver(value: object): boolean {
    if (owned.has(value)) return true;
    if (isEvent(value)) {
      // This establishes only the Event base operations for a borrowed method.
      // No event-subclass or whole-object ownership follows from this anchor.
      const selected = declarations.get(prototype(value));
      registry.admitObject(value, selected?.prototype ?? event!.prototype);
      return true;
    }
    if (!acceptsTarget(value)) return false;
    registry.admitObject(value, target!.prototype);
    return true;
  }

  function listener(receiver: object, callback: unknown): unknown {
    if (callback === null || callback === undefined || !object(callback)) return callback;
    if (
      typeof callback === 'function'
        ? !options.recognizesCallable(callback)
        : !options.isGuestValue(callback)
    )
      throw new TypeError('Event listener has no recorded callback owner');
    let callbacks = listeners.get(receiver);
    if (!callbacks) listeners.set(receiver, (callbacks = new WeakMap()));
    let wrapped = callbacks.get(callback);
    if (!wrapped) {
      wrapped = function (this: EventTarget, event: Event) {
        if (!acceptsTarget(receiver)) return;
        if (
          typeof callback === 'function'
            ? !options.recognizesCallable(callback)
            : !options.isGuestValue(callback)
        )
          return;
        // A reviewed native delivery is a producer for the selected event types.
        // A MouseEvent or another unregistered subclass remains unclaimed.
        admitEvent(event);
        if (typeof callback === 'function') return options.call(callback, this, [event]);
        const handle = options.property(callback, 'handleEvent');
        if (!options.isGuestValue(callback)) return;
        if (!options.recognizesCallable(handle))
          throw new TypeError('Event listener handleEvent has no callable owner');
        return options.call(handle, callback, [event]);
      };
      callbacks.set(callback, wrapped);
    }
    return wrapped;
  }

  function readEvent(operation: NativeReadOperation): unknown {
    if (operation.key === 'isTrusted' && options.isWindowMessage(operation.receiver))
      return true;
    return readNative(operation);
  }

  function data(owner: object, family: string, key: PropertyKey): NativeMemberRule[] {
    const captured = descriptor(owner, key);
    if (!captured) return [];
    if (!('value' in captured)) throw new TypeError('Event constant is an accessor');
    return [
      { key, read: { contract: contract(family + '.' + String(key)), read: readNative } },
    ];
  }

  function attribute(
    owner: object,
    family: string,
    key: string,
    result: NativeContract['result'] = 'data',
    writable = false,
  ): NativeMemberRule[] {
    const captured = descriptor(owner, key);
    if (!captured) return [];
    if (!captured.get) throw new TypeError('Event attribute has no native getter');
    const id = family + '.' + key;
    options.captureCallableShape(id + '.get', captured.get);
    if (writable && captured.set) options.captureCallableShape(id + '.set', captured.set);
    return [
      {
        key,
        read: { contract: contract(id + '.get', result), read: readEvent },
        ...(writable && captured.set
          ? {
              write: {
                contract: contract(id + '.set', 'none'),
                write: ({ receiver, value, descriptor }) => {
                  apply(descriptor.set!, receiver, [value]);
                  return true;
                },
              },
            }
          : {}),
      },
    ];
  }

  function method(
    owner: object,
    family: string,
    key: string,
    result: NativeContract['result'] = 'data',
  ): NativeMemberRule[] {
    const captured = descriptor(owner, key);
    if (!captured) return [];
    if (typeof captured.value !== 'function')
      throw new TypeError('Event method is not callable');
    const id = family + '.' + key;
    options.captureCallableShape(id, captured.value);
    options.captureMethod(captured.value, owner, key);
    return [
      {
        key,
        call: {
          contract: {
            ...contract(id, result, family === 'EventTarget' ? 'guest' : 'none'),
            effect: key === 'dispatchEvent' ? 'local-rendering' : 'local-data',
          },
          call({ target: native, receiver, arguments: args }) {
            if (family !== 'EventTarget') return apply(native, receiver, args);
            if (!object(receiver) || !acceptsTarget(receiver))
              throw new TypeError('EventTarget receiver is not prepared');
            if (key === 'dispatchEvent') return options.dispatch(native, receiver, args);
            const forwarded = [...args];
            if (args.length > 1) forwarded[1] = listener(receiver, args[1]);
            const converted = captureEventListenerArguments(forwarded);
            const value: unknown = apply(native, receiver, converted.arguments);
            if (key === 'addEventListener') {
              const cleanup = converted.cleanup();
              options.addCleanup(() => apply(removeListener, receiver, cleanup));
            }
            return value;
          },
        },
      },
    ];
  }

  function registerConstructor(
    name: string,
    native: Function,
    members: NativeMemberRule[],
  ) {
    const token = registry.registerConstructor(native, {
      contract: contract(name + '.constructor', 'reference'),
      construct(constructor, args) {
        const value: object = construct(constructor, args);
        if (name === 'EventTarget') targets.add(value);
        return value;
      },
    });
    options.registerConstructor(native, token);
    registry.registerFacade(native, {
      name: name + ' constructor',
      members: [
        ...['name', 'length'].flatMap((key) => data(native, name, key)),
        {
          key: 'prototype',
          read: {
            contract: contract(name + '.prototype', 'reference'),
            read: readNative,
          },
        },
        ...members,
      ],
    });
    owned.add(native);
  }

  registry.registerPrototype(target.prototype, {
    name: 'EventTarget',
    accepts: (value) => value === target.prototype || acceptsTarget(value),
    members: [
      {
        key: 'constructor',
        read: {
          contract: contract('EventTarget.constructor', 'callable'),
          read: readNative,
        },
      },
      ...data(target.prototype, 'EventTarget', Symbol.toStringTag),
      ...method(target.prototype, 'EventTarget', 'addEventListener', 'none'),
      ...method(target.prototype, 'EventTarget', 'removeEventListener', 'none'),
      ...method(target.prototype, 'EventTarget', 'dispatchEvent'),
    ],
  });
  owned.add(target.prototype);
  registerConstructor('EventTarget', target.target, []);

  const constants = ['NONE', 'CAPTURING_PHASE', 'AT_TARGET', 'BUBBLING_PHASE'];
  for (const [name, attributes, methods] of [
    [
      'Event',
      [
        'type',
        'target',
        'currentTarget',
        'srcElement',
        'eventPhase',
        'bubbles',
        'cancelable',
        'defaultPrevented',
        'composed',
        'isTrusted',
        'timeStamp',
        'cancelBubble',
        'returnValue',
      ],
      [
        'preventDefault',
        'stopPropagation',
        'stopImmediatePropagation',
        'composedPath',
        'initEvent',
      ],
    ],
    ['CustomEvent', ['detail'], ['initCustomEvent']],
    [
      'MessageEvent',
      ['data', 'origin', 'lastEventId', 'source', 'ports'],
      ['initMessageEvent'],
    ],
  ] as const) {
    const native = constructor(name);
    if (!native) continue;
    const probe =
      name === 'Event' ? eventType : descriptor(native.prototype, attributes[0])?.get;
    if (!probe) throw new TypeError(name + ' brand unavailable');
    const brand = nativeBrand<object>(probe);
    declarations.set(native.prototype, {
      name,
      prototype: native.prototype,
      accepts: brand,
    });
    registry.registerPrototype(native.prototype, {
      name,
      accepts: (value) => value === native.prototype || brand(value),
      members: [
        {
          key: 'constructor',
          read: {
            contract: contract(name + '.constructor', 'callable'),
            read: readNative,
          },
        },
        ...data(native.prototype, name, Symbol.toStringTag),
        ...constants.flatMap((key) => data(native.prototype, name, key)),
        ...attributes.flatMap((key) =>
          attribute(
            native.prototype,
            name,
            key,
            [
              'target',
              'currentTarget',
              'srcElement',
              'detail',
              'data',
              'source',
              'ports',
            ].includes(key)
              ? 'delegated'
              : 'data',
            key === 'cancelBubble' || key === 'returnValue',
          ),
        ),
        ...methods.flatMap((key) =>
          method(
            native.prototype,
            name,
            key,
            key === 'composedPath' ? 'delegated' : 'none',
          ),
        ),
      ],
    });
    owned.add(native.prototype);
    registerConstructor(
      name,
      native.target,
      constants.flatMap((key) => data(native.target, name, key)),
    );
  }

  return {
    /** Trusted family producers call this only after choosing their full lineage. */
    registerTarget(value: object): void {
      targets.add(value);
    },
    listener,
    admitEvent,
    admitReceiver,
    methodReceiver(owner: object, receiver: object): boolean {
      return (
        owner !== target.prototype ||
        receiver === target.prototype ||
        acceptsTarget(receiver)
      );
    },
    admitProduced(value: unknown): boolean {
      if (!object(value)) return false;
      if (owned.has(value)) return true;
      if (targets.has(value)) {
        registry.admitObject(value, target.prototype);
        owned.add(value);
        return true;
      }
      return admitEvent(value);
    },
  };
}
