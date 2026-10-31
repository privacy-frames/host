import {
  createHTTPWorkerControl,
  createHTTPWorkerResourceRead,
} from '../contexts/worker-client.ts';
import {
  internalArray,
  internalMap,
  ownDescriptor,
  internalRecord,
} from '../../shared/primordials.ts';
import { readWorkerMetadata, prepareWorkerRealm } from '../contexts/worker-realm.ts';
import { createPublisherEvents, type PublisherClient } from './events.ts';
import {
  parsePublisherName,
  publisherObject,
  publisherString,
  type PublisherClientDescription,
} from './protocol.ts';
const worker = self as unknown as SharedWorkerGlobalScope;
const rawAdd = EventTarget.prototype.addEventListener;
const rawStop = Event.prototype.stopImmediatePropagation;
const rawPost = MessagePort.prototype.postMessage;
const rawStart = MessagePort.prototype.start;
const rawFetch = fetch;
const rawJSON = Response.prototype.json;
const rawArrayBuffer = Response.prototype.arrayBuffer;
const responseStatus = ownDescriptor(Response.prototype, 'status')!.get!;
const responseType = ownDescriptor(Response.prototype, 'type')!.get!;
const responseHeaders = ownDescriptor(Response.prototype, 'headers')!.get!;
const responseOK = ownDescriptor(Response.prototype, 'ok')!.get!;
const NativeDOMException = DOMException;
const NativeURL = URL;
const NativePromise = Promise;
const nativeUUID = crypto.randomUUID.bind(crypto);
const stringify = JSON.stringify;
const dataGetter = ownDescriptor(MessageEvent.prototype, 'data')!.get!;
const portsGetter = ownDescriptor(MessageEvent.prototype, 'ports')!.get!;
const trustedGetter = ownDescriptor(new MessageEvent('connect'), 'isTrusted')!.get!;
const namespace = parsePublisherName(worker.name);
const context = readWorkerMetadata('shared-worker');
if (
  namespace[0] !== context.identity.application ||
  namespace[1] !== context.identity.installationGeneration
)
  throw new Error('Publisher namespace leaves its application');
const realm = prepareWorkerRealm(
  context,
  'connect',
  createHTTPWorkerControl(context),
  createHTTPWorkerResourceRead(context),
);
const { apply, define } = realm.tools;
const nameOwner = realm.tools.propertyOwner(worker, 'name');
if (nameOwner) realm.tools.accessor(nameOwner, 'name', internalRecord({ get: () => '' }));
const redeemURL = new NativeURL(
  '__contexts/' + context.identity.id + '/publisher-connect',
  context.applicationURL,
).href;
let primary: MessagePort | undefined;
let sourcePromise: Promise<void> | undefined;
let initialized = false;
let registrationId = namespace[2];
const clientReplies = internalMap<
  string,
  { resolve(value: unknown): void; reject(reason: Error): void }
>();
function clientRPC(
  operation: string,
  payload?: unknown,
  transfer: Transferable[] = [],
): Promise<unknown> {
  const port = primary;
  if (!port) return NativePromise.reject(new Error('Publisher host channel unavailable'));
  return new NativePromise((resolve, reject) => {
    const id = nativeUUID();
    clientReplies.set(id, internalRecord({ resolve, reject }));
    try {
      apply(rawPost, port, [
        internalRecord({ type: 'privacy-publisher-client-rpc', id, operation, payload }),
        transfer,
      ]);
    } catch (error) {
      clientReplies.delete(id);
      reject(error);
    }
  });
}
function client(value: unknown): PublisherClient {
  const record = publisherObject(value);
  if (
    record.type !== 'window' ||
    !['top-level', 'nested', 'auxiliary', 'none'].includes(String(record.frameType)) ||
    !['visible', 'hidden'].includes(String(record.visibilityState)) ||
    typeof record.focused !== 'boolean'
  )
    throw new Error('Invalid publisher client description');
  const checked: PublisherClientDescription = internalRecord({
    id: publisherString(record.id),
    url: publisherString(record.url),
    type: 'window',
    frameType: record.frameType as PublisherClientDescription['frameType'],
    visibilityState: record.visibilityState as DocumentVisibilityState,
    focused: record.focused,
  });
  return Object.freeze(
    internalRecord({
      ...checked,
      postMessage(data: unknown, transfer: Transferable[] = []) {
        void clientRPC(
          'post-message',
          internalRecord({ client: checked.id, data }),
          transfer,
        ).catch(() => {});
      },
    }),
  );
}
const events = createPublisherEvents(
  worker,
  internalRecord({
    async clients() {
      const values = await clientRPC('clients');
      if (!Array.isArray(values)) throw new Error('Invalid publisher client list');
      return values.map(client);
    },
    async unregister() {
      return (await clientRPC('unregister')) === true;
    },
  }),
);
for (const type of ['install', 'activate', 'fetch', 'message']) {
  let handler: ((event: Event) => void) | null = null;
  define(
    worker,
    'on' + type,
    internalRecord({
      get: () => handler,
      set(value: unknown) {
        handler = typeof value === 'function' ? (value as (event: Event) => void) : null;
      },
      configurable: false,
    }),
  );
  apply(rawAdd, worker, [
    type,
    (event: Event) => {
      if (handler) apply(handler, worker, [event]);
    },
  ]);
}
apply(rawAdd, worker, [
  'connect',
  (event: MessageEvent) => {
    if (!apply(trustedGetter, event, [])) return;
    apply(rawStop, event, []);
    const ports = internalArray<MessagePort>(Array.from(apply(portsGetter, event, [])));
    if (ports.length !== 1) throw new Error('Invalid publisher native connection');
    const port = ports[0];
    let authenticated = false;
    apply(rawAdd, port, [
      'message',
      (message: MessageEvent) => {
        apply(rawStop, message, []);
        void (async () => {
          const data = publisherObject(protocolData(apply(dataGetter, message, [])));
          if (!authenticated) {
            if (data.type !== 'privacy-publisher-connect')
              throw new Error('Publisher role grant missing');
            const response: Response = await apply(rawFetch, worker, [
              redeemURL,
              internalRecord({
                method: 'POST',
                credentials: 'omit',
                headers: internalRecord({ 'Content-Type': 'application/json' }),
                body: stringify(
                  internalRecord({
                    registration: registrationId,
                    ticket: publisherString(data.ticket),
                  }),
                ),
              }),
            ]);
            if (!apply(responseOK, response, []))
              throw new Error('Publisher role grant rejected');
            const proof = publisherObject(await apply(rawJSON, response, []));
            const registration = publisherObject(proof.registration);
            if (
              registration.id !== registrationId ||
              registration.application !== namespace[0] ||
              registration.generation !== namespace[1] ||
              proof.contextId !== context.identity.id
            )
              throw new Error('Publisher role binding differs');
            const browserClient = publisherString(proof.browserClient);
            authenticated = true;
            primary = port;
            if (!sourcePromise)
              sourcePromise = (async () => {
                const globals = events.globals(
                  publisherString(registration.script),
                  publisherString(registration.scope),
                );
                for (const [key, value] of Object.entries(globals))
                  define(
                    worker,
                    key,
                    internalRecord({ value, writable: false, configurable: false }),
                  );
                const source = publisherString(registration.script);
                await realm.load(internalRecord({ source, base: source }), () => {});
                if (registration.lifecycleCompleted !== true) {
                  await events.lifecycle('install');
                  await events.lifecycle('activate');
                }
                initialized = true;
              })();
            await sourcePromise;
            apply(rawPost, port, [
              internalRecord({
                type: 'privacy-publisher-ready',
                contextId: context.identity.id,
                browserClient,
              }),
            ]);
            return;
          }
          if (data.type === 'privacy-publisher-client-result') {
            const id = publisherString(data.id),
              pending = clientReplies.get(id);
            if (pending) {
              clientReplies.delete(id);
              if (data.ok === true) pending.resolve(data.value);
              else pending.reject(new Error('Publisher client operation failed'));
            }
            return;
          }
          if (data.type !== 'privacy-publisher-job' || !initialized)
            throw new Error('Publisher event arrived before activation');
          const id = publisherString(data.id),
            payload = publisherObject(data.payload);
          const transfer = internalArray<MessagePort>(
            Array.from(apply(portsGetter, message, [])),
          );
          let value: Record<string, unknown>;
          if (data.operation === 'message') {
            await events.message(
              payload.data,
              payload.source ? client(payload.source) : null,
              transfer,
            );
            value = internalRecord({ delivered: true });
          } else if (data.operation === 'fetch') {
            if (
              !Array.isArray(payload.headers) ||
              typeof payload.destination !== 'string'
            )
              throw new Error('Invalid publisher fetch');
            const result = await events.fetch(
              internalRecord({
                url: publisherString(payload.url),
                headers: payload.headers as [string, string][],
                clientId: publisherString(payload.clientId),
                destination: payload.destination as RequestDestination,
              }),
            );
            if (!result.handled) value = internalRecord({ handled: false });
            else {
              const response = result.response!;
              if (apply(responseType, response, []) === 'error')
                value = internalRecord({ handled: true, error: true });
              else {
                const body: ArrayBuffer = await apply(rawArrayBuffer, response, []);
                if (body.byteLength > 100 * 1024 * 1024)
                  throw new NativeDOMException(
                    'Publisher response exceeds application resource limit',
                    'QuotaExceededError',
                  );
                const headers: Headers = apply(responseHeaders, response, []);
                value = internalRecord({
                  handled: true,
                  body,
                  status: apply(responseStatus, response, []),
                  headers: internalArray(Array.from(headers)),
                });
              }
            }
          } else throw new Error('Unknown publisher job');
          apply(rawPost, port, [
            internalRecord({ type: 'privacy-publisher-result', id, ok: true, value }),
            value.body instanceof ArrayBuffer ? [value.body] : [],
          ]);
        })().catch(() => {
          const data: unknown = protocolData(apply(dataGetter, message, []));
          if (
            data &&
            typeof data === 'object' &&
            'id' in data &&
            typeof data.id === 'string'
          )
            apply(rawPost, port, [
              internalRecord({
                type: 'privacy-publisher-result',
                id: data.id,
                ok: false,
              }),
            ]);
          else
            apply(rawPost, port, [internalRecord({ type: 'privacy-publisher-failed' })]);
        });
      },
    ]);
    apply(rawStart, port, []);
  },
]);

function protocolData(value: unknown): unknown {
  return value !== null && typeof value === 'object' ? internalRecord(value) : value;
}
