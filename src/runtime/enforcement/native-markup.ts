import { strings, ownDescriptor, internalRecord } from '../../shared/primordials.ts';
import { isUnsafeNativeAttributeMutation } from '../../shared/native-attributes.ts';

interface MarkupOptions {
  /** Compiled initial content may retain inert data scripts and presentation resources. */
  initial?: boolean;
}

/** Check what the browser parsed without relying on publisher-mutable parser ASTs. */
export function createNativeMarkupValidator(fail: (message: string) => never) {
  const apply = Reflect.apply;
  const descriptor = ownDescriptor;
  const nativeDocument = document;
  const implementation = descriptor(Document.prototype, 'implementation')!.get!;
  const createDocument = DOMImplementation.prototype.createHTMLDocument;
  const createXMLDocument = DOMImplementation.prototype.createDocument;
  const createElement = Document.prototype.createElementNS;
  const parseFragment = descriptor(Element.prototype, 'innerHTML')!.set!;
  const serializeFragment = descriptor(Element.prototype, 'innerHTML')!.get!;
  const nodeType = descriptor(Node.prototype, 'nodeType')!.get!;
  const ownerDocument = descriptor(Node.prototype, 'ownerDocument')!.get!;
  const parentNode = descriptor(Node.prototype, 'parentNode')!.get!;
  const contentType = descriptor(Document.prototype, 'contentType')!.get!;
  const defaultView = descriptor(Document.prototype, 'defaultView')!.get!;
  const firstChild = descriptor(Node.prototype, 'firstChild')!.get!;
  const nextSibling = descriptor(Node.prototype, 'nextSibling')!.get!;
  const localName = descriptor(Element.prototype, 'localName')!.get!;
  const namespace = descriptor(Element.prototype, 'namespaceURI')!.get!;
  const attributes = descriptor(Element.prototype, 'attributes')!.get!;
  const attributeCount = descriptor(NamedNodeMap.prototype, 'length')!.get!;
  const attributeAt = NamedNodeMap.prototype.item;
  const attributeName = descriptor(Attr.prototype, 'name')!.get!;
  const attributeValue = descriptor(Attr.prototype, 'value')!.get!;
  const attributeNamespace = descriptor(Attr.prototype, 'namespaceURI')!.get!;
  const attributeLocalName = descriptor(Attr.prototype, 'localName')!.get!;
  const getAttribute = Element.prototype.getAttribute;
  const getAttributeNS = Element.prototype.getAttributeNS;
  const setAttributeNS = Element.prototype.setAttributeNS;
  const setAttribute = Element.prototype.setAttribute;
  const templateContent = descriptor(HTMLTemplateElement.prototype, 'content')!.get!;
  const shadowHost = descriptor(ShadowRoot.prototype, 'host')!.get!;
  const NativeURL = URL;
  const protocol = descriptor(NativeURL.prototype, 'protocol')!.get!;
  const html = 'http://www.w3.org/1999/xhtml';
  const xmlns = 'http://www.w3.org/2000/xmlns/';
  const construction: Document = apply(
    createDocument,
    apply(implementation, nativeDocument, []),
    [''],
  );
  const xmlConstruction: XMLDocument = apply(
    createXMLDocument,
    apply(implementation, nativeDocument, []),
    [null, '', null],
  );
  if (
    apply(defaultView, construction, []) !== null ||
    apply(defaultView, xmlConstruction, []) !== null
  )
    fail('Native markup validation requires viewless documents');

  function localAttribute(name: string): string {
    const lower = strings.toLowerCase(name);
    return strings.slice(lower, strings.lastIndexOf(lower, ':') + 1);
  }

  function checkAttribute(name: string, value: string): void {
    const local = localAttribute(name);
    if (isUnsafeNativeAttributeMutation(local, value))
      fail('Declarative native effect-control mutation is not admitted');
    if (
      strings.startsWith(local, 'on') ||
      local === 'srcdoc' ||
      local === 'is' ||
      local === 'manifest'
    )
      fail('Active native markup attribute is not admitted');
    if (
      (local === 'target' || local === 'formtarget') &&
      strings.toLowerCase(value) !== '_self'
    )
      fail('Native browsing targets must remain in the prepared context');
    if (local === 'show' && strings.toLowerCase(strings.trim(value)) === 'new')
      fail('Declarative browsing-target mutation is not admitted');
    if (local === 'attributename') {
      const target = localAttribute(strings.trim(value));
      if (
        target === 'target' ||
        target === 'formtarget' ||
        target === 'show' ||
        target === 'attributename'
      )
        fail('Declarative browsing-target mutation is not admitted');
    }
    if (
      local === 'href' ||
      local === 'src' ||
      local === 'poster' ||
      local === 'action' ||
      local === 'formaction' ||
      local === 'data'
    ) {
      const scheme: string = apply(
        protocol,
        new NativeURL(value, 'https://privacy.invalid/'),
        [],
      );
      if (scheme === 'javascript:' || scheme === 'vbscript:')
        fail('Executable content URL is not admitted');
    }
  }

  function inspect(value: Node, options: MarkupOptions = internalRecord({})): void {
    const type: number = apply(nodeType, value, []);
    if (type === 7) fail('Processing instructions are not admitted');
    if (type === 1) {
      if (
        apply(namespace, value, []) === html &&
        apply(getAttribute, value, ['spellcheck']) !== 'false'
      )
        apply(setAttribute, value, ['spellcheck', 'false']);
      const name: string = strings.toLowerCase(apply(localName, value, []));
      if (strings.includes(name, ':')) fail('Qualified element names are not admitted');
      switch (name) {
        case 'iframe':
        case 'frame':
        case 'frameset':
        case 'object':
        case 'embed':
        case 'applet':
        case 'portal':
        case 'fencedframe':
        case 'webview':
        case 'base':
          fail('Native context-producing markup is not admitted');
      }
      if (name === 'script') {
        const type: string = strings.toLowerCase(
          strings.trim(apply(getAttribute, value, ['type']) || ''),
        );
        if (
          !options.initial ||
          (type !== 'application/json' && type !== 'application/ld+json') ||
          apply(getAttribute, value, ['src']) !== null ||
          apply(getAttribute, value, ['href']) !== null ||
          apply(getAttribute, value, ['xlink:href']) !== null
        )
          fail('Native executable markup is not admitted');
      }
      if (
        name === 'link' &&
        (!options.initial ||
          strings.toLowerCase(apply(getAttribute, value, ['rel']) || '') !== 'stylesheet')
      )
        fail('Native resource hint is not admitted');
      if (name === 'meta') {
        const metadata: string = strings.toLowerCase(
          apply(getAttribute, value, ['name']) || '',
        );
        if (
          !options.initial ||
          apply(getAttribute, value, ['http-equiv']) !== null ||
          (metadata &&
            metadata !== 'viewport' &&
            metadata !== 'color-scheme' &&
            metadata !== 'theme-color')
        )
          fail('Native response policy markup is not admitted');
      }
      const list: NamedNodeMap = apply(attributes, value, []);
      const length: number = apply(attributeCount, list, []);
      for (let index = 0; index < length; index++) {
        const attribute = apply(attributeAt, list, [index]);
        if (!attribute) fail('Native markup attribute list changed during validation');
        checkAttribute(
          apply(attributeName, attribute, []),
          apply(attributeValue, attribute, []),
        );
      }
      if (name === 'template' && apply(namespace, value, []) === html)
        inspect(apply(templateContent, value, []), options);
    }
    for (
      let child: Node | null = apply(firstChild, value, []);
      child;
      child = apply(nextSibling, child, [])
    )
      inspect(child, options);
  }

  return internalRecord({
    inspect,
    fragment(source: string, context: Element | ShadowRoot): string {
      const element: Element =
        apply(nodeType, context, []) === 1 ? context : apply(shadowHost, context, []);
      const name: string = apply(localName, element, []);
      const ns: string = apply(namespace, element, []);
      const owner: Document = apply(ownerDocument, element, []);
      const htmlParsing = apply(contentType, owner, []) === 'text/html';
      const container: Element = apply(
        createElement,
        htmlParsing ? construction : xmlConstruction,
        [ns, name],
      );
      if (!htmlParsing)
        for (
          let ancestor: Node | null = element;
          ancestor;
          ancestor = apply(parentNode, ancestor, [])
        ) {
          if (apply(nodeType, ancestor, []) !== 1) continue;
          const list: NamedNodeMap = apply(attributes, ancestor, []);
          const length: number = apply(attributeCount, list, []);
          for (let index = 0; index < length; index++) {
            const item = apply(attributeAt, list, [index]);
            if (!item) fail('Native namespace declarations changed during validation');
            if (apply(attributeNamespace, item, []) !== xmlns) continue;
            const local: string = apply(attributeLocalName, item, []);
            if (apply(getAttributeNS, container, [xmlns, local]) === null)
              apply(setAttributeNS, container, [
                xmlns,
                apply(attributeName, item, []),
                apply(attributeValue, item, []),
              ]);
          }
        }
      apply(parseFragment, container, [source]);
      if (name === 'template' && ns === html)
        inspect(apply(templateContent, container, []));
      else
        for (
          let child: Node | null = apply(firstChild, container, []);
          child;
          child = apply(nextSibling, child, [])
        )
          inspect(child);
      return apply(serializeFragment, container, []);
    },
  });
}
