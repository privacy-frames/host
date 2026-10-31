import {
  internalArray,
  internalData,
  internalRecord,
  ownDescriptor,
} from '../../shared/primordials.ts';
import { WORKER_CONTROL_REQUEST } from '../../shared/types.ts';
import { servePrivatePort } from '../private-channel.ts';
import type { PrivateRequest } from '../private-channel.ts';
import { parseWorkerControl, type WorkerControl } from './worker-protocol.ts';
import type { WorkerBootstrapMetadata } from './model.ts';

const apply = Reflect.apply;
const nativeFetch = fetch;
const nativeGlobal = globalThis;
const NativeURL = URL;
const href = ownDescriptor(URL.prototype, 'href')!.get!;
const ok = ownDescriptor(Response.prototype, 'ok')!.get!;
const json = Response.prototype.json;
const stringify = JSON.stringify;
const closePort = MessagePort.prototype.close;
const NativeError = Error;

/** One protocol is used by the window controller and each private parent relay. */
export function createWorkerControl(request: PrivateRequest): WorkerControl {
  return async (operation, path, id) => {
    const input = parseWorkerControl(internalRecord({ operation, path, id }));
    const value = internalData(
      await request(internalRecord({ type: WORKER_CONTROL_REQUEST, ...input })),
    );
    if (!value || typeof value !== 'object')
      throw new NativeError('Invalid worker control response');
    if (operation === 'verify') {
      if (ownDescriptor(value, 'verified')?.value !== true)
        throw new NativeError('Worker execution was not authorized');
    } else if (typeof ownDescriptor(value, 'closed')?.value !== 'boolean')
      throw new NativeError('Invalid worker closure response');
    return value;
  };
}

/** Shared/publisher worker roots retain their authenticated HTTP adapter for now. */
export function createHTTPWorkerControl(context: WorkerBootstrapMetadata): WorkerControl {
  const url: string = apply(
    href,
    new NativeURL('__contexts/control', context.applicationURL),
    [],
  );
  return createWorkerControl(async (packet) => {
    const response: Response = await apply(nativeFetch, nativeGlobal, [
      url,
      internalRecord({
        method: 'POST',
        credentials: 'omit',
        headers: internalRecord({ 'Content-Type': 'application/json' }),
        body: stringify(packet),
      }),
    ]);
    if (!apply(ok, response, [])) throw new NativeError('Worker control refused');
    return apply(json, response, []);
  });
}

/** The factory fixes the first hop; a child can request only a verified descendant. */
export function serveWorkerParent(
  port: MessagePort,
  id: string,
  control: WorkerControl,
  current: () => boolean,
) {
  return servePrivatePort(port, async (packet, ports) => {
    for (let index = 0; index < ports.length; index++) apply(closePort, ports[index], []);
    if (
      ports.length ||
      !current() ||
      !packet ||
      typeof packet !== 'object' ||
      ownDescriptor(packet, 'type')?.value !== WORKER_CONTROL_REQUEST
    )
      throw new NativeError('Worker parent request refused');
    const input = parseWorkerControl(packet);
    const path = internalArray<string>([id]);
    for (let index = 0; index < input.path.length; index++)
      path[index + 1] = input.path[index];
    const result = await control(input.operation, path, input.id);
    if (!current()) throw new NativeError('Worker parent channel closed');
    return result;
  });
}
