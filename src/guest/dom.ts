import { parse, parseFragment, type DefaultTreeAdapterTypes as Tree } from 'parse5';
import { GuestResources } from './resources.ts';
import { rewriteGuestCSS } from './css.ts';
import { parsedElementSource } from './parser.ts';
import { isHTMLIFrameElement, isHTMLTemplateElement } from './contexts/brands.ts';

interface ScriptSource {
  source?: string;
  code: string;
  type: string;
}
export interface GuestDOMOptions {
  document: Document;
  resources: GuestResources;
  evaluate(code: string, url: string, module: boolean): unknown;
  child?(frame: HTMLIFrameElement): void;
  frameAttribute?(frame: HTMLIFrameElement, name: string, value: string): boolean;
  error(error: unknown): void;
}

function effectAttribute(name: string, namespace?: string | null): string {
  const qualified = name.toLowerCase();
  const local = qualified.slice(qualified.lastIndexOf(':') + 1);
  if (namespace === 'http://www.w3.org/XML/1998/namespace' && local === 'base')
    return 'xml:base';
  if (namespace === 'http://www.w3.org/1999/xlink' && local === 'href') return 'href';
  return qualified;
}

/** Pure HTML parsing precedes every native node insertion. Scripts stay inert. */
export class GuestDOM {
  private scripts = new WeakMap<Element, ScriptSource>();
  private executed = new WeakSet<Element>();
  private prepared = new WeakSet<Node>();
  private resourceHints = new WeakMap<Element, { key: string }>();
  private pending: Element[] = [];
  private ready = false;
  private current: Element | null = null;
  private attributes = new WeakMap<Element, Map<string, string>>();
  private removedAttributes = new WeakMap<Element, Set<string>>();
  readyState: DocumentReadyState = 'loading';
  private observer: MutationObserver;
  private eventConstructor: typeof Event;

  constructor(private options: GuestDOMOptions) {
    this.eventConstructor = options.document.defaultView
      ? Reflect.get(options.document.defaultView, 'Event')
      : Event;
    this.observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) this.connected(node);
      }
    });
    this.observer.observe(options.document, { childList: true, subtree: true });
  }

  get currentScript(): Element | null {
    return this.current;
  }
  script(element: Element): ScriptSource | undefined {
    return this.scripts.get(element);
  }
  logicalAttribute(
    element: Element,
    name: string,
    namespace?: string | null,
  ): string | undefined {
    const key = effectAttribute(name, namespace);
    if (this.removedAttributes.get(element)?.has(key)) return;
    const value = this.attributes.get(element)?.get(key);
    if (value !== undefined) return value;
    if (key === 'href' && ['a', 'area'].includes(element.localName)) {
      const cloned = element.getAttribute('data-pf-href');
      if (cloned !== null) return cloned;
    }
    return parsedElementSource(element)?.attributes.get(name);
  }
  forgetAttribute(element: Element, name: string, namespace?: string | null): void {
    const key = effectAttribute(name, namespace);
    this.attributes.get(element)?.delete(key);
    let removed = this.removedAttributes.get(element);
    if (!removed) {
      removed = new Set();
      this.removedAttributes.set(element, removed);
    }
    removed.add(key);
    if (key === 'href') element.removeAttribute('data-pf-href');
  }
  scriptText(element: Element, text: string): void {
    const script = this.scripts.get(element) || {
      code: '',
      type: element.getAttribute('type') || '',
    };
    script.code = text;
    this.scripts.set(element, script);
  }

  attribute(
    element: Element,
    name: string,
    value: string,
    namespace?: string | null,
  ): boolean {
    const key = effectAttribute(name, namespace);
    this.removedAttributes.get(element)?.delete(key);
    this.attributes.get(element)?.set(key, value);
    if (
      ![
        'http://www.w3.org/1999/xhtml',
        'http://www.w3.org/2000/svg',
        'http://www.w3.org/1998/Math/MathML',
      ].includes(element.namespaceURI || '')
    )
      return true;
    if (
      key === 'target' &&
      (element.localName === 'a' ||
        element.localName === 'area' ||
        element.namespaceURI === 'http://www.w3.org/1998/Math/MathML')
    ) {
      let attributes = this.attributes.get(element);
      if (!attributes) {
        attributes = new Map();
        this.attributes.set(element, attributes);
      }
      attributes.set(key, value);
      element.setAttribute(name, '_self');
      return false;
    }
    if (
      ['object', 'embed'].includes(element.localName) &&
      ['data', 'src', 'codebase', 'classid', 'archive'].includes(key)
    ) {
      let attributes = this.attributes.get(element);
      if (!attributes) {
        attributes = new Map();
        this.attributes.set(element, attributes);
      }
      attributes.set(key, value);
      element.removeAttribute(name);
      return false;
    }
    if (key === 'xml:base') {
      let attributes = this.attributes.get(element);
      if (!attributes) {
        attributes = new Map();
        this.attributes.set(element, attributes);
      }
      attributes.set(key, value);
      return false;
    }
    if (key === 'spellcheck' || key === 'writingsuggestions' || key === 'autocorrect') {
      element.setAttribute(key, key === 'autocorrect' ? 'off' : 'false');
      return false;
    }
    if (
      key === 'attributename' &&
      /^(?:[^:]+:)?(?:href|src|srcdoc|target|formtarget|action|formaction|ping|attributionsrc|nonce|http-equiv|content|rel|base|referrerpolicy|spellcheck|writingsuggestions|autocorrect)$/i.test(
        value.trim(),
      )
    )
      throw new DOMException(
        'Declarative native effect changes are unavailable',
        'SecurityError',
      );
    if (key === 'ping' || key === 'attributionsrc') return false;
    if (key === 'nonce' || key === 'integrity' || key === 'is') return false;
    if (element.localName === 'meta' && key === 'http-equiv') return false;
    if (key === 'rel' && /(?:preconnect|dns-prefetch|prefetch|prerender)/i.test(value))
      return false;
    if (element.localName === 'link' && (key === 'rel' || key === 'href')) {
      let attributes = this.attributes.get(element);
      if (!attributes) {
        attributes = new Map();
        this.attributes.set(element, attributes);
      }
      attributes.set(key, value);
      const rel =
        this.logicalAttribute(element, 'rel') ?? element.getAttribute('rel') ?? '';
      if (this.isResourceHint(rel)) {
        // Catalog bytes are already cached. Complete the hint from that catalog;
        // separately inserted scripts still execute through the guest loader.
        element.removeAttribute('href');
        if (key === 'rel') element.setAttribute('rel', value);
        this.resourceHint(element);
        return false;
      }
      this.resourceHints.delete(element);
      if (key === 'rel') {
        element.setAttribute('rel', value);
        const href = this.logicalAttribute(element, 'href');
        if (href !== undefined)
          element.setAttribute('href', this.options.resources.nativeURL(href));
        return false;
      }
    }
    if (element.localName === 'script') {
      const script = this.scripts.get(element) || {
        code: element.textContent || '',
        type: element.getAttribute('type') || '',
      };
      if (key === 'src' || key === 'href') {
        script.source = this.options.resources.resolve(value);
        this.scripts.set(element, script);
        this.connected(element);
        return false;
      }
      if (key === 'type') {
        script.type = value;
        this.scripts.set(element, script);
        return false;
      }
    }
    if (key.startsWith('on')) {
      element.removeAttribute(name);
      const callback = this.options.evaluate(
        '(function(event){' + value + '\n})',
        'inline-handler.js',
        false,
      );
      if (typeof callback === 'function') Reflect.set(element, key, callback);
      return false;
    }
    if (element.localName === 'iframe' && (key === 'srcdoc' || key === 'src')) {
      if (!this.options.frameAttribute?.(element as HTMLIFrameElement, key, value))
        throw new DOMException(
          'Child document preparation is unavailable',
          'SecurityError',
        );
      return false;
    }
    if (key === 'style') {
      element.setAttribute(name, this.css(value));
      return false;
    }
    if (key === 'srcset') {
      element.setAttribute(
        name,
        value
          .split(',')
          .map((part) => {
            const [url, ...descriptor] = part.trim().split(/\s+/);
            return [this.options.resources.nativeURL(url), ...descriptor].join(' ');
          })
          .join(', '),
      );
      return false;
    }
    if (['src', 'href', 'poster', 'background', 'xlink:href'].includes(key)) {
      let attributes = this.attributes.get(element);
      if (!attributes) {
        attributes = new Map();
        this.attributes.set(element, attributes);
      }
      attributes.set(key, value);
      if (
        key === 'href' &&
        (element.localName === 'a' ||
          element.localName === 'area' ||
          element.namespaceURI === 'http://www.w3.org/1998/Math/MathML')
      ) {
        // Even a fragment can open an HTTP tab through modifier activation.
        // The host performs local link actions; native anchors cannot navigate.
        element.removeAttribute('href');
        element.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
        // Native cloning preserves this untrusted destination. The host still
        // validates every activation as a local fragment or an approved export.
        element.setAttribute('data-pf-href', value);
        if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '0');
        if (!element.hasAttribute('role')) element.setAttribute('role', 'link');
      } else {
        const physical = this.options.resources.nativeURL(value);
        if (namespace) element.setAttributeNS(namespace, name, physical);
        else element.setAttribute(name, physical);
      }
      return false;
    }
    if (key === 'action' || key === 'formaction') return false;

    return true;
  }

  prepare(node: Node): void {
    if (this.prepared.has(node)) return;
    this.prepared.add(node);
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      if (
        ![
          'http://www.w3.org/1999/xhtml',
          'http://www.w3.org/2000/svg',
          'http://www.w3.org/1998/Math/MathML',
        ].includes(element.namespaceURI || '')
      ) {
        for (const child of Array.from(node.childNodes)) this.prepare(child);
        return;
      }
      if (
        ['base', 'applet', 'portal', 'fencedframe', 'frame', 'frameset'].includes(
          element.localName,
        )
      )
        throw new DOMException(
          'Native context element is not available',
          'SecurityError',
        );
      if (element.namespaceURI === 'http://www.w3.org/1999/xhtml') {
        element.setAttribute('spellcheck', 'false');
        element.setAttribute('writingsuggestions', 'false');
        element.setAttribute('autocorrect', 'off');
      }
      const parsed = parsedElementSource(element);
      if (parsed && !this.attributes.has(element)) {
        this.attributes.set(element, new Map(parsed.attributes));
        for (const [name, source] of parsed.handlers)
          this.attribute(element, name, source);
        if (parsed.script) {
          this.scripts.set(element, parsed.script);
          this.executed.add(element);
        }
        if (isHTMLIFrameElement(element))
          for (const name of ['src', 'srcdoc']) {
            const value = parsed.attributes.get(name);
            if (value !== undefined) this.attribute(element, name, value);
          }
      }
      if (element.localName === 'script' && !this.scripts.has(element)) {
        this.scripts.set(element, {
          source: element.getAttribute('src') || undefined,
          code: element.textContent || '',
          type: element.getAttribute('type') || '',
        });
        element.setAttribute('type', 'application/x-privacy-frames-inert');
        element.removeAttribute('src');
        element.removeAttribute('nonce');
      }
      for (const attribute of Array.from(element.attributes)) {
        if (attribute.name === 'type' && element.localName === 'script') continue;
        const value = attribute.value;
        element.removeAttributeNode(attribute);
        if (this.attribute(element, attribute.name, value, attribute.namespaceURI)) {
          if (attribute.namespaceURI)
            element.setAttributeNS(attribute.namespaceURI, attribute.name, value);
          else element.setAttribute(attribute.name, value);
        }
      }
      if (element.localName === 'style')
        element.textContent = this.css(element.textContent || '');
      if (isHTMLIFrameElement(element)) this.options.child?.(element);
    }
    for (const child of Array.from(node.childNodes)) this.prepare(child);
  }

  connected(node: Node): void {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      if (element.localName === 'link' && node.isConnected) this.resourceHint(element);
      if (element.localName === 'script' && node.isConnected) {
        if (this.ready) void this.execute(element);
        else if (!this.pending.includes(element)) this.pending.push(element);
      }
      if (isHTMLIFrameElement(element) && node.isConnected) this.options.child?.(element);
    }
    for (const child of Array.from(node.childNodes)) this.connected(child);
  }

  private isResourceHint(rel: string): boolean {
    return rel
      .toLowerCase()
      .split(/\s+/)
      .some((token) => token === 'preload' || token === 'modulepreload');
  }

  private resourceHint(element: Element): void {
    const rel =
      this.logicalAttribute(element, 'rel') ?? element.getAttribute('rel') ?? '';
    const href = this.logicalAttribute(element, 'href');
    if (!this.isResourceHint(rel) || href === undefined || !href) {
      this.resourceHints.delete(element);
      return;
    }
    element.removeAttribute('href');
    if (!element.isConnected) return;
    const url = this.options.resources.resolve(href);
    const key = rel.toLowerCase() + '\n' + url;
    if (this.resourceHints.get(element)?.key === key) return;
    const request = { key };
    this.resourceHints.set(element, request);
    queueMicrotask(() => {
      if (this.resourceHints.get(element) !== request) return;
      if (!element.isConnected) {
        this.resourceHints.delete(element);
        return;
      }
      const currentRel =
        this.logicalAttribute(element, 'rel') ?? element.getAttribute('rel') ?? '';
      if (
        !this.isResourceHint(currentRel) ||
        this.logicalAttribute(element, 'href') !== href
      ) {
        this.resourceHints.delete(element);
        return;
      }
      let available = false;
      try {
        if (
          currentRel.toLowerCase().split(/\s+/).includes('modulepreload') ||
          element.getAttribute('as')?.toLowerCase() === 'script'
        ) {
          this.options.resources.source(url);
          available = true;
        } else available = this.options.resources.resource(url) !== undefined;
      } catch {}
      element.dispatchEvent(new this.eventConstructor(available ? 'load' : 'error'));
    });
  }

  private async execute(element: Element): Promise<void> {
    if (this.executed.has(element)) return;
    const script = this.scripts.get(element);
    if (!script) return;
    if (
      script.type &&
      ![
        'module',
        'text/javascript',
        'application/javascript',
        'text/ecmascript',
        'application/ecmascript',
      ].includes(script.type)
    )
      return;
    this.executed.add(element);
    const previous = this.current;
    this.current = script.type === 'module' ? null : element;
    try {
      let completion: unknown;
      try {
        const source = script.source
          ? this.options.resources.source(script.source)
          : {
              code: script.code,
              url: this.options.resources.catalog.sourceURL + '#inline',
            };
        completion = this.options.evaluate(
          source.code,
          source.url,
          script.type === 'module',
        );
      } finally {
        // currentScript is only valid during synchronous classic evaluation.
        this.current = previous;
      }
      if (script.type === 'module') await completion;
      queueMicrotask(() => element.dispatchEvent(new this.eventConstructor('load')));
    } catch (error) {
      this.options.error(error);
      queueMicrotask(() => element.dispatchEvent(new this.eventConstructor('error')));
    }
  }

  private create(node: Tree.Node, document: Document): Node | null {
    if (node.nodeName === '#text' && 'value' in node)
      return document.createTextNode(node.value);
    if (node.nodeName === '#comment' && 'data' in node)
      return document.createComment(node.data);
    if (!('tagName' in node)) return null;
    if (
      ['base', 'applet', 'portal', 'fencedframe', 'frame', 'frameset'].includes(
        node.tagName,
      )
    )
      return null;
    if (
      node.tagName === 'meta' &&
      node.attrs.some((attribute) => attribute.name === 'http-equiv')
    )
      return null;
    const element = document.createElementNS(node.namespaceURI, node.tagName);
    if (node.namespaceURI === 'http://www.w3.org/1999/xhtml') {
      element.setAttribute('spellcheck', 'false');
      element.setAttribute('writingsuggestions', 'false');
      element.setAttribute('autocorrect', 'off');
    }
    if (node.tagName === 'script')
      this.scripts.set(element, {
        code: node.childNodes
          .map((child) => ('value' in child ? child.value : ''))
          .join(''),
        type: node.attrs.find((attribute) => attribute.name === 'type')?.value || '',
        source: node.attrs.find((attribute) => attribute.name === 'src')?.value,
      });
    for (const attribute of node.attrs) {
      if (node.tagName === 'script' && ['src', 'type', 'nonce'].includes(attribute.name))
        continue;
      const name = attribute.prefix
        ? attribute.prefix + ':' + attribute.name
        : attribute.name;
      if (this.attribute(element, name, attribute.value, attribute.namespace)) {
        if (attribute.namespace)
          element.setAttributeNS(
            attribute.namespace,
            attribute.prefix ? attribute.prefix + ':' + attribute.name : attribute.name,
            attribute.value,
          );
        else element.setAttribute(attribute.name, attribute.value);
      }
    }
    if (node.tagName === 'script')
      element.setAttribute('type', 'application/x-privacy-frames-inert');
    if (node.tagName === 'iframe') this.options.child?.(element as HTMLIFrameElement);
    const destination =
      'content' in node && isHTMLTemplateElement(element) ? element.content : element;
    for (const child of node.childNodes) {
      const created = this.create(child, document);
      if (created) destination.appendChild(created);
    }
    if ('content' in node && isHTMLTemplateElement(element)) {
      for (const child of node.content.childNodes) {
        const created = this.create(child, document);
        if (created) element.content.appendChild(created);
      }
    }
    if (node.tagName === 'style')
      element.textContent = this.css(element.textContent || '');
    this.prepared.add(element);
    return element;
  }

  fragment(text: string, document = this.options.document): DocumentFragment {
    const fragment = document.createDocumentFragment();
    for (const node of parseFragment(text).childNodes) {
      const created = this.create(node, document);
      if (created) fragment.appendChild(created);
    }
    return fragment;
  }

  async render(html: string): Promise<void> {
    const document = this.options.document;
    const tree = parse(html);
    const root = tree.childNodes.find(
      (node): node is Tree.Element => 'tagName' in node && node.tagName === 'html',
    );
    if (!root) throw new Error('Application document is missing HTML');
    const head = root.childNodes.find(
      (node): node is Tree.Element => 'tagName' in node && node.tagName === 'head',
    );
    const body = root.childNodes.find(
      (node): node is Tree.Element => 'tagName' in node && node.tagName === 'body',
    );
    document.head.replaceChildren();
    document.body.replaceChildren();
    for (const root of [document.documentElement, document.head, document.body]) {
      root.setAttribute('spellcheck', 'false');
      root.setAttribute('writingsuggestions', 'false');
      root.setAttribute('autocorrect', 'off');
    }
    for (const attribute of root.attrs)
      if (this.attribute(document.documentElement, attribute.name, attribute.value))
        document.documentElement.setAttribute(attribute.name, attribute.value);
    for (const [source, destination] of [
      [head, document.head],
      [body, document.body],
    ] as const) {
      if (!source) continue;
      for (const attribute of source.attrs)
        if (this.attribute(destination, attribute.name, attribute.value))
          destination.setAttribute(attribute.name, attribute.value);
      for (const child of source.childNodes) {
        const created = this.create(child, document);
        if (created) {
          destination.appendChild(created);
          this.connected(created);
        }
      }
    }
    this.ready = true;
    const scripts = this.pending;
    this.pending = [];
    const modules = scripts.filter(
      (element) => this.scripts.get(element)?.type === 'module',
    );
    for (const script of scripts)
      if (this.scripts.get(script)?.type !== 'module') void this.execute(script);
    this.readyState = 'interactive';
    await Promise.all(modules.map((script) => this.execute(script)));
    document.dispatchEvent(
      new this.eventConstructor('DOMContentLoaded', { bubbles: true }),
    );
    this.readyState = 'complete';
    document.defaultView?.dispatchEvent(new this.eventConstructor('load'));
  }

  css(text: string): string {
    return rewriteGuestCSS(text, (url) => this.options.resources.nativeURL(url));
  }

  dispose(): void {
    this.observer.disconnect();
  }
}
