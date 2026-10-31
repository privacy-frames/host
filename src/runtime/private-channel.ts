import {
  internalArray,
  internalData,
  internalRecord,
  internalSet,
  ownDescriptor,
} from '../shared/primordials.ts';

export type PrivateRequest = (
  message: object,
  ports?: readonly Transferable[],
) => Promise<unknown>;
export interface PrivateClient {
  request: PrivateRequest;
  close(): void;
}
export type PrivateHandler = (
  message: unknown,
  ports: readonly MessagePort[],
) => unknown | Promise<unknown>;

const apply = Reflect.apply;
const NativePromise = Promise;
const NativeError = Error;
const NativeChannel = MessageChannel;
const first = ownDescriptor(MessageChannel.prototype, 'port1')!.get!;
const second = ownDescriptor(MessageChannel.prototype, 'port2')!.get!;
const post = MessagePort.prototype.postMessage;
const start = MessagePort.prototype.start;
const close = MessagePort.prototype.close;
const add = EventTarget.prototype.addEventListener;
const remove = EventTarget.prototype.removeEventListener;
const data = ownDescriptor(MessageEvent.prototype, 'data')!.get!;
const eventPorts = ownDescriptor(MessageEvent.prototype, 'ports')?.get;
const each = Set.prototype.forEach;
const timer = setTimeout;
const clear = clearTimeout;
const nativeGlobal = globalThis;
const CLOSED = 'privacy-private-channel-closed';

function closePort(port: MessagePort) {
  apply(close, port, []);
}
function errorMessage(error: unknown): string {
  try {
    const message =
      error && typeof error === 'object'
        ? ownDescriptor(error, 'message')?.value
        : undefined;
    return typeof message === 'string' ? message : 'Private request failed';
  } catch {
    return 'Private request failed';
  }
}

/** Each request owns its reply port. Closing settles local waits, not remote work. */
export function createRequestClient(
  send: (message: object, transfer: Transferable[]) => void,
  timeoutMilliseconds = 20000,
): PrivateClient {
  const pending = internalSet<(error: unknown) => void>();
  let closed = false;
  function request(
    message: object,
    ports: readonly Transferable[] = [],
  ): Promise<unknown> {
    return new NativePromise((resolve, reject) => {
      if (closed) {
        reject(new NativeError('Private request channel is closed'));
        return;
      }
      const channel = new NativeChannel();
      const reply: MessagePort = apply(first, channel, []);
      const remote: MessagePort = apply(second, channel, []);
      let finished = false;
      const timeout = apply(timer, nativeGlobal, [
        () => cancel(new NativeError('Host request timed out')),
        timeoutMilliseconds,
      ]);
      function finish(): boolean {
        if (finished) return false;
        finished = true;
        pending.delete(cancel);
        apply(clear, nativeGlobal, [timeout]);
        closePort(reply);
        return true;
      }
      function cancel(error: unknown) {
        if (finish()) reject(error);
      }
      pending.add(cancel);
      apply(add, reply, [
        'message',
        (event: MessageEvent) => {
          if (!finish()) return;
          try {
            const result: unknown = internalData(apply(data, event, []));
            if (!result || typeof result !== 'object')
              throw new NativeError('Invalid host response');
            if (ownDescriptor(result, 'ok')?.value === true)
              resolve(ownDescriptor(result, 'value')?.value);
            else {
              const reason: unknown = ownDescriptor(result, 'error')?.value;
              throw new NativeError(
                typeof reason === 'string' ? reason : 'Host rejected request',
              );
            }
          } catch (error) {
            reject(error);
          }
        },
        internalRecord({ once: true }),
      ]);
      apply(start, reply, []);
      try {
        const transfer = internalArray<Transferable>([remote]);
        for (let index = 0; index < ports.length; index++)
          transfer[index + 1] = ports[index];
        // Reading caller-supplied transfer entries may reenter and close this client.
        if (closed || finished) {
          closePort(remote);
          cancel(new NativeError('Private request channel is closed'));
          return;
        }
        send(message, transfer);
      } catch (error) {
        cancel(error);
        closePort(remote);
      }
    });
  }
  function stop() {
    if (closed) return;
    closed = true;
    apply(each, pending, [
      (cancel: (error: unknown) => void) =>
        cancel(new NativeError('Private request channel is closed')),
    ]);
  }
  return internalRecord({ request, close: stop });
}

/** The caller must establish ownership of this endpoint before publishing a client. */
export function createPortClient(
  port: MessagePort,
  timeoutMilliseconds = 20000,
): PrivateClient {
  const client = createRequestClient(
    (message, transfer) => apply(post, port, [message, transfer]),
    timeoutMilliseconds,
  );
  let closed = false;
  function stop() {
    if (closed) return;
    closed = true;
    client.close();
    apply(remove, port, ['message', receive]);
    closePort(port);
  }
  function receive(event: MessageEvent) {
    const value: unknown = internalData(apply(data, event, []));
    if (
      value &&
      typeof value === 'object' &&
      ownDescriptor(value, 'type')?.value === CLOSED
    )
      stop();
  }
  apply(add, port, ['message', receive]);
  apply(start, port, []);
  return internalRecord({ request: client.request, close: stop });
}

/** Closing denies queued/awaiting replies; handlers already started may still finish. */
export function servePrivatePort(
  port: MessagePort,
  handler: PrivateHandler,
): { close(): void } {
  if (!eventPorts) throw new NativeError('Native message port lists unavailable');
  interface Call {
    reply: MessagePort;
    active: boolean;
  }
  const pending = internalSet<Call>();
  let closed = false;
  function finish(call: Call, packet: object) {
    if (!call.active) return;
    call.active = false;
    pending.delete(call);
    try {
      apply(post, call.reply, [packet]);
    } catch {
      try {
        apply(post, call.reply, [
          internalRecord({ ok: false, error: 'Invalid private response' }),
        ]);
      } catch {
        /* The receiver may already have closed its reply port. */
      }
    } finally {
      closePort(call.reply);
    }
  }
  function receive(event: MessageEvent) {
    if (closed) return;
    const ports: readonly MessagePort[] = apply(eventPorts!, event, []);
    const reply = ports[0];
    if (!reply) return;
    const call = internalRecord({ reply, active: true });
    pending.add(call);
    const extra = internalArray<MessagePort>();
    for (let index = 1; index < ports.length; index++) extra.push(ports[index]);
    void (async () => {
      try {
        const value = await handler(internalData(apply(data, event, [])), extra);
        finish(call, internalRecord({ ok: true, value }));
      } catch (error) {
        finish(call, internalRecord({ ok: false, error: errorMessage(error) }));
      }
    })();
  }
  function stop() {
    if (closed) return;
    closed = true;
    apply(remove, port, ['message', receive]);
    apply(each, pending, [
      (call: Call) =>
        finish(
          call,
          internalRecord({ ok: false, error: 'Private request channel is closed' }),
        ),
    ]);
    try {
      apply(post, port, [internalRecord({ type: CLOSED })]);
    } finally {
      closePort(port);
    }
  }
  apply(add, port, ['message', receive]);
  apply(start, port, []);
  return internalRecord({ close: stop });
}
