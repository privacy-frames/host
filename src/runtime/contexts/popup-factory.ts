import {
  strings,
  internalArray,
  internalRecord,
  internalMap,
  internalSet,
} from '../../shared/primordials.ts';
import type { PolicyTools } from '../enforcement/native.ts';
import type { ResourceAliases } from '../resource-aliases.ts';
import type { ChildDocumentSource } from './document-content-types.ts';
import {
  parseDocumentRegistration,
  type DocumentRegistration,
} from './document-protocol.ts';
// Control-plane requests retain the pre-adapter native operation.
const nativeFetch = fetch;

interface PopupFactoryOptions {
  applicationURL: string;
  baseURL(): string;
  resources: Pick<ResourceAliases, 'mapURL' | 'isInstalledURL' | 'sourceURL'>;
}
interface PendingMessage {
  value: unknown;
  origin: string;
  transfer: Transferable[];
}
interface PopupRecord {
  window: Window;
  facade: Window;
  events: EventTarget;
  address: string;
  name: string;
  ready: boolean;
  loaded: boolean;
  canceled: boolean;
  timer?: number;
  registration?: DocumentRegistration;
  port?: MessagePort;
  queue: PendingMessage[];
  onload?: unknown;
  onerror?: unknown;
}
/** Keep a native popup private until its committed document has common preparation. */
export function createPopupFactory(tools: PolicyTools, options: PopupFactoryOptions) {
  const { apply, descriptor, fail, str } = tools;
  const owner = window;
  const nativeOpen = owner.open;
  const nativeClose = owner.close;
  const nativeFocus = owner.focus;
  const nativePost = owner.postMessage;
  const nativeClone = structuredClone;
  const NativeWeakMap = WeakMap;
  const NativeTypeError = TypeError;
  const arrayFrom = Array.from;
  const NativeURL = URL;
  const urlGet = (key: 'href' | 'origin' | 'protocol') =>
    descriptor(NativeURL.prototype, key)!.get!;
  const href = urlGet('href'),
    origin = urlGet('origin'),
    protocol = urlGet('protocol');
  const runtimeOrigin: string = apply(origin, new NativeURL(options.applicationURL), []);
  const closed = descriptor(tools.propertyOwner(owner, 'closed')!, 'closed')!.get!;
  const location = descriptor(tools.propertyOwner(owner, 'location')!, 'location')!.get!;
  const replace = owner.location.replace;
  const documentGet = descriptor(
    tools.propertyOwner(owner, 'document')!,
    'document',
  )!.get!;
  const headGet = descriptor(Document.prototype, 'head')!.get!;
  const createElement = Document.prototype.createElement;
  const setAttribute = Element.prototype.setAttribute;
  const appendChild = Node.prototype.appendChild;
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  const dispatch = EventTarget.prototype.dispatchEvent;
  const stop = Event.prototype.stopImmediatePropagation;
  const data = descriptor(MessageEvent.prototype, 'data')!.get!;
  const source = descriptor(MessageEvent.prototype, 'source')!.get!;
  const eventOrigin = descriptor(MessageEvent.prototype, 'origin')!.get!;
  const post = MessagePort.prototype.postMessage;
  const start = MessagePort.prototype.start;
  const closePort = MessagePort.prototype.close;
  const NativeChannel = MessageChannel;
  const port1 = descriptor(MessageChannel.prototype, 'port1')!.get!;
  const port2 = descriptor(MessageChannel.prototype, 'port2')!.get!;
  const NativeTarget = EventTarget,
    NativeEvent = Event;
  const NativeProxy = Proxy;
  const ownKeys = Reflect.ownKeys,
    get = Reflect.get,
    set = Reflect.set;
  const getPrototype = Object.getPrototypeOf;
  const fetchOK = descriptor(Response.prototype, 'ok')!.get!;
  const json = Response.prototype.json,
    text = Response.prototype.text;
  const headers = descriptor(Response.prototype, 'headers')!.get!;
  const headerGet = Headers.prototype.get;
  const stringify = JSON.stringify;
  const setTimer = owner.setTimeout,
    clearTimer = owner.clearTimeout;
  const records = new NativeWeakMap<object, PopupRecord>();
  const named = internalMap<string, PopupRecord>();
  const all = internalSet<PopupRecord>();
  const field = (value: unknown, key: string): unknown =>
    value && typeof value === 'object' ? descriptor(value, key)?.value : undefined;
  function closeRegistration(registration: DocumentRegistration) {
    void nativeFetch(
      apply(href, new NativeURL('close', registration.url), []),
      internalRecord<RequestInit>({
        method: 'POST',
        credentials: 'omit',
        headers: internalRecord({ 'Content-Type': 'application/json' }),
        body: stringify(internalRecord({ parentToken: registration.parentToken })),
      }),
    ).catch(() => {});
  }
  function retire(record: PopupRecord, error = false) {
    if (record.canceled) return;
    record.canceled = true;
    if (record.timer !== undefined) apply(clearTimer, owner, [record.timer]);
    record.timer = undefined;
    if (record.port) apply(closePort, record.port, []);
    for (const message of record.queue)
      for (const transferable of message.transfer) {
        try {
          apply(closePort, transferable, []);
        } catch {
          /* Non-port transfers have no close. */
        }
      }
    record.queue.length = 0;
    apply(nativeClose, record.window, []);
    if (record.registration) closeRegistration(record.registration);
    if (named.get(record.name) === record) named.delete(record.name);
    all.delete(record);
    // records deliberately retains the weak association: delayed native messages
    // from canceled private windows must never expose an unprepared event.source.
    if (error) emit(record, 'error');
  }
  function emit(record: PopupRecord, type: 'load' | 'error') {
    const event = new NativeEvent(type);
    apply(dispatch, record.events, [event]);
    const handler = type === 'load' ? record.onload : record.onerror;
    if (typeof handler === 'function') apply(handler, record.facade, [event]);
  }
  function deliver(record: PopupRecord, message: PendingMessage) {
    apply(nativePost, record.window, [message.value, message.origin, message.transfer]);
  }
  function facade(record: PopupRecord): Window {
    const methods = internalMap<PropertyKey, unknown>();
    methods.set('close', () => retire(record));
    methods.set('focus', () => {
      if (!record.canceled) apply(nativeFocus, record.window, []);
    });
    methods.set('postMessage', (...args: unknown[]) => {
      if (!args.length) throw new NativeTypeError('postMessage requires a message');
      const dictionary =
        args[1] && typeof args[1] === 'object'
          ? (args[1] as WindowPostMessageOptions)
          : undefined;
      const targetOrigin = dictionary
        ? str(dictionary.targetOrigin ?? '/')
        : str(args[1] ?? '/');
      const suppliedTransfer = dictionary ? dictionary.transfer : args[2];
      const transfer =
        suppliedTransfer === undefined
          ? []
          : internalArray(arrayFrom(suppliedTransfer as Iterable<Transferable>));
      if (targetOrigin !== '*' && targetOrigin !== '/') {
        try {
          new NativeURL(targetOrigin);
        } catch {
          // Invalid origins never deliver a message. Let the native operation
          // retain each engine's error/transfer ordering (which differs).
          return apply(nativePost, owner, [args[0], targetOrigin, transfer]);
        }
      }
      // Transfer now, even while preparation is pending, like native postMessage.
      const snapshot = internalRecord(
        nativeClone(
          internalRecord({ value: args[0], transfer }),
          internalRecord({ transfer }),
        ),
      );
      if (record.canceled) return;
      const message = internalRecord({
        value: snapshot.value,
        origin: targetOrigin,
        transfer: snapshot.transfer,
      });
      if (record.loaded) deliver(record, message);
      else record.queue.push(message);
    });
    methods.set('addEventListener', (...args: unknown[]) =>
      apply(add, record.events, args),
    );
    methods.set('removeEventListener', (...args: unknown[]) =>
      apply(remove, record.events, args),
    );
    return new NativeProxy(
      record.events,
      internalRecord({
        get(_target, key) {
          if (key === 'then') return undefined;
          if (key === 'window' || key === 'self') return record.facade;
          if (key === 'closed')
            return record.canceled || apply(closed, record.window, []);
          if (key === 'onload' || key === 'onerror') return record[key];
          if (methods.has(key)) return methods.get(key);
          if (!record.ready || record.canceled)
            return key === 'document' || key === 'opener' ? null : undefined;
          // Application extensions on the child's Object prototype must receive
          // this facade, rather than the private native Window behind it.
          for (
            let owner: object | null = record.window;
            owner;
            owner = getPrototype(owner)
          )
            if (descriptor(owner, key)) {
              if (getPrototype(owner) === null)
                return get(record.window, key, record.facade);
              break;
            }
          const value = get(record.window, key, record.window);
          if (typeof value !== 'function') return value;
          // Bind the particular prepared realm, never a future named replacement.
          if (!methods.has(key))
            methods.set(
              key,
              new NativeProxy(
                value,
                internalRecord({
                  apply(fn, _receiver, args) {
                    return apply(fn, record.window, args);
                  },
                }),
              ),
            );
          return methods.get(key);
        },
        set(_target, key, value) {
          if (key === 'onload' || key === 'onerror') {
            record[key] = value;
            return true;
          }
          if (!record.ready || record.canceled) return false;
          for (
            let owner: object | null = record.window;
            owner;
            owner = getPrototype(owner)
          )
            if (descriptor(owner, key)) {
              if (getPrototype(owner) === null)
                return set(record.window, key, value, record.facade);
              break;
            }
          return set(record.window, key, value, record.window);
        },
        getPrototypeOf() {
          return record.ready && !record.canceled
            ? getPrototype(record.window)
            : NativeTarget.prototype;
        },
        getOwnPropertyDescriptor(_target, key) {
          if (!record.ready || record.canceled) return undefined;
          const d = descriptor(record.window, key);
          return d ? internalRecord({ ...d, configurable: true }) : undefined;
        },
        ownKeys() {
          return record.ready && !record.canceled ? ownKeys(record.window) : [];
        },
        defineProperty() {
          return false;
        },
        preventExtensions() {
          return false;
        },
      }),
    ) as unknown as Window;
  }
  apply(add, owner, [
    'message',
    (event: MessageEvent) => {
      const nativeSource = apply(source, event, []);
      const record =
        nativeSource && typeof nativeSource === 'object'
          ? records.get(nativeSource)
          : undefined;
      if (!record || record.ready) return;
      apply(stop, event, []);
      if (
        record.canceled ||
        !event.isTrusted ||
        apply(eventOrigin, event, []) !== runtimeOrigin
      )
        return;
      const value: unknown = apply(data, event, []);
      const registration = record.registration;
      if (
        !registration ||
        field(value, 'id') !== registration.id ||
        field(value, 'parentToken') !== registration.parentToken
      )
        return;
      if (field(value, 'type') === 'privacy-document-failed') {
        retire(record, true);
        return;
      }
      if (field(value, 'type') !== 'privacy-document-guarded') return;
      try {
        const channel = new NativeChannel();
        const privatePort: MessagePort = apply(port1, channel, []);
        const childPort: MessagePort = apply(port2, channel, []);
        record.port = privatePort;
        apply(add, privatePort, [
          'message',
          (message: MessageEvent) => {
            if (record.canceled || !record.ready) return;
            const reply: unknown = apply(data, message, []);
            if (field(reply, 'type') === 'failed') {
              retire(record, true);
              return;
            }
            if (field(reply, 'type') === 'loaded' && !record.loaded) {
              record.loaded = true;
              if (record.timer !== undefined) apply(clearTimer, owner, [record.timer]);
              record.timer = undefined;
              const queue = record.queue.splice(0);
              for (const pending of queue) deliver(record, pending);
              emit(record, 'load');
            }
          },
        ]);
        apply(start, privatePort, []);
        apply(nativePost, record.window, [
          internalRecord({
            type: 'privacy-document-port',
            id: registration.id,
            parentToken: registration.parentToken,
          }),
          runtimeOrigin,
          [childPort],
        ]);
        record.ready = true;
        apply(post, privatePort, [internalRecord({ type: 'published' })]);
      } catch {
        retire(record, true);
      }
    },
    true,
  ]);
  async function register(
    record: PopupRecord,
    source: ChildDocumentSource,
    popup: {
      name: string;
      noopener: boolean;
      noreferrer: boolean;
    },
  ) {
    try {
      let blobContent:
        | {
            text: string;
            contentType: string;
          }
        | undefined;
      if (source.kind === 'blob') {
        const response = await nativeFetch(source.url);
        if (!apply(fetchOK, response, [])) fail('Popup Blob is unavailable');
        blobContent = internalRecord({
          text: await apply(text, response, []),
          contentType:
            apply(headerGet, apply(headers, response, []), ['content-type']) ||
            'text/html',
        });
      }
      const response = await nativeFetch(
        apply(href, new NativeURL('__document-intents', options.applicationURL), []),
        internalRecord<RequestInit>({
          method: 'POST',
          credentials: 'omit',
          headers: internalRecord({ 'Content-Type': 'application/json' }),
          body: stringify(
            internalRecord({
              carrier: 'popup',
              popup,
              source,
              baseURL: options.baseURL(),
              ...(blobContent ? internalRecord({ blobContent }) : internalRecord({})),
            }),
          ),
        }),
      );
      if (!apply(fetchOK, response, [])) fail('Popup registration was refused');
      const registration = parseDocumentRegistration(
        await apply(json, response, []),
        options.applicationURL,
      );
      if (registration.carrier !== 'popup') fail('Invalid popup registration');
      record.registration = registration;
      if (record.canceled) {
        closeRegistration(registration);
        return;
      }
      if (popup.noreferrer) {
        const privateDocument: Document = apply(documentGet, record.window, []);
        const meta: Element = apply(createElement, privateDocument, ['meta']);
        apply(setAttribute, meta, ['name', 'referrer']);
        apply(setAttribute, meta, ['content', 'no-referrer']);
        apply(appendChild, apply(headGet, privateDocument, []), [meta]);
      }
      const privateLocation = apply(location, record.window, []);
      apply(replace, privateLocation, [registration.url]);
    } catch {
      retire(record, true);
    }
  }
  function open(
    url: unknown = '',
    target: unknown = '_blank',
    features: unknown = '',
  ): Window | null {
    const input = str(url),
      name = str(target),
      featureText = str(features);
    const lowerName = strings.toLowerCase(name);
    if (['_self', '_parent', '_top'].includes(lowerName))
      fail('Popup target cannot navigate an existing document');
    if (name.length > 512 || /[\u0000-\u001f\u007f]/.test(name))
      fail('Invalid popup name');
    const flags = internalMap(
      strings
        .split(strings.toLowerCase(featureText), /[\s,]+/)
        .filter(Boolean)
        .map((part) => {
          const [key, value] = strings.split(part, '=');
          return [key, value === undefined || !['0', 'no', 'false'].includes(value)];
        }),
    );
    const noreferrer = flags.get('noreferrer') === true;
    const noopener = noreferrer || flags.get('noopener') === true;
    const address = new NativeURL(input || 'about:blank', options.baseURL());
    const scheme: string = apply(protocol, address, []);
    const full: string = apply(href, address, []);
    let child: ChildDocumentSource;
    if (strings.split(full, '#', 1)[0] === 'about:blank')
      child = internalRecord({ kind: 'empty' });
    else if (scheme === 'data:')
      child = internalRecord({ kind: 'data', url: full, baseURL: options.baseURL() });
    else if (scheme === 'blob:') {
      if (apply(origin, address, []) !== runtimeOrigin)
        fail('Popup Blob must belong to runtime origin');
      child = internalRecord({ kind: 'blob', url: full, baseURL: options.baseURL() });
    } else {
      const mapped = options.resources.mapURL(full);
      if (
        !['http:', 'https:'].includes(scheme) ||
        !options.resources.isInstalledURL(mapped)
      )
        fail('Popup source must be installed');
      child = internalRecord({
        kind: 'url',
        url: options.resources.sourceURL(mapped) || full,
        installedURL: mapped,
      });
    }
    const namedTarget = name && lowerName !== '_blank' && !noopener ? name : '';
    const previous = namedTarget ? named.get(namedTarget) : undefined;
    if (
      previous &&
      !previous.canceled &&
      !apply(closed, previous.window, []) &&
      previous.address === full
    )
      return previous.facade;
    const nativeFeatures = strings
      .split(featureText, ',')
      .filter((part) =>
        /^\s*(?:popup|width|height|left|top|screenx|screeny|resizable|scrollbars|menubar|toolbar|status)(?:\s*=|\s*$)/i.test(
          part,
        ),
      )
      .join(',');
    const privateWindow = apply(nativeOpen, owner, [
      'about:blank',
      '_blank',
      nativeFeatures,
    ]) as Window | null;
    if (!privateWindow) return null;
    const record: PopupRecord = internalRecord({
      window: privateWindow,
      facade: undefined as unknown as Window,
      events: new NativeTarget(),
      address: full,
      name: namedTarget,
      ready: false,
      loaded: false,
      canceled: false,
      queue: internalArray(),
    });
    record.facade = facade(record);
    records.set(privateWindow, record);
    all.add(record);
    record.timer = apply(setTimer, owner, [() => retire(record, true), 20000]);
    if (namedTarget) named.set(namedTarget, record);
    if (previous) retire(previous);
    void register(
      record,
      child,
      internalRecord({
        name: lowerName === '_blank' ? '' : name,
        noopener,
        noreferrer,
      }),
    );
    return noopener ? null : record.facade;
  }
  apply(add, owner, [
    'pagehide',
    () => {
      for (const record of all) retire(record);
    },
  ]);
  return open;
}
