import { GuestLocation } from './location.ts';
import { GuestEngine } from './engine.ts';
import type { GuestHost } from './protocol.ts';
import { GuestResources } from './resources.ts';
import { GuestDOM } from './dom.ts';
import { createGuestCustomElements } from './custom-elements.ts';
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
  'ResizeObserverEntry',
  'ResizeObserverSize',
  'IntersectionObserverEntry',
  'MutationRecord',
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
const attributeArguments = new Map<string, readonly number[]>([
  ['setAttribute', [0, 1]],
  ['setAttributeNS', [0, 1, 2]],
  ['getAttribute', [0]],
  ['getAttributeNS', [0, 1]],
  ['hasAttribute', [0]],
  ['hasAttributeNS', [0, 1]],
  ['getAttributeNode', [0]],
  ['getAttributeNodeNS', [0, 1]],
  ['removeAttribute', [0]],
  ['removeAttributeNS', [0, 1]],
  ['toggleAttribute', [0]],
]);
const domString = (value: unknown): string => {
  if (typeof value === 'symbol') throw new TypeError('A Symbol is not a DOMString');
  return String(value);
};
const localEditingCommands = new Set([
  'backcolor',
  'bold',
  'defaultparagraphseparator',
  'delete',
  'fontname',
  'fontsize',
  'forecolor',
  'formatblock',
  'forwarddelete',
  'heading',
  'hilitecolor',
  'indent',
  'insertlinebreak',
  'insertorderedlist',
  'insertparagraph',
  'inserttext',
  'insertunorderedlist',
  'italic',
  'justifycenter',
  'justifyfull',
  'justifyleft',
  'justifyright',
  'outdent',
  'redo',
  'removeformat',
  'selectall',
  'strikethrough',
  'stylewithcss',
  'subscript',
  'superscript',
  'underline',
  'undo',
  'unlink',
  'usecss',
]);
const own = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key);

/** Native browser authority is concentrated here, independent of guest prototypes. */
export class BrowserEnvironment {
  private navigation?: GuestLocation;
  readonly resources: GuestResources;
  readonly host: GuestHost;
  readonly globals: Record<string, unknown> = Object.create(null);
  readonly dynamic = new Set<string>();
  readonly document?: Document;
  readonly dom?: GuestDOM;
  private engine?: GuestEngine;
  private customElements?: ReturnType<typeof createGuestCustomElements>;
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
  private animatedTargets = new WeakMap<object, Element>();
  private tokenOwners = new WeakMap<object, Element>();
  private windowsSeen = new WeakSet<object>();
  private linkActions = new WeakMap<Event, () => void>();
  private disposed = false;
  private stopServices = () => {};
  private cleanups = new Set<() => void>();

  constructor(readonly options: BrowserEnvironmentOptions) {
    const { catalog, global: native } = options;
    this.resources = new GuestResources(catalog);
    this.document = 'document' in native ? native.document : undefined;
    environments.set(native, this);
    if (this.document?.defaultView) {
      this.customElements = createGuestCustomElements(this.document.defaultView, {
        property: (value, key) => this.requireEngine().property(value, key),
        construct: (constructor, args) =>
          this.requireEngine().construct(constructor, args),
        alias: (native, guest) => this.requireEngine().alias(native, guest),
      });
      this.globals.customElements = this.customElements.registry;
    }
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
        logicalOrigin: (target) => {
          const environment = environments.get(target);
          return environment
            ? new URL(environment.options.catalog.sourceURL).origin
            : undefined;
        },
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
      owns: (target) =>
        typeof target !== 'function' && (isNode(target) || isWindow(target)),
      get: (target, key) => this.get(target, key),
      set: (target, key, value) => this.set(target, key, value),
      call: (target, receiver, args) => Reflect.apply(target, receiver, args),
      construct: (target, args, newTarget) => this.construct(target, args, newTarget),
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
      'HTMLDocument',
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
      this.navigation = new GuestLocation(native, catalog);
      this.globals.location = this.navigation.location;
      this.globals.origin = new URL(catalog.sourceURL).origin;
      this.globals.history = this.navigation.createHistory();
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
      const click = (event: MouseEvent) => {
        const anchor = isElement(event.target) ? event.target.closest('a,area') : null;
        if (anchor) this.followAnchor(anchor, event);
      };
      const keyboard = (event: KeyboardEvent) => {
        const anchor = isElement(event.target) ? event.target.closest('a,area') : null;
        if (
          event.key !== 'Enter' ||
          !anchor ||
          this.dom?.logicalAttribute(anchor, 'href') === undefined
        )
          return;
        queueMicrotask(() => {
          if (this.disposed || event.defaultPrevented) return;
          const MouseEventConstructor: typeof MouseEvent = Reflect.get(
            native,
            'MouseEvent',
          );
          anchor.dispatchEvent(
            new MouseEventConstructor('click', { bubbles: true, cancelable: true }),
          );
        });
      };
      native.addEventListener('click', click, true);
      native.addEventListener('keydown', keyboard, true);
      this.cleanups.add(() => {
        native.removeEventListener('click', click, true);
        native.removeEventListener('keydown', keyboard, true);
      });
      native.addEventListener('submit', (event) => event.preventDefault(), true);
    }
    for (const name of Object.keys(this.globals)) this.dynamic.delete(name);
  }

  private followAnchor(anchor: Element, event: Event): void {
    this.dom?.prepare(anchor);
    if (this.linkActions.has(event)) return;
    const action = () => {
      if (this.linkActions.get(event) !== action) return;
      this.linkActions.delete(event);
      if (this.disposed || event.defaultPrevented) return;
      const native = this.options.global;
      if (!('document' in native)) return;
      const logical = this.dom?.logicalAttribute(anchor, 'href');
      if (logical === undefined) return;
      try {
        if (anchor.hasAttribute('download')) {
          const local = /^(?:blob:|data:)/i.test(logical)
            ? logical
            : this.resources.resource(logical)
              ? this.resources.nativeURL(logical)
              : null;
          if (!local) return;
          if (
            !native.confirm(
              'Allow this application to export a file? Exported data leaves confinement. Your browser may send download metadata for security checks.',
            )
          )
            return;
          const download = native.document.createElement('a');
          download.href = local;
          download.download = anchor.getAttribute('download') || '';
          download.click();
          return;
        }
        const url = new URL(logical, this.options.catalog.documentBase);
        const resource = this.resources.resource(url.href);
        const current = this.resources.resource(this.options.catalog.sourceURL);
        if (logical.startsWith('#') || (resource && resource === current))
          native.location.hash = url.hash;
      } catch {
        // Invalid and unavailable link destinations have no native fallback.
      }
    };
    this.linkActions.set(event, action);
    queueMicrotask(action);
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
    if ((key === 'baseVal' || key === 'animVal') && this.animatedTargets.has(target)) {
      const logical = this.dom?.logicalAttribute(
        this.animatedTargets.get(target)!,
        'target',
      );
      if (logical !== undefined) return logical;
    }
    if (key === 'location' && isDocument(target))
      return target.defaultView
        ? environments.get(target.defaultView)?.globals.location
        : null;
    if (
      key === 'state' &&
      typeof PopStateEvent === 'function' &&
      target instanceof PopStateEvent &&
      target.isTrusted &&
      target.target === this.options.global
    )
      return this.navigation ? this.navigation.eventState(target.state) : target.state;
    if (key === 'cookie' && isDocument(target)) return '';
    if (target === this.document) {
      if (key === 'currentScript') return this.dom?.currentScript;
      if (key === 'readyState') return this.dom?.readyState;
      if (key === 'baseURI') return this.options.catalog.documentBase;
      if (key === 'URL' || key === 'documentURI')
        return this.navigation?.href ?? this.options.catalog.sourceURL;
      if (key === 'cookie') return '';
    }
    if (this.document && isElement(target)) {
      if (target.localName === 'link' && key === 'href') {
        const logical = this.dom?.logicalAttribute(target, 'href');
        if (logical !== undefined) return this.resources.resolve(logical);
      }
      if (
        key === 'target' &&
        target.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
        (target.localName === 'a' || target.localName === 'area')
      ) {
        const logical = this.dom?.logicalAttribute(target, 'target');
        if (logical !== undefined) return logical;
      }
      if (
        ['object', 'embed'].includes(target.localName) &&
        ['data', 'src', 'codeBase', 'classid', 'archive'].includes(String(key))
      ) {
        const logical = this.dom?.logicalAttribute(target, String(key));
        if (logical !== undefined) return logical;
      }
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
      if (key === 'target' && target.namespaceURI === 'http://www.w3.org/2000/svg')
        this.animatedTargets.set(value, target);
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
    if (key === 'baseVal' && this.animatedTargets.has(target))
      return !this.dom!.attribute(
        this.animatedTargets.get(target)!,
        'target',
        domString(value),
      );
    if (key === 'value' && this.tokenOwners.has(target)) {
      const rel = domString(value);
      value = rel;
      if (!this.dom!.attribute(this.tokenOwners.get(target)!, 'rel', rel)) return true;
    }
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
      if (
        !this.dom!.attribute(
          target.ownerElement,
          target.name,
          String(value),
          target.namespaceURI,
        )
      )
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
        [
          'src',
          'href',
          'srcset',
          'poster',
          'nonce',
          'type',
          'data',
          'codeBase',
          'classid',
          'archive',
          'target',
        ].includes(key)
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

  private construct(target: Function, args: unknown[], newTarget?: Function): object {
    const custom = this.customElements?.constructBase(target, args, newTarget);
    if (custom) return custom;
    if (target.name === 'CustomElementRegistry')
      throw new DOMException(
        'Scoped custom element registries are unavailable',
        'NotSupportedError',
      );
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
    if (key === 'createProcessingInstruction' && isDocument(receiver)) {
      if (args.length < target.length)
        throw new TypeError('Missing processing-instruction argument');
      args[0] = domString(args[0]);
      args[1] = domString(args[1]);
    }
    if ((key === 'click' || key === 'dispatchEvent') && isNode(receiver)) {
      const element = isElement(receiver) ? receiver : receiver.parentElement;
      const anchor = element?.closest('a,area');
      if (anchor) {
        this.dom?.prepare(anchor);
        let activated: Event | undefined;
        const follow = (event: Event) => {
          activated = event;
          this.followAnchor(anchor, event);
        };
        anchor.addEventListener('click', follow, true);
        try {
          const result: unknown = Reflect.apply(target, receiver, args);
          if (activated) this.linkActions.get(activated)?.();
          return result;
        } finally {
          anchor.removeEventListener('click', follow, true);
        }
      }
    }
    // Web IDL conversion may run application code. Validate and forward the same
    // captured primitives, rather than converting an untrusted object twice.
    if (isElement(receiver) && typeof key === 'string') {
      const indices = attributeArguments.get(key);
      if (indices) {
        if (args.length < target.length)
          throw new TypeError('Missing attribute argument');
        for (const index of indices)
          if (index < args.length)
            args[index] =
              key.endsWith('NS') && index === 0 && args[index] == null
                ? null
                : domString(args[index]);
      }
    }
    if (
      receiver &&
      typeof receiver === 'object' &&
      this.attributeOwners.has(receiver) &&
      (key === 'removeNamedItem' || key === 'removeNamedItemNS')
    ) {
      if (args.length < target.length) throw new TypeError('Missing attribute argument');
      for (let index = 0; index < (key === 'removeNamedItemNS' ? 2 : 1); index++)
        args[index] =
          key === 'removeNamedItemNS' && index === 0 && args[index] == null
            ? null
            : domString(args[index]);
    }
    if (key === 'execCommand' && isDocument(receiver)) {
      if (!args.length) throw new TypeError('Missing editing command');
      const command = domString(args[0]).toLowerCase();
      args[0] = command;
      if (args.length > 2) args[2] = domString(args[2]);
      if (!localEditingCommands.has(command))
        throw new DOMException('This editing command is unavailable', 'SecurityError');
      if (
        (command === 'formatblock' || command === 'heading') &&
        !/^<?(?:address|blockquote|div|h[1-6]|p|pre)>?$/i.test(String(args[2]))
      )
        throw new DOMException('Unsupported editing element', 'SecurityError');
      if (
        command === 'defaultparagraphseparator' &&
        !/^(?:div|p)$/i.test(String(args[2]))
      )
        throw new DOMException('Unsupported paragraph element', 'SecurityError');
    }
    if (
      key === 'submit' &&
      Object.prototype.toString.call(receiver) === '[object HTMLFormElement]'
    )
      throw new DOMException('Native form navigation is unavailable', 'SecurityError');
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
    if (key === 'addModule') {
      if (receiver && typeof receiver === 'object' && this.audioOwners.has(receiver))
        return this.audio!.addModule(this.audioOwners.get(receiver)!, String(args[0]));
      throw new DOMException('This worklet context is unavailable', 'SecurityError');
    }
    if (
      receiver &&
      typeof receiver === 'object' &&
      this.tokenOwners.has(receiver) &&
      ['add', 'remove', 'toggle', 'replace'].includes(String(key))
    ) {
      const count =
        key === 'toggle'
          ? Math.min(1, args.length)
          : key === 'replace'
            ? Math.min(2, args.length)
            : args.length;
      for (let index = 0; index < count; index++) args[index] = domString(args[index]);
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
      if (
        ['getAttribute', 'getAttributeNS', 'hasAttribute', 'hasAttributeNS'].includes(
          String(key),
        )
      ) {
        const namespaced = key === 'getAttributeNS' || key === 'hasAttributeNS';
        const name = String(args[namespaced ? 1 : 0]);
        const logical = this.dom?.logicalAttribute(
          receiver,
          name,
          namespaced && typeof args[0] === 'string' ? args[0] : null,
        );
        const presence = key === 'hasAttribute' || key === 'hasAttributeNS';
        if (logical !== undefined) return presence ? true : logical;
        if (isHTMLIFrameElement(receiver)) {
          const value = this.windows?.attributeValue(receiver, name);
          if (value !== undefined) return presence ? value !== null : value;
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
      if (key === 'toggleAttribute') {
        const name = String(args[0]);
        const mirror = receiver.ownerDocument.createElement('div');
        const virtual =
          this.dom!.logicalAttribute(receiver, name) !== undefined ||
          (isHTMLIFrameElement(receiver) &&
            typeof this.windows?.attributeValue(receiver, name) === 'string');
        if (virtual || receiver.hasAttribute(name)) mirror.setAttribute(name, '');
        const enabled = Boolean(Reflect.apply(target, mirror, args));
        if (enabled) {
          if (this.dom!.attribute(receiver, name, '')) receiver.setAttribute(name, '');
        } else {
          receiver.removeAttribute(name);
          this.dom!.forgetAttribute(receiver, name);
          if (isHTMLIFrameElement(receiver) && (name === 'src' || name === 'srcdoc'))
            this.windows?.attribute(receiver, name, null);
        }
        return enabled;
      }
      if (
        key === 'removeAttribute' ||
        key === 'removeAttributeNS' ||
        key === 'removeAttributeNode'
      ) {
        const attribute =
          key === 'removeAttributeNode' && isAttr(args[0]) ? args[0] : undefined;
        const name = attribute?.name || String(args[key === 'removeAttributeNS' ? 1 : 0]);
        const namespace =
          attribute?.namespaceURI ||
          (key === 'removeAttributeNS' && typeof args[0] === 'string' ? args[0] : null);
        const result: unknown = Reflect.apply(target, receiver, args);
        this.dom!.forgetAttribute(receiver, name, namespace);
        if (isHTMLIFrameElement(receiver) && (name === 'src' || name === 'srcdoc'))
          this.windows?.attribute(receiver, name, null);
        return result;
      }
      if (
        (key === 'setAttributeNode' || key === 'setAttributeNodeNS') &&
        isAttr(args[0])
      ) {
        const attribute = args[0];
        const previous = receiver.getAttributeNode(attribute.name);
        if (
          !this.dom!.attribute(
            receiver,
            attribute.name,
            attribute.value,
            attribute.namespaceURI,
          )
        )
          return previous;
      }
      if (key === 'setAttribute' || key === 'setAttributeNS') {
        const index = key === 'setAttributeNS' ? 1 : 0;
        if (
          !this.dom!.attribute(
            receiver,
            String(args[index]),
            String(args[index + 1]),
            key === 'setAttributeNS' && typeof args[0] === 'string' ? args[0] : null,
          )
        )
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
      if (
        !this.dom!.attribute(
          owner,
          attribute.name,
          attribute.value,
          attribute.namespaceURI,
        )
      )
        return previous;
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
    if (!this.navigation)
      throw new DOMException('Worker navigation is unavailable', 'SecurityError');
    this.navigation.navigate(input);
  }

  dispose(): void {
    this.navigation?.dispose();
    if (this.disposed) return;
    this.disposed = true;
    this.stopServices();
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.clear();
    for (const timer of this.timers) {
      this.options.global.clearTimeout(timer);
      this.options.global.clearInterval(timer);
    }
    this.customElements?.dispose();
    this.workers.dispose();
    this.windows?.dispose();
    this.audio?.dispose();
    this.dom?.dispose();
    this.resources.dispose();
    if (environments.get(this.options.global) === this)
      environments.delete(this.options.global);
  }
}
