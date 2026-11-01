import { internalSet, ownDescriptor, internalRecord } from '../../shared/primordials.ts';
import type { ScriptURLGate } from '../enforcement/script-urls.ts';
import type { PolicyTools } from '../enforcement/native.ts';
import type { ResourceAliases } from '../resource-aliases.ts';
import {
  sharedWorkerKey,
  type SharedWorkerIdentity,
  type SharedWorkerTicket,
  type SharedWorkerType,
} from '../../shared/shared-worker.ts';

const NativeSharedWorker = globalThis.SharedWorker;
const NativeChannel = MessageChannel;
const nativeFetch = fetch;
const construct = Reflect.construct;
const apply = Reflect.apply;
const get = Reflect.get;
const stringify = JSON.stringify;
const nativeGlobal = globalThis;
const NativeURL = URL;
const href = ownDescriptor(URL.prototype, 'href')!.get!;
const origin = ownDescriptor(URL.prototype, 'origin')!.get!;
const protocol = ownDescriptor(URL.prototype, 'protocol')!.get!;
const port1 = ownDescriptor(MessageChannel.prototype, 'port1')!.get!;
const port2 = ownDescriptor(MessageChannel.prototype, 'port2')!.get!;
const portPost = MessagePort.prototype.postMessage;
const portStart = MessagePort.prototype.start;
const portClose = MessagePort.prototype.close;
const messageData = ownDescriptor(MessageEvent.prototype, 'data')!.get!;
const responseOK = ownDescriptor(Response.prototype, 'ok')!.get!;
const responseJSON = Response.prototype.json;
const responseBody = Response.prototype.arrayBuffer;
const nativeDispatch = EventTarget.prototype.dispatchEvent;
const NativeErrorEvent = ErrorEvent;
const NativePromise = Promise;
const setTimer = setTimeout;
const clearTimer = clearTimeout;

export interface SharedWorkerFactoryContext {
  scriptURL: ScriptURLGate;
  applicationURL: string;
  baseURL: () => string;
  resources: ResourceAliases;
  identity: () => SharedWorkerIdentity | undefined;
}
interface Connection {
  handle: SharedWorker;
  app: MessagePort;
  peer: MessagePort;
  control: MessagePort;
  ticket?: string;
  closed: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

/** Keep native handles and application ports; host protocol uses a separate port. */
export function createSharedWorkerFactory(
  tools: PolicyTools,
  context: SharedWorkerFactoryContext,
): typeof SharedWorker | undefined {
  if (!NativeSharedWorker) return;
  const { method, accessor, str, fail, nativeAdd } = tools;
  const nativePort = ownDescriptor(NativeSharedWorker.prototype, 'port')!.get!;
  const handles = new WeakMap<SharedWorker, Connection>();
  const appPorts = new WeakMap<MessagePort, Connection>();
  const active = internalSet<Connection>();
  const runtimeOrigin: string = apply(origin, new NativeURL(context.applicationURL), []);
  const connectURL: string = apply(
    href,
    new NativeURL('__contexts/shared/connect', context.applicationURL),
    [],
  );
  const disconnectURL: string = apply(
    href,
    new NativeURL('__contexts/shared/disconnect', context.applicationURL),
    [],
  );
  function disconnect(record: Connection) {
    if (!record.ticket) return;
    const ticket = record.ticket;
    record.ticket = undefined;
    const closing: Promise<Response> = apply(nativeFetch, nativeGlobal, [
      disconnectURL,
      internalRecord({
        method: 'POST',
        credentials: 'omit',
        headers: internalRecord({ 'Content-Type': 'application/json' }),
        body: stringify(internalRecord({ ticket })),
      }),
    ]);
    closing.catch(() => {});
  }
  function close(record: Connection, notify = true) {
    if (record.closed) return;
    record.closed = true;
    active.delete(record);
    if (record.timer !== undefined) apply(clearTimer, nativeGlobal, [record.timer]);
    if (notify)
      try {
        apply(portPost, record.control, [
          internalRecord({ type: 'privacy-shared-close' }),
        ]);
      } catch {}
    apply(portClose, record.control, []);
    apply(portClose, record.app, []);
    apply(portClose, record.peer, []);
    disconnect(record);
  }
  function failed(record: Connection, message: string) {
    if (record.closed) return;
    close(record);
    apply(nativeDispatch, record.handle, [
      new NativeErrorEvent('error', internalRecord({ message })),
    ]);
  }
  accessor(
    NativeSharedWorker.prototype,
    'port',
    internalRecord({
      get(this: SharedWorker) {
        return handles.get(this)?.app || fail('Unmanaged shared worker handle');
      },
    }),
  );
  method(MessagePort.prototype, 'close', function (this: MessagePort) {
    const record = appPorts.get(this);
    if (record) close(record);
    return apply(portClose, this, []);
  });
  const factory = new Proxy(
    NativeSharedWorker,
    internalRecord({
      construct(_target, args: unknown[], newTarget) {
        if (!args.length) throw new TypeError('Shared worker source is required');
        const mapped = context.resources.mapURL(str(args[0]));
        const url = new NativeURL(mapped, context.baseURL());
        const source: string = apply(href, url, []);
        const blob = apply(protocol, url, []) === 'blob:';
        if (
          blob
            ? apply(origin, url, []) !== runtimeOrigin
            : !context.resources.isInstalledURL(source)
        )
          fail('Shared worker source is not installed or an application Blob');
        const options = args[1];
        if (
          options !== undefined &&
          options !== null &&
          typeof options !== 'string' &&
          typeof options !== 'object'
        )
          throw new TypeError('Invalid shared worker options');
        const name =
          typeof options === 'string'
            ? options
            : options
              ? str(get(options, 'name') ?? '')
              : '';
        const type: SharedWorkerType =
          options && typeof options === 'object'
            ? (str(get(options, 'type') ?? 'classic') as SharedWorkerType)
            : 'classic';
        if (!['classic', 'module'].includes(type))
          throw new TypeError('Unsupported shared worker type');
        const identity =
          context.identity() ?? fail('Shared worker application identity is unavailable');
        const original = context.resources.sourceURL(source) || source;
        const key = sharedWorkerKey(
          identity,
          internalRecord({ source: original, type, name }),
        );
        const bootstrapURL: string = apply(
          href,
          new NativeURL('__contexts/shared/' + type + '.js', context.applicationURL),
          [],
        );
        // Start reading a Blob before returning: publisher code may revoke its URL.
        const bodyReady: Promise<ArrayBuffer | undefined> = blob
          ? apply(nativeFetch, nativeGlobal, [source]).then(
              async (response: Response) => {
                if (!apply(responseOK, response, []))
                  throw new Error('Shared worker Blob unavailable');
                const body: ArrayBuffer = await apply(responseBody, response, []);
                if (body.byteLength > 100 * 1024 * 1024)
                  throw new Error('Shared worker source too large');
                return body;
              },
            )
          : new NativePromise<ArrayBuffer | undefined>((resolve) => resolve(undefined));
        bodyReady.catch(() => {});
        const handle: SharedWorker = construct(
          NativeSharedWorker,
          [
            context.scriptURL(bootstrapURL),
            internalRecord({ type, name: key, credentials: 'omit' }),
          ],
          newTarget === factory ? NativeSharedWorker : newTarget,
        );
        const control: MessagePort = apply(nativePort, handle, []);
        const channel = new NativeChannel();
        const record: Connection = internalRecord({
          handle,
          control,
          app: apply(port1, channel, []),
          peer: apply(port2, channel, []),
          closed: false,
        });
        handles.set(handle, record);
        appPorts.set(record.app, record);
        active.add(record);
        apply(nativeAdd, control, [
          'message',
          (event: MessageEvent) => {
            const data: unknown = protocolData(apply(messageData, event, []));
            if (record.closed || !data || typeof data !== 'object' || !('type' in data))
              return;
            if (data.type === 'privacy-shared-ready') {
              if (record.timer !== undefined)
                apply(clearTimer, nativeGlobal, [record.timer]);
              record.timer = undefined;
            } else if (data.type === 'privacy-shared-failed')
              failed(record, 'Shared worker confinement or source startup failed');
            else if (data.type === 'privacy-shared-closed') close(record, false);
          },
        ]);
        apply(nativeAdd, handle, ['error', () => close(record)]);
        apply(portStart, control, []);
        record.timer = apply(setTimer, nativeGlobal, [
          () => failed(record, 'Shared worker preparation timed out'),
          15000,
        ]);
        void (async () => {
          try {
            const response: Response = await apply(nativeFetch, nativeGlobal, [
              connectURL,
              internalRecord({
                method: 'POST',
                credentials: 'omit',
                headers: internalRecord({ 'Content-Type': 'application/json' }),
                body: stringify(internalRecord({ source: original, type, name })),
              }),
            ]);
            if (!apply(responseOK, response, []))
              throw new Error('Shared worker connection was refused');
            const value: unknown = await apply(responseJSON, response, []);
            if (
              !value ||
              typeof value !== 'object' ||
              !('ticket' in value) ||
              typeof value.ticket !== 'string' ||
              !value.ticket ||
              !('key' in value) ||
              value.key !== key ||
              !('application' in value) ||
              value.application !== identity.application ||
              !('installationGeneration' in value) ||
              value.installationGeneration !== identity.installationGeneration ||
              !('bootstrapURL' in value) ||
              value.bootstrapURL !== bootstrapURL
            )
              throw new Error('Invalid shared worker connection ticket');
            record.ticket = (value as SharedWorkerTicket).ticket;
            if (record.closed) {
              disconnect(record);
              return;
            }
            const body = await bodyReady.catch(() => undefined);
            if (record.closed) {
              disconnect(record);
              return;
            }
            apply(portPost, control, [
              internalRecord({
                type: 'privacy-shared-connect',
                ticket: record.ticket,
                key,
                start: internalRecord({ source: original, base: original, body }),
              }),
              body ? [record.peer, body] : [record.peer],
            ]);
          } catch {
            failed(record, 'Shared worker connection could not start');
          }
        })();
        return handle;
      },
    }),
  );
  method(NativeSharedWorker.prototype, 'constructor', factory);
  if ('document' in nativeGlobal)
    apply(nativeAdd, nativeGlobal, [
      'pagehide',
      () => {
        for (const record of active) close(record);
      },
      true,
    ]);
  return factory;
}

function protocolData(value: unknown): unknown {
  return value !== null && typeof value === 'object' ? internalRecord(value) : value;
}
