import createDOMPurify, { type Config } from 'dompurify';
import type { TrustedHTML } from 'trusted-types/lib/index.js';
import {
  isNavigationTarget,
  isUnsafeTargetMutation,
} from '../../src/shared/navigation-targets.ts';

const purifier = createDOMPurify(window);
const defaultPurifier = createDOMPurify(window);
const construction = document.implementation.createHTMLDocument('');
const factory: unknown = Reflect.get(window, 'trustedTypes');
if (!factory || typeof factory !== 'object') throw new Error('Native HTML types missing');
const htmlBrand: unknown = Reflect.get(factory, 'isHTML');
const defaultPolicy: unknown = Reflect.get(factory, 'defaultPolicy');
if (!defaultPolicy || typeof defaultPolicy !== 'object')
  throw new Error('Default HTML policy missing');
const mintHTML: unknown = Reflect.get(defaultPolicy, 'createHTML');
if (typeof mintHTML !== 'function' || typeof htmlBrand !== 'function')
  throw new Error('Native HTML policy methods missing');
const apply = Reflect.apply;
const isHTML = (value: unknown): value is TrustedHTML => {
  return apply(htmlBrand, factory, [value]) === true;
};
const trustedHTML = (text: string): TrustedHTML => {
  const value: unknown = apply(mintHTML, defaultPolicy, [text]);
  if (!isHTML(value)) throw new Error('Native HTML brand missing');
  return value;
};
const parserPolicy = {
  name: 'default',
  createHTML: trustedHTML,
  createScript(): never {
    throw new TypeError('Candidate parser cannot mint scripts');
  },
  createScriptURL(): never {
    throw new TypeError('Candidate parser cannot mint script URLs');
  },
};
const setHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!.set!;
const forbidden = [
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'portal',
  'fencedframe',
  'webview',
  'base',
  'script',
  'link',
  'meta',
];

// A candidate host adapter: the returned sanitized text is the only insertable
// value. `removed` below is diagnostic, never an authorization decision.
purifier.addHook('uponSanitizeAttribute', (_node, data) => {
  if (
    (isNavigationTarget(data.attrName) && data.attrValue.toLowerCase() !== '_self') ||
    isUnsafeTargetMutation(data.attrName, data.attrValue)
  )
    data.keepAttr = false;
});

function configuration(hostPolicy: boolean): Config {
  const config: Config = {
    TRUSTED_TYPES_POLICY: parserPolicy,
    RETURN_TRUSTED_TYPE: false,
    ...(hostPolicy
      ? {
          FORBID_TAGS: forbidden,
          FORBID_ATTR: ['srcdoc', 'is', 'manifest'],
          ADD_ATTR: ['target', 'formtarget'],
          CUSTOM_ELEMENT_HANDLING: {
            tagNameCheck: /^[a-z][\w.]*-[\w.-]+$/,
            attributeNameCheck: /^[\w:-]+$/,
            allowCustomizedBuiltInElements: false,
          },
        }
      : {}),
  };
  return config;
}

export function sanitize(text: string, hostPolicy: boolean) {
  const instance = hostPolicy ? purifier : defaultPurifier;
  const html = instance.sanitize(text, configuration(hostPolicy));
  return { html, removed: instance.removed.length, supported: instance.isSupported };
}

/** Test a context-aware adapter rather than treating every fragment as body HTML. */
export function sanitizeContext(text: string, localName: string, namespace: string) {
  const container = construction.createElementNS(namespace, localName);
  apply(setHTML, container, [trustedHTML(text)]);
  const result = purifier.sanitize(container, {
    ...configuration(true),
    IN_PLACE: true,
  });
  if (result !== container) throw new Error('Sanitizer replaced the parsing container');
  return {
    html: container.innerHTML,
    removed: purifier.removed.length,
    supported: purifier.isSupported,
  };
}
