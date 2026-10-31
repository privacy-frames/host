import {
  internalArray,
  internalRecord,
  ownDescriptor,
} from '../../shared/primordials.ts';
import { parseWorkerControl } from './worker-protocol.ts';

export type WorkerResourceRead = (
  path: readonly string[],
  url: string,
  headers: [string, string][],
) => Promise<unknown>;
const isArray = Array.isArray;
const string = String;
const NativeError = Error;
function field(value: unknown, key: string): unknown {
  return value && typeof value === 'object'
    ? ownDescriptor(value, key)?.value
    : undefined;
}
export function parseWorkerResource(value: unknown) {
  const suppliedPath = field(value, 'path');
  const { path } = parseWorkerControl(
    internalRecord({
      operation: 'verify',
      path: suppliedPath === undefined ? internalArray() : suppliedPath,
    }),
  );
  const url = field(value, 'url');
  const headers = field(value, 'headers');
  if (typeof url !== 'string' || !isArray(headers) || headers.length > 256)
    throw new NativeError('Invalid worker resource request');
  const checked = internalArray<[string, string]>();
  for (let index = 0; index < headers.length; index++) {
    const pair: unknown = ownDescriptor(headers, string(index))?.value;
    if (!isArray(pair) || pair.length !== 2)
      throw new NativeError('Invalid worker resource header');
    const name: unknown = ownDescriptor(pair, '0')?.value;
    const item: unknown = ownDescriptor(pair, '1')?.value;
    if (typeof name !== 'string' || typeof item !== 'string')
      throw new NativeError('Invalid worker resource header');
    const entry: [string, string] = [name, item];
    internalArray(entry);
    checked[index] = entry;
  }
  return internalRecord({ path, url, headers: checked });
}
