import { createNativeHost } from './native-host.ts';
import { NativePolicy, NativePolicyError, type NativeContract } from './native-policy.ts';
import { registerEventFamily, type EventFamilyOptions } from './event-policy.ts';

export interface BrowserPolicyOptions extends EventFamilyOptions {
  global: object;
}

/** One registry for browser families. A receiver admitted for a borrowed operation
 * does not thereby become an object owned by this host. */
export function createBrowserPolicy(options: BrowserPolicyOptions) {
  const registry = new NativePolicy({ isGuestValue: options.isGuestValue });
  const owned = new WeakSet<object>();
  const callables = new WeakSet<Function>();
  const globalReceiverContracts = new WeakSet<NativeContract>();
  const methods = new WeakMap<Function, { owner: object; key: PropertyKey }>();
  const host = createNativeHost({
    name: 'Browser',
    registry,
    owns: (target) => owned.has(target),
    admit: (target) => events.admitReceiver(target),
    result(value, contract) {
      if (contract.result === 'reference' && !events.admitProduced(value))
        throw new NativePolicyError(
          'return',
          contract.id,
          undefined,
          'unrecognized browser reference producer',
        );
      return value;
    },
    prototype(target) {
      const parent = registry.prototype(target);
      return parent ?? Object.prototype;
    },
    functionPrototype: Function.prototype,
    callablePublished(_target, contract) {
      if (
        contract.id === 'EventTarget.addEventListener' ||
        contract.id === 'EventTarget.removeEventListener' ||
        contract.id === 'EventTarget.dispatchEvent'
      )
        globalReceiverContracts.add(contract);
    },
    normalizeReceiver(receiver, contract) {
      return receiver == null && globalReceiverContracts.has(contract)
        ? options.global
        : receiver;
    },
  });
  const events = registerEventFamily({
    ...options,
    registry,
    owned,
    captureCallableShape: host.captureCallableShape,
    registerConstructor: host.registerConstructor,
    captureMethod(target, owner, key) {
      const previous = methods.get(target);
      if (previous && (previous.owner !== owner || previous.key !== key))
        throw new TypeError('Browser native method has another declaration');
      methods.set(target, { owner, key });
    },
  });

  return {
    host,
    /** Replace a captured native method with its canonical policy wrapper before
     * BrowserEnvironment can wrap it using a property's incidental name. */
    callable(target: Function, receiver?: object): Function | undefined {
      const declaration = methods.get(target);
      if (!declaration) return;
      if (receiver && !events.methodReceiver(declaration.owner, receiver)) return;
      const value = host.get(declaration.owner, declaration.key);
      if (typeof value !== 'function')
        throw new TypeError('Registered browser method is not callable');
      callables.add(value);
      return value;
    },
    ownsCallable: (value: Function) => callables.has(value),
    admitEvent: events.admitEvent,
  };
}
