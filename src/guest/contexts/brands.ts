const apply = Reflect.apply;
const objectTag = Object.prototype.toString;

function getter(
  constructorName: string,
  property: string,
): ((this: unknown) => unknown) | undefined {
  const constructor: unknown = Reflect.get(globalThis, constructorName);
  if (typeof constructor !== 'function') return;
  const prototype: unknown = Reflect.get(constructor, 'prototype');
  if (!prototype || typeof prototype !== 'object') return;
  return Object.getOwnPropertyDescriptor(prototype, property)?.get;
}

/** Cache native internal-slot checks, which do not change with public prototypes. */
export function nativeBrand<T extends object>(
  read: ((this: unknown) => unknown) | undefined,
): (value: unknown) => value is T {
  const cache = new WeakMap<object, boolean>();
  return (value: unknown): value is T => {
    if (
      !read ||
      value === null ||
      (typeof value !== 'object' && typeof value !== 'function')
    )
      return false;
    const known = cache.get(value);
    if (known !== undefined) return known;
    let accepted = false;
    try {
      apply(read, value, []);
      accepted = true;
    } catch {
      // A Web IDL getter rejects receivers without its native internal slots.
    }
    cache.set(value, accepted);
    return accepted;
  };
}

const nodeType = getter('Node', 'nodeType');
const elementName = getter('Element', 'localName');
const attributeName = getter('Attr', 'name');
const documentURL = getter('Document', 'URL');
const frameWindow = getter('HTMLIFrameElement', 'contentWindow');
const templateContent = getter('HTMLTemplateElement', 'content');
const audioRate = getter('BaseAudioContext', 'sampleRate');
const blobSize = getter('Blob', 'size');
const portMessage = getter('MessagePort', 'onmessage');
const nativeWindow =
  typeof Window === 'function'
    ? Object.getOwnPropertyDescriptor(globalThis, 'window')?.get ||
      getter('Window', 'window')
    : undefined;

export const isNode = nativeBrand<Node>(nodeType);
export const isElement = nativeBrand<Element>(elementName);
export const isAttr = nativeBrand<Attr>(attributeName);
export const isDocument = nativeBrand<Document>(documentURL);
export const isHTMLIFrameElement = nativeBrand<HTMLIFrameElement>(frameWindow);
export const isHTMLTemplateElement = nativeBrand<HTMLTemplateElement>(templateContent);
export const isBaseAudioContext = nativeBrand<BaseAudioContext>(audioRate);
export const isBlob = nativeBrand<Blob>(blobSize);
export const isMessagePort = nativeBrand<MessagePort>(portMessage);
export const isWindow = nativeBrand<Window>(nativeWindow);

/**
 * Cache has no synchronous branded getter. This is a conservative dispatch
 * classification, not authorization; native Cache methods still check receivers.
 * A false positive only selects the local-resource implementation of add/addAll.
 */
export function isCache(value: unknown): value is Cache {
  if (typeof Cache !== 'function' || value === null || typeof value !== 'object')
    return false;
  try {
    return apply(objectTag, value, []) === '[object Cache]';
  } catch {
    return false;
  }
}
