import { createControllerClient } from '../controller-client.ts';
import {
  strings,
  internalArray,
  internalMap,
  ownDescriptor,
  internalRecord,
} from '../../shared/primordials.ts';
import type { ResourceAliases } from '../resource-aliases.ts';
import { publisherRegistrationScope } from './scope.ts';
import {
  PUBLISHER_RPC,
  PUBLISHER_LAUNCH,
  publisherObject,
  publisherString,
  parsePublisherRegistration,
  type PublisherLaunch,
} from './protocol.ts';
import type { PublisherRegistration } from './store.ts';
const NativeSharedWorker = globalThis.SharedWorker;
const sharedPort =
  NativeSharedWorker && ownDescriptor(NativeSharedWorker.prototype, 'port')!.get!;
const rawAdd = EventTarget.prototype.addEventListener;
const rawDispatch = EventTarget.prototype.dispatchEvent;
const rawStop = Event.prototype.stopImmediatePropagation;
const dataGetter = ownDescriptor(MessageEvent.prototype, 'data')!.get!;
const sourceGetter = ownDescriptor(MessageEvent.prototype, 'source')!.get!;
const portsGetter = ownDescriptor(MessageEvent.prototype, 'ports')!.get!;
const trustedGetter = ownDescriptor(new MessageEvent('message'), 'isTrusted')!.get!;
const NativeEventTarget = EventTarget;
const NativeEvent = Event;
const NativeMessageEvent = MessageEvent;
const NativeURL = URL;
const urlHref = ownDescriptor(NativeURL.prototype, 'href')!.get!;
const urlOrigin = ownDescriptor(NativeURL.prototype, 'origin')!.get!;
const urlPathname = ownDescriptor(NativeURL.prototype, 'pathname')!.get!;
const urlSearch = ownDescriptor(NativeURL.prototype, 'search')!.get!;
const urlHash = ownDescriptor(NativeURL.prototype, 'hash')!.get!;
const NativePromise = Promise;
const NativeError = Error;
const NativeDOMException = DOMException;
const apply = Reflect.apply;
export interface ForegroundWorker extends EventTarget {
  readonly scriptURL: string;
  readonly state: 'activated';
  onstatechange: ((event: Event) => void) | null;
  postMessage(data: unknown, options?: Transferable[] | StructuredSerializeOptions): void;
}
export interface ForegroundRegistration extends EventTarget {
  readonly scope: string;
  readonly active: ForegroundWorker;
  readonly installing: null;
  readonly waiting: null;
  update(): Promise<never>;
  unregister(): Promise<boolean>;
  readonly navigationPreload: {
    getState(): Promise<{
      enabled: false;
      headerValue: string;
    }>;
    enable(): Promise<never>;
    disable(): Promise<never>;
    setHeaderValue(): Promise<never>;
  };
}
export interface ForegroundContainer extends EventTarget {
  readonly controller: ForegroundWorker | null;
  readonly ready: Promise<ForegroundRegistration>;
  register(
    input: string | URL,
    options?: RegistrationOptions,
  ): Promise<ForegroundRegistration>;
  getRegistration(input?: string | URL): Promise<ForegroundRegistration | undefined>;
  getRegistrations(): Promise<ForegroundRegistration[]>;
  startMessages(): void;
}
export interface PublisherClientOptions {
  applicationURL: string;
  baseURL(): string;
  installationSourceURL(): string;
  resources: ResourceAliases;
}
function unsupported(): Promise<never> {
  return NativePromise.reject(
    new NativeDOMException(
      'Unsupported by the foreground publisher-worker profile',
      'NotSupportedError',
    ),
  );
}
/** The native controller and native executor ports stay in trusted closures. */
export function createPublisherContainer({
  applicationURL,
  baseURL,
  installationSourceURL,
  resources,
}: PublisherClientOptions) {
  const host = createControllerClient();
  const nativeController = host.controller;
  class Container extends NativeEventTarget implements ForegroundContainer {
    get controller() {
      return current?.active || null;
    }
    get ready() {
      return ready;
    }
    async register(
      input: string | URL,
      options: RegistrationOptions = internalRecord({}),
    ) {
      const mapped = resources.mapURL(input);
      if (!resources.isInstalledURL(mapped))
        throw new NativeDOMException(
          'Publisher script is not installed',
          'SecurityError',
        );
      const script = resources.sourceURL(mapped) || mapped;
      const workerType = options.type || 'classic';
      if (workerType !== 'classic' && workerType !== 'module')
        throw new TypeError('Invalid publisher worker type');
      const scope = publisherRegistrationScope(
        options.scope,
        script,
        internalRecord({
          applicationURL,
          installationSourceURL: installationSourceURL(),
          documentBaseURL: baseURL(),
        }),
      );
      return start(await rpc('register', internalRecord({ script, scope, workerType })));
    }
    async getRegistration(input?: string | URL) {
      if (input !== undefined && current) {
        const requested = new NativeURL(
          resources.sourceURL(input) || String(input),
          baseURL(),
        );
        if (!strings.startsWith(requested.href, current.scope)) return undefined;
      }
      return current;
    }
    async getRegistrations() {
      return current ? [current] : [];
    }
    startMessages() {}
  }
  const container = new Container();
  const views = internalMap<
    string,
    {
      registration: ForegroundRegistration;
      active: ForegroundWorker;
    }
  >();
  const launching = internalMap<string, Promise<ForegroundRegistration>>();
  let current: ForegroundRegistration | undefined;
  let resolveReady!: (registration: ForegroundRegistration) => void;
  const ready = new NativePromise<ForegroundRegistration>((resolve) => {
    resolveReady = resolve;
  });
  function rpc(
    operation: string,
    payload?: unknown,
    ports: Transferable[] = [],
  ): Promise<unknown> {
    return host.request(
      internalRecord({ type: PUBLISHER_RPC, operation, payload }),
      ports,
    );
  }
  function eventHandler(target: EventTarget, type: string) {
    let handler: ((event: Event) => void) | null = null;
    Object.defineProperty(
      target,
      'on' + type,
      internalRecord({
        get: () => handler,
        set(value: unknown) {
          handler =
            typeof value === 'function' ? (value as (event: Event) => void) : null;
        },
      }),
    );
    apply(rawAdd, target, [
      type,
      (event: Event) => {
        if (handler) apply(handler, target, [event]);
      },
    ]);
  }
  function registration(record: PublisherRegistration): ForegroundRegistration {
    const known = views.get(record.id);
    if (known) return known.registration;
    const active: ForegroundWorker = Object.assign(
      new NativeEventTarget(),
      internalRecord({
        scriptURL: record.script,
        state: 'activated' as const,
        onstatechange: null,
        postMessage(
          data: unknown,
          options: Transferable[] | StructuredSerializeOptions = [],
        ) {
          const transfer = Array.isArray(options) ? options : options.transfer || [];
          // Arbitrary application fields remain inside payload and cannot impersonate
          // the host protocol. Ports intentionally supplied by the app stay app ports.
          void rpc('message', data, transfer).catch(() => {});
        },
      }),
    );
    const value: ForegroundRegistration = Object.assign(
      new NativeEventTarget(),
      internalRecord({
        scope: record.scope,
        active,
        installing: null,
        waiting: null,
        onupdatefound: null,
        update: unsupported,
        async unregister() {
          const result = await rpc('unregister');
          if (result === true) {
            current = undefined;
            apply(rawDispatch, container, [new NativeEvent('controllerchange')]);
          }
          return result === true;
        },
        navigationPreload: Object.freeze(
          internalRecord({
            getState: async () =>
              internalRecord({ enabled: false as const, headerValue: 'true' }),
            enable: unsupported,
            disable: unsupported,
            setHeaderValue: unsupported,
          }),
        ),
      }),
    );
    eventHandler(active, 'statechange');
    eventHandler(value, 'updatefound');
    Object.freeze(active);
    Object.freeze(value);
    views.set(record.id, internalRecord({ registration: value, active }));
    return value;
  }
  function parseLaunch(input: unknown): PublisherLaunch {
    const launch = publisherObject(input),
      record = parsePublisherRegistration(launch.registration);
    if (record.type !== 'classic' && record.type !== 'module')
      throw new NativeError('Invalid publisher executor type');
    const url = new NativeURL(publisherString(launch.url));
    const application = new NativeURL(applicationURL);
    if (
      apply(urlOrigin, url, []) !== apply(urlOrigin, application, []) ||
      !strings.startsWith(
        apply(urlPathname, url, []),
        apply(urlPathname, application, []) + '__contexts/publisher/',
      ) ||
      apply(urlSearch, url, []) ||
      apply(urlHash, url, [])
    )
      throw new NativeError('Publisher executor URL is outside the application');
    return internalRecord({
      ticket: publisherString(launch.ticket),
      url: apply(urlHref, url, []),
      name: publisherString(launch.name),
      registration: record,
    });
  }
  async function start(input: unknown): Promise<ForegroundRegistration> {
    const launch = parseLaunch(input);
    if (!NativeSharedWorker || !sharedPort)
      throw new NativeDOMException(
        'Foreground publisher workers require SharedWorker',
        'NotSupportedError',
      );
    const existing = launching.get(launch.registration.id);
    if (existing) return existing;
    const pending = (async () => {
      const executor = new NativeSharedWorker(
        launch.url,
        internalRecord<WorkerOptions>({
          type: launch.registration.type,
          name: launch.name,
          credentials: 'omit',
        }),
      );
      const port: MessagePort = apply(sharedPort, executor, []);
      await rpc(
        'attach',
        internalRecord({ registration: launch.registration.id, ticket: launch.ticket }),
        [port],
      );
      const value = registration(launch.registration);
      if (current !== value) {
        current = value;
        resolveReady(value);
        apply(rawDispatch, container, [new NativeEvent('controllerchange')]);
      }
      return value;
    })();
    launching.set(launch.registration.id, pending);
    try {
      return await pending;
    } finally {
      launching.delete(launch.registration.id);
    }
  }
  host.listen((event: MessageEvent) => {
    if (
      !apply(trustedGetter, event, []) ||
      apply(sourceGetter, event, []) !== nativeController()
    )
      return;
    const data: unknown = protocolData(apply(dataGetter, event, []));
    if (!data || typeof data !== 'object' || !('type' in data)) return;
    if (data.type === PUBLISHER_LAUNCH) {
      apply(rawStop, event, []);
      if ('launch' in data) void start(data.launch).catch(() => {});
    } else if (data.type === 'privacy-publisher-state') {
      apply(rawStop, event, []);
      if (!('registration' in data)) return;
      if (data.registration === null) {
        if (current) {
          current = undefined;
          apply(rawDispatch, container, [new NativeEvent('controllerchange')]);
        }
      } else {
        const record = parsePublisherRegistration(data.registration);
        if (
          typeof record.id !== 'string' ||
          typeof record.script !== 'string' ||
          typeof record.scope !== 'string'
        )
          return;
        const value = registration(record);
        if (current !== value) {
          current = value;
          resolveReady(value);
          apply(rawDispatch, container, [new NativeEvent('controllerchange')]);
        }
      }
    } else if (data.type === 'privacy-publisher-application-message') {
      apply(rawStop, event, []);
      if (
        !('registration' in data) ||
        typeof data.registration !== 'string' ||
        !('data' in data)
      )
        return;
      const view = views.get(data.registration);
      if (!view) return;
      const message = new NativeMessageEvent(
        'message',
        internalRecord({
          data: data.data,
          ports: internalArray([...apply(portsGetter, event, [])]),
          origin: new NativeURL(view.active.scriptURL).origin,
        }),
      );
      Object.defineProperty(message, 'source', internalRecord({ value: view.active }));
      apply(rawDispatch, container, [message]);
    }
  });
  for (const type of ['message', 'messageerror', 'controllerchange'])
    eventHandler(container, type);
  Object.freeze(Container.prototype);
  Object.freeze(container);
  return internalRecord({
    container,
    async initialize() {
      const launch = await rpc('status');
      if (launch) return start(launch);
    },
  });
}

function protocolData(value: unknown): unknown {
  return value !== null && typeof value === 'object' ? internalRecord(value) : value;
}
