import { strings, internalArray, internalRecord } from '../../shared/primordials.ts';
import { installNativeAttributes } from './native-attributes.ts';
import { createResourceElementPolicy } from './resource-elements.ts';
import {
  fixedNativeAttribute,
  isUnsafeNativeAttributeMutation,
} from '../../shared/native-attributes.ts';
import { elementAllowed } from '../../shared/policy.ts';
import type { TrustedPolicy } from '../trusted/client.ts';
import type { PolicyTools } from './native.ts';
import { installInertDocuments } from './inert-documents.ts';
import { createNativeMarkupValidator } from './native-markup.ts';
import type { ScriptPolicy } from './scripts.ts';
import type { DocumentContextPolicy } from '../contexts/document-factory.ts';

/** Reject context-producing markup before native parsers or insertion run. */
export function installDOMPolicy(
  tools: PolicyTools,
  rawGetAttr: typeof Element.prototype.getAttribute,
  policy: TrustedPolicy,
  scripts?: ScriptPolicy,
  documents?: DocumentContextPolicy,
  mapResourceURL: (input: unknown) => string = String,
) {
  const { apply, descriptor, method, accessor, deny, fail, str } = tools;
  const nativeSetAttribute = Element.prototype.setAttribute;
  const nativeSetAttributeNode = Element.prototype.setAttributeNode;
  const nativeClone = Node.prototype.cloneNode;
  const nativeNamespace = descriptor(Element.prototype, 'namespaceURI')!.get!;
  const nativeMarkup = createNativeMarkupValidator(fail);
  const nativeAttributes = installNativeAttributes(tools);
  const inert = installInertDocuments(tools, policy);
  const resourceElements = createResourceElementPolicy(tools, mapResourceURL);
  // The read-only relList view must never call publisher-replaceable methods
  // with its private native token list as the receiver.
  const tokenSupports = DOMTokenList.prototype.supports;
  const tokenContains = DOMTokenList.prototype.contains;
  const tokenItem = DOMTokenList.prototype.item;
  const tokenLength = descriptor(DOMTokenList.prototype, 'length')!.get!;
  const tokenValue = descriptor(DOMTokenList.prototype, 'value')!.get!;
  const nativeParent = descriptor(Node.prototype, 'parentNode')!.get!;
  const nativeConnected = descriptor(Node.prototype, 'isConnected')!.get!;
  const nativeType = descriptor(Node.prototype, 'nodeType')!.get!;
  const rangePrototype = Range.prototype;
  const NativeMetaElement = globalThis.HTMLMetaElement;
  // Pure parsing is isolated; native construction and inspection remain local.
  const textHTML = (value: unknown, context: Element | ShadowRoot) => {
    const source = str(value);
    const text =
      documents && !inert.owns(context) ? documents.markup(source, context) : source;
    policy.validateMarkup(text);
    return nativeMarkup.fragment(text, context);
  };
  for (const proto of [Element.prototype, ShadowRoot.prototype]) {
    for (const key of ['innerHTML', 'outerHTML']) {
      const d = descriptor(proto, key);
      if (d?.set)
        accessor(
          proto,
          key,
          internalRecord({
            set(this: Element | ShadowRoot, value) {
              if (key === 'innerHTML' && scripts?.isScript(this)) {
                scripts.text(this, value === null ? '' : str(value));
                return;
              }
              const target =
                documents && key === 'outerHTML' ? documents.mutationTarget(this) : this;
              const parent: Node | null = apply(nativeParent, target, []);
              const context =
                key === 'outerHTML' && parent && apply(nativeType, parent, []) === 1
                  ? (parent as Element)
                  : this;
              try {
                return apply(d.set!, target, [textHTML(value, context)]);
              } finally {
                if (!inert.owns(this))
                  documents?.afterMarkup(key === 'outerHTML' ? parent || this : this);
              }
            },
          }),
        );
    }
    for (const key of ['setHTML', 'setHTMLUnsafe', 'getHTML'])
      if (key !== 'getHTML') method(proto, key, deny);
  }
  const adjacent = Element.prototype.insertAdjacentHTML;
  method(
    Element.prototype,
    'insertAdjacentHTML',
    function (this: Element, position: unknown, html: unknown) {
      const where = str(position);
      const target =
        documents && ['beforebegin', 'afterend'].includes(strings.toLowerCase(where))
          ? documents.mutationTarget(this)
          : this;
      const parent: Node | null = apply(nativeParent, target, []);
      const context =
        ['beforebegin', 'afterend'].includes(strings.toLowerCase(where)) &&
        parent &&
        apply(nativeType, parent, []) === 1
          ? (parent as Element)
          : this;
      try {
        return apply(adjacent, target, [where, textHTML(html, context)]);
      } finally {
        if (!inert.owns(this)) documents?.afterMarkup(parent || this);
      }
    },
  );
  method(Range.prototype, 'createContextualFragment', deny);
  method(Document.prototype, 'createProcessingInstruction', deny);
  for (const key of ['parseHTML', 'parseHTMLUnsafe']) method(Document, key, deny);
  method(DOMImplementation.prototype, 'createDocumentType', deny);
  // Autonomous elements execute application callbacks in this prepared realm.
  // Customized built-ins could replace native context/resource element classes.
  if (globalThis.CustomElementRegistry) {
    const nativeDefine = CustomElementRegistry.prototype.define;
    method(
      CustomElementRegistry.prototype,
      'define',
      function (
        this: CustomElementRegistry,
        name: unknown,
        constructor: unknown,
        options?: unknown,
      ) {
        if (options !== undefined) fail('Customized built-in elements are not admitted');
        return apply(nativeDefine, this, [str(name), constructor]);
      },
    );
    // Scoped registry initialization has a separate lifecycle; retain its gate.
    method(CustomElementRegistry.prototype, 'initialize', deny);
  }

  const create = Document.prototype.createElement,
    createNS = Document.prototype.createElementNS;
  method(
    Document.prototype,
    'createElement',
    function (this: Document, name: unknown, options?: unknown) {
      const tag = str(name);
      const passive = inert.owns(this);
      if (
        !(passive && strings.toLowerCase(tag) === 'base') &&
        (passive ||
          !documents ||
          !['iframe', 'object'].includes(strings.toLowerCase(tag)))
      )
        elementAllowed(tag);
      if (passive && ['script', 'link', 'meta'].includes(strings.toLowerCase(tag)))
        fail('DOM construction must remain passive');
      if (options !== undefined) fail('Customized built-in elements are not admitted');
      if (
        strings.toLowerCase(tag) === 'meta' ||
        (strings.toLowerCase(tag) === 'script' && !scripts)
      )
        fail('Dynamic policy/resource elements are not admitted');
      const node: Element = apply(create, this, [tag]);
      nativeAttributes.prepare(node);
      inert.track(node);
      if (!inert.owns(this)) documents?.created(node);
      return node;
    },
  );
  method(
    Document.prototype,
    'createElementNS',
    function (this: Document, namespace: unknown, name: unknown, options?: unknown) {
      const ns = namespace == null ? null : str(namespace),
        tag = str(name);
      const passive = inert.owns(this);
      if (
        !(
          passive &&
          ns === 'http://www.w3.org/1999/xhtml' &&
          strings.toLowerCase(tag) === 'base'
        ) &&
        (passive ||
          !documents ||
          ns !== 'http://www.w3.org/1999/xhtml' ||
          !['iframe', 'object'].includes(strings.toLowerCase(tag)))
      )
        elementAllowed(tag);
      if (passive && ['script', 'link', 'meta'].includes(strings.toLowerCase(tag)))
        fail('DOM construction must remain passive');
      if (
        (!passive &&
          ![
            'http://www.w3.org/1999/xhtml',
            'http://www.w3.org/2000/svg',
            'http://www.w3.org/1998/Math/MathML',
          ].includes(ns || '')) ||
        options !== undefined
      )
        fail('Unsupported namespace/options');
      if (
        strings.toLowerCase(tag) === 'meta' ||
        (strings.toLowerCase(tag) === 'link' && ns !== 'http://www.w3.org/1999/xhtml') ||
        (strings.toLowerCase(tag) === 'script' &&
          (!scripts || ns !== 'http://www.w3.org/1999/xhtml'))
      )
        fail('Dynamic policy/resource elements are not admitted');
      const node: Element = apply(createNS, this, [ns, tag]);
      nativeAttributes.prepare(node);
      inert.track(node);
      if (!inert.owns(this)) documents?.created(node);
      return node;
    },
  );
  const nodeType = descriptor(Node.prototype, 'nodeType')!.get!;
  const first = descriptor(Node.prototype, 'firstChild')!.get!,
    next = descriptor(Node.prototype, 'nextSibling')!.get!;
  const local = descriptor(Element.prototype, 'localName')!.get!;
  const template =
    globalThis.HTMLTemplateElement &&
    descriptor(HTMLTemplateElement.prototype, 'content')!.get!;
  function inspect(node: unknown) {
    let type;
    try {
      type = apply(nodeType, node, []);
    } catch {
      return;
    }
    if (type === 7) fail('Processing instructions are not admitted');
    if (type === 1) {
      const tag = apply(local, node, []);
      nativeAttributes.prepare(node as Element);
      if (!documents?.isContextElement(node)) elementAllowed(tag);
      if (strings.toLowerCase(tag) === 'script') {
        if (scripts && scripts.isScript(node)) scripts.prepare(node);
        else fail('Dynamic script context is not admitted');
      } else if (strings.toLowerCase(tag) === 'link') {
        if (!resourceElements.prepare(node))
          fail('Dynamic resource element is not admitted');
      } else if (strings.toLowerCase(tag) === 'meta')
        fail('Dynamic policy/resource elements are not admitted');
      if (tag === 'template' && template) inspect(apply(template, node, []));
    }
    for (let child = apply(first, node, []); child; child = apply(next, child, []))
      inspect(child);
  }
  function insertion(
    proto: object,
    key: string,
    indices?: (args: unknown[]) => number[],
  ) {
    const fn = Reflect.get(proto, key);
    if (typeof fn !== 'function') return;
    method(proto, key, function (this: Element, ...args: unknown[]) {
      args = internalArray(args);
      if (documents && proto === rangePrototype && key === 'surroundContents')
        documents.prepareRange(this as unknown as Range);
      // WebIDL string conversion can run application code. Finish those
      // conversions before deciding whether the destination is still viewless.
      if (
        [
          'append',
          'prepend',
          'replaceChildren',
          'before',
          'after',
          'replaceWith',
        ].includes(key)
      )
        args = args.map((value) => {
          try {
            apply(nodeType, value, []);
            return value;
          } catch {
            return str(value);
          }
        });
      if (key === 'insertAdjacentElement') args[0] = str(args[0]);
      const passive = inert.owns(this);
      for (const i of indices ? indices(args) : args.map((_, i) => i)) {
        if (passive) {
          inert.inspect(args[i], true);
          continue;
        }
        if (inert.owns(args[i])) inert.inspect(args[i]);
        if (documents)
          args[i] = documents.prepareTree(
            args[i],
            key === 'moveBefore' && apply(nativeConnected, this, []),
          );
        inspect(args[i]);
      }
      if (scripts?.isScript(this)) scripts.prepare(this);
      if (documents && key === 'replaceChild' && args[1] && typeof args[1] === 'object') {
        const old = documents.mutationTarget(args[1] as Node);
        if (apply(nativeParent, old, []) === this) args[1] = old;
      }
      const target =
        documents && ['before', 'after', 'replaceWith'].includes(key)
          ? documents.mutationTarget(this)
          : this;
      try {
        const result = apply(fn, target, args);
        return documents ? documents.publicNode(result) : result;
      } finally {
        if (!passive) documents?.settle();
      }
    });
  }
  for (const name of ['appendChild', 'insertBefore', 'replaceChild'])
    insertion(Node.prototype, name, () => [0]);
  for (const proto of [Element.prototype, Document.prototype, DocumentFragment.prototype])
    for (const name of ['append', 'prepend', 'replaceChildren', 'moveBefore'])
      insertion(proto, name, name === 'moveBefore' ? () => [0] : undefined);
  for (const proto of [
    Element.prototype,
    CharacterData.prototype,
    DocumentType.prototype,
  ])
    for (const name of ['before', 'after', 'replaceWith']) insertion(proto, name);
  insertion(Element.prototype, 'insertAdjacentElement', () => [1]);
  insertion(Range.prototype, 'insertNode', () => [0]);
  insertion(Range.prototype, 'surroundContents', () => [0]);
  for (const [proto, key] of [
    [Node.prototype, 'removeChild'],
    [Element.prototype, 'remove'],
    [CharacterData.prototype, 'remove'],
    [DocumentType.prototype, 'remove'],
    [Range.prototype, 'deleteContents'],
    [Range.prototype, 'extractContents'],
  ] as const) {
    const fn = Reflect.get(proto, key);
    if (typeof fn !== 'function') continue;
    method(proto, key, function (this: Node, ...args: unknown[]) {
      args = internalArray(args);
      let target = this;
      if (documents && key === 'remove') target = documents.mutationTarget(this);
      if (documents && key === 'removeChild' && args[0] && typeof args[0] === 'object') {
        const candidate = documents.mutationTarget(args[0] as Node);
        if (apply(nativeParent, candidate, []) === this) args[0] = candidate;
      }
      try {
        const result = apply(fn, target, args);
        return documents ? documents.publicNode(result) : result;
      } finally {
        documents?.settle();
      }
    });
  }
  {
    const clone = Node.prototype.cloneNode;
    method(Node.prototype, 'cloneNode', function (this: Node, deep?: boolean) {
      inert.rejectInstructions(this);
      documents?.assertTransfer(this);
      const result: Node = apply(clone, this, [deep]);
      if (inert.owns(this)) inert.track(result);
      documents?.cloned(this, result);
      if (!inert.owns(result)) nativeAttributes.tree(result);
      return result;
    });
    for (const key of ['importNode', 'adoptNode'] as const) {
      const fn = Document.prototype[key];
      method(
        Document.prototype,
        key,
        function (this: Document, node: Node, deep?: boolean) {
          const passive = inert.owns(this);
          inert.rejectInstructions(node);
          if (passive || inert.owns(node)) inert.inspect(node, passive);
          documents?.assertTransfer(node, key === 'adoptNode');
          const result: Node = apply(
            fn,
            this,
            key === 'importNode' ? [node, deep] : [node],
          );
          if (passive) inert.track(result);
          if (!passive) nativeAttributes.tree(result);
          if (key === 'importNode') documents?.cloned(node, result);
          documents?.settle();
          return result;
        },
      );
    }
  }
  // Getter restrictions add protection if a context-producing browser path is missed.
  for (const ctor of [
    globalThis.HTMLIFrameElement,
    globalThis.HTMLFrameElement,
    globalThis.HTMLObjectElement,
    globalThis.HTMLEmbedElement,
  ])
    if (ctor) {
      for (const key of ['contentWindow', 'contentDocument', 'getSVGDocument']) {
        const d = descriptor(ctor.prototype, key);
        if (d?.get)
          accessor(
            ctor.prototype,
            key,
            internalRecord({
              get(this: Element) {
                return documents ? documents.reference(this, key) : deny();
              },
            }),
          );
        else if (d?.value)
          method(ctor.prototype, key, function (this: Element) {
            return documents ? documents.reference(this, key) : deny();
          });
      }
    }

  if (documents) {
    for (const ctor of [HTMLIFrameElement, HTMLObjectElement]) {
      for (const key of [
        'src',
        'srcdoc',
        'name',
        'sandbox',
        'loading',
        'credentialless',
        'data',
        'type',
      ]) {
        const d = descriptor(ctor.prototype, key);
        if (!d?.get && !d?.set) continue;
        accessor(
          ctor.prototype,
          key,
          internalRecord({
            ...(d.get
              ? internalRecord({
                  get(this: Element) {
                    return documents.property(this, key);
                  },
                })
              : internalRecord({})),
            ...(d.set
              ? internalRecord({
                  set(this: Element, value: unknown) {
                    documents.attribute(
                      this,
                      key,
                      key === 'credentialless' ? (value ? '' : null) : str(value),
                    );
                  },
                })
              : internalRecord({})),
          }),
        );
      }
    }
    for (const key of ['getAttribute', 'getAttributeNS'] as const) {
      const fn = Element.prototype[key];
      method(Element.prototype, key, function (this: Element, ...args: unknown[]) {
        args = internalArray(args);
        const name = str(args[key === 'getAttributeNS' ? 1 : 0]);
        const virtual = documents.readAttribute(this, name);
        return virtual ? virtual.value : apply(fn, this, args);
      });
    }
  }

  // Reflected properties and Attr objects must not bypass element policy.
  for (const ctor of [
    globalThis.HTMLLinkElement,
    globalThis.HTMLMetaElement,
    ...(scripts ? [] : [globalThis.HTMLScriptElement]),
  ])
    if (ctor) {
      for (const key of Object.getOwnPropertyNames(ctor.prototype)) {
        const d = descriptor(ctor.prototype, key);
        if (d?.set || key === 'relList')
          accessor(
            ctor.prototype,
            key,
            internalRecord({
              ...(d?.set
                ? internalRecord({
                    set(value) {
                      if (ctor === globalThis.HTMLLinkElement) {
                        const text = resourceElements.attribute(this, key, value);
                        if (text !== undefined)
                          return apply(d.set!, this, [
                            key === 'disabled' ? Boolean(value) : text,
                          ]);
                      }
                      if (
                        ctor === NativeMetaElement &&
                        key === 'content' &&
                        apply(rawGetAttr, this, ['name']) === 'theme-color' &&
                        apply(rawGetAttr, this, ['http-equiv']) === null
                      )
                        return apply(d.set!, this, [str(value)]);
                      return deny();
                    },
                  })
                : internalRecord({})),
              ...(key === 'relList'
                ? internalRecord({
                    get() {
                      const list = apply(d!.get!, this, []);
                      return Object.freeze(
                        internalRecord({
                          supports: (token: unknown) =>
                            apply(tokenSupports, list, [str(token)]),
                          contains: (token: unknown) =>
                            apply(tokenContains, list, [str(token)]),
                          item: (index: number) => apply(tokenItem, list, [index]),
                          get length() {
                            return apply(tokenLength, list, []);
                          },
                          get value() {
                            return apply(tokenValue, list, []);
                          },
                          toString: () => apply(tokenValue, list, []),
                          add: deny,
                          remove: deny,
                          toggle: deny,
                          replace: deny,
                          [Symbol.iterator]() {
                            // Native token-list iteration can defer reads of its
                            // receiver's mutable prototype. Yield a string snapshot
                            // so no iterator retains the private native token list.
                            const length = apply(tokenLength, list, []);
                            const tokens = internalArray<string>();
                            for (let index = 0; index < length; index++) {
                              tokens.push(apply(tokenItem, list, [index])!);
                            }
                            return tokens[Symbol.iterator]();
                          },
                        }),
                      );
                    },
                  })
                : internalRecord({})),
            }),
          );
      }
    }

  const ownerElement = descriptor(Attr.prototype, 'ownerElement')!.get!;
  const attrName = descriptor(Attr.prototype, 'name')!.get!;
  const attrValue = descriptor(Attr.prototype, 'value')!.get!;
  const setAttrValue = descriptor(Attr.prototype, 'value')!.set!;
  const attrNamespace = descriptor(Attr.prototype, 'namespaceURI')!.get!;
  const sensitive = (node: unknown) => {
    const tag = strings.toLowerCase(apply(local, node, []));
    if (['link', 'meta', 'script'].includes(tag)) fail('Policy element is immutable');
  };
  for (const [proto, key] of [
    [Attr.prototype, 'value'],
    [Node.prototype, 'nodeValue'],
    [Node.prototype, 'textContent'],
  ] as const) {
    const d = descriptor(proto, key);
    if (d?.set)
      accessor(
        proto,
        key,
        internalRecord({
          set(value) {
            if (key === 'textContent' && scripts?.isScript(this)) {
              scripts.text(this, value === null || value === undefined ? '' : str(value));
              return;
            }
            if (apply(nodeType, this, []) === 2) {
              const owner = apply(ownerElement, this, []);
              if (
                owner &&
                documents?.attribute(
                  owner,
                  apply(attrName, this, []),
                  value == null ? '' : str(value),
                )
              )
                return;
              if (owner) {
                sensitive(owner);
                value = nativeAttributes.attribute(
                  apply(attrName, this, []),
                  value ?? '',
                  owner,
                );
              }
            }
            return apply(d.set!, this, [value]);
          },
        }),
      );
  }
  for (const key of ['setAttributeNode', 'setAttributeNodeNS']) {
    const fn = Reflect.get(Element.prototype, key);
    method(Element.prototype, key, function (this: Element, ...args: unknown[]) {
      args = internalArray(args);
      const attr = args[0] as Attr | undefined;
      const name = strings.toLowerCase(str(apply(attrName, attr, [])));
      if (documents?.attribute(this, name, apply(attrValue, attr, []))) return null;
      sensitive(this);
      const checked = nativeAttributes.attribute(name, apply(attrValue, attr, []), this);
      const nativeValue = descriptor(Attr.prototype, 'value')!.set!;
      apply(nativeValue, attr, [checked]);
      if (['srcdoc', 'is'].includes(name) || strings.startsWith(name, 'on'))
        fail('Attribute not admitted');
      return apply(fn, this, args);
    });
  }
  // NamedNodeMap setters can recover their target only after mutation. Refuse them.
  for (const key of ['setNamedItem', 'setNamedItemNS'])
    method(NamedNodeMap.prototype, key, deny);
  for (const key of ['removeNamedItem', 'removeNamedItemNS'])
    method(NamedNodeMap.prototype, key, deny);
  for (const key of ['removeAttribute', 'removeAttributeNS', 'removeAttributeNode']) {
    const fn = Reflect.get(Element.prototype, key);
    method(Element.prototype, key, function (this: Element, ...args: unknown[]) {
      args = internalArray(args);
      if (key === 'removeAttributeNS') args[0] = args[0] == null ? null : str(args[0]);
      const name =
        key === 'removeAttributeNode'
          ? apply(attrName, args[0], [])
          : str(args[key === 'removeAttributeNS' ? 1 : 0]);
      if (key !== 'removeAttributeNode') args[key === 'removeAttributeNS' ? 1 : 0] = name;
      const fixed = fixedNativeAttribute(name, apply(nativeNamespace, this, []));
      if (fixed === 'false') {
        if (
          (key === 'removeAttributeNS' && args[0] != null && str(args[0]) !== '') ||
          (key === 'removeAttributeNode' && apply(attrNamespace, args[0], []) !== null)
        )
          return apply(fn, this, args);
        if (key === 'removeAttributeNode') {
          if (apply(ownerElement, args[0], []) !== this) return apply(fn, this, args);
          // Replace atomically so callbacks never observe an enabled control.
          const replacement = apply(nativeClone, args[0], [false]);
          apply(setAttrValue, replacement, ['false']);
          return apply(nativeSetAttributeNode, this, [replacement]);
        }
        // Ordinary removal leaves the physical control disabled, like toggle.
        return;
      }
      if (fixed !== undefined) {
        // The physical target remains explicit even after removal (SVG xlink:show).
        const result = apply(fn, this, args);
        apply(nativeSetAttribute, this, [name, '_self']);
        return result;
      }
      if (documents?.attribute(this, name, null))
        return key === 'removeAttributeNode' ? args[0] : undefined;
      return apply(fn, this, args);
    });
  }
}

/** URL setters are installed last, after storage and every parser entry point. */
export function installResourceAttributePolicy(
  tools: PolicyTools,
  mapURL: (input: unknown) => string,
  scripts?: ScriptPolicy,
  documents?: DocumentContextPolicy,
  mapNavigationURL?: (input: unknown) => string,
) {
  const { apply, descriptor, method, fail, str } = tools;
  const local = descriptor(Element.prototype, 'localName')!.get!;
  const namespace = descriptor(Element.prototype, 'namespaceURI')!.get!;
  const nativeSetAttribute = Element.prototype.setAttribute;
  const resourceElements = createResourceElementPolicy(tools, mapURL);
  // Meta policy remains immutable; dynamic links receive restricted resource roles.
  for (const name of ['setAttribute', 'setAttributeNS', 'toggleAttribute']) {
    const fn = Reflect.get(Element.prototype, name);
    method(Element.prototype, name, function (this: Element, ...args: unknown[]) {
      args = internalArray(args);
      const tag = strings.toLowerCase(apply(local, this, []));
      if (tag === 'meta' || (tag === 'script' && !scripts))
        fail('Policy element is immutable');
      if (name === 'setAttributeNS') args[0] = args[0] == null ? null : str(args[0]);
      const nameIndex = name === 'setAttributeNS' ? 1 : 0;
      const attributeName = str(args[nameIndex]);
      args[nameIndex] = attributeName;
      const key = strings.toLowerCase(attributeName);
      if (name !== 'toggleAttribute') {
        const valueIndex = name === 'setAttributeNS' ? 2 : 1;
        args[valueIndex] = str(args[valueIndex]);
      }
      if (tag === 'link') {
        if (name === 'setAttributeNS' && args[0] != null && str(args[0]) !== '')
          fail('Namespaced resource attributes are not admitted');
        const valueIndex = name === 'setAttributeNS' ? 2 : 1;
        const checked = resourceElements.attribute(
          this,
          key,
          name === 'toggleAttribute' ? '' : args[valueIndex],
        );
        if (checked === undefined) fail('Dynamic resource element is not admitted');
        if (name !== 'toggleAttribute') args[valueIndex] = checked;
      }
      const fixed = fixedNativeAttribute(key, apply(namespace, this, []));
      if (fixed !== undefined) {
        if (name === 'toggleAttribute') {
          // Native controls remain explicit even when toggled off by the caller.
          apply(nativeSetAttribute, this, [attributeName, fixed]);
          return true;
        }
        const index = name === 'setAttributeNS' ? 2 : 1;
        str(args[index]);
        args[index] = fixed;
      } else if (
        name !== 'toggleAttribute' &&
        isUnsafeNativeAttributeMutation(key, str(args[name === 'setAttributeNS' ? 2 : 1]))
      ) {
        fail('Declarative native effect-control mutation is not admitted');
      }
      if (documents && name === 'toggleAttribute') {
        const current = documents.readAttribute(this, key);
        if (current) {
          const present = args.length > 1 ? Boolean(args[1]) : current.value === null;
          documents.attribute(this, key, present ? '' : null);
          return present;
        }
      } else if (
        documents?.attribute(this, key, str(args[name === 'setAttributeNS' ? 2 : 1]))
      )
        return;
      if (key === 'srcdoc' || key === 'is' || strings.startsWith(key, 'on'))
        fail('Attribute not admitted');
      if (scripts?.isScript(this)) {
        if (name === 'setAttributeNS') {
          const namespace = args[0] == null ? null : str(args[0]);
          if (namespace !== null && namespace !== '')
            fail('Namespaced script attributes are not admitted');
          args[0] = namespace;
        }
        if (name === 'toggleAttribute') {
          scripts.attribute(this, key, '');
        } else {
          const valueIndex = name === 'setAttributeNS' ? 2 : 1;
          args[valueIndex] = scripts.attribute(this, key, args[valueIndex]);
        }
        return apply(fn, this, args);
      }
      if (
        name !== 'toggleAttribute' &&
        ['src', 'href', 'poster', 'xlink:href'].includes(key)
      ) {
        const index = name === 'setAttributeNS' ? 2 : 1;
        args[index] =
          key === 'href' &&
          (tag === 'a' || tag === 'area') &&
          apply(namespace, this, []) === 'http://www.w3.org/1999/xhtml' &&
          mapNavigationURL
            ? mapNavigationURL(args[index])
            : mapURL(args[index]);
      }
      return apply(fn, this, args);
    });
  }
}
