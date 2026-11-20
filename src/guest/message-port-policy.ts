import { captureMessageTransfer } from './message-transfer.ts';
import {
  NativePolicy,
  NativePolicyError,
  type NativeContract,
  type NativeMemberRule,
  type NativeReadOperation,
} from './native-policy.ts';

export interface MessagePortPolicyOptions {
  registry: NativePolicy;
  /** Trusted bootstrap port supplies native declarations, but is never admitted. */
  controlPort: MessagePort;
  owned: WeakSet<object>;
  isGuestValue(value: object): boolean;
  captureCallableShape(id: string, target: Function): void;
  detachTransferred(values: readonly Transferable[]): void;
}

const apply = Reflect.apply;
const prototype = Object.getPrototypeOf;
const descriptor = Object.getOwnPropertyDescriptor;
const object = (value: unknown): value is object =>
  value !== null && (typeof value === 'object' || typeof value === 'function');
const string = (value: unknown): string => {
  if (typeof value === 'symbol') throw new TypeError('A Symbol is not an event type');
  return String(value);
};
const read = ({ receiver, descriptor }: NativeReadOperation) =>
  descriptor.get ? apply(descriptor.get, receiver, []) : descriptor.value;
const contract = (
  id: string,
  result: NativeContract['result'] = 'data',
  callbacks: NativeContract['callbacks'] = 'none',
): NativeContract => ({ id, effect: 'local-data', result, callbacks });

/** Only host-created processor endpoints and their native deliveries are producers.
 * Event payloads and MessagePort branding do not confer endpoint ownership. */
export function registerMessagePortPolicy(options: MessagePortPolicyOptions) {
  const { registry, owned } = options;
  const portPrototype = prototype(options.controlPort);
  const ports = new WeakSet<object>();
  const events = new WeakSet<object>();
  const declarations = new Map<object, NativeMemberRule[]>();
  const listeners = new WeakMap<object, WeakMap<object, EventListener>>();
  const handlers = new WeakMap<object, Map<PropertyKey, unknown>>();
  const eventReads = new Map<PropertyKey, { owner: object; get: Function }>();

  function admitPort(port: MessagePort): void {
    if (port === options.controlPort)
      throw new NativePolicyError(
        'admit',
        'MessagePort',
        undefined,
        'management endpoint',
      );
    if (ports.has(port)) return;
    if (prototype(port) !== portPrototype)
      throw new NativePolicyError(
        'admit',
        'MessagePort',
        undefined,
        'foreign endpoint prototype',
      );
    registry.admitObject(port);
    ports.add(port);
    owned.add(port);
  }

  function registerChain(
    sample: object,
    family: string,
    members: (owner: object) => NativeMemberRule[],
  ) {
    const chain: object[] = [];
    for (
      let owner = prototype(sample);
      owner && prototype(owner);
      owner = prototype(owner)
    )
      chain.push(owner);
    for (const owner of chain.reverse()) {
      if (declarations.has(owner)) continue;
      const rules = members(owner);
      registry.registerPrototype(owner, { name: family, members: rules });
      declarations.set(owner, rules);
      owned.add(owner);
    }
    return [
      ...new Map(
        chain
          .flatMap((owner) => declarations.get(owner) ?? [])
          .map((rule) => [rule.key, rule]),
      ).values(),
    ];
  }

  function admitEvent(event: Event): void {
    if (events.has(event)) return;
    const members = registerChain(event, 'MessageEvent', (owner) => {
      const rules: NativeMemberRule[] = [];
      for (const key of [
        'data',
        'origin',
        'lastEventId',
        'source',
        'ports',
        'type',
        'target',
        'currentTarget',
        'eventPhase',
        'bubbles',
        'cancelable',
        'defaultPrevented',
        'composed',
        'isTrusted',
        'timeStamp',
        'cancelBubble',
        'returnValue',
        Symbol.toStringTag,
      ]) {
        const captured = descriptor(owner, key);
        if (!captured) continue;
        const id = `MessageEvent.${String(key)}`;
        const reference = ['source', 'target', 'currentTarget'].includes(String(key));
        rules.push({
          key,
          read: { contract: contract(id, reference ? 'reference' : 'data'), read },
          ...(captured.set && (key === 'cancelBubble' || key === 'returnValue')
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
        });
        if (captured.get) {
          options.captureCallableShape(id, captured.get);
          eventReads.set(key, { owner, get: captured.get });
        }
        if (captured.set) options.captureCallableShape(id + '.set', captured.set);
      }
      for (const key of [
        'preventDefault',
        'stopPropagation',
        'stopImmediatePropagation',
        'composedPath',
      ]) {
        const captured = descriptor(owner, key);
        if (typeof captured?.value !== 'function') continue;
        const id = `MessageEvent.${key}`;
        options.captureCallableShape(id, captured.value);
        rules.push({
          key,
          call: {
            contract: contract(id),
            call: ({ target, receiver, arguments: args }) =>
              apply(target, receiver, args),
          },
        });
      }
      return rules;
    });
    // Native MessagePort delivery supplies these endpoints. Never inspect payload
    // fields for authority, and never allow a management port through this path.
    const reader = eventReads.get('ports');
    let declaring: object | null = event;
    while (declaring && declaring !== reader?.owner) declaring = prototype(declaring);
    const transferred = reader && declaring ? apply(reader.get, event, []) : undefined;
    if (transferred !== undefined) {
      if (!Array.isArray(transferred))
        throw new TypeError('Native event ports are not an array');
      for (const port of transferred) admitPort(port);
    }
    const trusted = descriptor(event, 'isTrusted');
    if (trusted?.get) {
      // Browsers expose this unforgeable attribute on each native event rather
      // than its prototype. Capture only the known native-delivery attribute.
      const id = 'MessageEvent.isTrusted';
      options.captureCallableShape(id, trusted.get);
      registry.registerFacade(event, {
        name: 'Native MessageEvent',
        members: [
          ...members.filter((rule) => rule.key !== 'isTrusted'),
          { key: 'isTrusted', read: { contract: contract(id), read } },
        ],
      });
    } else registry.admitObject(event);
    events.add(event);
    owned.add(event);
  }

  function listener(port: object, callback: unknown): EventListener | null {
    if (callback == null) return null;
    if (!object(callback) || !options.isGuestValue(callback))
      throw new TypeError('MessagePort callbacks must belong to the guest');
    let callbacks = listeners.get(port);
    if (!callbacks) listeners.set(port, (callbacks = new WeakMap()));
    let wrapper = callbacks.get(callback);
    if (!wrapper) {
      wrapper = function (event: Event) {
        if (!options.isGuestValue(callback)) return;
        admitEvent(event);
        if (typeof callback === 'function') apply(callback, port, [event]);
        else {
          const handle = Reflect.get(callback, 'handleEvent');
          if (typeof handle !== 'function')
            throw new TypeError('Event listener is not callable');
          apply(handle, callback, [event]);
        }
      };
      callbacks.set(callback, wrapper);
    }
    return wrapper;
  }

  registerChain(options.controlPort, 'MessagePort', (owner) => {
    const rules: NativeMemberRule[] = [];
    for (const key of [
      'postMessage',
      'start',
      'close',
      'addEventListener',
      'removeEventListener',
      'dispatchEvent',
    ]) {
      const captured = descriptor(owner, key);
      if (typeof captured?.value !== 'function') continue;
      const id = `MessagePort.${key}`;
      options.captureCallableShape(id, captured.value);
      rules.push({
        key,
        call: {
          contract: contract(
            id,
            key === 'dispatchEvent' ? 'data' : 'none',
            key === 'addEventListener' || key === 'removeEventListener'
              ? 'guest'
              : 'none',
          ),
          call({ target, receiver, arguments: args }) {
            if (!object(receiver) || !ports.has(receiver))
              throw new TypeError('MessagePort receiver is not owned');
            if (key === 'addEventListener' || key === 'removeEventListener') {
              if (args.length < 2) throw new TypeError('Missing event listener argument');
              return apply(target, receiver, [
                string(args[0]),
                listener(receiver, args[1]),
                args[2],
              ]);
            }
            if (key === 'dispatchEvent' && (!object(args[0]) || !events.has(args[0])))
              throw new TypeError('Only admitted native events can be dispatched');
            if (key !== 'postMessage') return apply(target, receiver, args);
            // Consume a guest transfer getter/iterator once, then give the platform
            // and detachment accounting the same captured sequence.
            if (!args.length) throw new TypeError('Missing message argument');
            const transfer = captureMessageTransfer(args[1]);
            const result = apply(target, receiver, [args[0], transfer]);
            options.detachTransferred(transfer);
            return result;
          },
        },
      });
    }
    for (const key of ['onmessage', 'onmessageerror']) {
      const captured = descriptor(owner, key);
      if (!captured?.get || !captured.set) continue;
      const id = `MessagePort.${key}`;
      options.captureCallableShape(id, captured.get);
      options.captureCallableShape(id + '.set', captured.set);
      rules.push({
        key,
        read: {
          contract: contract(id, 'guest'),
          read: ({ receiver }) => handlers.get(receiver)?.get(key) ?? null,
        },
        write: {
          contract: contract(id + '.set', 'none', 'guest'),
          write: ({ receiver, value, descriptor }) => {
            // Event handler attributes accept functions; other values clear them.
            const callback = typeof value === 'function' ? value : null;
            const wrapped = listener(receiver, callback);
            apply(descriptor.set!, receiver, [wrapped]);
            let values = handlers.get(receiver);
            if (!values) handlers.set(receiver, (values = new Map()));
            values.set(key, callback);
            return true;
          },
        },
      });
    }
    if (descriptor(owner, Symbol.toStringTag))
      rules.push({
        key: Symbol.toStringTag,
        read: { contract: contract('MessagePort.tag'), read },
      });
    return rules;
  });

  return { admitPort };
}
