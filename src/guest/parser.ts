import { parse, type DefaultTreeAdapterTypes as Tree } from 'parse5';
import { SaxesParser, type SaxesTagNS } from 'saxes';
import { rewriteGuestCSS } from './css.ts';
import type { GuestResources } from './resources.ts';

const htmlNamespace = 'http://www.w3.org/1999/xhtml';
const svgNamespace = 'http://www.w3.org/2000/svg';
const mathNamespace = 'http://www.w3.org/1998/Math/MathML';
const xmlNamespace = 'http://www.w3.org/XML/1998/namespace';
const xlinkNamespace = 'http://www.w3.org/1999/xlink';
const xsltNamespace = 'http://www.w3.org/1999/XSL/Transform';
const parserErrorNamespace = 'http://www.mozilla.org/newlayout/xml/parsererror.xml';
const inertScriptType = 'application/x-privacy-frames-inert';
const supportedTypes = new Set<string>([
  'text/html',
  'text/xml',
  'application/xml',
  'application/xhtml+xml',
  'image/svg+xml',
]);
const urlAttributes = new Set([
  'src',
  'href',
  'poster',
  'background',
  'lowsrc',
  'dynsrc',
  'longdesc',
  'usemap',
  'profile',
  'codebase',
  'classid',
  'data',
  'cite',
]);
const withheldAttributes = new Set([
  'nonce',
  'integrity',
  'is',
  'srcdoc',
  'ping',
  'action',
  'formaction',
  'target',
  'formtarget',
  'manifest',
]);
const contextElements = new Set([
  'iframe',
  'frame',
  'fencedframe',
  'portal',
  'object',
  'embed',
  'applet',
]);
const svgPaintAttributes = new Set([
  'fill',
  'stroke',
  'filter',
  'clip-path',
  'mask',
  'cursor',
  'marker',
  'marker-start',
  'marker-mid',
  'marker-end',
  'color-profile',
]);
const unsafeAnimationTargets = new Set([
  'base',
  'nonce',
  'type',
  'srcdoc',
  'is',
  'rel',
  'http-equiv',
  'content',
  'target',
  'formtarget',
  'action',
  'formaction',
  'manifest',
  'ping',
]);
const supportedType = (type: string): type is DOMParserSupportedType =>
  supportedTypes.has(type);

export interface ParsedScriptSource {
  code: string;
  type: string;
  source?: string;
  /** DOMParser-created scripts remain inert when their nodes are later inserted. */
  inert: true;
}

export interface ParsedElementSource {
  attributes: ReadonlyMap<string, string>;
  handlers: ReadonlyMap<string, string>;
  baseURL: string;
  script?: ParsedScriptSource;
}

export interface GuestDOMParser {
  parseFromString(input: string, type: DOMParserSupportedType): Document;
}

export interface GuestDOMParserConstructor {
  new (): GuestDOMParser;
  readonly prototype: GuestDOMParser;
}

interface SourceAttribute {
  name: string;
  value: string;
  namespace: string | null;
  localName: string;
}

const elements = new WeakMap<Element, ParsedElementSource>();
const documentSources = new WeakMap<Document, string>();

/** Original application values remain private to the trusted DOM adapter. */
export const parsedElementSource = (element: Element) => elements.get(element);
export const parsedDocumentSource = (document: Document) => documentSources.get(document);

function mapURL(resources: GuestResources, value: string, base: string): string {
  try {
    return resources.nativeURL(value, base);
  } catch {
    return 'data:application/octet-stream,';
  }
}

/** The srcset tokenizer keeps commas inside URL tokens, including data URLs. */
function mapSourceSet(value: string, map: (value: string) => string): string {
  const candidates: string[] = [];
  let position = 0;
  while (position < value.length) {
    while (position < value.length && /[\t\n\f\r ,]/.test(value[position])) position++;
    const start = position;
    while (position < value.length && !/[\t\n\f\r ]/.test(value[position])) position++;
    let url = value.slice(start, position);
    if (!url) break;
    if (url.endsWith(',')) {
      candidates.push(map(url.replace(/,+$/, '')));
      continue;
    }
    const descriptorStart = position;
    let parentheses = 0;
    while (position < value.length) {
      const character = value[position];
      if (character === ',' && parentheses === 0) break;
      if (character === '(') parentheses++;
      else if (character === ')') parentheses = Math.max(0, parentheses - 1);
      position++;
    }
    const descriptor = value.slice(descriptorStart, position).trim();
    candidates.push(map(url) + (descriptor ? ' ' + descriptor : ''));
    if (value[position] === ',') position++;
  }
  return candidates.join(', ');
}

function activeNamespace(namespace: string | null): boolean {
  return (
    namespace === htmlNamespace ||
    namespace === svgNamespace ||
    namespace === mathNamespace
  );
}

function applyAttributes(
  element: Element,
  attributes: readonly SourceAttribute[],
  base: string,
  resources: GuestResources,
): void {
  const original = new Map(
    attributes.map((attribute) => [attribute.name, attribute.value]),
  );
  const handlers = new Map<string, string>();
  const visual = activeNamespace(element.namespaceURI);
  const tag = element.localName.toLowerCase();
  const script = visual && tag === 'script';
  const animation =
    element.namespaceURI === svgNamespace &&
    ['animate', 'set', 'animatecolor', 'animatetransform', 'animatemotion'].includes(tag);
  const animationTarget =
    (original.get('attributeName') || '').trim().toLowerCase().split(':').at(-1) || '';
  const disabledAnimation =
    animation &&
    (animationTarget.startsWith('on') || unsafeAnimationTargets.has(animationTarget));
  const source: ParsedElementSource = {
    attributes: original,
    handlers,
    baseURL: base,
    ...(script
      ? {
          script: {
            code: '',
            type: original.get('type') || '',
            source:
              original.get('src') || original.get('href') || original.get('xlink:href'),
            inert: true,
          },
        }
      : {}),
  };
  elements.set(element, source);
  if (script) {
    const type = original.get('type') || '';
    element.setAttribute(
      'type',
      ['application/json', 'application/ld+json'].includes(type.trim().toLowerCase())
        ? type
        : inertScriptType,
    );
  }

  for (const attribute of attributes) {
    const key = attribute.localName.toLowerCase();
    let value = attribute.value;
    // xml:base affects descendant fragment URLs even on a non-rendering ancestor.
    // Retain its logical value in metadata rather than changing native URL scope.
    if (attribute.namespace === xmlNamespace && key === 'base') continue;
    if (visual) {
      if (key.startsWith('on')) {
        handlers.set(attribute.name, value);
        continue;
      }
      if (withheldAttributes.has(key)) continue;
      if (script && ['src', 'href', 'type'].includes(key)) continue;
      if (
        contextElements.has(tag) &&
        [
          'src',
          'href',
          'data',
          'code',
          'codebase',
          'classid',
          'archive',
          'sandbox',
        ].includes(key)
      )
        continue;
      if (tag === 'base' && ['href', 'target'].includes(key)) continue;
      if (tag === 'meta' && key === 'http-equiv') continue;
      if (
        key === 'rel' &&
        /(?:^|\s)(?:preconnect|dns-prefetch|prefetch|prerender)(?:\s|$)/i.test(value)
      )
        continue;
      if (
        disabledAnimation &&
        ['attributename', 'from', 'to', 'by', 'values'].includes(key)
      )
        continue;
      if (key === 'style')
        value = rewriteGuestCSS(
          value,
          (url) => mapURL(resources, url, base),
          'declarationList',
        );
      else if (key === 'srcset' || key === 'imagesrcset')
        value = mapSourceSet(value, (url) => mapURL(resources, url, base));
      else if (
        urlAttributes.has(key) ||
        (attribute.namespace === xlinkNamespace && key === 'href')
      )
        value = mapURL(resources, value, base);
      else if (element.namespaceURI === svgNamespace && svgPaintAttributes.has(key))
        value = rewriteGuestCSS(value, (url) => mapURL(resources, url, base), 'value');
      else if (animation && ['from', 'to', 'by', 'values'].includes(key)) {
        const values = key === 'values' ? value.split(';') : [value];
        if (urlAttributes.has(animationTarget))
          value = values.map((value) => mapURL(resources, value.trim(), base)).join(';');
        else if (svgPaintAttributes.has(animationTarget) || animationTarget === 'style')
          value = values
            .map((value) =>
              rewriteGuestCSS(
                value,
                (url) => mapURL(resources, url, base),
                animationTarget === 'style' ? 'declarationList' : 'value',
              ),
            )
            .join(';');
      }
    } else if (
      element.namespaceURI === xsltNamespace &&
      ['import', 'include'].includes(tag) &&
      key === 'href'
    )
      value = mapURL(resources, value, base);
    element.setAttributeNS(attribute.namespace, attribute.name, value);
  }
}

function finishElement(element: Element, resources: GuestResources): void {
  const source = elements.get(element);
  if (!source) return;
  if (source.script)
    elements.set(element, {
      ...source,
      script: { ...source.script, code: element.textContent || '' },
    });
  if (activeNamespace(element.namespaceURI) && element.localName === 'style')
    element.textContent = rewriteGuestCSS(
      element.textContent || '',
      (url) => mapURL(resources, url, source.baseURL),
      'stylesheet',
    );
}

function recordDocument(
  document: Document,
  url: string,
  type: DOMParserSupportedType,
): Document {
  documentSources.set(document, url);
  Object.defineProperties(document, {
    URL: { get: () => url, configurable: true },
    documentURI: { get: () => url, configurable: true },
    baseURI: { get: () => url, configurable: true },
    contentType: { get: () => type, configurable: true },
  });
  return document;
}

function htmlDocument(
  host: Document,
  resources: GuestResources,
  input: string,
  base: string,
): Document {
  const ast = parse(input);
  const document = host.implementation.createHTMLDocument('');
  document.replaceChildren();
  let logicalBase = base;
  let baseFound = false;
  const visit = (node: Tree.Node) => {
    if (
      'tagName' in node &&
      node.namespaceURI === htmlNamespace &&
      node.tagName === 'base' &&
      !baseFound
    ) {
      const href = node.attrs.find((attribute) => attribute.name === 'href');
      if (href) {
        baseFound = true;
        try {
          logicalBase = new URL(href.value, base).href;
        } catch {
          /* An invalid first base retains the fallback. */
        }
      }
    }
    if ('childNodes' in node) for (const child of node.childNodes) visit(child);
  };
  visit(ast);

  const create = (node: Tree.Node): Node | null => {
    if (node.nodeName === '#text' && 'value' in node)
      return document.createTextNode(node.value);
    if (node.nodeName === '#comment' && 'data' in node)
      return document.createComment(node.data);
    if (node.nodeName === '#documentType' && 'name' in node)
      return host.implementation.createDocumentType(
        node.name || 'html',
        node.publicId,
        node.systemId,
      );
    if (!('tagName' in node)) return null;
    const template =
      node.namespaceURI === htmlNamespace && node.tagName === 'template'
        ? document.createElement('template')
        : null;
    const element = template || document.createElementNS(node.namespaceURI, node.tagName);
    const attributes = node.attrs.map((attribute): SourceAttribute => ({
      name: attribute.prefix ? attribute.prefix + ':' + attribute.name : attribute.name,
      localName: attribute.name,
      namespace: attribute.namespace || null,
      value: attribute.value,
    }));
    applyAttributes(element, attributes, logicalBase, resources);
    const destination = template?.content || element;
    for (const child of node.childNodes) {
      const created = create(child);
      if (created) destination.appendChild(created);
    }
    if (template && 'content' in node)
      for (const child of node.content.childNodes) {
        const created = create(child);
        if (created) template.content.appendChild(created);
      }
    finishElement(element, resources);
    return element;
  };
  for (const child of ast.childNodes) {
    const node = create(child);
    if (node) document.appendChild(node);
  }
  return recordDocument(document, logicalBase, 'text/html');
}

function documentType(host: Document, value: string): DocumentType {
  const quoted = '(?:"([^"]*)"|\'([^\']*)\')';
  const parsed = new RegExp(
    '^\\s*([^\\s\\[]+)(?:\\s+PUBLIC\\s+' +
      quoted +
      '\\s+' +
      quoted +
      '|\\s+SYSTEM\\s+' +
      quoted +
      ')?',
  ).exec(value);
  if (!parsed) throw new Error('Invalid document type');
  const remainder = value.slice(parsed[0].length).trim();
  if (remainder)
    throw new Error(
      remainder.startsWith('[')
        ? 'DTD internal subsets are not supported'
        : 'Invalid document type',
    );
  return host.implementation.createDocumentType(
    parsed[1],
    parsed[2] ?? parsed[3] ?? '',
    parsed[4] ?? parsed[5] ?? parsed[6] ?? parsed[7] ?? '',
  );
}

function xmlDocument(
  host: Document,
  resources: GuestResources,
  input: string,
  type: DOMParserSupportedType,
  base: string,
): Document {
  const document = host.implementation.createDocument(null, '', null);
  const roots: Node[] = [];
  const stack: { element: Element; base: string }[] = [];
  const append = (node: Node) => {
    const parent = stack.at(-1)?.element;
    if (parent) parent.appendChild(node);
    else roots.push(node);
  };
  const parser = new SaxesParser({ xmlns: true });
  parser.on('error', (error) => {
    throw error;
  });
  parser.on('opentag', (tag: SaxesTagNS) => {
    let nodeBase = stack.at(-1)?.base || base;
    const xmlBase = Object.values(tag.attributes).find(
      (attribute) => attribute.uri === xmlNamespace && attribute.local === 'base',
    );
    if (xmlBase) {
      try {
        nodeBase = new URL(xmlBase.value, nodeBase).href;
      } catch {
        /* Invalid xml:base does not make the document ill-formed. */
      }
    }
    const element = document.createElementNS(tag.uri || null, tag.name);
    applyAttributes(
      element,
      Object.values(tag.attributes).map((attribute) => ({
        name: attribute.name,
        localName: attribute.local,
        namespace: attribute.uri || null,
        value: attribute.value,
      })),
      nodeBase,
      resources,
    );
    append(element);
    stack.push({ element, base: nodeBase });
  });
  parser.on('closetag', () => {
    const entry = stack.pop();
    if (entry) finishElement(entry.element, resources);
  });
  parser.on('text', (text) => {
    if (stack.length) append(document.createTextNode(text));
  });
  parser.on('cdata', (text) => append(document.createCDATASection(text)));
  parser.on('comment', (text) => append(document.createComment(text)));
  parser.on('doctype', (value) => roots.push(documentType(host, value)));
  parser.on('processinginstruction', ({ target, body }) => {
    if (target.toLowerCase() === 'xml-stylesheet')
      body = body.replace(
        /\bhref\s*=\s*(["'])(.*?)\1/g,
        (_whole, _quote: string, value: string) =>
          'href="' +
          mapURL(resources, value, base).replace(/&/g, '&amp;').replace(/"/g, '&quot;') +
          '"',
      );
    append(document.createProcessingInstruction(target, body));
  });
  try {
    parser.write(input).close();
    for (const node of roots) document.appendChild(node);
    return recordDocument(document, base, type);
  } catch (error) {
    const failure = host.implementation.createDocument(
      parserErrorNamespace,
      'parsererror',
      null,
    );
    failure.documentElement.textContent =
      error instanceof Error ? error.message : String(error);
    return recordDocument(failure, base, type);
  }
}

/** Pure syntax parsing precedes construction; native resource effects see mapped URLs. */
export function parseGuestDocument(
  host: Document,
  resources: GuestResources,
  input: string,
  type: DOMParserSupportedType,
  base = resources.catalog.documentBase,
): Document {
  const mime = String(type);
  if (!supportedType(mime)) throw new TypeError('Unsupported DOMParser MIME type');
  const source = String(input);
  return mime === 'text/html'
    ? htmlDocument(host, resources, source, base)
    : xmlDocument(host, resources, source, mime, base);
}

export function createGuestDOMParser(
  document: Document,
  resources: GuestResources,
): GuestDOMParserConstructor {
  return class DOMParser implements GuestDOMParser {
    parseFromString(input: string, type: DOMParserSupportedType): Document {
      return parseGuestDocument(document, resources, input, type);
    }
  };
}
