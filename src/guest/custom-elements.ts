interface GuestCustomElementEngine {
  property(value: unknown, key: PropertyKey): unknown;
  construct(constructor: Function, args: unknown[]): object;
  alias(native: object, guest: object): void;
}

interface Definition {
  guest: Function;
  native: CustomElementConstructor;
  base: Function;
}

interface Construction {
  definition: Definition;
  element: HTMLElement;
  consumed: boolean;
}

const callbackNames = [
  'connectedCallback',
  'disconnectedCallback',
  'adoptedCallback',
  'attributeChangedCallback',
  'connectedMoveCallback',
  'formAssociatedCallback',
  'formDisabledCallback',
  'formResetCallback',
  'formStateRestoreCallback',
] as const;

/** Native elements retain the browser's construction and reaction machinery;
 * application constructors and every lifecycle callback run in the guest engine.
 */
export function createGuestCustomElements(
  window: Window & typeof globalThis,
  engine: GuestCustomElementEngine,
) {
  const registry = window.customElements;
  const definitions = new Map<Function, Definition>();
  const constructors = new Map<CustomElementConstructor, Function>();
  const pending: Construction[] = [];
  let skip: Definition | undefined;
  let closed = false;

  class GuestRegistry {
    define(name: string, guest: Function, suppliedOptions?: ElementDefinitionOptions) {
      if (closed) throw new DOMException('Guest context is closed', 'InvalidStateError');
      if (typeof guest !== 'function')
        throw new TypeError('Constructor must be callable');
      const prototype = engine.property(guest, 'prototype');
      if (!prototype || typeof prototype !== 'object')
        throw new TypeError('Custom element prototype must be an object');
      if (definitions.has(guest))
        throw new DOMException('Constructor is already registered', 'NotSupportedError');
      const suppliedExtends = suppliedOptions?.extends;
      const options =
        suppliedExtends === undefined ? undefined : { extends: String(suppliedExtends) };
      const base = options
        ? Object.getPrototypeOf(
            window.document.implementation
              .createHTMLDocument()
              .createElement(options.extends),
          ).constructor
        : window.HTMLElement;
      if (
        typeof base !== 'function' ||
        (!(base.prototype instanceof window.Element) && base !== window.HTMLElement)
      )
        throw new TypeError('Custom element base is not an HTML element');
      const callbacks = new Map<string, Function>();
      for (const name of callbackNames) {
        const callback = engine.property(prototype, name);
        if (callback !== undefined) {
          if (typeof callback !== 'function')
            throw new TypeError(name + ' must be callable');
          callbacks.set(name, callback);
        }
      }
      const observed = callbacks.has('attributeChangedCallback')
        ? engine.property(guest, 'observedAttributes')
        : undefined;
      const attributes =
        observed === undefined ? [] : Array.from(observed as Iterable<unknown>, String);
      const formAssociated = Boolean(engine.property(guest, 'formAssociated'));
      const suppliedDisabledFeatures = engine.property(guest, 'disabledFeatures');
      const disabledFeatures =
        suppliedDisabledFeatures === undefined
          ? undefined
          : Array.from(suppliedDisabledFeatures as Iterable<unknown>, String);
      let definition: Definition;
      const NativeBase: typeof HTMLElement = base;
      class TrustedElement extends NativeBase {
        constructor() {
          super();
          if (skip === definition) return;
          if (closed)
            throw new DOMException('Guest context is closed', 'InvalidStateError');
          const construction = { definition, element: this, consumed: false };
          pending.push(construction);
          try {
            const result = engine.construct(guest, []);
            if (result !== this || !construction.consumed)
              throw new TypeError(
                'Custom element constructor must initialize and return its element',
              );
          } finally {
            pending.pop();
          }
        }
      }
      definition = { guest, native: TrustedElement, base };
      for (const [name, callback] of callbacks)
        Object.defineProperty(TrustedElement.prototype, name, {
          configurable: true,
          writable: true,
          value: function (this: HTMLElement, ...args: unknown[]) {
            if (!closed) return Reflect.apply(callback, this, args);
          },
        });
      Object.defineProperty(TrustedElement, 'observedAttributes', { value: attributes });
      Object.defineProperty(TrustedElement, 'formAssociated', { value: formAssociated });
      if (disabledFeatures)
        Object.defineProperty(TrustedElement, 'disabledFeatures', {
          value: disabledFeatures,
        });
      definitions.set(guest, definition);
      constructors.set(TrustedElement, guest);
      // Encoding a real browser-created instance must restore its actual guest
      // prototype, including methods, accessors and instanceof relationships.
      engine.alias(TrustedElement, guest);
      engine.alias(TrustedElement.prototype, prototype);
      try {
        registry.define(name, TrustedElement, options);
      } catch (error) {
        definitions.delete(guest);
        constructors.delete(TrustedElement);
        throw error;
      }
    }

    get(name: string): Function | undefined {
      const constructor = registry.get(name);
      return constructor ? constructors.get(constructor) : undefined;
    }

    whenDefined(name: string): Promise<Function> {
      return registry.whenDefined(name).then((constructor) => {
        const guest = constructors.get(constructor);
        if (!guest)
          throw new DOMException(
            'Custom element belongs to another context',
            'SecurityError',
          );
        return guest;
      });
    }

    upgrade(root: Node): void {
      registry.upgrade(root);
    }

    getName(constructor: Function): string | null {
      const definition = definitions.get(constructor);
      if (!definition) return null;
      const getName: unknown = Reflect.get(registry, 'getName');
      return typeof getName === 'function'
        ? Reflect.apply(getName, registry, [definition.native])
        : null;
    }
  }

  return {
    registry: new GuestRegistry(),
    constructBase(
      target: Function,
      _args: unknown[],
      newTarget?: Function,
    ): object | undefined {
      const definition = newTarget && definitions.get(newTarget);
      if (!definition || target !== definition.base) return undefined;
      const construction = pending.at(-1);
      if (construction?.definition === definition && !construction.consumed) {
        construction.consumed = true;
        return construction.element;
      }
      const previous = skip;
      skip = definition;
      try {
        return Reflect.construct(definition.native, []);
      } finally {
        skip = previous;
      }
    },
    dispose() {
      closed = true;
      pending.length = 0;
    },
  };
}
