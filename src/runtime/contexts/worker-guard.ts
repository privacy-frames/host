import {
  internalArray,
  ownDescriptor,
  internalRecord,
} from '../../shared/primordials.ts';
import { createPortClient, type PrivateClient } from '../private-channel.ts';
import { createWorkerControl } from './worker-client.ts';
import { readWorkerMetadata, prepareWorkerRealm } from './worker-realm.ts';
const worker = self as unknown as DedicatedWorkerGlobalScope;
const rawAdd = EventTarget.prototype.addEventListener;
const rawStop = Event.prototype.stopImmediatePropagation;
const rawMessageData = ownDescriptor(MessageEvent.prototype, 'data')!.get!;
const rawMessagePorts = ownDescriptor(MessageEvent.prototype, 'ports')!.get!;
const rawPortPost = MessagePort.prototype.postMessage;
const rawPortStart = MessagePort.prototype.start;
const rawPortClose = MessagePort.prototype.close;
const context = readWorkerMetadata('dedicated-worker');
let broker: PrivateClient | undefined;
const realm = prepareWorkerRealm(
  context,
  'message',
  createWorkerControl((packet) => {
    if (!broker) throw new Error('Worker parent broker unavailable');
    return broker.request(packet);
  }),
);
const { apply } = realm.tools;
apply(rawAdd, worker, [
  'message',
  (event: MessageEvent<unknown>) => {
    apply(rawStop, event, []);
    const data: unknown = apply(rawMessageData, event, []);
    const ports = internalArray<MessagePort>(
      Array.from(apply(rawMessagePorts, event, [])),
    );
    if (
      !data ||
      typeof data !== 'object' ||
      !('type' in data) ||
      data.type !== 'pf-context-bootstrap' ||
      ports.length !== 2
    )
      throw new Error('Invalid context bootstrap channel');
    const port = ports[0];
    broker = createPortClient(ports[1]);
    apply(rawAdd, port, [
      'message',
      async (message: MessageEvent<unknown>) => {
        let ready = false;
        const notify = () => {
          if (!ready) {
            ready = true;
            apply(rawPortPost, port, [internalRecord({ type: 'pf-context-ready' })]);
          }
        };
        try {
          const start: unknown = apply(rawMessageData, message, []);
          if (
            !start ||
            typeof start !== 'object' ||
            !('type' in start) ||
            start.type !== 'pf-context-start'
          )
            throw new Error('Invalid worker source');
          await realm.load(start, notify);
          apply(rawPortPost, port, [internalRecord({ type: 'pf-context-started' })]);
        } catch (error) {
          broker?.close();
          apply(rawPortPost, port, [internalRecord({ type: 'pf-context-failed' })]);
          console.error(
            'Worker startup failed:',
            error instanceof Error ? error.message : String(error),
          );
        } finally {
          apply(rawPortClose, port, []);
        }
      },
      internalRecord({ once: true }),
    ]);
    apply(rawPortStart, port, []);
  },
  internalRecord({ once: true }),
]);
