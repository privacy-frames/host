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

function accepts(
  value: unknown,
  read: ((this: unknown) => unknown) | undefined,
): boolean {
  if (
    !read ||
    (typeof value !== 'object' && typeof value !== 'function') ||
    value === null
  )
    return false;
  try {
    apply(read, value, []);
    return true;
  } catch {
    return false;
  }
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

export const isNode = (value: unknown): value is Node => accepts(value, nodeType);
export const isElement = (value: unknown): value is Element =>
  accepts(value, elementName);
export const isAttr = (value: unknown): value is Attr => accepts(value, attributeName);
export const isDocument = (value: unknown): value is Document =>
  accepts(value, documentURL);
export const isHTMLIFrameElement = (value: unknown): value is HTMLIFrameElement =>
  accepts(value, frameWindow);
export const isHTMLTemplateElement = (value: unknown): value is HTMLTemplateElement =>
  accepts(value, templateContent);
export const isBaseAudioContext = (value: unknown): value is BaseAudioContext =>
  accepts(value, audioRate);
export const isBlob = (value: unknown): value is Blob => accepts(value, blobSize);
export const isMessagePort = (value: unknown): value is MessagePort =>
  accepts(value, portMessage);
export const isWindow = (value: unknown): value is Window => accepts(value, nativeWindow);

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
