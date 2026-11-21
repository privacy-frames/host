import { nativeBrand } from '../native-brand.ts';

export { nativeBrand } from '../native-brand.ts';

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
