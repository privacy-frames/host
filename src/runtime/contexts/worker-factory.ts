import {
  internalArray,
  ownDescriptor,
  internalRecord,
} from '../../shared/primordials.ts';
import type { PolicyTools } from '../enforcement/native.ts';
import type { ResourceAliases } from '../resource-aliases.ts';

// Control-plane requests retain the pre-adapter native operation.
const nativeFetch = fetch;

export interface WorkerFactoryContext {
  applicationURL: string;
  baseURL: () => string;
  resources: ResourceAliases;
}

interface QueuedMessage {
  data: unknown;
  transfer: unknown[];
}
interface WorkerLifecycle {
  ready: boolean;
  started: boolean;
  closed: boolean;
  queue: QueuedMessage[];
  port: MessagePort | null;
  closeURL: string;
  closeRequested: boolean;
}

/** Native handles retain native events; startup messages wait for trusted setup. */
export function createWorkerFactory(
  tools: PolicyTools,
  context: WorkerFactoryContext,
): typeof Worker | undefined {
  const NativeWorker = globalThis.Worker;
  if (!NativeWorker) return undefined;
  const { apply, method, fail } = tools;
  const nativeGlobal = globalThis;
  const construct = Reflect.construct;
  const get = Reflect.get;
  const str = String;
  const arrayFrom = Array.from;
  const isArray = Array.isArray;
  const NativePromise = Promise;
  const resolvePromise = Promise.resolve;
  const nativeCrypto = crypto;
  const randomUUID = crypto.randomUUID;
  const messageData = ownDescriptor(MessageEvent.prototype, 'data')!.get!;
  const nativePost = NativeWorker.prototype.postMessage;
  const nativeTerminate = NativeWorker.prototype.terminate;
  const nativeClone = structuredClone;
  const NativeChannel = MessageChannel;
  const getPort1 = ownDescriptor(NativeChannel.prototype, 'port1')!.get!;
  const getPort2 = ownDescriptor(NativeChannel.prototype, 'port2')!.get!;
  const portPost = MessagePort.prototype.postMessage;
  const portClose = MessagePort.prototype.close;
  const portStart = MessagePort.prototype.start;
  const nativeDispatch = EventTarget.prototype.dispatchEvent;
  const NativeErrorEvent = ErrorEvent;
  const responseBody = Response.prototype.arrayBuffer;
  const responseOK = ownDescriptor(Response.prototype, 'ok')!.get!;
  const NativeURL = URL;
  const href = ownDescriptor(NativeURL.prototype, 'href')!.get!;
  const protocol = ownDescriptor(NativeURL.prototype, 'protocol')!.get!;
  const origin = ownDescriptor(NativeURL.prototype, 'origin')!.get!;
  const runtimeOrigin: string = apply(origin, new NativeURL(context.applicationURL), []);
  const workers = new WeakMap<Worker, WorkerLifecycle>();

  function checkedURL(value: unknown): { value: string; blob: boolean } {
    const mapped = context.resources.mapURL(str(value));
    const url = new NativeURL(mapped, context.baseURL());
    const blob = apply(protocol, url, []) === 'blob:';
    if (
      blob
        ? apply(origin, url, []) !== runtimeOrigin
        : !context.resources.isInstalledURL(mapped)
    )
      fail('Worker source is not an installed resource or application Blob');
    return internalRecord({ value: apply(href, url, []), blob });
  }

  function cloneMessage(data: unknown, options?: unknown): QueuedMessage {
    let transfer: unknown = [];
    if (options !== undefined && options !== null) {
      if (
        isArray(options) ||
        ((typeof options === 'object' || typeof options === 'function') &&
          typeof get(options, Symbol.iterator) === 'function')
      )
        transfer = options;
      else if (typeof options === 'object' && options !== null)
        transfer = get(options, 'transfer') ?? [];
      else throw new TypeError('Invalid message transfer options');
    }
    if (
      typeof transfer !== 'object' ||
      transfer === null ||
      typeof get(transfer, Symbol.iterator) !== 'function'
    )
      throw new TypeError('Message transfer list must be iterable');
    const entries = internalArray(arrayFrom(transfer as Iterable<unknown>));
    const cloned: unknown = apply(nativeClone, nativeGlobal, [
      internalRecord({ data, transfer: entries }),
      internalRecord({ transfer: entries }),
    ]);
    if (cloned !== null && typeof cloned === 'object') internalRecord(cloned);
    if (
      !cloned ||
      typeof cloned !== 'object' ||
      !('data' in cloned) ||
      !('transfer' in cloned) ||
      !isArray(cloned.transfer)
    )
      throw new Error('Message cloning failed');
    return internalRecord({ data: cloned.data, transfer: cloned.transfer });
  }

  function closePort(lifecycle: WorkerLifecycle) {
    if (lifecycle.port) apply(portClose, lifecycle.port, []);
    lifecycle.port = null;
  }

  function revoke(lifecycle: WorkerLifecycle) {
    if (lifecycle.closeRequested) return;
    lifecycle.closeRequested = true;
    const closing: Promise<Response> = apply(nativeFetch, nativeGlobal, [
      lifecycle.closeURL,
      internalRecord({ method: 'POST', credentials: 'omit' }),
    ]);
    closing.catch(() => {});
  }

  function failed(worker: Worker, lifecycle: WorkerLifecycle, message: string) {
    if (lifecycle.closed) return;
    lifecycle.closed = true;
    lifecycle.queue.length = 0;
    closePort(lifecycle);
    revoke(lifecycle);
    apply(nativeTerminate, worker, []);
    apply(nativeDispatch, worker, [
      new NativeErrorEvent('error', internalRecord({ message })),
    ]);
  }

  method(
    NativeWorker.prototype,
    'postMessage',
    function (this: Worker, data: unknown, options?: unknown) {
      if (!arguments.length) throw new TypeError('Message data is required');
      const lifecycle = workers.get(this);
      if (!lifecycle) return fail('Unmanaged worker handle');
      if (lifecycle.ready || lifecycle.closed)
        return apply(nativePost, this, options === undefined ? [data] : [data, options]);
      lifecycle.queue.push(cloneMessage(data, options));
    },
  );
  method(NativeWorker.prototype, 'terminate', function (this: Worker) {
    const lifecycle = workers.get(this);
    if (!lifecycle) return fail('Unmanaged worker handle');
    lifecycle.closed = true;
    lifecycle.queue.length = 0;
    closePort(lifecycle);
    revoke(lifecycle);
    return apply(nativeTerminate, this, []);
  });

  const factory = new Proxy(
    NativeWorker,
    internalRecord({
      construct(_target, args: unknown[], newTarget) {
        if (!args.length) throw new TypeError('Worker script URL is required');
        const source = checkedURL(args[0]);
        const options = args[1];
        if (options !== undefined && options !== null && typeof options !== 'object')
          throw new TypeError('Invalid worker options');
        const type = options ? str(get(options, 'type') ?? 'classic') : 'classic';
        if (type !== 'classic' && type !== 'module')
          throw new TypeError('Unsupported worker type');
        const name = options ? str(get(options, 'name') ?? '') : '';
        const bootstrap = new NativeURL(
          `__contexts/${apply(randomUUID, nativeCrypto, [])}/${type}.js`,
          context.applicationURL,
        );
        const worker: Worker = construct(
          NativeWorker,
          [
            apply(href, bootstrap, []),
            internalRecord({ type, name, credentials: 'omit' }),
          ],
          newTarget === factory ? NativeWorker : newTarget,
        );
        const lifecycle: WorkerLifecycle = internalRecord({
          ready: false,
          started: false,
          closed: false,
          queue: internalArray(),
          port: null,
          closeURL: apply(href, new NativeURL('close', bootstrap), []),
          closeRequested: false,
        });
        workers.set(worker, lifecycle);
        const channel = new NativeChannel();
        const port1: MessagePort = apply(getPort1, channel, []);
        const port2: MessagePort = apply(getPort2, channel, []);
        lifecycle.port = port1;
        apply(tools.nativeAdd, worker, [
          'error',
          () => {
            if (!lifecycle.started && !lifecycle.closed) {
              lifecycle.closed = true;
              lifecycle.queue.length = 0;
              closePort(lifecycle);
              revoke(lifecycle);
            }
          },
        ]);
        // This first native message precedes every message from the returned handle.
        apply(nativePost, worker, [
          internalRecord({ type: 'pf-context-bootstrap' }),
          [port2],
        ]);
        apply(tools.nativeAdd, port1, [
          'message',
          (event: MessageEvent<unknown>) => {
            const data: unknown = protocolData(apply(messageData, event, []));
            if (
              lifecycle.closed ||
              !data ||
              typeof data !== 'object' ||
              !('type' in data)
            )
              return;
            if (data.type === 'pf-context-ready') {
              lifecycle.ready = true;
              try {
                for (const entry of lifecycle.queue.splice(0))
                  apply(nativePost, worker, [entry.data, entry.transfer]);
              } catch {
                failed(worker, lifecycle, 'Worker message delivery failed');
              }
            } else if (data.type === 'pf-context-started') {
              lifecycle.started = true;
              closePort(lifecycle);
            } else if (data.type === 'pf-context-failed') {
              failed(worker, lifecycle, 'Worker confinement or script startup failed');
            }
          },
        ]);
        apply(portStart, port1, []);
        const sourceBody = source.blob
          ? nativeFetch(source.value).then(async (response) => {
              if (!apply(responseOK, response, []))
                throw new Error('Worker Blob is unavailable');
              const body: ArrayBuffer = await apply(responseBody, response, []);
              if (body.byteLength > 100 * 1024 * 1024)
                throw new Error('Worker source is too large');
              return body;
            })
          : apply(resolvePromise, NativePromise, [undefined]);
        sourceBody
          .then((body) => {
            if (lifecycle.closed) return;
            apply(portPost, port1, [
              internalRecord({
                type: 'pf-context-start',
                source: context.resources.sourceURL(source.value) || source.value,
                base: context.resources.sourceURL(source.value) || source.value,
                body,
                module: type === 'module',
              }),
              body ? [body] : [],
            ]);
          })
          .catch(() => {
            failed(worker, lifecycle, 'Worker source could not load');
          });
        return worker;
      },
    }),
  );
  method(NativeWorker.prototype, 'constructor', factory);
  return factory;
}

function protocolData(value: unknown): unknown {
  return value !== null && typeof value === 'object' ? internalRecord(value) : value;
}
