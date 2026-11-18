import type { GuestResources } from './resources.ts';
import { parseGuestDocument } from './parser.ts';

type RequestEventName =
  'loadstart' | 'progress' | 'abort' | 'error' | 'load' | 'timeout' | 'loadend';
type RequestEventHandler = ((event: ProgressEvent) => unknown) | null;

export interface GuestXMLHttpRequest extends EventTarget {
  readonly UNSENT: 0;
  readonly OPENED: 1;
  readonly HEADERS_RECEIVED: 2;
  readonly LOADING: 3;
  readonly DONE: 4;
  readonly readyState: number;
  readonly status: number;
  readonly statusText: string;
  readonly responseURL: string;
  readonly response:
    string | ArrayBuffer | Blob | Document | object | number | boolean | null;
  readonly responseText: string;
  readonly responseXML: Document | null;
  readonly upload: GuestXMLHttpRequestUpload;
  responseType: XMLHttpRequestResponseType;
  timeout: number;
  withCredentials: boolean;
  onreadystatechange: ((this: GuestXMLHttpRequest, event: Event) => unknown) | null;
  onloadstart: RequestEventHandler;
  onprogress: RequestEventHandler;
  onabort: RequestEventHandler;
  onerror: RequestEventHandler;
  onload: RequestEventHandler;
  ontimeout: RequestEventHandler;
  onloadend: RequestEventHandler;
  open(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void;
  setRequestHeader(name: string, value: string): void;
  getResponseHeader(name: string): string | null;
  getAllResponseHeaders(): string;
  overrideMimeType(mime: string): void;
  send(body?: Document | XMLHttpRequestBodyInit | null): void;
  abort(): void;
}

export interface GuestXMLHttpRequestUpload extends EventTarget {
  onloadstart: RequestEventHandler;
  onprogress: RequestEventHandler;
  onabort: RequestEventHandler;
  onerror: RequestEventHandler;
  onload: RequestEventHandler;
  ontimeout: RequestEventHandler;
  onloadend: RequestEventHandler;
}

export interface GuestXMLHttpRequestConstructor {
  new (): GuestXMLHttpRequest;
  readonly prototype: GuestXMLHttpRequest;
  readonly UNSENT: 0;
  readonly OPENED: 1;
  readonly HEADERS_RECEIVED: 2;
  readonly LOADING: 3;
  readonly DONE: 4;
}

export interface GuestRequestEventTargetConstructor {
  new (): GuestXMLHttpRequestUpload;
  readonly prototype: GuestXMLHttpRequestUpload;
}

export interface GuestMediaDevices extends EventTarget {
  ondevicechange: ((event: Event) => unknown) | null;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  enumerateDevices(): Promise<MediaDeviceInfo[]>;
  getSupportedConstraints(): MediaTrackSupportedConstraints;
}

export interface GuestNavigator {
  readonly userAgent: string;
  readonly appCodeName: string;
  readonly appName: string;
  readonly appVersion: string;
  readonly platform: string;
  readonly product: string;
  readonly productSub: string;
  readonly vendor: string;
  readonly vendorSub: string;
  readonly language: string;
  readonly languages: readonly string[];
  readonly hardwareConcurrency: number;
  readonly maxTouchPoints: number;
  readonly onLine: boolean;
  readonly cookieEnabled: boolean;
  readonly doNotTrack: string | null;
  readonly webdriver: boolean;
  readonly mediaDevices?: GuestMediaDevices;
  readonly permissions: Pick<Permissions, 'query'>;
  sendBeacon(url: string | URL, data?: BodyInit | null): boolean;
  javaEnabled(): boolean;
}

export interface GuestWebServicesOptions {
  resources: GuestResources;
  nativeGlobal: Window | WorkerGlobalScope;
  application: string;
  parseDocument?: (source: string, type: DOMParserSupportedType, url: string) => Document;
}

export interface GuestWebServices {
  XMLHttpRequest: GuestXMLHttpRequestConstructor;
  XMLHttpRequestEventTarget: GuestRequestEventTargetConstructor;
  XMLHttpRequestUpload: GuestRequestEventTargetConstructor;
  navigator: GuestNavigator;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  dispose(): void;
}

interface RequestState {
  readyState: number;
  method: string;
  url: string;
  async: boolean;
  sent: boolean;
  generation: number;
  responseType: XMLHttpRequestResponseType;
  timeout: number;
  withCredentials: boolean;
  started: number;
  timer: ReturnType<typeof setTimeout> | null;
  status: number;
  statusText: string;
  headers: Headers;
  requestHeaders: Headers;
  mimeOverride: string | null;
  bytes: ArrayBuffer;
  text: string;
  response: GuestXMLHttpRequest['response'];
  document: Document | null | undefined;
}

const eventNames: readonly RequestEventName[] = [
  'loadstart',
  'progress',
  'abort',
  'error',
  'load',
  'timeout',
  'loadend',
];
const responseTypes: readonly XMLHttpRequestResponseType[] = [
  '',
  'text',
  'json',
  'arraybuffer',
  'blob',
  'document',
];

const exception = (message: string, name: string) => new DOMException(message, name);
const invalidState = () =>
  exception(
    'The request is not in a valid state for this operation.',
    'InvalidStateError',
  );

function progress(type: RequestEventName, loaded = 0, total = 0): Event {
  if (typeof ProgressEvent !== 'undefined')
    return new ProgressEvent(type, { lengthComputable: total > 0, loaded, total });
  const event = new Event(type);
  Object.defineProperties(event, {
    lengthComputable: { value: total > 0 },
    loaded: { value: loaded },
    total: { value: total },
  });
  return event;
}

function responseWithURL(response: Response, url: string): Response {
  const clone = response.clone.bind(response);
  Object.defineProperties(response, {
    url: { get: () => url, configurable: true },
    clone: {
      value: () => responseWithURL(clone(), url),
      configurable: true,
      writable: true,
    },
  });
  return response;
}

function decodedText(bytes: ArrayBuffer, mime: string): string {
  const charset = /(?:^|;)\s*charset\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(mime);
  try {
    return new TextDecoder(charset?.[1] || charset?.[2] || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

/** Browser-style local resource reads without a native network implementation. */
export function createGuestWebServices({
  resources,
  nativeGlobal,
  parseDocument: parseDocumentSource,
}: GuestWebServicesOptions): GuestWebServices {
  const states = new WeakMap<GuestXMLHttpRequest, RequestState>();
  const uploads = new WeakMap<GuestXMLHttpRequest, GuestXMLHttpRequestUpload>();
  const active = new Set<GuestXMLHttpRequest>();
  const captures = new Set<MediaStream>();
  const cleanup: (() => void)[] = [];
  const isWindow = 'document' in nativeGlobal;
  const parserDocument = 'document' in nativeGlobal ? nativeGlobal.document : undefined;
  let disposed = false;

  function state(request: GuestXMLHttpRequest): RequestState {
    const value = states.get(request);
    if (!value) throw new TypeError('Illegal XMLHttpRequest invocation');
    return value;
  }

  function stopTimer(value: RequestState): void {
    if (value.timer !== null) clearTimeout(value.timer);
    value.timer = null;
  }

  function resetResponse(value: RequestState): void {
    value.status = 0;
    value.statusText = '';
    value.headers = new Headers();
    value.bytes = new ArrayBuffer(0);
    value.text = '';
    value.response = null;
    value.document = undefined;
  }

  function changeState(request: GuestXMLHttpRequest, next: number): void {
    const value = state(request);
    value.readyState = next;
    request.dispatchEvent(new Event('readystatechange'));
  }

  function finishError(
    request: GuestXMLHttpRequest,
    type: 'error' | 'timeout' | 'abort',
    generation: number,
  ): void {
    const value = state(request);
    if (!value.sent || value.generation !== generation) return;
    value.sent = false;
    active.delete(request);
    stopTimer(value);
    resetResponse(value);
    changeState(request, 4);
    request.dispatchEvent(progress(type));
    request.dispatchEvent(progress('loadend'));
  }

  function setTimer(request: GuestXMLHttpRequest): void {
    const value = state(request);
    stopTimer(value);
    if (value.sent && value.async && value.timeout > 0) {
      const generation = value.generation;
      value.timer = setTimeout(
        () => finishError(request, 'timeout', generation),
        Math.max(0, value.timeout - (Date.now() - value.started)),
      );
    }
  }

  function parseDocument(value: RequestState): Document | null {
    if (value.document !== undefined) return value.document;
    value.document = null;
    if (!parserDocument && !parseDocumentSource) return null;
    const mime = (value.mimeOverride || value.headers.get('Content-Type') || '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();
    const html = mime === 'text/html' && value.responseType === 'document';
    if (!html && !/^(?:text\/xml|application\/xml|[^/]+\/[^/]+\+xml)$/.test(mime))
      return null;
    const mimeType = html ? 'text/html' : 'application/xml';
    const document = parseDocumentSource
      ? parseDocumentSource(value.text, mimeType, value.url)
      : parserDocument
        ? parseGuestDocument(parserDocument, resources, value.text, mimeType, value.url)
        : null;
    if (!document) return null;
    if (!html && document.querySelector('parsererror')) return null;
    value.document = document;
    return document;
  }

  function makeResponse(value: RequestState): GuestXMLHttpRequest['response'] {
    switch (value.responseType) {
      case 'arraybuffer':
        return value.bytes;
      case 'blob':
        return new Blob([value.bytes], {
          type: (value.mimeOverride || value.headers.get('Content-Type') || '').split(
            ';',
            1,
          )[0],
        });
      case 'document':
        return parseDocument(value);
      case 'json':
        try {
          return JSON.parse(new TextDecoder().decode(value.bytes));
        } catch {
          return null;
        }
      default:
        return value.text;
    }
  }

  function received(
    request: GuestXMLHttpRequest,
    generation: number,
    response: Response,
    bytes: ArrayBuffer,
  ): void {
    const value = state(request);
    if (!value.sent || value.generation !== generation) return;
    value.status = response.status;
    value.statusText = response.statusText || (response.status === 200 ? 'OK' : '');
    value.headers = new Headers(response.headers);
    if (value.async) changeState(request, 2);
    if (!value.sent || value.generation !== generation) return;
    value.bytes = bytes;
    value.text = decodedText(
      bytes,
      value.mimeOverride || value.headers.get('Content-Type') || '',
    );
    if (value.async) changeState(request, 3);
    if (!value.sent || value.generation !== generation) return;
    value.response = makeResponse(value);
    if (value.async)
      request.dispatchEvent(progress('progress', bytes.byteLength, bytes.byteLength));
    if (!value.sent || value.generation !== generation) return;
    value.sent = false;
    active.delete(request);
    stopTimer(value);
    changeState(request, 4);
    request.dispatchEvent(progress('load', bytes.byteLength, bytes.byteLength));
    request.dispatchEvent(progress('loadend', bytes.byteLength, bytes.byteLength));
  }

  const requestTargetKey = Symbol();
  class XMLHttpRequestEventTarget
    extends EventTarget
    implements GuestXMLHttpRequestUpload
  {
    onloadstart: RequestEventHandler = null;
    onprogress: RequestEventHandler = null;
    onabort: RequestEventHandler = null;
    onerror: RequestEventHandler = null;
    onload: RequestEventHandler = null;
    ontimeout: RequestEventHandler = null;
    onloadend: RequestEventHandler = null;
    constructor(key?: symbol) {
      super();
      if (key !== requestTargetKey) throw new TypeError('Illegal constructor');
      for (const name of eventNames)
        this.addEventListener(name, (event) =>
          this[`on${name}`]?.call(this, event as ProgressEvent),
        );
    }
    get [Symbol.toStringTag]() {
      return 'XMLHttpRequestEventTarget';
    }
  }

  class XMLHttpRequestUpload extends XMLHttpRequestEventTarget {
    get [Symbol.toStringTag]() {
      return 'XMLHttpRequestUpload';
    }
  }

  class XMLHttpRequest extends XMLHttpRequestEventTarget implements GuestXMLHttpRequest {
    static readonly UNSENT = 0;
    static readonly OPENED = 1;
    static readonly HEADERS_RECEIVED = 2;
    static readonly LOADING = 3;
    static readonly DONE = 4;
    declare readonly UNSENT: 0;
    declare readonly OPENED: 1;
    declare readonly HEADERS_RECEIVED: 2;
    declare readonly LOADING: 3;
    declare readonly DONE: 4;
    onreadystatechange: ((this: GuestXMLHttpRequest, event: Event) => unknown) | null =
      null;

    constructor() {
      super(requestTargetKey);
      uploads.set(this, new XMLHttpRequestUpload(requestTargetKey));
      states.set(this, {
        readyState: 0,
        method: '',
        url: '',
        async: true,
        sent: false,
        generation: 0,
        responseType: '',
        timeout: 0,
        withCredentials: false,
        started: 0,
        timer: null,
        status: 0,
        statusText: '',
        headers: new Headers(),
        requestHeaders: new Headers(),
        mimeOverride: null,
        bytes: new ArrayBuffer(0),
        text: '',
        response: null,
        document: undefined,
      });
      this.addEventListener('readystatechange', (event) =>
        this.onreadystatechange?.call(this, event),
      );
    }

    get [Symbol.toStringTag]() {
      return 'XMLHttpRequest';
    }
    get upload(): GuestXMLHttpRequestUpload {
      const upload = uploads.get(this);
      if (!upload) throw new TypeError('Illegal XMLHttpRequest invocation');
      return upload;
    }
    get readyState(): number {
      return state(this).readyState;
    }
    get status(): number {
      return state(this).status;
    }
    get statusText(): string {
      return state(this).statusText;
    }
    get responseURL() {
      const value = state(this);
      return value.status ? value.url : '';
    }
    get response() {
      const value = state(this);
      return value.responseType === '' || value.responseType === 'text'
        ? this.responseText
        : value.readyState === 4
          ? value.response
          : null;
    }
    get responseText() {
      const value = state(this);
      if (value.responseType !== '' && value.responseType !== 'text')
        throw invalidState();
      return value.readyState < 3 ? '' : value.text;
    }
    get responseXML() {
      const value = state(this);
      if (value.responseType !== '' && value.responseType !== 'document')
        throw invalidState();
      return value.readyState === 4 ? parseDocument(value) : null;
    }
    get responseType() {
      return state(this).responseType;
    }
    set responseType(type: XMLHttpRequestResponseType) {
      const value = state(this);
      if (value.readyState >= 3) throw invalidState();
      if (!responseTypes.includes(type))
        throw new TypeError('Invalid XMLHttpRequest responseType');
      if (!value.async && isWindow && type !== '')
        throw exception(
          'Synchronous Window requests do not support responseType.',
          'InvalidAccessError',
        );
      if (type === 'document' && !isWindow) return;
      value.responseType = type;
    }
    get timeout() {
      return state(this).timeout;
    }
    set timeout(timeout: number) {
      const value = state(this);
      const milliseconds = Number(timeout) >>> 0;
      if (!value.async && isWindow && milliseconds)
        throw exception(
          'Synchronous Window requests do not support timeouts.',
          'InvalidAccessError',
        );
      value.timeout = milliseconds;
      setTimer(this);
    }
    get withCredentials() {
      return state(this).withCredentials;
    }
    set withCredentials(value: boolean) {
      const request = state(this);
      if (request.readyState > 1 || request.sent) throw invalidState();
      request.withCredentials = Boolean(value);
    }

    open(
      method: string,
      input: string | URL,
      async = true,
      username?: string | null,
      password?: string | null,
    ): void {
      if (disposed) throw invalidState();
      method = String(method);
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(method))
        throw exception('Invalid HTTP method.', 'SyntaxError');
      if (/^(?:CONNECT|TRACE|TRACK)$/i.test(method))
        throw exception('Forbidden HTTP method.', 'SecurityError');
      if (/^(?:DELETE|GET|HEAD|OPTIONS|POST|PUT)$/i.test(method))
        method = method.toUpperCase();
      const url = new URL(resources.resolve(String(input)));
      if (username != null) url.username = String(username);
      if (password != null) url.password = String(password);
      url.hash = '';
      const value = state(this);
      stopTimer(value);
      active.delete(this);
      value.generation++;
      value.sent = false;
      value.method = method;
      value.url = url.href;
      value.async = Boolean(async);
      value.requestHeaders = new Headers();
      value.mimeOverride = null;
      resetResponse(value);
      if (!value.async && isWindow && (value.timeout || value.responseType !== ''))
        throw exception(
          'Synchronous Window requests do not support timeout or responseType.',
          'InvalidAccessError',
        );
      if (value.readyState !== 1) changeState(this, 1);
    }

    setRequestHeader(name: string, value: string): void {
      const request = state(this);
      if (request.readyState !== 1 || request.sent) throw invalidState();
      // Headers validates names and values; credentials are never sent anywhere.
      request.requestHeaders.append(String(name), String(value));
    }
    getResponseHeader(name: string): string | null {
      const value = state(this);
      if (value.readyState < 2 || !value.status || /^set-cookie2?$/i.test(String(name)))
        return null;
      return value.headers.get(String(name));
    }
    getAllResponseHeaders(): string {
      const value = state(this);
      if (value.readyState < 2 || !value.status) return '';
      return [...value.headers]
        .filter(([name]) => !/^set-cookie2?$/i.test(name))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => `${name}: ${value}\r\n`)
        .join('');
    }
    overrideMimeType(mime: string): void {
      const value = state(this);
      if (value.readyState >= 3) throw invalidState();
      value.mimeOverride = String(mime);
    }

    send(_body: Document | XMLHttpRequestBodyInit | null = null): void {
      const value = state(this);
      if (disposed || value.readyState !== 1 || value.sent) throw invalidState();
      value.sent = true;
      value.started = Date.now();
      active.add(this);
      const generation = value.generation;
      if (!value.async) {
        const resource = resources.resource(value.url);
        if (!resource || !/^(?:GET|HEAD)$/.test(value.method)) {
          finishError(this, 'error', generation);
          throw exception('The requested local resource is unavailable.', 'NetworkError');
        }
        const response = new Response(null, {
          headers: { 'Content-Type': resource.contentType },
        });
        received(
          this,
          generation,
          response,
          value.method === 'HEAD' ? new ArrayBuffer(0) : resource.bytes.slice(0),
        );
        return;
      }
      this.dispatchEvent(progress('loadstart'));
      setTimer(this);
      void resources
        .fetch(value.url, { method: value.method, headers: value.requestHeaders })
        .then(async (response) =>
          received(this, generation, response, await response.arrayBuffer()),
        )
        .catch(() => finishError(this, 'error', generation));
    }
    abort(): void {
      const value = state(this);
      if (value.sent) finishError(this, 'abort', value.generation);
      value.generation++;
      value.sent = false;
      stopTimer(value);
      active.delete(this);
      value.readyState = 0;
      resetResponse(value);
    }
  }

  for (const [name, value] of Object.entries({
    UNSENT: 0,
    OPENED: 1,
    HEADERS_RECEIVED: 2,
    LOADING: 3,
    DONE: 4,
  })) {
    const descriptor = { value, enumerable: true, writable: false, configurable: false };
    Object.defineProperty(XMLHttpRequest, name, descriptor);
    Object.defineProperty(XMLHttpRequest.prototype, name, descriptor);
  }

  const nativeNavigator = nativeGlobal.navigator;
  const media =
    'mediaDevices' in nativeNavigator ? nativeNavigator.mediaDevices : undefined;
  let mediaDevices: GuestMediaDevices | undefined;
  if (media) {
    class MediaDevices extends EventTarget implements GuestMediaDevices {
      ondevicechange: ((event: Event) => unknown) | null = null;
      constructor() {
        super();
        this.addEventListener('devicechange', (event) =>
          this.ondevicechange?.call(this, event),
        );
      }
      get [Symbol.toStringTag]() {
        return 'MediaDevices';
      }
      async getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
        if (disposed)
          throw exception('The application context is closed.', 'InvalidStateError');
        if (constraints.video)
          throw exception('Camera access is unavailable.', 'NotAllowedError');
        if (!constraints.audio) throw new TypeError('Audio constraints are required.');
        const stream = await media!.getUserMedia({
          audio: constraints.audio,
          video: false,
        });
        if (disposed) {
          for (const track of stream.getTracks()) track.stop();
          throw exception('The application context is closed.', 'AbortError');
        }
        captures.add(stream);
        const inactive = () => captures.delete(stream);
        stream.addEventListener('inactive', inactive, { once: true });
        cleanup.push(() => stream.removeEventListener('inactive', inactive));
        return stream;
      }
      async enumerateDevices(): Promise<MediaDeviceInfo[]> {
        if (disposed)
          throw exception('The application context is closed.', 'InvalidStateError');
        return (await media!.enumerateDevices()).filter(
          (device) => device.kind === 'audioinput' || device.kind === 'audiooutput',
        );
      }
      getSupportedConstraints(): MediaTrackSupportedConstraints {
        if (disposed)
          throw exception('The application context is closed.', 'InvalidStateError');
        return media!.getSupportedConstraints();
      }
    }
    mediaDevices = new MediaDevices();
    const changed = () => mediaDevices?.dispatchEvent(new Event('devicechange'));
    media.addEventListener('devicechange', changed);
    cleanup.push(() => media.removeEventListener('devicechange', changed));
  }

  const permissionStates = new WeakMap<
    PermissionStatus,
    { name: PermissionName; native: globalThis.PermissionStatus | null }
  >();
  class PermissionStatus extends EventTarget {
    onchange: ((event: Event) => unknown) | null = null;
    constructor(name: PermissionName, permission: globalThis.PermissionStatus | null) {
      super();
      permissionStates.set(this, { name, native: permission });
      const changed = () => this.dispatchEvent(new Event('change'));
      permission?.addEventListener('change', changed);
      cleanup.push(() => permission?.removeEventListener('change', changed));
      this.addEventListener('change', (event) => this.onchange?.call(this, event));
    }
    get name(): PermissionName {
      const value = permissionStates.get(this);
      if (!value) throw new TypeError('Illegal PermissionStatus invocation');
      return value.name;
    }
    get state(): PermissionState {
      const value = permissionStates.get(this);
      if (!value) throw new TypeError('Illegal PermissionStatus invocation');
      return value.native?.state || 'denied';
    }
    get [Symbol.toStringTag]() {
      return 'PermissionStatus';
    }
  }

  const permissions: Pick<Permissions, 'query'> = {
    async query(descriptor: PermissionDescriptor): Promise<globalThis.PermissionStatus> {
      if (!descriptor || typeof descriptor.name !== 'string')
        throw new TypeError('A permission name is required.');
      const name = String(descriptor.name);
      if (disposed)
        throw exception('The application context is closed.', 'InvalidStateError');
      const native =
        name === 'microphone' && 'permissions' in nativeNavigator
          ? await nativeNavigator.permissions.query({ name: 'microphone' })
          : null;
      if (disposed)
        throw exception('The application context is closed.', 'InvalidStateError');
      return new PermissionStatus(descriptor.name, native);
    },
  };

  const navigator: GuestNavigator = {
    get userAgent() {
      return nativeNavigator.userAgent;
    },
    get appCodeName() {
      return nativeNavigator.appCodeName;
    },
    get appName() {
      return nativeNavigator.appName;
    },
    get appVersion() {
      return nativeNavigator.appVersion;
    },
    get platform() {
      return nativeNavigator.platform;
    },
    get product() {
      return nativeNavigator.product;
    },
    get productSub() {
      return 'productSub' in nativeNavigator ? nativeNavigator.productSub : '';
    },
    get vendor() {
      return 'vendor' in nativeNavigator ? nativeNavigator.vendor : '';
    },
    get vendorSub() {
      return 'vendorSub' in nativeNavigator ? nativeNavigator.vendorSub : '';
    },
    get language() {
      return nativeNavigator.language || 'en-US';
    },
    get languages() {
      return Array.from(
        nativeNavigator.languages || [nativeNavigator.language || 'en-US'],
      );
    },
    get hardwareConcurrency() {
      return nativeNavigator.hardwareConcurrency || 1;
    },
    get maxTouchPoints() {
      return 'maxTouchPoints' in nativeNavigator ? nativeNavigator.maxTouchPoints : 0;
    },
    get onLine() {
      return nativeNavigator.onLine;
    },
    get cookieEnabled() {
      return false;
    },
    get doNotTrack() {
      return 'doNotTrack' in nativeNavigator ? nativeNavigator.doNotTrack : null;
    },
    get webdriver() {
      return 'webdriver' in nativeNavigator ? nativeNavigator.webdriver : false;
    },
    ...(mediaDevices ? { mediaDevices } : {}),
    permissions,
    sendBeacon() {
      return false;
    },
    javaEnabled() {
      return false;
    },
  };
  for (const key of Reflect.ownKeys(navigator)) {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, key);
    if (descriptor)
      Object.defineProperty(navigator, key, {
        ...descriptor,
        configurable: false,
        ...(Object.hasOwn(descriptor, 'value') ? { writable: false } : {}),
      });
  }
  Object.defineProperty(navigator, Symbol.toStringTag, {
    value: isWindow ? 'Navigator' : 'WorkerNavigator',
  });

  async function localFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    if (disposed)
      throw exception('The application context is closed.', 'InvalidStateError');
    const signal = init?.signal || (input instanceof Request ? input.signal : undefined);
    if (signal?.aborted)
      throw signal.reason || exception('The request was aborted.', 'AbortError');
    const url = new URL(
      resources.resolve(input instanceof Request ? input.url : String(input)),
    );
    url.hash = '';
    return new Promise<Response>((resolve, reject) => {
      const aborted = () =>
        reject(signal?.reason || exception('The request was aborted.', 'AbortError'));
      signal?.addEventListener('abort', aborted, { once: true });
      void resources
        .fetch(input, init)
        .then((response) => resolve(responseWithURL(response, url.href)), reject)
        .finally(() => signal?.removeEventListener('abort', aborted));
    });
  }

  return {
    XMLHttpRequest,
    XMLHttpRequestEventTarget,
    XMLHttpRequestUpload,
    navigator,
    fetch: localFetch,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const request of active) request.abort();
      for (const stream of captures) for (const track of stream.getTracks()) track.stop();
      captures.clear();
      for (const dispose of cleanup) dispose();
      cleanup.length = 0;
    },
  };
}
