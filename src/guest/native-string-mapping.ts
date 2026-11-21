const nativeString = String;
const nativeApply = Reflect.apply;
const nativeDescriptor = Reflect.getOwnPropertyDescriptor;
const nativePrototype = Reflect.getPrototypeOf;
const nativeKeys = Reflect.ownKeys;
const wellFormed: unknown = Reflect.get(String.prototype, 'toWellFormed');

type StringType = 'DOMString' | 'USVString';
type CSSContext = 'value' | 'declarationList' | 'stylesheet';

export interface NativeStringOptions {
  readonly type: StringType;
  readonly legacyNullToEmptyString?: boolean;
}

/** Defer conversion until native Web IDL reaches this argument. The original
 * conversion runs once; subsequent native conversion receives only a primitive. */
export function mapNativeString(
  input: unknown,
  map: (value: string) => string,
  options: NativeStringOptions,
): object {
  const wrapper: object = Object.create(null);
  Object.defineProperty(wrapper, Symbol.toPrimitive, {
    value() {
      if (typeof input === 'symbol') throw new TypeError('A Symbol is not a string');
      let value =
        options.legacyNullToEmptyString && input === null ? '' : nativeString(input);
      if (options.type === 'USVString') {
        if (typeof wellFormed !== 'function')
          throw new TypeError('USVString conversion is unavailable');
        value = nativeApply(wellFormed, value, []);
      }
      return map(value);
    },
  });
  return wrapper;
}

/** CSSOM explicitly permits either string representation. CSS.escape performs
 * no CSS parsing, so unlike a style declaration it preserves the distinction. */
export function cssomStringType(escape: (value: string) => string): StringType {
  const converted = escape('\ud800');
  if (converted === '\ud800') return 'DOMString';
  if (converted === '\ufffd') return 'USVString';
  throw new TypeError('Unrecognized native CSSOMString conversion');
}

function legacyCSSData(descriptor: PropertyDescriptor | undefined): boolean {
  return (
    !!descriptor &&
    'value' in descriptor &&
    typeof descriptor.value === 'string' &&
    descriptor.writable === true &&
    descriptor.enumerable === true &&
    descriptor.configurable === true
  );
}

/** CSSOM's IDL-attribute-to-property algorithm, including the lowercase webkit
 * alias. Native CSS.supports verifies the resulting supported-property family. */
function cssProperty(key: string): string {
  const prefix = key.startsWith('webkit') ? '-' : '';
  return prefix + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
}

interface MappingOptions {
  readonly global: Window | WorkerGlobalScope;
  readonly css: (value: string, context: CSSContext) => string;
  readonly url: (value: string) => string;
}

export function createNativeStringMapping(options: MappingOptions) {
  const read = (key: string): unknown => Reflect.get(options.global, key);
  const css: unknown = read('CSS');
  const escape: unknown = css && Reflect.get(css, 'escape');
  const supports: unknown = css && Reflect.get(css, 'supports');
  const cssType =
    typeof escape === 'function'
      ? cssomStringType((value) => nativeApply(escape, css, [value]))
      : undefined;
  const mappedCSS = (input: unknown, context: CSSContext, legacy = false): object => {
    if (!cssType) throw new TypeError('Native CSSOMString conversion is unavailable');
    return mapNativeString(input, (value) => options.css(value, context), {
      type: cssType,
      legacyNullToEmptyString: legacy,
    });
  };
  const setters = new Map<Function, { context: CSSContext; legacy: boolean }>();
  const operations = new Map<Function, (args: readonly unknown[]) => unknown[]>();
  const prototype = (name: string): object | undefined => {
    const constructor = read(name);
    return typeof constructor === 'function' ? constructor.prototype : undefined;
  };
  const declarationPrototypes = new Set<object>();
  for (const name of ['CSSStyleDeclaration', 'CSSStyleProperties']) {
    const owner = prototype(name);
    if (owner) declarationPrototypes.add(owner);
  }
  for (const owner of declarationPrototypes) {
    for (const key of nativeKeys(owner)) {
      if (typeof key !== 'string') continue;
      const descriptor = nativeDescriptor(owner, key)!;
      if (!descriptor.set) continue;
      const known =
        key === 'cssText' ||
        key === 'cssFloat' ||
        (typeof supports === 'function' &&
          nativeApply(supports, css, [cssProperty(key), 'initial']));
      if (!known) continue;
      const rule = {
        context: key === 'cssText' ? 'declarationList' : 'value',
        legacy: key !== 'cssText',
      } as const;
      setters.set(descriptor.set, rule);
      operations.set(descriptor.set, (args) => {
        const forwarded = [...args];
        if (forwarded.length)
          forwarded[0] = mappedCSS(args[0], rule.context, rule.legacy);
        return forwarded;
      });
    }
  }
  const operation = (
    owner: object | undefined,
    key: string,
    index: number,
    map: (value: unknown) => object,
  ) => {
    const target: unknown = owner && nativeDescriptor(owner, key)?.value;
    if (typeof target !== 'function') return;
    operations.set(target, (args) => {
      const forwarded = [...args];
      if (args.length > index) forwarded[index] = map(args[index]);
      return forwarded;
    });
  };
  operation(prototype('CSSStyleDeclaration'), 'setProperty', 1, (value) =>
    mappedCSS(value, 'value', true),
  );
  const sheet = prototype('CSSStyleSheet');
  operation(sheet, 'insertRule', 0, (value) => mappedCSS(value, 'stylesheet'));
  for (const key of ['replace', 'replaceSync'])
    operation(sheet, key, 0, (value) =>
      mapNativeString(value, (text) => options.css(text, 'stylesheet'), {
        type: 'USVString',
      }),
    );
  // Some engines represent supported CSS attributes as legacy own data
  // properties, rather than ordinary prototype setters. Capture that family
  // from a trusted fresh declaration, never from application-created expandos.
  const legacyProperties = new Set<string>();
  const declaration = prototype('CSSStyleDeclaration');
  const lengthGetter = declaration && nativeDescriptor(declaration, 'length')?.get;
  const document = 'document' in options.global ? options.global.document : undefined;
  if (document && typeof supports === 'function') {
    const style = document.createElement('div').style;
    for (const key of nativeKeys(style)) {
      if (typeof key !== 'string') continue;
      const descriptor = nativeDescriptor(style, key);
      if (
        legacyCSSData(descriptor) &&
        nativeApply(supports, css, [cssProperty(key), 'initial'])
      ) {
        for (const alias of [key, cssProperty(key)])
          if (legacyCSSData(nativeDescriptor(style, alias))) legacyProperties.add(alias);
      }
    }
  }
  const legacyDeclaration = (target: object): boolean => {
    if (!lengthGetter) return false;
    try {
      nativeApply(lengthGetter, target, []);
      return true;
    } catch {
      return false;
    }
  };
  const audio = read('Audio');
  return {
    set(target: object, key: PropertyKey, value: unknown): unknown {
      for (let owner: object | null = target; owner; owner = nativePrototype(owner)) {
        const descriptor = nativeDescriptor(owner, key);
        if (!descriptor) continue;
        const rule = descriptor.set && setters.get(descriptor.set);
        if (rule) return mappedCSS(value, rule.context, rule.legacy);
        if (
          owner === target &&
          typeof key === 'string' &&
          legacyProperties.has(key) &&
          legacyCSSData(descriptor) &&
          legacyDeclaration(target)
        )
          return mappedCSS(value, 'value', true);
        return value;
      }
      return value;
    },
    call(target: Function, args: unknown[]): unknown[] {
      return operations.get(target)?.(args) ?? args;
    },
    construct(target: Function, args: unknown[]): unknown[] {
      if (target !== audio || !args.length || args[0] === undefined) return args;
      const forwarded = [...args];
      forwarded[0] = mapNativeString(args[0], options.url, { type: 'DOMString' });
      return forwarded;
    },
  };
}
