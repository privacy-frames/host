import {
  internalArray,
  internalRecord,
  ownDescriptor,
} from '../../shared/primordials.ts';

export type WorkerControlOperation = 'verify' | 'close';
export type WorkerControl = (
  operation: WorkerControlOperation,
  path: readonly string[],
  id?: string,
) => Promise<unknown>;
export interface WorkerControlInput {
  operation: WorkerControlOperation;
  path: string[];
  id?: string;
}
const identifier =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const test = RegExp.prototype.test;
const apply = Reflect.apply;
const isArray = Array.isArray;
const string = String;
const NativeError = Error;
function field(value: unknown, key: string): unknown {
  return value && typeof value === 'object'
    ? ownDescriptor(value, key)?.value
    : undefined;
}
export function workerIdentifier(value: unknown): value is string {
  return typeof value === 'string' && apply(test, identifier, [value]);
}
/** Only data fields are interpreted; claimed actors never form part of this protocol. */
export function parseWorkerControl(value: unknown): WorkerControlInput {
  const operation = field(value, 'operation');
  const path = field(value, 'path');
  const id = field(value, 'id');
  if ((operation !== 'verify' && operation !== 'close') || !isArray(path))
    throw new NativeError('Invalid worker control request');
  const checked = internalArray<string>();
  for (let index = 0; index < path.length; index++) {
    const item = ownDescriptor(path, string(index))?.value;
    if (!workerIdentifier(item)) throw new NativeError('Invalid worker control path');
    checked[index] = item;
  }
  if (operation === 'close') {
    if (!workerIdentifier(id)) throw new NativeError('Invalid worker closure identifier');
    return internalRecord({ operation, path: checked, id });
  }
  if (id !== undefined) throw new NativeError('Invalid worker verification identifier');
  return internalRecord({ operation, path: checked });
}
