import {
  strings,
  internalArray,
  internalSet,
  ownDescriptor,
  internalRecord,
  internalMap,
} from '../../shared/primordials.ts';
import {
  CONTENT_MARKER,
  type CompiledDocumentContent,
  type ContentAttribute,
  type ContentContext,
  type ContentHandler,
  type ContentScript,
} from './document-content-types.ts';
import type { ScriptPolicy } from '../enforcement/scripts.ts';
import type { ResourceAliases } from '../resource-aliases.ts';
import { isDataScript } from '../../shared/policy.ts';
import { relocateRuntimeModule } from '../modules.ts';
import { relocateImportMeta } from '../../shared/module-source.ts';
import { createNativeMarkupValidator } from '../enforcement/native-markup.ts';
const HTML = 'http://www.w3.org/1999/xhtml';
const SVG = 'http://www.w3.org/2000/svg';
const XMLNS = 'http://www.w3.org/2000/xmlns/';
// Import this module before common window preparation or any publisher code.
const apply = Reflect.apply;
const descriptor = ownDescriptor;
const deleteProperty = Reflect.deleteProperty;
const setProperty = Reflect.set;
const mint = crypto.randomUUID.bind(crypto);
const isArray = Array.isArray;
const stringify = JSON.stringify;
const NativeError = Error;
const markupValidator = createNativeMarkupValidator((message) => {
  throw new NativeError(message);
});
const freeze = Object.freeze;
const nativeDocument = document;
const nativeWindow = window;
const createElement = Document.prototype.createElementNS;
const importNode = Document.prototype.importNode;
const append = Node.prototype.appendChild;
const replace = Node.prototype.replaceChild;
const removeChild = Node.prototype.removeChild;
const clientRect = Element.prototype.getBoundingClientRect;
const requestFrame = nativeWindow.requestAnimationFrame;
const cancelFrame = nativeWindow.cancelAnimationFrame;
const setTimer = nativeWindow.setTimeout;
const clearTimer = nativeWindow.clearTimeout;
const replaceChildren = Element.prototype.replaceChildren;
const setAttribute = Element.prototype.setAttributeNS;
const getAttribute = Element.prototype.getAttribute;
const attributeNames = Element.prototype.getAttributeNames;
const removeAttribute = Element.prototype.removeAttribute;
const innerHTML = descriptor(Element.prototype, 'innerHTML')!.set!;
const text = descriptor(Node.prototype, 'textContent')!.set!;
const localName = descriptor(Element.prototype, 'localName')!.get!;
const namespace = descriptor(Element.prototype, 'namespaceURI')!.get!;
const nodeType = descriptor(Node.prototype, 'nodeType')!.get!;
const firstChild = descriptor(Node.prototype, 'firstChild')!.get!;
const nextSibling = descriptor(Node.prototype, 'nextSibling')!.get!;
const parentNode = descriptor(Node.prototype, 'parentNode')!.get!;
const ownerDocument = descriptor(Node.prototype, 'ownerDocument')!.get!;
const templateContent = descriptor(HTMLTemplateElement.prototype, 'content')!.get!;
const nativeParse = DOMParser.prototype.parseFromString;
const NativeParser = DOMParser;
const NativeBlob = Blob;
const NativeURL = URL;
const urlProtocol = descriptor(NativeURL.prototype, 'protocol')!.get!;
const createURL = URL.createObjectURL;
const revokeURL = URL.revokeObjectURL;
const addEvent = EventTarget.prototype.addEventListener;
const dispatch = EventTarget.prototype.dispatchEvent;
const stopEvent = Event.prototype.stopImmediatePropagation;
const eventTarget = descriptor(Event.prototype, 'target')!.get!;
const NativeEvent = Event;
const NativeWeakSet = WeakSet;
const NativePromise = Promise;
const resolvePromise = Promise.resolve;
const allPromises = Promise.all;
const scriptAsync = descriptor(HTMLScriptElement.prototype, 'async')!.set!;
const scriptDefer = descriptor(HTMLScriptElement.prototype, 'defer')!.set!;
const root = nativeDocument.documentElement;
const readHead = descriptor(Document.prototype, 'head')!.get!;
const readBody = descriptor(Document.prototype, 'body')!.get!;
const documentElement = descriptor(Document.prototype, 'documentElement')!.get!;
export interface DocumentRendererOptions {
  nonce: string;
  scripts: ScriptPolicy;
  resources: Pick<ResourceAliases, 'mapURL' | 'isInstalledURL'>;
  /** Publish only an inert facade here; pending native frames remain host-private. */
  contextsLoaded?: () => Promise<void>;
  contextsPrepared?: () => Promise<void>;
  deferChildStartup?: () => () => void;
  retainedHeadNodes?: readonly Node[];
  prepareContext?: (
    placeholder: HTMLTemplateElement,
    context: ContentContext,
  ) => Element | void | Promise<Element | void>;
}
interface Located {
  node: Element;
  templates: string[];
}
const forbidden = internalSet([
  'iframe',
  'object',
  'embed',
  'frame',
  'frameset',
  'fencedframe',
  'portal',
  'applet',
  'webview',
  'base',
]);
function element(node: Node): node is Element {
  return apply(nodeType, node, []) === 1;
}
function tag(node: Element): string {
  return strings.toLowerCase(apply(localName, node, []));
}
function isTemplate(node: Element): node is HTMLTemplateElement {
  return tag(node) === 'template' && apply(namespace, node, []) === HTML;
}
function attribute(node: Element, name: string): string | null {
  return apply(getAttribute, node, [name]);
}
function children(node: Node): Node[] {
  const nodes = internalArray<Node>();
  for (
    let child = apply(firstChild, node, []);
    child;
    child = apply(nextSibling, child, [])
  )
    nodes.push(child);
  return nodes;
}
function samePath(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, i) => value === right[i]);
}
function validPath(path: string[]) {
  return isArray(path) && path.every((value) => typeof value === 'string' && !!value);
}
function validateAttributes(attributes: ContentAttribute[]) {
  if (!isArray(attributes)) throw new NativeError('Invalid content attributes');
  for (const item of attributes) {
    if (
      !item ||
      typeof item.name !== 'string' ||
      typeof item.value !== 'string' ||
      (item.namespace !== undefined && typeof item.namespace !== 'string') ||
      /^on/i.test(item.name) ||
      ['srcdoc', 'is', 'nonce'].includes(strings.toLowerCase(item.name))
    )
      throw new NativeError('Active content attribute');
    if (
      ['href', 'src', 'action', 'formaction', 'data', 'xlink:href'].includes(
        strings.toLowerCase(item.name),
      ) &&
      ['javascript:', 'vbscript:'].includes(
        apply(urlProtocol, new NativeURL(item.value, 'https://privacy.invalid/'), []),
      )
    )
      throw new NativeError('Executable content URL');
  }
}
function setAttributes(node: Element, attributes: ContentAttribute[]) {
  validateAttributes(attributes);
  for (const name of apply(attributeNames, node, []))
    apply(removeAttribute, node, [name]);
  for (const item of attributes)
    apply(setAttribute, node, [item.namespace || null, item.name, item.value]);
}
function validatePassive(node: Node) {
  if (element(node)) {
    const name = tag(node);
    if (
      forbidden.has(name) ||
      (name === 'script' && !isDataScript(attribute(node, 'type') || '')) ||
      (name === 'meta' && attribute(node, 'http-equiv') !== null)
    )
      throw new NativeError('Content is not passive');
    for (const name of apply(attributeNames, node, []))
      validateAttributes([internalRecord({ name, value: attribute(node, name) || '' })]);
    if (isTemplate(node)) validatePassive(apply(templateContent, node, []));
  }
  for (const child of children(node)) validatePassive(child);
}
function locate(
  node: Node,
  dormant: boolean,
  map = internalMap<string, Located>(),
  templates: string[] = [],
) {
  if (element(node)) {
    const marker = attribute(node, CONTENT_MARKER);
    if (marker) {
      if (map.has(marker)) throw new NativeError('Duplicate content marker');
      map.set(marker, internalRecord({ node, templates }));
    }
    if (isTemplate(node)) {
      if (dormant)
        locate(
          apply(templateContent, node, []),
          true,
          map,
          marker ? [...templates, marker] : templates,
        );
      return map;
    }
  }
  for (const child of children(node)) locate(child, dormant, map, templates);
  return map;
}
/** Render compiled passive content into an already committed, prepared document. */
export function createDocumentRenderer(options: DocumentRendererOptions) {
  if (!/^[A-Za-z0-9+/_=-]+$/.test(options.nonce))
    throw new NativeError('Invalid script nonce');
  const {
    scripts,
    resources,
    prepareContext,
    contextsLoaded,
    contextsPrepared,
    deferChildStartup,
  } = options;
  const retainedHeadNodes = internalArray([...(options.retainedHeadNodes || [])]);
  for (const node of retainedHeadNodes)
    if (apply(parentNode, node, []) !== apply(readHead, nativeDocument, []))
      throw new NativeError('Retained head node is not attached to this document head');
  let content: CompiledDocumentContent | undefined;
  let prepared: CompiledDocumentContent | undefined;
  const moduleSources = internalMap<ContentScript, string>();
  let rendering = false;
  const completed = new NativeWeakSet<Element>();
  // The empty shell's native lifecycle may occur before or during preparation.
  // Only the renderer delivers the corresponding app lifecycle after app setup.
  for (const type of ['DOMContentLoaded', 'load'])
    apply(addEvent, nativeWindow, [
      type,
      (event: Event) => {
        const target = apply(eventTarget, event, []);
        if (event.isTrusted && [nativeWindow, nativeDocument, root].includes(target))
          apply(stopEvent, event, []);
      },
      true,
    ]);
  if (apply(namespace, root, []) === SVG)
    apply(addEvent, root, [
      'load',
      (event: Event) => {
        if (event.isTrusted && apply(eventTarget, event, []) === root)
          apply(stopEvent, event, []);
      },
      true,
    ]);
  function renderingOpportunity() {
    return new NativePromise<void>((resolve) => {
      let finished = false,
        frame: number | undefined,
        timer: number | undefined;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (frame !== undefined) apply(cancelFrame, nativeWindow, [frame]);
        if (timer !== undefined) apply(clearTimer, nativeWindow, [timer]);
        // Publication can leave the embedding layout dirty, especially after a
        // move from display:none. Resolve it before publisher geometry queries.
        apply(clientRect, root, []);
        resolve();
      };
      frame = apply(requestFrame, nativeWindow, [finish]);
      // Hidden/background documents may not receive animation callbacks. Their
      // native hidden-layout semantics still apply; rendering must not hang.
      timer = apply(setTimer, nativeWindow, [finish, 100]);
    });
  }
  function createScript() {
    return apply(createElement, nativeDocument, [HTML, 'script']) as HTMLScriptElement;
  }
  function parseHTML(text: string) {
    const template = apply(createElement, nativeDocument, [HTML, 'template']);
    apply(innerHTML, template, [text]);
    const fragment: DocumentFragment = apply(templateContent, template, []);
    validatePassive(fragment);
    markupValidator.inspect(fragment, internalRecord({ initial: true }));
    return fragment;
  }
  function verifyDescriptors(
    compiled: CompiledDocumentContent,
    locations: Map<string, Located>,
  ) {
    const kinds = internalMap<string, string>();
    for (const [kind, list] of [
      ['script', compiled.scripts],
      ['context', compiled.contexts],
      ['handler', compiled.handlers],
    ] as const) {
      if (!isArray(list)) throw new NativeError('Invalid content descriptors');
      for (const item of list) {
        if (
          !item ||
          typeof item.marker !== 'string' ||
          !item.marker ||
          !validPath(item.templates)
        )
          throw new NativeError('Invalid content position');
        const position = locations.get(item.marker);
        if (!position || !samePath(position.templates, item.templates))
          throw new NativeError('Content descriptor position differs');
        if (kind !== 'handler') {
          if (kinds.has(item.marker) || !isTemplate(position.node))
            throw new NativeError('Invalid content placeholder');
          kinds.set(item.marker, kind);
        }
      }
    }
    for (const handler of compiled.handlers)
      if (
        typeof handler.event !== 'string' ||
        !/^[a-z][a-z0-9:_-]*$/i.test(handler.event) ||
        typeof handler.code !== 'string'
      )
        throw new NativeError('Invalid event handler');
    for (const context of compiled.contexts) {
      if (
        !['iframe', 'object'].includes(context.element) ||
        !context.source ||
        !['empty', 'srcdoc', 'data', 'blob', 'url'].includes(context.source.kind)
      )
        throw new NativeError('Invalid child document descriptor');
      validateAttributes(context.attributes);
      if (
        context.attributes.some((item) =>
          ['src', 'data', 'srcdoc', 'href', 'xlink:href'].includes(
            strings.toLowerCase(item.name),
          ),
        )
      )
        throw new NativeError('Child source must be a descriptor');
      const source = context.source;
      if (
        source.kind === 'srcdoc' &&
        (typeof source.text !== 'string' || typeof source.baseURL !== 'string')
      )
        throw new NativeError('Invalid srcdoc source');
      if (source.kind === 'data' || source.kind === 'blob' || source.kind === 'url') {
        if (typeof source.url !== 'string') throw new NativeError('Invalid child URL');
        const url = new NativeURL(source.url);
        if (
          source.kind === 'url'
            ? !['http:', 'https:'].includes(apply(urlProtocol, url, []))
            : apply(urlProtocol, url, []) !== source.kind + ':'
        )
          throw new NativeError('Child URL protocol differs');
        if (
          source.kind === 'url' &&
          source.installedURL !== undefined &&
          !resources.isInstalledURL(source.installedURL)
        )
          throw new NativeError('Child resource is not installed');
        if (source.kind !== 'url' && typeof source.baseURL !== 'string')
          throw new NativeError('Missing child source base');
      }
      if ('baseURL' in source) new NativeURL(source.baseURL);
      if (context.templates.length === 0 && !prepareContext)
        throw new NativeError('Child document adapter is unavailable');
    }
    for (const script of compiled.scripts) {
      if (
        !['classic', 'module'].includes(script.kind) ||
        !script.source ||
        !['inline', 'resource', 'unavailable'].includes(script.source.kind) ||
        [script.async, script.defer, script.noModule].some(
          (value) => typeof value !== 'boolean',
        )
      )
        throw new NativeError('Invalid executable script descriptor');
      validateAttributes(script.attributes);
      if (
        script.attributes.some((item) =>
          ['src', 'href', 'xlink:href'].includes(strings.toLowerCase(item.name)),
        )
      )
        throw new NativeError('Executable source must be a descriptor');
      if (script.source.kind === 'inline') {
        if (
          typeof script.source.code !== 'string' ||
          typeof script.source.baseURL !== 'string'
        )
          throw new NativeError('Invalid inline script');
      } else if (script.source.kind === 'unavailable') {
        if (typeof script.source.sourceURL !== 'string')
          throw new NativeError('Invalid unavailable script');
      } else if (
        typeof script.source.url !== 'string' ||
        !resources.isInstalledURL(script.source.url)
      )
        throw new NativeError('Script is not installed');
    }
  }
  function installHandlers(
    handlers: ContentHandler[],
    target: (marker: string) => Element | undefined,
  ) {
    for (const handler of handlers) {
      const node = target(handler.marker);
      if (!node) throw new NativeError('Missing event handler target');
      const script = createScript();
      const marker = mint();
      apply(setAttribute, script, [null, 'data-privacy-handler', marker]);
      const selector = 'script[data-privacy-handler=' + stringify(marker) + ']';
      // Parse publisher functions in the app global, without evaluating source in
      // a trusted closure. The temporary script carries only that app function.
      apply(text, script, [
        `(document.currentScript || document.querySelector(${stringify(selector)})).__privacyHandler=function(event){return Reflect.apply(function(event,evt){\n${handler.code}\n},this,[event,event]);};`,
      ]);
      scripts.prepare(script);
      const parent = apply(readHead, nativeDocument, []) || root;
      apply(append, parent, [script]);
      const callback: unknown = descriptor(script, '__privacyHandler')?.value;
      apply(deleteProperty, Reflect, [script, '__privacyHandler']);
      apply(removeChild, parent, [script]);
      if (typeof callback !== 'function')
        throw new NativeError('Event handler compilation failed');
      apply(setProperty, Reflect, [node, 'on' + handler.event, callback, node]);
    }
  }
  async function executable(descriptor: ContentScript, placeholder: Element) {
    if (completed.has(placeholder)) return;
    completed.add(placeholder);
    const script = createScript();
    for (const item of descriptor.attributes) {
      if (
        ['type', 'async', 'defer', 'nomodule', 'nonce'].includes(
          strings.toLowerCase(item.name),
        )
      )
        continue;
      apply(setAttribute, script, [item.namespace || null, item.name, item.value]);
    }
    if (descriptor.kind === 'module')
      apply(setAttribute, script, [null, 'type', 'module']);
    if (descriptor.noModule) apply(setAttribute, script, [null, 'nomodule', '']);
    apply(scriptAsync, script, [descriptor.async]);
    apply(scriptDefer, script, [descriptor.defer]);
    let blob: string | undefined;
    let source: string | undefined;
    if (descriptor.source.kind === 'resource')
      source = resources.mapURL(descriptor.source.url);
    else if (descriptor.kind === 'module' && descriptor.source.kind === 'inline') {
      const code = moduleSources.get(descriptor);
      if (code === undefined) throw new NativeError('Module source was not prepared');
      blob = apply(createURL, NativeURL, [
        new NativeBlob([code], internalRecord({ type: 'text/javascript' })),
      ]);
      source = blob;
    }
    scripts.prepare(script);
    const parent = apply(parentNode, placeholder, []);
    if (!parent) throw new NativeError('Detached executable placeholder');
    apply(setAttribute, script, [null, CONTENT_MARKER, descriptor.marker]);
    apply(replace, parent, [script, placeholder]);
    installHandlers(
      content!.handlers.filter(
        (handler) =>
          handler.marker === descriptor.marker &&
          !(handler.event === 'load' && descriptor.source.kind === 'inline'),
      ),
      () => script,
    );
    apply(removeAttribute, script, [CONTENT_MARKER]);
    if (descriptor.source.kind === 'unavailable') {
      // A missing dependency must never become an executable network request.
      // Keep a script element for its handlers and report failure in a later task.
      if (!(descriptor.kind === 'classic' && descriptor.noModule))
        await new NativePromise<void>((resolve) => {
          apply(setTimer, nativeWindow, [
            () => {
              apply(dispatch, script, [new NativeEvent('error')]);
              resolve();
            },
            0,
          ]);
        });
      return;
    }
    const done =
      source && !(descriptor.kind === 'classic' && descriptor.noModule)
        ? new NativePromise<void>((resolve, reject) => {
            apply(addEvent, script, [
              'load',
              (event: Event) => {
                if (event.isTrusted) resolve();
              },
            ]);
            apply(addEvent, script, [
              'error',
              (event: Event) => {
                if (event.isTrusted) reject(new NativeError('Document script failed'));
              },
            ]);
          })
        : apply(resolvePromise, NativePromise, []);
    if (source)
      apply(setAttribute, script, [
        null,
        'src',
        scripts.attribute(script, 'src', source),
      ]);
    else if (descriptor.source.kind === 'inline')
      scripts.text(script, descriptor.source.code);
    try {
      await done;
    } finally {
      if (blob) apply(revokeURL, NativeURL, [blob]);
    }
  }
  async function activate(locations: Map<string, Located>, template?: string) {
    if (!content) throw new NativeError('Document is not rendered');
    let releaseStartup = deferChildStartup?.();
    const release = () => {
      const pending = releaseStartup;
      releaseStartup = undefined;
      pending?.();
    };
    try {
      const active = (item: { templates: string[] }) =>
        template ? item.templates.at(-1) === template : item.templates.length === 0;
      for (const context of content.contexts.filter(active)) {
        const position = locations.get(context.marker);
        if (!position || completed.has(position.node)) continue;
        if (!prepareContext)
          throw new NativeError('Child document adapter is unavailable');
        const facade = await prepareContext(
          position.node as HTMLTemplateElement,
          context,
        );
        completed.add(position.node);
        if (facade) {
          if (apply(ownerDocument, facade, []) !== nativeDocument)
            throw new NativeError('Foreign child document facade');
          apply(setAttribute, facade, [null, CONTENT_MARKER, context.marker]);
          position.node = facade;
        }
      }
      // Static context elements must be present before publisher startup can
      // query or move them. Wait for guarded publication, not child app load.
      await contextsPrepared?.();
      installHandlers(
        content.handlers
          .filter(active)
          .filter(
            (item) =>
              locations.has(item.marker) &&
              !content!.scripts.some((script) => script.marker === item.marker),
          ),
        (marker) => locations.get(marker)?.node,
      );
      const deferred = internalArray<[ContentScript, Element]>();
      const asynchronous = internalArray<Promise<void>>();
      for (const descriptor of content.scripts.filter(active)) {
        const placeholder = locations.get(descriptor.marker)?.node;
        if (!placeholder) throw new NativeError('Missing executable placeholder');
        if (
          descriptor.async &&
          (descriptor.kind === 'module' || descriptor.source.kind !== 'inline')
        )
          asynchronous.push(executable(descriptor, placeholder));
        else if (
          descriptor.kind === 'module' ||
          (descriptor.defer && descriptor.source.kind !== 'inline')
        ) {
          const pending: [ContentScript, Element] = [descriptor, placeholder];
          internalArray(pending);
          deferred.push(pending);
        } else await executable(descriptor, placeholder);
      }
      // Prepared child Windows are already safe to inspect. Their application
      // scripts wait until parser-blocking parent scripts have initialized globals.
      // Release before modules, whose top-level await may depend on a child load.
      release();
      for (const [descriptor, placeholder] of deferred)
        await executable(descriptor, placeholder);
      return asynchronous;
    } finally {
      release();
    }
  }
  return freeze(
    internalRecord({
      /** Normalize executable module source while the guarded Window is still private. */
      prepare(compiled: CompiledDocumentContent) {
        if (prepared) throw new NativeError('Document content already prepared');
        if (!isArray(compiled.scripts))
          throw new NativeError('Invalid executable descriptors');
        for (const script of compiled.scripts) {
          if (script.kind === 'module' && script.source.kind === 'inline') {
            if (
              typeof script.source.code !== 'string' ||
              typeof script.source.baseURL !== 'string'
            )
              throw new NativeError('Invalid inline module');
            moduleSources.set(
              script,
              relocateRuntimeModule(
                relocateImportMeta(script.source.code, script.source.baseURL),
                script.source.baseURL,
                resources,
                true,
              ),
            );
          }
        }
        prepared = compiled;
      },
      async render(compiled: CompiledDocumentContent) {
        if (prepared !== compiled)
          throw new NativeError('Document content must be prepared before publication');
        if (content || rendering)
          throw new NativeError('Document content already supplied');
        rendering = true;
        const head: HTMLHeadElement | null = apply(readHead, nativeDocument, []);
        const body: HTMLElement | null = apply(readBody, nativeDocument, []);
        try {
          let htmlHead: DocumentFragment | undefined,
            htmlBody: DocumentFragment | undefined,
            svg: Element | undefined;
          if (compiled.kind === 'html') {
            if (apply(namespace, root, []) !== HTML || !head || !body)
              throw new NativeError('Expected committed HTML shell');
            validateAttributes(compiled.html.attributes);
            validateAttributes(compiled.html.bodyAttributes);
            htmlHead = parseHTML(compiled.html.head);
            htmlBody = parseHTML(compiled.html.body);
            const map = locate(htmlHead, true);
            locate(htmlBody, true, map);
            const holder = apply(createElement, nativeDocument, [HTML, 'html']);
            setAttributes(holder, compiled.html.attributes);
            locate(holder, true, map);
            const bodyHolder = apply(createElement, nativeDocument, [HTML, 'body']);
            setAttributes(bodyHolder, compiled.html.bodyAttributes);
            locate(bodyHolder, true, map);
            verifyDescriptors(compiled, map);
          } else if (compiled.kind === 'svg') {
            if (apply(namespace, root, []) !== SVG || tag(root) !== 'svg')
              throw new NativeError('Expected committed native SVG shell');
            validateAttributes(compiled.svg.attributes);
            const declarations = compiled.svg.attributes
              .filter((item) => item.namespace === XMLNS && item.name !== 'xmlns')
              .map((item) => {
                if (!/^xmlns:[A-Za-z_][A-Za-z0-9_.-]*$/.test(item.name))
                  throw new NativeError('Invalid SVG namespace declaration');
                const value = strings.replace(
                  item.value,
                  /[&<>"]/g,
                  (character) =>
                    internalRecord<Record<string, string>>({
                      '&': '&amp;',
                      '<': '&lt;',
                      '>': '&gt;',
                      '"': '&quot;',
                    })[character]!,
                );
                return ' ' + item.name + '="' + value + '"';
              })
              .join('');
            const parsed: Document = apply(nativeParse, new NativeParser(), [
              '<svg xmlns="' +
                SVG +
                '"' +
                declarations +
                '>' +
                compiled.svg.content +
                '</svg>',
              'image/svg+xml',
            ]);
            const parsedRoot: Element = apply(documentElement, parsed, []);
            svg = parsedRoot;
            if (apply(namespace, svg, []) !== SVG || tag(svg) !== 'svg')
              throw new NativeError('Invalid SVG content');
            setAttributes(svg, compiled.svg.attributes);
            validatePassive(svg);
            markupValidator.inspect(svg, internalRecord({ initial: true }));
            verifyDescriptors(compiled, locate(svg, true));
          } else throw new NativeError('Unsupported document kind');
          content = compiled;
          if (compiled.kind === 'html') {
            setAttributes(root, compiled.html.attributes);
            setAttributes(body!, compiled.html.bodyAttributes);
            for (const node of retainedHeadNodes)
              if (apply(parentNode, node, []) !== head)
                throw new NativeError('Retained head node was detached');
            for (const child of children(head!))
              if (!retainedHeadNodes.includes(child)) apply(removeChild, head, [child]);
            apply(append, head, [htmlHead!]);
            apply(replaceChildren, body!, [htmlBody!]);
          } else {
            setAttributes(root, compiled.svg.attributes);
            const imported = children(svg!).map((node) =>
              apply(importNode, nativeDocument, [node, true]),
            );
            apply(replaceChildren, root, imported);
          }
          await renderingOpportunity();
          const asynchronous = await activate(locate(root, false));
          apply(dispatch, nativeDocument, [
            new NativeEvent('DOMContentLoaded', internalRecord({ bubbles: true })),
          ]);
          await apply(allPromises, NativePromise, [asynchronous]);
          await contextsLoaded?.();
          if (compiled.kind === 'svg') apply(dispatch, root, [new NativeEvent('load')]);
          apply(dispatch, nativeWindow, [new NativeEvent('load')]);
        } finally {
          rendering = false;
        }
      },
      async activateTemplate(
        template: HTMLTemplateElement,
        activatedRoot: Node = nativeDocument,
      ) {
        if (
          !isTemplate(template) ||
          apply(ownerDocument, template, []) !== nativeDocument
        )
          throw new NativeError('Invalid activated template');
        const marker = attribute(template, CONTENT_MARKER);
        if (!marker || !content) throw new NativeError('Unknown template');
        const pending = await activate(locate(activatedRoot, false), marker);
        await apply(allPromises, NativePromise, [pending]);
      },
    }),
  );
}
