import { GuestEngine } from './engine.ts';
import type { GuestHost } from './protocol.ts';
import { GuestResources } from './resources.ts';
import { GuestDOM } from './dom.ts';
import { createGuestDOMParser, parseGuestDocument } from './parser.ts';
import { rewriteGuestCSS } from './css.ts';
import { exposedInterfaces, globalInterfaceDefinitions } from './runtime-interfaces.ts';
import { guestCaches, guestIndexedDB, guestStorage } from './storage.ts';
import { createGuestWebServices } from './web-services.ts';
import { createGuestWorkers } from './contexts/worker-factory.ts';
import { createGuestAudioWorklets } from './contexts/audio-worklet.ts';
import {
  createGuestWindowContexts,
  isGuestWindowMessage,
} from './contexts/window-contexts.ts';
import {
  isNode,
  isElement,
  isAttr,
  isDocument,
  isHTMLIFrameElement,
  isHTMLTemplateElement,
  isBaseAudioContext,
  isBlob,
  isCache,
  isWindow,
} from './contexts/brands.ts';
import type {
  GuestContextCatalog,
  GuestScriptType,
  GuestWorkerInitialization,
} from './contexts/types.ts';

type BrowserGlobal = Window | DedicatedWorkerGlobalScope | SharedWorkerGlobalScope;
interface BrowserEnvironmentOptions {
  catalog: GuestContextCatalog;
  global: BrowserGlobal;
  kind?: 'window' | 'dedicated-worker' | 'shared-worker';
  entryURL?: string;
  name?: string;
  onError?: (error: unknown) => void;
  createWindow?(
    catalog: GuestContextCatalog,
    window: Window,
    html: string,
  ): Promise<{ close(): void }>;
}

const environments = new WeakMap<object, BrowserEnvironment>();
const globalPrototypes = new WeakMap<object, BrowserEnvironment>();
const forbidden =
  /^(?:WebSocket|WebTransport|EventSource|RTC|webkitRTC|ServiceWorker|NavigationPreload|Credential|IdentityCredential|FederatedCredential|Authenticator|Presentation|RemotePlayback|SpeechRecognition|webkitSpeechRecognition|SpeechSynthesis|Payment|Push|Notification|Bluetooth|USB|Serial|HID|NDEF|XR|WebUSB|WebHID|WebNFC|XSLTProcessor)/;
const intrinsic = new Set([
  'Object',
  'Function',
  'Array',
  'Boolean',
  'Number',
  'String',
  'Symbol',
  'BigInt',
  'Date',
  'RegExp',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Promise',
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'AggregateError',
  'ArrayBuffer',
  'SharedArrayBuffer',
  'Atomics',
  'DataView',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int8Array',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array',
  'WebAssembly',
]);
const globalsDenied = new Set([
  'fetch',
  'XMLHttpRequest',
  'Worker',
  'SharedWorker',
  'navigator',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'customElements',
  'eval',
  'open',
  'close',
  'print',
  'alert',
  'confirm',
  'prompt',
  'showModalDialog',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'postMessage',
  'importScripts',
]);
const safeGlobalMembers = new Set([
  'document',
  'window',
  'self',
  'top',
  'parent',
  'opener',
  'frames',
  'frameElement',
  'length',
  'closed',
  'origin',
  'isSecureContext',
  'crossOriginIsolated',
  'innerWidth',
  'innerHeight',
  'outerWidth',
  'outerHeight',
  'screenX',
  'screenY',
  'screenLeft',
  'screenTop',
  'scrollX',
  'scrollY',
  'pageXOffset',
  'pageYOffset',
  'devicePixelRatio',
  'screen',
  'visualViewport',
  'orientation',
  'event',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'focus',
  'blur',
  'getSelection',
  'scroll',
  'scrollTo',
  'scrollBy',
  'createImageBitmap',
  'reportError',
]);
const interfaceNames = new Set([
  'Window',
  'WindowProxy',
  'WindowProperties',
  'WorkerGlobalScope',
  'DedicatedWorkerGlobalScope',
  'SharedWorkerGlobalScope',
  'WorkerNavigator',
  'WorkerLocation',
  'Navigator',
  'Node',
  'NodeList',
  'NamedNodeMap',
  'Element',
  'CharacterData',
  'Text',
  'Comment',
  'CDATASection',
  'ProcessingInstruction',
  'Document',
  'DocumentFragment',
  'DocumentType',
  'XMLDocument',
  'XMLSerializer',
  'DOMParser',
  'DOMImplementation',
  'XPathEvaluator',
  'XPathExpression',
  'XPathResult',
  'Range',
  'StaticRange',
  'Selection',
  'ShadowRoot',
  'TreeWalker',
  'NodeIterator',
  'NodeFilter',
  'Attr',
  'CustomElementRegistry',
  'Event',
  'EventTarget',
  'MessageChannel',
  'MessagePort',
  'AbortController',
  'AbortSignal',
  'Blob',
  'File',
  'FileList',
  'FileReader',
  'FileReaderSync',
  'Headers',
  'Request',
  'Response',
  'URL',
  'URLSearchParams',
  'URLPattern',
  'Storage',
  'StorageManager',
  'Cache',
  'CacheStorage',
  'Screen',
  'VisualViewport',
  'MediaQueryList',
  'Crypto',
  'CryptoKey',
  'SubtleCrypto',
  'TextMetrics',
  'Path2D',
  'Image',
  'ImageData',
  'ImageDecoder',
  'VideoFrame',
  'VideoDecoder',
  'VideoEncoder',
  'EncodedVideoChunk',
  'EncodedAudioChunk',
  'MediaRecorder',
  'DataTransfer',
  'DataTransferItem',
  'DataTransferItemList',
  'ReadableStream',
  'ReadableStreamDefaultReader',
  'ReadableStreamBYOBReader',
  'ReadableStreamDefaultController',
  'ReadableByteStreamController',
  'ReadableStreamBYOBRequest',
  'WritableStream',
  'WritableStreamDefaultController',
  'WritableStreamDefaultWriter',
  'TransformStream',
  'TransformStreamDefaultController',
  'ByteLengthQueuingStrategy',
  'CountQueuingStrategy',
  'CompressionStream',
  'DecompressionStream',
  'Animation',
  'AnimationEffect',
  'AnimationTimeline',
  'DocumentTimeline',
  'KeyframeEffect',
  'ScrollTimeline',
  'ViewTimeline',
]);
const interfaceFamily =
  /^(?:HTML|SVG|MathML|CSS|DOM|WebGL|Canvas|OffscreenCanvas|ImageBitmap|Audio|OfflineAudio|BaseAudio|MediaStream|IDB|FontFace|TextEncoder|TextDecoder|Performance)|Event$|Observer$/;
const own = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key);

/** Native browser authority is concentrated here, independent of guest prototypes. */
export class BrowserEnvironment {
  readonly resources: GuestResources;
  readonly host: GuestHost;
  readonly globals: Record<string, unknown> = Object.create(null);
  readonly dynamic = new Set<string>();
  readonly document?: Document;
  readonly dom?: GuestDOM;
  private engine?: GuestEngine;
  private constructors = new Set<Function>();
  private methodWrappers = new WeakMap<Function, Function>();
  private accessorWrappers = new WeakMap<object, Map<PropertyKey, PropertyDescriptor>>();
  private timers = new Set<number>();
  private workers: ReturnType<typeof createGuestWorkers>;
  private audio?: ReturnType<typeof createGuestAudioWorklets>;
  private audioOwners = new WeakMap<object, BaseAudioContext>();
  private windows?: ReturnType<typeof createGuestWindowContexts>;
  private namedSetters = new WeakSet<object>();
  private attributeOwners = new WeakMap<object, Element>();
  private animatedURLs = new WeakMap<object, Element>();
  private tokenOwners = new WeakMap<object, Element>();
  private windowsSeen = new WeakSet<object>();
  private disposed = false;
  private stopServices = () => {};
  private cleanups = new Set<() => void>();

  constructor(readonly options: BrowserEnvironmentOptions) {
    const { catalog, global: native } = options;
    this.resources = new GuestResources(catalog);
    this.document = 'document' in native ? native.document : undefined;
    environments.set(native, this);
    const eventTarget: unknown = Reflect.get(native, 'EventTarget');
    const eventPrototype =
      typeof eventTarget === 'function' ? eventTarget.prototype : null;
    let prototype = Reflect.getPrototypeOf(native);
    while (prototype && prototype !== eventPrototype && prototype !== Object.prototype) {
      globalPrototypes.set(prototype, this);
      prototype = Reflect.getPrototypeOf(prototype);
    }
    const report = (error: unknown) => options.onError?.(error) || console.error(error);
    if ('document' in native && options.createWindow)
      this.windows = createGuestWindowContexts({
        catalog,
        resources: this.resources,
        nativeWindow: native,
        createSession: options.createWindow,
        report,
        commitTransfers: (transfer) => this.requireEngine().detachTransferred(transfer),
        canMessage: (target) =>
          environments.get(target)?.options.catalog.application === catalog.application,
      });
    if (this.document)
      this.dom = new GuestDOM({
        document: this.document,
        resources: this.resources,
        evaluate: (code, url, module) =>
          this.requireEngine().evaluate(code, url, module ? 'module' : 'global'),
        error: report,
        child: (frame) => {
          this.windows?.track(frame);
          if (frame.isConnected) void this.windows?.connected(frame);
        },
        frameAttribute: (frame, name, value) =>
          this.windows?.attribute(frame, name, value) || false,
      });
    if (this.document)
      this.audio = createGuestAudioWorklets({
        catalog,
        prepare: (input) => ({
          url: this.resources.source(input).url,
          modules: this.resources.modules,
        }),
      });
    this.workers = createGuestWorkers({
      catalog,
      prepare: (url, type) => this.prepareWorker(url, type),
      commitTransfers: (transfer) => this.requireEngine().detachTransferred(transfer),
    });
    this.host = {
      get: (target, key) => this.get(target, key),
      set: (target, key, value) => this.set(target, key, value),
      call: (target, receiver, args) => Reflect.apply(target, receiver, args),
      construct: (target, args) => this.construct(target, args),
      ownKeys: (target) =>
        target === native
          ? Reflect.ownKeys(this.globals)
          : Reflect.ownKeys(target).filter((key) => this.scopeProperty(target, key)),
      descriptor: (target, key) => this.descriptor(target, key),
      prototype: (target) => Reflect.getPrototypeOf(target),
      settable: (target, key) =>
        typeof key === 'string' &&
        (this.namedSetters.has(target) ||
          Object.prototype.toString.call(target) === '[object DOMStringMap]'),
      delete: (target, key) => Reflect.deleteProperty(target, key),
    };
    const exposures = this.document
      ? ['Window']
      : ['Worker', options.kind === 'shared-worker' ? 'SharedWorker' : 'DedicatedWorker'];
    for (const definition of exposedInterfaces(exposures)) {
      const name = definition.name;
      if (
        intrinsic.has(name) ||
        globalsDenied.has(name) ||
        forbidden.test(name) ||
        (!interfaceNames.has(name) && !interfaceFamily.test(name))
      )
        continue;
      const value: unknown = Reflect.get(native, name);
      if (value !== undefined) this.globals[name] = value;
      if (typeof value === 'function') this.constructors.add(value);
    }
    for (const definition of globalInterfaceDefinitions(exposures)) {
      for (const member of definition.members) {
        if (
          member.kind === 'iterable' ||
          member.kind === 'maplike' ||
          member.kind === 'setlike'
        )
          continue;
        const name = member.name;
        if (
          !name ||
          globalsDenied.has(name) ||
          intrinsic.has(name) ||
          forbidden.test(name) ||
          (!safeGlobalMembers.has(name) && !name.startsWith('on'))
        )
          continue;
        if (Reflect.has(native, name)) this.dynamic.add(name);
      }
    }
    for (const name of safeGlobalMembers)
      if (!globalsDenied.has(name) && Reflect.has(native, name)) this.dynamic.add(name);
    const services = createGuestWebServices({
      resources: this.resources,
      nativeGlobal: native,
      application: catalog.application,
    });
    this.stopServices = services.dispose;
    Object.assign(this.globals, {
      console,
      Intl,
      navigator: services.navigator,
      clientInformation: services.navigator,
      fetch: services.fetch,
      XMLHttpRequest: services.XMLHttpRequest,
      XMLHttpRequestEventTarget: services.XMLHttpRequestEventTarget,
      XMLHttpRequestUpload: services.XMLHttpRequestUpload,
      Worker: this.workers.Worker,
      SharedWorker: this.workers.SharedWorker,
      indexedDB: guestIndexedDB(native.indexedDB, 'pf:' + catalog.application + ':'),
      caches: guestCaches(native.caches, 'pf:' + catalog.application + ':'),
      crypto: native.crypto,
      performance: native.performance,
      self: native,
      global: native,
      atob,
      btoa,
    });
    for (const name of [
      'TextEncoder',
      'TextDecoder',
      'URL',
      'URLSearchParams',
      'Blob',
      'File',
      'FileReader',
      'FileReaderSync',
      'Request',
      'Response',
      'Headers',
      'Event',
      'MessageEvent',
      'CustomEvent',
      'EventTarget',
      'MessageChannel',
      'MessagePort',
      'AbortController',
      'AbortSignal',
      'DOMException',
      'MutationObserver',
      'IntersectionObserver',
      'ResizeObserver',
      'ImageData',
      'Image',
      'Option',
      'Audio',
      'AudioContext',
      'OfflineAudioContext',
    ]) {
      const value: unknown = Reflect.get(native, name);
      if (value !== undefined) this.globals[name] = value;
    }
    for (const value of Object.values(this.globals))
      if (typeof value === 'function') this.constructors.add(value);
    if (this.document) {
      const Parser = createGuestDOMParser(this.document, this.resources);
      this.globals.DOMParser = Parser;
      this.constructors.add(Parser);
    }
    for (const key of Object.getOwnPropertyNames(Intl)) {
      const value: unknown = Reflect.get(Intl, key);
      if (typeof value === 'function') this.constructors.add(value);
    }
    for (const name of ['setTimeout', 'setInterval'] as const)
      this.globals[name] = (callback: unknown, delay = 0, ...args: unknown[]) => {
        const run = () => {
          if (this.disposed) return;
          try {
            if (typeof callback === 'function') Reflect.apply(callback, native, args);
            else this.requireEngine().evaluate(String(callback), 'timer.js');
          } catch (error) {
            report(error);
          }
        };
        const timer =
          name === 'setTimeout'
            ? native.setTimeout(run, Number(delay))
            : native.setInterval(run, Number(delay));
        this.timers.add(timer);
        return timer;
      };
    this.globals.clearTimeout = this.globals.clearInterval = (timer: number) => {
      native.clearTimeout(timer);
      native.clearInterval(timer);
      this.timers.delete(timer);
    };
    this.globals.queueMicrotask = (callback: VoidFunction) =>
      queueMicrotask(() => {
        if (!this.disposed) callback();
      });
    if ('document' in native) {
      this.globals.window = native;
      this.globals.document = this.document;
      const local = guestStorage(native.localStorage, 'pf:' + catalog.application + ':');
      const session = guestStorage(
        native.sessionStorage,
        'pf:' + catalog.application + ':',
      );
      this.globals.localStorage = local;
      this.globals.sessionStorage = session;
      this.namedSetters.add(local);
      this.namedSetters.add(session);
      this.globals.location = this.location(native);
      this.globals.history = this.history(native);
      this.globals.requestAnimationFrame = (callback: FrameRequestCallback) =>
        native.requestAnimationFrame((time) => {
          if (!this.disposed) callback(time);
        });
      this.globals.cancelAnimationFrame = (id: number) => native.cancelAnimationFrame(id);
      this.globals.getComputedStyle = (element: Element, pseudo?: string | null) =>
        native.getComputedStyle(element, pseudo);
      this.globals.matchMedia = (query: string) => native.matchMedia(query);
      this.globals.close = () =>
        queueMicrotask(() => {
          this.requireEngine().dispose();
          native.close();
        });
      this.globals.open = (url?: string | URL, target?: string, features?: string) =>
        this.windows?.open(url, target, features) || null;
      this.globals.postMessage = (
        message: unknown,
        targetOrigin: string | WindowPostMessageOptions = '/',
        transfer?: Transferable[],
      ) => this.windows?.postMessage(native, message, targetOrigin, transfer);
      native.addEventListener(
        'click',
        (event) => {
          const target = event.target;
          const anchor = isElement(target) ? target.closest('a,area') : null;
          if (!anchor) return;
          const href = anchor.getAttribute('href') || '';
          if (anchor.hasAttribute('download') && /^(?:blob:|data:)/.test(href)) return;
          if (!href.startsWith('#')) event.preventDefault();
        },
        true,
      );
      native.addEventListener('submit', (event) => event.preventDefault(), true);
    }
    for (const name of Object.keys(this.globals)) this.dynamic.delete(name);
  }

  private requireEngine(): GuestEngine {
    if (!this.engine) throw new Error('Guest environment is not attached');
    return this.engine;
  }

  attach(engine: GuestEngine): void {
    this.engine = engine;
    for (const [name, value] of Object.entries(this.globals)) {
      try {
        engine.set(name, value);
      } catch (error) {
        throw new Error(
          'Could not expose ' +
            name +
            ': ' +
            (error instanceof Error ? error.message : String(error)),
          { cause: error },
        );
      }
    }
    for (const name of this.dynamic) engine.bind(name, this.options.global);
    engine.onDispose(() => this.dispose());
  }

  private prepareWorker(
    url: string,
    scriptType: GuestScriptType,
  ): GuestWorkerInitialization {
    const source = this.resources.source(url);
    const resources = this.options.catalog.resources;
    const catalog = this.resources.resource(url)
      ? this.options.catalog
      : {
          ...this.options.catalog,
          resources: [
            ...resources,
            {
              url: source.url,
              path: '__guest_blob_' + crypto.randomUUID() + '.js',
              contentType: 'text/javascript',
              bytes: new TextEncoder().encode(source.code).buffer,
            },
          ],
        };
    return { kind: 'privacy-frames:guest-worker', catalog, entryURL: url, scriptType };
  }

  private get(target: object, key: PropertyKey): unknown {
    if (!this.scopeProperty(target, key)) return undefined;
    const scope = globalPrototypes.get(target);
    if (scope && typeof key === 'string' && own(scope.globals, key))
      return scope.globals[key];
    if (key === 'isTrusted' && isGuestWindowMessage(target)) return true;
    if (
      this.document &&
      isHTMLIFrameElement(target) &&
      (key === 'src' || key === 'srcdoc')
    )
      return this.windows?.get(target, key);
    if (
      key === 'postMessage' &&
      target !== this.options.global &&
      isWindow(target) &&
      environments.has(target) &&
      this.windows
    )
      return (
        message: unknown,
        origin: string | WindowPostMessageOptions = '/',
        transfer?: Transferable[],
      ) => this.windows!.postMessage(target, message, origin, transfer);
    const environment = environments.get(target);
    if (!environment && (this.windowsSeen.has(target) || isWindow(target)))
      return key === 'closed' && isWindow(target) ? target.closed : undefined;
    if (environment) {
      if (typeof key !== 'string') return undefined;
      if (environment !== this && environment.engine) {
        const value = environment.engine.get(key);
        if (value !== undefined) return value;
      }
      if (own(environment.globals, key)) return environment.globals[key];
      if (!environment.dynamic.has(key)) return undefined;
    }
    if (
      key === 'nonce' ||
      key === 'remote' ||
      key === 'serviceWorker' ||
      key === 'navigationPreload'
    )
      return undefined;
    if ((key === 'baseVal' || key === 'animVal') && this.animatedURLs.has(target)) {
      const element = this.animatedURLs.get(target)!;
      const logical = this.dom?.logicalAttribute(element, 'href');
      if (logical !== undefined) return logical;
    }
    if (key === 'location' && isDocument(target))
      return target.defaultView
        ? environments.get(target.defaultView)?.globals.location
        : null;
    if (key === 'cookie' && isDocument(target)) return '';
    if (target === this.document) {
      if (key === 'currentScript') return this.dom?.currentScript;
      if (key === 'readyState') return this.dom?.readyState;
      if (key === 'baseURI') return this.options.catalog.documentBase;
      if (key === 'URL' || key === 'documentURI') return this.options.catalog.sourceURL;
      if (key === 'cookie') return '';
    }
    if (this.document && isElement(target)) {
      if (
        target.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
        (target.localName === 'a' || target.localName === 'area') &&
        [
          'href',
          'origin',
          'protocol',
          'host',
          'hostname',
          'port',
          'pathname',
          'search',
          'hash',
          'username',
          'password',
        ].includes(String(key))
      ) {
        const logical = this.dom?.logicalAttribute(target, 'href');
        if (logical !== undefined)
          return Reflect.get(new URL(this.resources.resolve(logical)), key);
      }
      const script = this.dom?.script(target);
      if (script && key === 'type') return script.type;
      if (script && (key === 'src' || key === 'href')) return script.source || '';
    }
    const value: unknown = Reflect.get(target, key, target);
    if (isWindow(value)) this.windowsSeen.add(value);
    if (isElement(target) && value && typeof value === 'object') {
      if (key === 'attributes') this.attributeOwners.set(value, target);
      if (key === 'relList') this.tokenOwners.set(value, target);
      if (key === 'href' && target.namespaceURI === 'http://www.w3.org/2000/svg')
        this.animatedURLs.set(value, target);
    }
    if (
      key === 'name' &&
      Object.prototype.toString.call(target) === '[object IDBDatabase]' &&
      typeof value === 'string'
    )
      return value.replace('pf:' + this.options.catalog.application + ':', '');
    if (
      ['opener', 'parent', 'top', 'frames'].includes(String(key)) &&
      value &&
      typeof value === 'object' &&
      !environments.has(value)
    )
      return null;
    if (
      key === 'audioWorklet' &&
      value &&
      typeof value === 'object' &&
      this.document &&
      isBaseAudioContext(target)
    )
      this.audioOwners.set(value, target);
    if (
      typeof value !== 'function' ||
      key === 'constructor' ||
      this.constructors.has(value)
    )
      return value;
    let wrapper = this.methodWrappers.get(value);
    if (!wrapper) {
      const environment = this;
      wrapper = function (this: unknown, ...args: unknown[]) {
        return environment.invoke(value, this, key, args);
      };
      Object.defineProperty(wrapper, 'name', { value: value.name });
      this.methodWrappers.set(value, wrapper);
    }
    return wrapper;
  }

  private set(target: object, key: PropertyKey, value: unknown): boolean {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') return false;
    const constructor = Reflect.getOwnPropertyDescriptor(target, 'constructor')?.value;
    if (typeof constructor === 'function' && constructor.prototype === target)
      return false;
    if (isDocument(target) && (key === 'cookie' || key === 'domain')) return false;
    if (key === 'baseVal' && this.animatedURLs.has(target))
      return !this.dom!.attribute(this.animatedURLs.get(target)!, 'href', String(value));
    const foreign = environments.get(target);
    if (foreign && foreign !== this && foreign.engine && typeof key === 'string') {
      foreign.engine.set(key, value);
      return true;
    }
    if (
      this.document &&
      isAttr(target) &&
      target.ownerElement &&
      ['value', 'nodeValue', 'textContent'].includes(String(key))
    ) {
      if (!this.dom!.attribute(target.ownerElement, target.name, String(value)))
        return true;
    }
    if (
      this.document &&
      isHTMLIFrameElement(target) &&
      (key === 'src' || key === 'srcdoc')
    )
      return this.windows?.attribute(target, key, String(value)) || false;
    if (key === 'innerHTML' && isNode(target) && !isElement(target)) {
      const fragment = this.dom!.fragment(
        String(value),
        target.ownerDocument || this.document,
      );
      Reflect.apply(DocumentFragment.prototype.replaceChildren, target, [fragment]);
      this.dom!.connected(target);
      return true;
    }
    if (target === this.options.global && key === 'location') {
      this.navigate(String(value));
      return true;
    }
    if (this.document && isElement(target)) {
      if (
        target.localName === 'meta' &&
        (key === 'httpEquiv' || (key === 'content' && target.getAttribute('http-equiv')))
      )
        return false;
      if (
        (target.localName === 'a' || target.localName === 'area') &&
        [
          'protocol',
          'host',
          'hostname',
          'port',
          'pathname',
          'search',
          'hash',
          'username',
          'password',
        ].includes(String(key))
      ) {
        const url = new URL(
          this.dom?.logicalAttribute(target, 'href') || target.getAttribute('href') || '',
          this.options.catalog.documentBase,
        );
        Reflect.set(url, key, String(value));
        this.dom!.attribute(target, 'href', url.href);
        return true;
      }
      if (
        [
          'spellcheck',
          'writingSuggestions',
          'autocorrect',
          'ping',
          'attributionSrc',
          'rel',
          'action',
          'formAction',
          'attributeName',
        ].includes(String(key))
      ) {
        if (!this.dom!.attribute(target, String(key), String(value))) return true;
      }
      if (key === 'innerHTML' || key === 'outerHTML') {
        const fragment = this.dom!.fragment(String(value), target.ownerDocument);
        if (key === 'innerHTML') {
          if (isHTMLTemplateElement(target)) target.content.replaceChildren(fragment);
          else target.replaceChildren(fragment);
          this.dom!.connected(target);
        } else target.replaceWith(fragment);
        return true;
      }
      if (key === 'text' || key === 'textContent' || key === 'innerText') {
        if (target.localName === 'script')
          this.dom?.scriptText(target, String(value ?? ''));
        if (target.localName === 'style') value = this.dom?.css(String(value ?? ''));
      }
      if (
        typeof key === 'string' &&
        ['src', 'href', 'srcset', 'poster', 'nonce', 'type'].includes(key)
      ) {
        if (!this.dom!.attribute(target, key, String(value))) return true;
      }
    }
    if (
      Object.prototype.toString.call(target) === '[object CSSStyleDeclaration]' &&
      typeof value === 'string'
    )
      value = rewriteGuestCSS(
        value,
        (url) => this.resources.nativeURL(url),
        key === 'cssText' ? 'declarationList' : 'value',
      );
    if (key === 'nonce' || key === 'srcdoc') return false;
    const written = Reflect.set(target, key, value, target);
    if (
      written &&
      typeof key === 'string' &&
      key.startsWith('on') &&
      typeof value === 'function'
    )
      this.cleanups.add(() => {
        if (Reflect.get(target, key) === value) Reflect.set(target, key, null);
      });
    return written;
  }

  private descriptor(target: object, key: PropertyKey): PropertyDescriptor | undefined {
    if (!this.scopeProperty(target, key)) return;
    const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
    if (!descriptor) return;
    if ('value' in descriptor) return { ...descriptor, value: this.get(target, key) };
    let descriptors = this.accessorWrappers.get(target);
    if (!descriptors) {
      descriptors = new Map();
      this.accessorWrappers.set(target, descriptors);
    }
    let wrapped = descriptors.get(key);
    if (!wrapped) {
      const environment = this;
      wrapped = {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: descriptor.get
          ? function (this: object) {
              return environment.get(this, key);
            }
          : undefined,
        set: descriptor.set
          ? function (this: object, value: unknown) {
              environment.set(this, key, value);
            }
          : undefined,
      };
      descriptors.set(key, wrapped);
    }
    return wrapped;
  }

  private construct(target: Function, args: unknown[]): object {
    if (!this.constructors.has(target) || forbidden.test(target.name))
      throw new DOMException(
        'Constructor is not available in this environment',
        'SecurityError',
      );
    if (target.name === 'Audio' && typeof args[0] === 'string')
      args[0] = this.resources.nativeURL(args[0]);
    if (target.name === 'FontFace' && typeof args[1] === 'string')
      args[1] = rewriteGuestCSS(args[1], (url) => this.resources.nativeURL(url), 'value');
    const value: object = Reflect.construct(target, args);
    if (isBlob(value))
      this.resources.registerBlob(value, Array.isArray(args[0]) ? args[0] : undefined);
    return value;
  }

  private scopeProperty(target: object, key: PropertyKey): boolean {
    const environment = globalPrototypes.get(target);
    return (
      !environment ||
      typeof key !== 'string' ||
      key === 'constructor' ||
      own(environment.globals, key) ||
      environment.dynamic.has(key)
    );
  }

  private invoke(
    target: Function,
    receiver: unknown,
    key: PropertyKey,
    args: unknown[],
  ): unknown {
    if (key === 'fetch')
      return this.resources.fetch(
        String(args[0]),
        args[1] && typeof args[1] === 'object' ? args[1] : undefined,
      );
    if (
      this.document &&
      key === 'createContextualFragment' &&
      receiver &&
      typeof receiver === 'object'
    ) {
      const container: unknown = Reflect.get(receiver, 'commonAncestorContainer');
      const document = isDocument(container)
        ? container
        : isNode(container)
          ? container.ownerDocument || this.document
          : this.document;
      return this.dom!.fragment(String(args[0]), document);
    }
    if (
      key === 'createProcessingInstruction' &&
      String(args[0]).toLowerCase() === 'xml-stylesheet'
    )
      throw new DOMException('Native XML stylesheets are unavailable', 'SecurityError');
    if (this.document && (key === 'parseHTML' || key === 'parseHTMLUnsafe'))
      return parseGuestDocument(
        this.document,
        this.resources,
        String(args[0]),
        'text/html',
      );
    if (
      this.document &&
      (key === 'setHTML' || key === 'setHTMLUnsafe') &&
      isNode(receiver)
    ) {
      const fragment = this.dom!.fragment(
        String(args[0]),
        receiver.ownerDocument || this.document,
      );
      if (isElement(receiver)) receiver.replaceChildren(fragment);
      else
        Reflect.apply(DocumentFragment.prototype.replaceChildren, receiver, [fragment]);
      return;
    }
    if (
      Object.prototype.toString.call(receiver) === '[object CSSStyleDeclaration]' &&
      key === 'setProperty' &&
      typeof args[1] === 'string'
    )
      args[1] = rewriteGuestCSS(args[1], (url) => this.resources.nativeURL(url), 'value');
    if (
      Object.prototype.toString.call(receiver) === '[object CSSStyleSheet]' &&
      ['insertRule', 'replace', 'replaceSync'].includes(String(key)) &&
      typeof args[0] === 'string'
    )
      args[0] = rewriteGuestCSS(args[0], (url) => this.resources.nativeURL(url));
    if (key === 'importScripts') {
      for (const input of args) {
        const source = this.resources.source(String(input), this.options.entryURL);
        this.requireEngine().evaluate(source.code, source.url);
      }
      return;
    }
    if (
      (key === 'setTimeout' || key === 'setInterval') &&
      typeof this.globals[key] === 'function'
    )
      return Reflect.apply(this.globals[key], undefined, args);
    if (key === 'open' && isWindow(receiver))
      return (
        this.windows?.open(
          String(args[0] || ''),
          String(args[1] || '_blank'),
          String(args[2] || ''),
        ) || null
      );
    if (key === 'postMessage' && isWindow(receiver))
      return this.windows?.postMessage(
        receiver,
        args[0],
        typeof args[1] === 'string' ? args[1] : '/',
        Array.isArray(args[2]) ? args[2] : [],
      );
    if (
      key === 'addModule' &&
      receiver &&
      typeof receiver === 'object' &&
      this.audioOwners.has(receiver)
    )
      return this.audio!.addModule(this.audioOwners.get(receiver)!, String(args[0]));
    if (
      receiver &&
      typeof receiver === 'object' &&
      this.tokenOwners.has(receiver) &&
      ['add', 'remove', 'toggle', 'replace'].includes(String(key))
    ) {
      const owner = this.tokenOwners.get(receiver)!;
      const detached = owner.ownerDocument.createElement('link');
      detached.rel = owner.getAttribute('rel') || '';
      Reflect.apply(target, detached.relList, args);
      if (!this.dom!.attribute(owner, 'rel', detached.rel))
        return key === 'toggle' ? false : undefined;
    }
    if (key === 'createObjectURL' && isBlob(args[0]))
      return this.resources.createObjectURL(args[0]);
    if (key === 'revokeObjectURL') return this.resources.revokeObjectURL(String(args[0]));
    if (key === '__lookupGetter__' || key === '__lookupSetter__') {
      let object = receiver;
      while (object && (typeof object === 'object' || typeof object === 'function')) {
        const descriptor = this.descriptor(object, String(args[0]));
        if (descriptor)
          return key === '__lookupGetter__' ? descriptor.get : descriptor.set;
        object = Reflect.getPrototypeOf(object);
      }
      return undefined;
    }
    if (this.document && isElement(receiver)) {
      if (key === 'getAttribute' && typeof args[0] === 'string') {
        const logical = this.dom?.logicalAttribute(receiver, args[0]);
        if (logical !== undefined) return logical;
        if (isHTMLIFrameElement(receiver)) {
          const value = this.windows?.attributeValue(receiver, args[0]);
          if (value !== undefined) return value;
        }
      }
      if (
        (key === 'removeAttribute' || key === 'toggleAttribute') &&
        ['spellcheck', 'writingsuggestions', 'autocorrect'].includes(
          String(args[0]).toLowerCase(),
        )
      )
        return key === 'toggleAttribute' ? true : undefined;
      if (
        key === 'removeAttributeNS' &&
        ['spellcheck', 'writingsuggestions', 'autocorrect'].includes(
          String(args[1]).toLowerCase(),
        )
      )
        return;
      if (
        key === 'removeAttributeNode' &&
        isAttr(args[0]) &&
        ['spellcheck', 'writingsuggestions', 'autocorrect'].includes(
          args[0].name.toLowerCase(),
        )
      )
        return args[0];
      if (
        (key === 'setAttributeNode' || key === 'setAttributeNodeNS') &&
        isAttr(args[0])
      ) {
        const attribute = args[0];
        const previous = receiver.getAttributeNode(attribute.name);
        if (!this.dom!.attribute(receiver, attribute.name, attribute.value))
          return previous;
      }
      if (key === 'setAttribute' || key === 'setAttributeNS') {
        const index = key === 'setAttributeNS' ? 1 : 0;
        if (!this.dom!.attribute(receiver, String(args[index]), String(args[index + 1])))
          return;
      }
      if (key === 'insertAdjacentHTML') {
        const fragment = this.dom!.fragment(String(args[1]), receiver.ownerDocument);
        const position = String(args[0]).toLowerCase();
        if (position === 'beforebegin') receiver.before(fragment);
        else if (position === 'afterbegin') receiver.prepend(fragment);
        else if (position === 'beforeend') receiver.append(fragment);
        else if (position === 'afterend') receiver.after(fragment);
        else throw new DOMException('Invalid position', 'SyntaxError');
        return;
      }
    }
    if (
      (key === 'setNamedItem' || key === 'setNamedItemNS') &&
      receiver &&
      typeof receiver === 'object' &&
      this.attributeOwners.has(receiver) &&
      isAttr(args[0])
    ) {
      const owner = this.attributeOwners.get(receiver)!;
      const attribute = args[0];
      const previous = owner.getAttributeNode(attribute.name);
      if (!this.dom!.attribute(owner, attribute.name, attribute.value)) return previous;
    }
    if (
      (key === 'removeNamedItem' || key === 'removeNamedItemNS') &&
      receiver &&
      typeof receiver === 'object' &&
      this.attributeOwners.has(receiver)
    ) {
      const name = String(args[key === 'removeNamedItemNS' ? 1 : 0]).toLowerCase();
      if (['spellcheck', 'writingsuggestions', 'autocorrect'].includes(name))
        return this.attributeOwners.get(receiver)!.getAttributeNode(name);
    }
    if (this.document && isDocument(receiver) && key === 'open') {
      if (args.length > 2)
        throw new DOMException('Document navigation is not available', 'SecurityError');
      receiver.body?.replaceChildren();
      return receiver;
    }
    if (this.document && isDocument(receiver) && (key === 'write' || key === 'writeln')) {
      const fragment = this.dom!.fragment(
        args.map(String).join('') + (key === 'writeln' ? '\n' : ''),
        receiver,
      );
      const current = this.dom?.currentScript;
      if (current?.parentNode) current.after(fragment);
      else this.document!.body.append(fragment);
      return;
    }
    for (const value of args)
      if (this.document && isNode(value)) this.dom?.prepare(value);
    if (isCache(receiver) && (key === 'add' || key === 'addAll')) {
      const requests = key === 'addAll' && Array.isArray(args[0]) ? args[0] : [args[0]];
      return Promise.all(
        requests.map(async (request) => {
          const response = await this.resources.fetch(String(request));
          await receiver.put(String(request), response);
        }),
      ).then(() => undefined);
    }
    const result: unknown = Reflect.apply(target, receiver, args);
    if (key === 'addEventListener' && receiver && typeof receiver === 'object') {
      const [type, listener, options] = args;
      const capture =
        typeof options === 'boolean'
          ? options
          : !!(
              options &&
              typeof options === 'object' &&
              'capture' in options &&
              options.capture
            );
      this.cleanups.add(() =>
        Reflect.apply(EventTarget.prototype.removeEventListener, receiver, [
          String(type),
          listener,
          capture,
        ]),
      );
    }
    if (this.document && isElement(result)) this.dom?.prepare(result);
    for (const value of args)
      if (this.document && isNode(value) && value.isConnected) this.dom?.connected(value);
    if (key === 'postMessage' && args.length > 1) {
      const options = args[1];
      const transfer = Array.isArray(options)
        ? options
        : options &&
            typeof options === 'object' &&
            'transfer' in options &&
            Array.isArray(options.transfer)
          ? options.transfer
          : [];
      this.requireEngine().detachTransferred(transfer);
    }
    return result;
  }

  private navigate(input: string): void {
    const native = this.options.global;
    if (!('document' in native))
      throw new DOMException('Worker navigation is unavailable', 'SecurityError');
    const url = new URL(input, native.location.href);
    const current = new URL(native.location.href);
    if (
      url.origin !== current.origin ||
      url.pathname !== current.pathname ||
      url.search !== current.search
    )
      throw new DOMException('Navigation leaves the installed document', 'SecurityError');
    native.location.hash = url.hash;
  }

  private location(native: Window): object {
    const environment = this;
    const result: Record<string, unknown> = {
      assign: (value: string) => environment.navigate(value),
      replace: (value: string) => environment.navigate(value),
      reload: () => native.location.reload(),
      toString: () => native.location.href,
    };
    for (const key of [
      'href',
      'origin',
      'protocol',
      'host',
      'hostname',
      'port',
      'pathname',
      'search',
      'hash',
    ] as const)
      Object.defineProperty(result, key, {
        enumerable: true,
        get: () => native.location[key],
        set: (value: string) =>
          key === 'href'
            ? this.navigate(value)
            : this.navigate(
                new URL(
                  key === 'hash' ? '#' + value.replace(/^#/, '') : String(value),
                  native.location.href,
                ).href,
              ),
      });
    return result;
  }

  private history(native: Window): object {
    const update = (
      replace: boolean,
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) => {
      if (url !== undefined && url !== null) {
        const next = new URL(String(url), native.location.href);
        if (
          next.origin !== native.location.origin ||
          !next.pathname.startsWith(
            this.options.catalog.applicationURL.replace(native.location.origin, ''),
          )
        )
          throw new DOMException('History leaves this application', 'SecurityError');
      }
      return replace
        ? native.history.replaceState(data, unused, url)
        : native.history.pushState(data, unused, url);
    };
    return {
      get length() {
        return native.history.length;
      },
      get state() {
        return native.history.state;
      },
      pushState: (data: unknown, unused: string, url?: string | URL | null) =>
        update(false, data, unused, url),
      replaceState: (data: unknown, unused: string, url?: string | URL | null) =>
        update(true, data, unused, url),
      back: () => {
        throw new DOMException(
          'History traversal may leave this application',
          'SecurityError',
        );
      },
      forward: () => {
        throw new DOMException(
          'History traversal may leave this application',
          'SecurityError',
        );
      },
      go: () => {
        throw new DOMException(
          'History traversal may leave this application',
          'SecurityError',
        );
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopServices();
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.clear();
    for (const timer of this.timers) {
      this.options.global.clearTimeout(timer);
      this.options.global.clearInterval(timer);
    }
    this.workers.dispose();
    this.windows?.dispose();
    this.audio?.dispose();
    this.dom?.dispose();
    this.resources.dispose();
    if (environments.get(this.options.global) === this)
      environments.delete(this.options.global);
  }
}
