import {
  createHTTPWorkerControl,
  createHTTPWorkerResourceRead,
} from './worker-client.ts';
import {
  strings,
  internalArray,
  internalSet,
  ownDescriptor,
  internalRecord,
} from '../../shared/primordials.ts';
import { readWorkerMetadata, prepareWorkerRealm } from './worker-realm.ts';
import { parseSharedWorkerKey } from '../../shared/shared-worker.ts';
const worker = self as unknown as SharedWorkerGlobalScope;
const nativeName = worker.name;
const rawAdd = EventTarget.prototype.addEventListener;
const rawDispatch = EventTarget.prototype.dispatchEvent;
const rawStop = Event.prototype.stopImmediatePropagation;
const NativeMessageEvent = MessageEvent;
const dataGetter = ownDescriptor(MessageEvent.prototype, 'data')!.get!;
const portsGetter = ownDescriptor(MessageEvent.prototype, 'ports')!.get!;
const originGetter = ownDescriptor(MessageEvent.prototype, 'origin')!.get!;
const trustedGetter = ownDescriptor(new NativeMessageEvent('connect'), 'isTrusted')!.get!;
const rawPost = MessagePort.prototype.postMessage;
const rawStart = MessagePort.prototype.start;
const rawClose = MessagePort.prototype.close;
const rawFetch = fetch;
const responseOK = ownDescriptor(Response.prototype, 'ok')!.get!;
const responseJSON = Response.prototype.json;
const setTimer = setTimeout;
const NativeURL = URL;
const href = ownDescriptor(URL.prototype, 'href')!.get!;
const stringify = JSON.stringify;
const context = readWorkerMetadata('shared-worker');
const realm = prepareWorkerRealm(
  context,
  'connect',
  createHTTPWorkerControl(context),
  createHTTPWorkerResourceRead(context),
);
const { apply, method, accessor, propertyOwner } = realm.tools;
const namespace = parseSharedWorkerKey(nativeName);
if (
  !namespace ||
  namespace.application !== context.identity.application ||
  namespace.installationGeneration !== context.identity.installationGeneration ||
  !strings.endsWith(context.identity.url, '/' + namespace.type + '.js')
)
  throw new Error('Shared worker name does not match its application');
const nameOwner = propertyOwner(worker, 'name');
if (nameOwner) accessor(nameOwner, 'name', internalRecord({ get: () => namespace.name }));
const redeemURL: string = apply(
  href,
  new NativeURL(
    '__contexts/' + context.identity.id + '/shared-connect',
    context.applicationURL,
  ),
  [],
);
interface Connection {
  control: MessagePort;
  port?: MessagePort;
  origin: string;
  data: unknown;
  closed: boolean;
  authenticated: boolean;
  delivered: boolean;
}
const connections = internalSet<Connection>();
const appPorts = new WeakMap<MessagePort, Connection>();
let sourcePromise: Promise<void> | undefined;
let sourceReady = false,
  sourceFailed = false,
  deliveryScheduled = false;
function close(connection: Connection, notify = true) {
  if (connection.closed) return;
  connection.closed = true;
  connections.delete(connection);
  if (notify)
    try {
      apply(rawPost, connection.control, [
        internalRecord({ type: 'privacy-shared-closed' }),
      ]);
    } catch {}
  if (connection.port) apply(rawClose, connection.port, []);
  apply(rawClose, connection.control, []);
}
function fail(connection: Connection) {
  if (connection.closed) return;
  try {
    apply(rawPost, connection.control, [
      internalRecord({ type: 'privacy-shared-failed' }),
    ]);
  } catch {}
  // Closing the control port immediately can discard a queued failure on some
  // engines. The parent closes its private side after receiving this response.
  if (connection.port) apply(rawClose, connection.port, []);
  connection.closed = true;
  connections.delete(connection);
}
function deliver() {
  if (deliveryScheduled || !sourceReady || sourceFailed) return;
  deliveryScheduled = true;
  apply(setTimer, worker, [
    () => {
      deliveryScheduled = false;
      for (const connection of connections) {
        if (
          !connection.authenticated ||
          connection.closed ||
          connection.delivered ||
          !connection.port
        )
          continue;
        connection.delivered = true;
        const port = connection.port;
        apply(rawDispatch, worker, [
          new NativeMessageEvent(
            'connect',
            internalRecord({
              data: connection.data,
              origin: connection.origin,
              source: port,
              ports: [port],
            }),
          ),
        ]);
        apply(rawPost, connection.control, [
          internalRecord({ type: 'privacy-shared-ready' }),
        ]);
      }
    },
    0,
  ]);
}
function ready() {
  sourceReady = true;
  deliver();
}
method(MessagePort.prototype, 'close', function (this: MessagePort) {
  const connection = appPorts.get(this);
  if (connection) close(connection);
  return apply(rawClose, this, []);
});
apply(rawAdd, worker, [
  'connect',
  (event: MessageEvent) => {
    // Synthetic application events never enter the private connection protocol.
    if (!apply(trustedGetter, event, [])) return;
    apply(rawStop, event, []);
    const ports = internalArray<MessagePort>(Array.from(apply(portsGetter, event, [])));
    if (ports.length !== 1) throw new Error('Invalid native shared connection');
    const connection: Connection = internalRecord({
      control: ports[0],
      origin: apply(originGetter, event, []),
      data: protocolData(apply(dataGetter, event, [])),
      closed: false,
      authenticated: false,
      delivered: false,
    });
    connections.add(connection);
    let requested = false;
    apply(rawAdd, connection.control, [
      'message',
      async (message: MessageEvent) => {
        apply(rawStop, message, []);
        const data: unknown = protocolData(apply(dataGetter, message, []));
        if (connection.closed || !data || typeof data !== 'object' || !('type' in data))
          return;
        if (data.type === 'privacy-shared-close') {
          close(connection, false);
          return;
        }
        if (requested || data.type !== 'privacy-shared-connect') {
          fail(connection);
          return;
        }
        requested = true;
        const app: readonly MessagePort[] = apply(portsGetter, message, []);
        try {
          if (
            app.length !== 1 ||
            !('ticket' in data) ||
            typeof data.ticket !== 'string' ||
            !('key' in data) ||
            data.key !== nativeName ||
            !('start' in data) ||
            !data.start ||
            typeof data.start !== 'object' ||
            !('source' in data.start) ||
            data.start.source !== namespace.source ||
            !('base' in data.start) ||
            data.start.base !== namespace.source
          )
            throw new Error('Invalid shared connection request');
          connection.port = app[0];
          const response: Response = await apply(rawFetch, worker, [
            redeemURL,
            internalRecord({
              method: 'POST',
              credentials: 'omit',
              headers: internalRecord({ 'Content-Type': 'application/json' }),
              body: stringify(internalRecord({ ticket: data.ticket, key: nativeName })),
            }),
          ]);
          if (!apply(responseOK, response, []))
            throw new Error('Shared connection was not authenticated');
          const grant: unknown = await apply(responseJSON, response, []);
          if (
            !grant ||
            typeof grant !== 'object' ||
            !('key' in grant) ||
            grant.key !== nativeName ||
            !('application' in grant) ||
            grant.application !== context.identity.application ||
            !('installationGeneration' in grant) ||
            grant.installationGeneration !== context.identity.installationGeneration ||
            !('connection' in grant) ||
            typeof grant.connection !== 'string' ||
            !grant.connection
          )
            throw new Error('Invalid shared connection grant');
          if (connection.closed) {
            apply(rawClose, app[0], []);
            return;
          }
          connection.authenticated = true;
          appPorts.set(app[0], connection);
          if (sourceFailed) {
            fail(connection);
            return;
          }
          if (!sourcePromise) {
            sourcePromise = realm
              .load(data.start, ready)
              .then(() => ready())
              .catch(() => {
                sourceFailed = true;
                for (const pending of connections) fail(pending);
              });
          }
          deliver();
          await sourcePromise;
        } catch {
          fail(connection);
        }
      },
    ]);
    apply(rawStart, connection.control, []);
  },
  true,
]);

function protocolData(value: unknown): unknown {
  return value !== null && typeof value === 'object' ? internalRecord(value) : value;
}
