import type { DocumentControl } from './document-client.ts';
import {
  strings,
  internalArray,
  internalRecord,
  internalMap,
  internalSet,
} from '../../shared/primordials.ts';
import type { TrustedPolicy } from '../trusted/client.ts';
import type { PolicyTools } from '../enforcement/native.ts';
import type { ChildDocumentSource, ContentContext } from './document-content-types.ts';
import {
  parseDocumentRegistration,
  type DocumentRegistration,
} from './document-protocol.ts';
import {
  beginDocumentPublication,
  cancelDocumentPublication,
  type DocumentGeneration,
  type DocumentPublicationState,
} from './document-publication.ts';
// Native fetch is retained only for local Blob source reads.
const nativeFetch = fetch;

export interface DocumentContextPolicy {
  isContextElement(node: unknown): node is Element;
  created(node: Element): void;
  prepareTree(node: unknown, preserve?: boolean): unknown;
  prepareRange(range: Range): void;
  markup(text: string, context: Element | ShadowRoot): string;
  afterMarkup(root: Node): void;
  attribute(node: Element, name: string, value: string | null): boolean;
  readAttribute(
    node: Element,
    name: string,
  ):
    | {
        value: string | null;
      }
    | undefined;
  property(node: Element, name: string): unknown;
  reference(node: Element, key: string): Window | Document | null;
  cloned(source: Node, clone: Node): void;
  assertTransfer(node: Node, adopting?: boolean): void;
  publicNode(node: unknown): unknown;
  mutationTarget(node: Node): Node;
  settle(): void;
  whenLoaded(): Promise<void>;
  whenPrepared(): Promise<void>;
  deferChildStartup(): () => void;
  prepareContext(placeholder: HTMLTemplateElement, descriptor: ContentContext): Element;
}
interface DocumentFactoryOptions {
  documentControl: DocumentControl;
  applicationURL: string;
  baseURL(): string;
  policy: TrustedPolicy;
}
interface ManagedDocument extends DocumentPublicationState {
  element: Element;
  frame: HTMLIFrameElement;
  placeholder: HTMLTemplateElement;
  attributes: Map<string, string>;
  source?: ChildDocumentSource;
  baseURL?: string;
  privateRoot?: ShadowRoot;
  registration?: DocumentRegistration;
  window?: Window;
  document?: Document;
  port?: MessagePort;
  sandboxTokens?: object;
  startupTimer?: number;
  completion?: Promise<void>;
  complete?: () => void;
  preparation?: Promise<void>;
  prepared?: () => void;
}
interface DeferredStartupAction {
  record: ManagedDocument;
  generation: DocumentGeneration;
  run(): void;
}
const PLACEHOLDER = 'data-privacy-document';
const HTML = 'http://www.w3.org/1999/xhtml';
/** Own native creation and publication; a pending iframe never enters app DOM. */
export function createDocumentFactory(
  tools: PolicyTools,
  options: DocumentFactoryOptions,
): DocumentContextPolicy {
  const { apply, descriptor, fail } = tools;
  const document = globalThis.document;
  const rootElement = document.documentElement;
  const ownWindow = window;
  const NativeURL = URL;
  const getURL = (key: 'href' | 'origin' | 'protocol' | 'hash') =>
    descriptor(NativeURL.prototype, key)!.get!;
  const href = getURL('href'),
    origin = getURL('origin'),
    protocol = getURL('protocol'),
    hash = getURL('hash');
  const runtimeOrigin: string = apply(origin, new NativeURL(options.applicationURL), []);
  const setTimer = window.setTimeout,
    clearTimer = window.clearTimeout;
  const responseText = Response.prototype.text;
  const responseOK = descriptor(Response.prototype, 'ok')!.get!;
  const responseHeaders = descriptor(Response.prototype, 'headers')!.get!;
  const headerGet = Headers.prototype.get;
  const mint = crypto.randomUUID.bind(crypto);
  const NativeEvent = Event;
  const NativePromise = Promise,
    allPromises = Promise.all;
  const NativeChannel = MessageChannel;
  const channelPort1 = descriptor(MessageChannel.prototype, 'port1')!.get!;
  const channelPort2 = descriptor(MessageChannel.prototype, 'port2')!.get!;
  const portPost = MessagePort.prototype.postMessage,
    portStart = MessagePort.prototype.start,
    portClose = MessagePort.prototype.close;
  const nativePost = window.postMessage;
  const add = EventTarget.prototype.addEventListener,
    dispatch = EventTarget.prototype.dispatchEvent;
  const stop = Event.prototype.stopImmediatePropagation;
  const eventData = descriptor(MessageEvent.prototype, 'data')!.get!;
  const eventSource = descriptor(MessageEvent.prototype, 'source')!.get!;
  const eventOrigin = descriptor(MessageEvent.prototype, 'origin')!.get!;
  const createNS = Document.prototype.createElementNS;
  function create(this: Document, name: string): HTMLElement {
    return apply(createNS, this, [HTML, name]) as HTMLElement;
  }
  const getAttr = Element.prototype.getAttribute,
    setAttr = Element.prototype.setAttribute,
    removeAttr = Element.prototype.removeAttribute;
  const attrNames = Element.prototype.getAttributeNames;
  const append = Node.prototype.appendChild,
    replace = Node.prototype.replaceChild,
    remove = Node.prototype.removeChild;
  const parent = descriptor(Node.prototype, 'parentNode')!.get!;
  const owner = descriptor(Node.prototype, 'ownerDocument')!.get!;
  const connected = descriptor(Node.prototype, 'isConnected')!.get!;
  const first = descriptor(Node.prototype, 'firstChild')!.get!,
    next = descriptor(Node.prototype, 'nextSibling')!.get!;
  const local = descriptor(Element.prototype, 'localName')!.get!,
    namespace = descriptor(Element.prototype, 'namespaceURI')!.get!;
  const nodeType = descriptor(Node.prototype, 'nodeType')!.get!;
  const templateContent = descriptor(HTMLTemplateElement.prototype, 'content')!.get!;
  const shadowHost = descriptor(ShadowRoot.prototype, 'host')!.get!;
  const attachShadow = Element.prototype.attachShadow;
  const frameWindow = descriptor(HTMLIFrameElement.prototype, 'contentWindow')!.get!;
  const frameDocument = descriptor(HTMLIFrameElement.prototype, 'contentDocument')!.get!;
  const frameSandbox = descriptor(HTMLIFrameElement.prototype, 'sandbox')!.get!;
  const tokenSupports = DOMTokenList.prototype.supports;
  const elementMove = Element.prototype.moveBefore;
  const fragmentMove = DocumentFragment.prototype.moveBefore;
  const intersects = Range.prototype.intersectsNode;
  const records = internalSet<ManagedDocument>();
  const elements = new WeakMap<Element, ManagedDocument>();
  const placeholders = new WeakMap<Node, ManagedDocument>();
  const markupRecords = internalMap<string, ManagedDocument>();
  const startupActions = internalArray<DeferredStartupAction>();
  let startupDeferrals = 0;
  let flushingStartup = false;
  function flushStartup() {
    if (startupDeferrals || flushingStartup) return;
    flushingStartup = true;
    try {
      while (!startupDeferrals && startupActions.length) {
        const action = startupActions.shift()!;
        if (action.record.generation !== action.generation) continue;
        try {
          action.run();
        } catch {
          if (action.record.generation !== action.generation) continue;
          // One broken context must not strand another prepared child. Revoke
          // this generation before attempting best-effort native cleanup/events.
          try {
            cancel(action.record);
          } catch {}
          try {
            apply(dispatch, action.record.element, [new NativeEvent('error')]);
          } catch {}
        }
      }
    } finally {
      flushingStartup = false;
    }
  }
  function afterParentClassics(record: ManagedDocument, run: () => void) {
    startupActions.push(internalRecord({ record, generation: record.generation, run }));
    flushStartup();
  }
  function deferChildStartup() {
    startupDeferrals++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      startupDeferrals--;
      flushStartup();
    };
  }
  const names = internalSet([
    'src',
    'srcdoc',
    'data',
    'type',
    'name',
    'sandbox',
    'loading',
    'credentialless',
  ]);
  function actualElement(node: unknown): node is Element {
    try {
      return apply(nodeType, node, []) === 1;
    } catch {
      return false;
    }
  }
  function isContextElement(node: unknown): node is Element {
    return (
      actualElement(node) &&
      apply(namespace, node, []) === HTML &&
      ['iframe', 'object'].includes(apply(local, node, []))
    );
  }
  function sameDocument(node: Node) {
    if (apply(owner, node, []) !== document)
      fail('Cross-document context mutation is not supported');
  }
  function children(node: Node): Node[] {
    const result = internalArray<Node>();
    for (let child = apply(first, node, []); child; child = apply(next, child, []))
      result.push(child);
    if (
      actualElement(node) &&
      apply(local, node, []) === 'template' &&
      apply(namespace, node, []) === HTML
    )
      result.push(apply(templateContent, node, []));
    return result;
  }
  function newPlaceholder(): HTMLTemplateElement {
    return apply(create, document, ['template']) as HTMLTemplateElement;
  }
  function suppressLoad(node: Element) {
    for (const type of ['load', 'error'])
      apply(add, node, [
        type,
        (event: Event) => {
          if (event.isTrusted) apply(stop, event, []);
        },
        true,
      ]);
  }
  function closeRegistration(registration: DocumentRegistration) {
    void options
      .documentControl(
        'close',
        internalRecord({
          id: registration.id,
          parentToken: registration.parentToken,
        }),
      )
      .catch(() => {});
  }
  function cancel(record: ManagedDocument) {
    cancelDocumentPublication(record);
    record.prepared?.();
    record.prepared = undefined;
    const complete = record.complete;
    record.complete = undefined;
    complete?.();
    if (record.startupTimer !== undefined)
      apply(clearTimer, ownWindow, [record.startupTimer]);
    record.startupTimer = undefined;
    if (record.port) apply(portClose, record.port, []);
    record.port = undefined;
    if (record.registration) closeRegistration(record.registration);
    record.registration = undefined;
    record.window = undefined;
    record.document = undefined;
    const physicalParent = apply(parent, record.frame, []);
    if (physicalParent) apply(remove, physicalParent, [record.frame]);
    if (record.privateRoot) {
      const host: Element = apply(shadowHost, record.privateRoot, []);
      const hostParent = apply(parent, host, []);
      if (hostParent) apply(remove, hostParent, [host]);
    }
    record.privateRoot = undefined;
  }
  function failed(record: ManagedDocument) {
    cancel(record);
    afterParentClassics(record, () => {
      apply(dispatch, record.element, [new NativeEvent('error')]);
    });
  }
  function manage(node: Element): ManagedDocument {
    sameDocument(node);
    const existing = elements.get(node);
    if (existing) return existing;
    const frame: HTMLIFrameElement =
      apply(local, node, []) === 'iframe'
        ? (node as HTMLIFrameElement)
        : (apply(create, document, ['iframe']) as HTMLIFrameElement);
    const attributes = internalMap<string, string>();
    for (const name of apply(attrNames, node, []))
      attributes.set(name, apply(getAttr, node, [name])!);
    const placeholder = newPlaceholder();
    const record: ManagedDocument = internalRecord({
      element: node,
      frame,
      placeholder,
      attributes,
      generation: {},
      started: false,
      ready: false,
      published: false,
      loaded: false,
    });
    records.add(record);
    elements.set(node, record);
    elements.set(frame, record);
    placeholders.set(placeholder, record);
    suppressLoad(node);
    if (frame !== node) suppressLoad(frame);
    for (const name of names) apply(removeAttr, node, [name]);
    apply(setAttr, frame, ['name', '']);
    apply(setAttr, frame, ['loading', 'eager']);
    if (frame !== node)
      apply(setAttr, frame, ['style', 'display:block;width:100%;height:100%;border:0']);
    return record;
  }
  function readSource(record: ManagedDocument): ChildDocumentSource {
    if (record.source) return record.source;
    const baseURL = record.baseURL || options.baseURL();
    if (record.element === record.frame && record.attributes.has('srcdoc'))
      return internalRecord({
        kind: 'srcdoc',
        text: record.attributes.get('srcdoc')!,
        baseURL,
      });
    const value = record.attributes.get(record.element === record.frame ? 'src' : 'data');
    if (value === undefined || !strings.trim(value))
      return internalRecord({ kind: 'empty' });
    const url = new NativeURL(value, baseURL);
    const scheme = apply(protocol, url, []);
    const address: string = apply(href, url, []);
    if (strings.split(address, '#', 1)[0] === 'about:blank')
      return internalRecord({ kind: 'empty' });
    if (scheme === 'blob:' || scheme === 'data:')
      return internalRecord({
        kind: scheme === 'blob:' ? 'blob' : 'data',
        url: address,
        baseURL,
      });
    if (!['http:', 'https:'].includes(scheme)) fail('Unsupported document source');
    return internalRecord({ kind: 'url', url: address });
  }
  function validateSandbox(value: string | null | undefined) {
    if (value == null) return;
    const tokens = strings.split(value, /\s+/);
    if (!tokens.includes('allow-scripts') || !tokens.includes('allow-same-origin'))
      fail(
        'Document sandbox requires allow-scripts and allow-same-origin for trusted setup',
      );
  }
  function validateProfile(record: ManagedDocument) {
    if (record.element !== record.frame) return;
    validateSandbox(record.attributes.get('sandbox'));
    if (record.attributes.has('credentialless'))
      fail('Credentialless document contexts are not supported');
  }
  async function begin(record: ManagedDocument) {
    const generation = beginDocumentPublication(record);
    record.completion = new NativePromise<void>((resolve) => {
      record.complete = resolve;
    });
    record.preparation = new NativePromise<void>((resolve) => {
      record.prepared = resolve;
    });
    let registration: DocumentRegistration | undefined;
    try {
      validateProfile(record);
      const source = readSource(record);
      let blobContent:
        | {
            text: string;
            contentType: string;
          }
        | undefined;
      if (source.kind === 'blob') {
        const blob = new NativeURL(source.url);
        if (apply(origin, blob, []) !== runtimeOrigin)
          fail('Document Blob must belong to the runtime origin');
        const value = await nativeFetch(source.url);
        if (!apply(responseOK, value, [])) fail('Document Blob is unavailable');
        blobContent = internalRecord({
          text: await apply(responseText, value, []),
          contentType:
            apply(headerGet, apply(responseHeaders, value, []), ['content-type']) ||
            'text/html',
        });
      }
      const reply = await options.documentControl(
        'create',
        internalRecord({
          source,
          baseURL: record.baseURL || options.baseURL(),
          ...(blobContent ? internalRecord({ blobContent }) : internalRecord({})),
        }),
      );
      registration = parseDocumentRegistration(reply, options.applicationURL);
      if (generation !== record.generation || !apply(connected, record.placeholder, [])) {
        closeRegistration(registration);
        return;
      }
      record.registration = registration;
      const host: HTMLElement = apply(create, document, ['div']);
      apply(setAttr, host, ['style', 'display:none!important']);
      const privateRoot: ShadowRoot = apply(attachShadow, host, [
        internalRecord({ mode: 'closed' }),
      ]);
      record.privateRoot = privateRoot;
      // No source-controlled navigation, name or sandbox reaches the native frame.
      apply(removeAttr, record.frame, ['srcdoc']);
      apply(setAttr, record.frame, ['name', '']);
      const sandbox =
        record.element === record.frame ? record.attributes.get('sandbox') : undefined;
      if (sandbox === undefined) apply(removeAttr, record.frame, ['sandbox']);
      else apply(setAttr, record.frame, ['sandbox', sandbox]);
      apply(removeAttr, record.frame, ['credentialless']);
      const fragment =
        source.kind === 'url' || source.kind === 'data' || source.kind === 'blob'
          ? apply(hash, new NativeURL(source.url), [])
          : '';
      apply(setAttr, record.frame, ['src', registration.url + fragment]);
      apply(append, rootElement, [host]);
      apply(append, privateRoot, [record.frame]);
      record.window = apply(frameWindow, record.frame, []);
      if (!record.window) throw new Error('Private document context was not created');
      record.startupTimer = apply(setTimer, ownWindow, [
        () => {
          if (generation !== record.generation || record.ready) return;
          failed(record);
        },
        15000,
      ]);
    } catch {
      if (registration && record.registration !== registration)
        closeRegistration(registration);
      if (generation === record.generation) {
        failed(record);
      }
    }
  }
  function publish(record: ManagedDocument) {
    const registration = record.registration;
    const privateRoot = record.privateRoot;
    if (
      !registration ||
      !privateRoot ||
      apply(parent, record.frame, []) !== privateRoot ||
      !apply(connected, record.placeholder, [])
    )
      return false;
    const target: Node | null = apply(parent, record.placeholder, []);
    if (!target || !apply(connected, target, [])) return false;
    const currentDocument: Document | null = apply(frameDocument, record.frame, []);
    if (!currentDocument || apply(frameWindow, record.frame, []) !== record.window)
      return false;
    const destination = record.element === record.frame ? target : record.element;
    if (record.element !== record.frame) {
      for (const child of children(record.element)) {
        const prepared = prepareTree(child);
        if (prepared !== child) apply(replace, record.element, [prepared, child]);
      }
      apply(replace, target, [record.element, record.placeholder]);
    }
    const move = actualElement(destination) ? elementMove : fragmentMove;
    if (typeof move !== 'function')
      fail('State-preserving document publication is required');
    apply(move, destination, [
      record.frame,
      record.element === record.frame ? record.placeholder : null,
    ]);
    if (
      apply(frameDocument, record.frame, []) !== currentDocument ||
      apply(frameWindow, record.frame, []) !== record.window
    )
      throw new Error('Document publication replaced the prepared realm');
    if (record.element === record.frame) apply(remove, target, [record.placeholder]);
    record.document = currentDocument;
    record.ready = true;
    record.published = true;
    record.prepared?.();
    record.prepared = undefined;
    const name = record.attributes.get('name');
    if (name) apply(setAttr, record.element, ['name', name]);
    const host: Element = apply(shadowHost, privateRoot, []);
    const hostParent = apply(parent, host, []);
    if (hostParent) apply(remove, hostParent, [host]);
    record.privateRoot = undefined;
    return true;
  }
  apply(add, ownWindow, [
    'message',
    (event: MessageEvent) => {
      const source = apply(eventSource, event, []);
      let record: ManagedDocument | undefined;
      for (const candidate of records) {
        if (candidate.window === source && !candidate.ready && candidate.started) {
          record = candidate;
          break;
        }
      }
      if (!record || apply(eventOrigin, event, []) !== runtimeOrigin) return;
      const data: unknown = protocolData(apply(eventData, event, []));
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
      const field = (key: string) => descriptor(data, key)?.value;
      const type = field('type');
      if (type !== 'privacy-document-guarded' && type !== 'privacy-document-failed')
        return;
      apply(stop, event, []);
      const registration = record.registration;
      if (
        !registration ||
        field('id') !== registration.id ||
        field('parentToken') !== registration.parentToken ||
        !record.privateRoot ||
        apply(parent, record.frame, []) !== record.privateRoot ||
        apply(frameWindow, record.frame, []) !== source
      )
        return;
      if (type === 'privacy-document-failed') {
        failed(record);
        return;
      }
      try {
        if (record.startupTimer !== undefined)
          apply(clearTimer, ownWindow, [record.startupTimer]);
        record.startupTimer = undefined;
        const channel = new NativeChannel();
        const port: MessagePort = apply(channelPort1, channel, []);
        const childPort: MessagePort = apply(channelPort2, channel, []);
        record.port = port;
        const generation = record.generation;
        apply(add, port, [
          'message',
          (message: MessageEvent) => {
            const value: unknown = protocolData(apply(eventData, message, []));
            if (
              generation !== record.generation ||
              !record.ready ||
              !value ||
              typeof value !== 'object'
            )
              return;
            if (descriptor(value, 'type')?.value === 'failed') {
              failed(record);
              return;
            }
            if (descriptor(value, 'type')?.value === 'loaded' && !record.loaded) {
              afterParentClassics(record, () => {
                if (record.loaded) return;
                record.loaded = true;
                const complete = record.complete;
                record.complete = undefined;
                complete?.();
                apply(dispatch, record.element, [new NativeEvent('load')]);
              });
            }
          },
        ]);
        apply(portStart, port, []);
        apply(nativePost, record.window, [
          internalRecord({
            type: 'privacy-document-port',
            id: registration.id,
            parentToken: registration.parentToken,
          }),
          runtimeOrigin,
          [childPort],
        ]);
        if (!publish(record)) throw new Error('Document publication was canceled');
        afterParentClassics(record, () => {
          if (
            record.port !== port ||
            !record.ready ||
            !record.published ||
            !apply(connected, record.frame, []) ||
            apply(frameWindow, record.frame, []) !== record.window ||
            apply(frameDocument, record.frame, []) !== record.document
          )
            return;
          try {
            apply(portPost, port, [internalRecord({ type: 'published' })]);
          } catch {
            failed(record);
          }
        });
      } catch {
        failed(record);
      }
    },
    true,
  ]);
  function prepareTree(value: unknown, preserve = false): unknown {
    let type: number;
    try {
      type = apply(nodeType, value, []);
    } catch {
      return value;
    }
    const node = value as Node;
    if (type === 1 && isContextElement(node)) {
      const record = manage(node);
      validateProfile(record);
      if (record.ready && preserve) return node;
      if (record.published) {
        const oldParent = apply(parent, record.element, []);
        if (oldParent) apply(replace, oldParent, [record.placeholder, record.element]);
        cancel(record);
      }
      return record.placeholder;
    }
    for (const child of children(node)) {
      const prepared = prepareTree(child, preserve);
      if (prepared !== child) apply(replace, node, [prepared, child]);
    }
    return value;
  }
  function settle() {
    for (const record of records) {
      if (
        record.started &&
        !record.published &&
        record.privateRoot &&
        (apply(parent, record.frame, []) !== record.privateRoot ||
          !apply(connected, record.frame, []))
      ) {
        cancel(record);
        continue;
      }
      if (record.published) {
        if (!apply(connected, record.element, []) || !apply(connected, record.frame, []))
          cancel(record);
      } else if (apply(connected, record.placeholder, [])) {
        if (!record.started) void begin(record);
      } else if (record.started) cancel(record);
    }
  }
  function attributeChange(node: Element, name: string, value: string | null) {
    if (!isContextElement(node) || !names.has(strings.toLowerCase(name))) return false;
    const record = manage(node);
    const key = strings.toLowerCase(name);
    if (record.element === record.frame) {
      if (key === 'credentialless' && value !== null)
        fail('Credentialless document contexts are not supported');
      if (key === 'sandbox' && record.started) validateSandbox(value);
    }
    if (value === null) record.attributes.delete(key);
    else record.attributes.set(key, value);
    if (!['src', 'srcdoc', 'data', 'type'].includes(key)) {
      if (key === 'sandbox' && record.started) {
        if (value === null) apply(removeAttr, record.frame, ['sandbox']);
        else apply(setAttr, record.frame, ['sandbox', value]);
      }
      if (key === 'name' && record.ready) {
        if (value === null) apply(removeAttr, record.element, ['name']);
        else apply(setAttr, record.element, ['name', value]);
      }
      return true;
    }
    record.source = undefined;
    record.baseURL = undefined;
    if (record.published) {
      const target = apply(parent, record.element, []);
      if (target) apply(replace, target, [record.placeholder, record.element]);
    }
    cancel(record);
    settle();
    return true;
  }
  function reference(node: Element, key: string): Window | Document | null {
    const record = elements.get(node);
    if (
      !record ||
      !record.ready ||
      !record.published ||
      !apply(connected, record.frame, []) ||
      apply(frameWindow, record.frame, []) !== record.window ||
      apply(frameDocument, record.frame, []) !== record.document
    )
      return null;
    if (key === 'contentWindow') return record.window || null;
    if (key === 'getSVGDocument' && record.registration?.kind !== 'svg') return null;
    return record.document || null;
  }
  function readAttribute(node: Element, name: string) {
    if (!isContextElement(node) || !names.has(strings.toLowerCase(name)))
      return undefined;
    if (apply(owner, node, []) !== document) return internalRecord({ value: null });
    return internalRecord({
      value: manage(node).attributes.get(strings.toLowerCase(name)) ?? null,
    });
  }
  function property(node: Element, name: string): unknown {
    const value = readAttribute(node, name)?.value || '';
    if (name === 'credentialless') return readAttribute(node, name)?.value !== null;
    if (name === 'sandbox') {
      const record = manage(node);
      const tokens = () =>
        strings.split(record.attributes.get('sandbox') || '', /\s+/).filter(Boolean);
      const token = (input: unknown) => {
        const text = tools.str(input);
        if (!text || /\s/.test(text))
          throw new DOMException('Invalid sandbox token', 'SyntaxError');
        return text;
      };
      const update = (values: string[]) =>
        attributeChange(node, 'sandbox', [...internalSet(values)].join(' '));
      return (record.sandboxTokens ||= Object.freeze(
        internalRecord({
          get value() {
            return record.attributes.get('sandbox') || '';
          },
          set value(input: unknown) {
            attributeChange(node, 'sandbox', tools.str(input));
          },
          get length() {
            return tokens().length;
          },
          contains: (input: unknown) => tokens().includes(token(input)),
          item: (index: number) => tokens()[index] ?? null,
          add: (...values: unknown[]) => {
            update([...tokens(), ...values.map(token)]);
          },
          remove: (...values: unknown[]) => {
            const removed = values.map(token);
            update(tokens().filter((value) => !removed.includes(value)));
          },
          toggle: (input: unknown, force?: boolean) => {
            const value = token(input);
            const values = tokens();
            const present =
              force === undefined ? !values.includes(value) : Boolean(force);
            update(
              present ? [...values, value] : values.filter((item) => item !== value),
            );
            return present;
          },
          replace: (before: unknown, after: unknown) => {
            const old = token(before),
              next = token(after),
              values = tokens();
            if (!values.includes(old)) return false;
            update(values.map((value) => (value === old ? next : value)));
            return true;
          },
          supports: (input: unknown) =>
            apply(tokenSupports, apply(frameSandbox, record.frame, []), [token(input)]),
          toString: () => record.attributes.get('sandbox') || '',
          [Symbol.iterator]: () => tokens()[Symbol.iterator](),
        }),
      ));
    }
    if ((name === 'src' || name === 'data') && value)
      return apply(href, new NativeURL(value, options.baseURL()), []);
    return value;
  }
  function assertTransfer(node: Node, adopting = false) {
    if (isContextElement(node) || placeholders.has(node)) {
      if (adopting) fail('Context adoption is not supported');
      sameDocument(node);
    }
    for (const child of children(node)) assertTransfer(child, adopting);
  }
  function cloned(source: Node, clone: Node) {
    const pending = placeholders.get(source);
    if (pending && actualElement(clone) && apply(local, clone, []) === 'template') {
      const element: Element = apply(create, document, [
        apply(local, pending.element, []),
      ]);
      const copy = manage(element);
      copy.attributes = internalMap(pending.attributes);
      copy.source = pending.source;
      copy.baseURL = pending.baseURL;
      copy.placeholder = clone as HTMLTemplateElement;
      placeholders.set(clone, copy);
      return;
    }
    if (isContextElement(source) && isContextElement(clone)) {
      sameDocument(source);
      const original = manage(source),
        copy = manage(clone);
      copy.attributes = internalMap(original.attributes);
      copy.source = original.source;
      copy.baseURL = original.baseURL;
    }
    const before = children(source),
      after = children(clone);
    for (let index = 0; index < before.length && index < after.length; index++)
      cloned(before[index], after[index]);
  }
  function prepareContext(
    placeholder: HTMLTemplateElement,
    context: ContentContext,
  ): Element {
    sameDocument(placeholder);
    const node: Element = apply(create, document, [context.element]);
    const record = manage(node);
    record.placeholder = placeholder;
    placeholders.set(placeholder, record);
    record.source = context.source;
    record.baseURL =
      'baseURL' in context.source ? context.source.baseURL : options.baseURL();
    if (context.source.kind === 'srcdoc')
      record.attributes.set('srcdoc', context.source.text);
    else if (context.source.kind !== 'empty')
      record.attributes.set(
        context.element === 'iframe' ? 'src' : 'data',
        context.source.url,
      );
    for (const item of context.attributes) {
      if (names.has(strings.toLowerCase(item.name)))
        record.attributes.set(strings.toLowerCase(item.name), item.value);
      else if (
        !item.namespace &&
        !strings.startsWith(strings.toLowerCase(item.name), 'on')
      )
        apply(setAttr, node, [item.name, item.value]);
    }
    validateProfile(record);
    settle();
    return node;
  }
  function markup(text: string, context: Element | ShadowRoot): string {
    let target: Element;
    try {
      target = apply(shadowHost, context, []);
    } catch {
      target = context as Element;
    }
    sameDocument(target);
    const fragment = options.policy.fragment(
      internalRecord({
        text,
        localName: apply(local, target, []),
        namespace: apply(namespace, target, []),
        markerPrefix: mint(),
      }),
    );
    for (const context of fragment.contexts) {
      const node: Element = apply(create, document, [context.element]);
      const record = manage(node);
      record.attributes = internalMap(context.attributes);
      validateProfile(record);
      markupRecords.set(context.key, record);
    }
    return fragment.html;
  }

  function afterMarkup(root: Node) {
    if (actualElement(root)) {
      const key = apply(getAttr, root, [PLACEHOLDER]);
      const record = key ? markupRecords.get(key) : undefined;
      if (record && key) {
        if (apply(local, root, []) !== 'template') fail('Invalid context placeholder');
        record.placeholder = root as HTMLTemplateElement;
        placeholders.set(root, record);
        markupRecords.delete(key);
      }
    }
    for (const child of children(root)) afterMarkup(child);
    settle();
  }
  return internalRecord({
    isContextElement,
    created: (node) => {
      if (isContextElement(node)) manage(node);
    },
    prepareTree,
    prepareRange: (range) => {
      for (const record of records)
        if (record.published && apply(intersects, range, [record.element]))
          prepareTree(record.element);
    },
    markup,
    afterMarkup,
    attribute: attributeChange,
    readAttribute,
    property,
    reference,
    cloned,
    assertTransfer,
    publicNode: (node) =>
      node && typeof node === 'object'
        ? placeholders.get(node as Node)?.element || node
        : node,
    mutationTarget: (node) =>
      elements.get(node as Element)?.published === false
        ? elements.get(node as Element)!.placeholder
        : node,
    settle,
    deferChildStartup,
    whenPrepared: async () => {
      while (true) {
        const pending = internalArray<Promise<void>>();
        for (const record of records)
          if (record.started && !record.ready && record.preparation)
            pending.push(record.preparation);
        if (!pending.length) return;
        await apply(allPromises, NativePromise, [pending]);
      }
    },
    whenLoaded: async () => {
      while (true) {
        const pending = internalArray<Promise<void>>();
        for (const record of records)
          if (record.started && !record.loaded && record.completion)
            pending.push(record.completion);
        if (!pending.length) return;
        await apply(allPromises, NativePromise, [pending]);
      }
    },
    prepareContext,
  });
}

function protocolData(value: unknown): unknown {
  return value !== null && typeof value === 'object' ? internalRecord(value) : value;
}
