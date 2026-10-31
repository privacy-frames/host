import {
  internalArray,
  internalData,
  internalRecord,
  ownDescriptor,
} from '../shared/primordials.ts';

// Capture before prepareWindowRealm replaces the application-facing container.
const serviceWorker = ownDescriptor(Navigator.prototype, 'serviceWorker')?.get;
const controller =
  globalThis.ServiceWorkerContainer &&
  ownDescriptor(ServiceWorkerContainer.prototype, 'controller')?.get;
const post = globalThis.ServiceWorker && ServiceWorker.prototype.postMessage;
const NativeChannel = MessageChannel;
const port1 = ownDescriptor(NativeChannel.prototype, 'port1')!.get!;
const port2 = ownDescriptor(NativeChannel.prototype, 'port2')!.get!;
const start = MessagePort.prototype.start;
const close = MessagePort.prototype.close;
const add = EventTarget.prototype.addEventListener;
const data = ownDescriptor(MessageEvent.prototype, 'data')!.get!;
const NativePromise = Promise;
const NativeError = Error;
const apply = Reflect.apply;
const timer = setTimeout;
const clear = clearTimeout;
const nativeWindow = window;

/** Native controller handles and reply ports remain private to trusted closures. */
export function createControllerClient() {
  const container = serviceWorker ? apply(serviceWorker, navigator, []) : null;
  if (!container || !controller || !post)
    throw new NativeError('Native host controller is unavailable');
  const current = (): ServiceWorker | null => apply(controller, container, []);

  function request(
    message: object,
    ports: readonly Transferable[] = [],
  ): Promise<unknown> {
    return new NativePromise((resolve, reject) => {
      const target = current();
      if (!target) {
        reject(new NativeError('Host controller is unavailable'));
        return;
      }
      const channel = new NativeChannel();
      const reply = apply(port1, channel, []);
      const remote = apply(port2, channel, []);
      const timeout = apply(timer, nativeWindow, [
        () => {
          apply(close, reply, []);
          reject(new NativeError('Host request timed out'));
        },
        20000,
      ]);
      const finish = () => {
        apply(clear, nativeWindow, [timeout]);
        apply(close, reply, []);
      };
      apply(add, reply, [
        'message',
        (event: MessageEvent) => {
          finish();
          try {
            const result: unknown = internalData(apply(data, event, []));
            if (!result || typeof result !== 'object')
              throw new NativeError('Invalid host response');
            if (ownDescriptor(result, 'ok')?.value === true)
              resolve(ownDescriptor(result, 'value')?.value);
            else {
              const error: unknown = ownDescriptor(result, 'error')?.value;
              reject(
                new NativeError(
                  typeof error === 'string' ? error : 'Host rejected request',
                ),
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
        // Do not expose the private reply port to an application Array iterator.
        const transfer = internalArray<Transferable>([remote]);
        for (let index = 0; index < ports.length; index++)
          transfer[index + 1] = ports[index];
        apply(post, target, [message, transfer]);
      } catch (error) {
        finish();
        apply(close, remote, []);
        reject(error);
      }
    });
  }

  function listen(listener: (event: MessageEvent) => void) {
    apply(add, container, ['message', listener]);
  }

  return internalRecord({ controller: current, request, listen });
}
