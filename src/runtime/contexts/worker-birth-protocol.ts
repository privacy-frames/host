import { internalRecord, ownDescriptor } from '../../shared/primordials.ts';
import { parseWorkerControl, workerIdentifier } from './worker-protocol.ts';

export type WorkerBirth = (
  path: readonly string[],
  id: string,
  url: string,
  module: boolean,
) => Promise<unknown>;
const NativeError = Error;

/** URL assertions select a native lookup; they do not supply a native client ID. */
export function parseWorkerBirth(value: unknown) {
  const field = (key: string): unknown =>
    value && typeof value === 'object' ? ownDescriptor(value, key)?.value : undefined;
  const { path } = parseWorkerControl(
    internalRecord({
      operation: 'verify',
      path: field('path'),
    }),
  );
  const id = field('id');
  const url = field('url');
  const module = field('module');
  if (!workerIdentifier(id) || typeof url !== 'string' || typeof module !== 'boolean')
    throw new NativeError('Invalid worker birth request');
  return internalRecord({ path, id, url, module });
}
