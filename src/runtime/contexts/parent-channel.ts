import {
  internalArray,
  internalData,
  internalRecord,
  internalSet,
  ownDescriptor,
} from '../../shared/primordials.ts';
import {
  createPortClient,
  servePrivatePort,
  type PrivateClient,
  type PrivateHandler,
} from '../private-channel.ts';

const REQUEST = 'privacy-private-parent-channel';
const READY = 'privacy-private-parent-ready';
const apply = Reflect.apply;
const nativeWindow = window;
const post = window.postMessage;
const add = EventTarget.prototype.addEventListener;
const stopEvent = Event.prototype.stopImmediatePropagation;
const source = ownDescriptor(MessageEvent.prototype, 'source')!.get!;
const origin = ownDescriptor(MessageEvent.prototype, 'origin')!.get!;
const data = ownDescriptor(MessageEvent.prototype, 'data')!.get!;
const ports = ownDescriptor(MessageEvent.prototype, 'ports')!.get!;
const trusted = ownDescriptor(new Event('message'), 'isTrusted')!.get!;
const NativeChannel = MessageChannel;
const first = ownDescriptor(MessageChannel.prototype, 'port1')!.get!;
const second = ownDescriptor(MessageChannel.prototype, 'port2')!.get!;
const closePort = MessagePort.prototype.close;
const NativeError = Error;

function field(value: unknown, key: string): unknown {
  return value && typeof value === 'object'
    ? ownDescriptor(value, key)?.value
    : undefined;
}

/** Capture the owning Window before app execution; no child controller is required. */
export async function connectParentChannel(
  parent: Window,
  expectedOrigin: string,
  key: string,
  timeoutMilliseconds = 20000,
): Promise<PrivateClient> {
  const channel = new NativeChannel();
  const local: MessagePort = apply(first, channel, []);
  const remote: MessagePort = apply(second, channel, []);
  const client = createPortClient(local, timeoutMilliseconds);
  try {
    apply(post, parent, [
      internalRecord({ type: REQUEST, key }),
      expectedOrigin,
      internalArray([remote]),
    ]);
    const ready = await client.request(internalRecord({ type: READY }));
    if (ready !== true) throw new NativeError('Parent channel not acknowledged');
    return client;
  } catch (error) {
    client.close();
    apply(closePort, remote, []);
    throw error;
  }
}

interface ParentChannelOptions {
  child(): Window | null;
  origin: string;
  key: string;
  isCurrent(): boolean;
  handle: PrivateHandler;
}

interface PendingChannel {
  key: string;
  origin: string;
  child(): Window | null;
  accept(port: MessagePort): void;
  close(): void;
}
const pending = internalSet<PendingChannel>();
const each = Set.prototype.forEach;

/** The dispatcher must run before any application listener can observe transferred ports. */
function receiveChildChannel(event: MessageEvent) {
  if (!apply(trusted, event, [])) return;
  const raw: unknown = apply(data, event, []);
  if (field(raw, 'type') !== REQUEST) return;
  apply(stopEvent, event, []);
  const packet: unknown = internalData(raw);
  const incoming: readonly MessagePort[] = apply(ports, event, []);
  const sender: MessageEventSource | null = apply(source, event, []);
  const senderOrigin: string = apply(origin, event, []);
  let selected: PendingChannel | undefined;
  apply(each, pending, [
    (candidate: PendingChannel) => {
      if (
        selected ||
        candidate.key !== field(packet, 'key') ||
        candidate.origin !== senderOrigin
      )
        return;
      try {
        if (candidate.child() === sender) selected = candidate;
      } catch {
        candidate.close();
      }
    },
  ]);
  if (selected && incoming.length === 1) selected.accept(incoming[0]);
  else
    for (let index = 0; index < incoming.length; index++)
      apply(closePort, incoming[index], []);
}

/** A key routes a handshake; actual Window identity and origin authenticate it. */
export function acceptChildChannel(options: ParentChannelOptions): { close(): void } {
  const { child, origin: expectedOrigin, key, isCurrent, handle } = options;
  let closed = false;
  let server: { close(): void } | undefined;
  function stop() {
    if (closed) return;
    closed = true;
    pending.delete(record);
    server?.close();
  }
  function accept(port: MessagePort) {
    pending.delete(record);
    if (closed || !isCurrent()) {
      apply(closePort, port, []);
      stop();
      return;
    }
    let ready = false;
    server = servePrivatePort(port, async (message, extra) => {
      if (!isCurrent()) {
        stop();
        throw new NativeError('Parent channel authority changed');
      }
      if (!ready) {
        if (field(message, 'type') !== READY || extra.length)
          throw new NativeError('Parent channel handshake required');
        ready = true;
        return true;
      }
      const value = await handle(message, extra);
      if (!isCurrent()) {
        stop();
        throw new NativeError('Parent channel authority changed');
      }
      return value;
    });
  }
  const record = internalRecord({
    child,
    origin: expectedOrigin,
    key,
    accept,
    close: stop,
  });
  pending.add(record);
  return internalRecord({ close: stop });
}

// Install during module initialization, rather than after an application asks
// to create a child. Unmatched private handshakes never reach application listeners.
apply(add, nativeWindow, ['message', receiveChildChannel, true]);
