import { internalRecord, ownDescriptor } from '../shared/primordials.ts';
import { createRequestClient } from './private-channel.ts';

// Capture before prepareWindowRealm replaces the application-facing container.
const serviceWorker = ownDescriptor(Navigator.prototype, 'serviceWorker')?.get;
const controller =
  globalThis.ServiceWorkerContainer &&
  ownDescriptor(ServiceWorkerContainer.prototype, 'controller')?.get;
const post = globalThis.ServiceWorker && ServiceWorker.prototype.postMessage;
const add = EventTarget.prototype.addEventListener;
const NativeError = Error;
const apply = Reflect.apply;

/** Native controller handles and reply ports remain private to trusted closures. */
export function createControllerClient() {
  const container = serviceWorker ? apply(serviceWorker, navigator, []) : null;
  if (!container || !controller || !post)
    throw new NativeError('Native host controller is unavailable');
  const current = (): ServiceWorker | null => apply(controller, container, []);
  const client = createRequestClient((message, transfer) => {
    const target = current();
    if (!target) throw new NativeError('Host controller is unavailable');
    apply(post, target, [message, transfer]);
  });
  function listen(listener: (event: MessageEvent) => void) {
    apply(add, container, ['message', listener]);
  }
  return internalRecord({ controller: current, request: client.request, listen });
}
