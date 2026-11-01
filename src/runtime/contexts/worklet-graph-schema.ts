import {
  internalArray,
  internalRecord,
  internalSet,
  ownDescriptor,
  strings,
} from '../../shared/primordials.ts';
import type { WorkletChunk, WorkletGraph } from './worklet-graph.ts';

const array = Array.isArray;
const integer = Number.isSafeInteger;
const NativeError = Error;
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object')
    throw new NativeError('Invalid worklet graph record');
  const property = ownDescriptor(value, key);
  if (!property || !('value' in property))
    throw new NativeError('Invalid worklet graph field');
  return property.value;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new NativeError('Invalid worklet graph string');
  return value;
}
function list(value: unknown): unknown[] {
  if (!array(value)) throw new NativeError('Invalid worklet graph list');
  const result = internalArray<unknown>();
  for (let index = 0; index < value.length; index++)
    result.push(field(value, '' + index));
  return result;
}

/** Copy unknown wire data into private records; identity is not granted here. */
export function readWorkletGraph(value: unknown): WorkletGraph {
  const entry = text(field(value, 'entry'));
  const names = internalSet<string>();
  const chunks = internalArray<WorkletChunk>();
  for (const candidate of list(field(value, 'chunks'))) {
    const name = text(field(candidate, 'name'));
    const code = text(field(candidate, 'code'));
    if (names.has(name)) throw new NativeError('Duplicate worklet chunk');
    names.add(name);
    const imports = internalArray<WorkletChunk['imports'][number]>();
    let cursor = 0;
    for (const item of list(field(candidate, 'imports'))) {
      const start = field(item, 'start');
      const end = field(item, 'end');
      const target = text(field(item, 'target'));
      const external = field(item, 'external');
      if (
        typeof start !== 'number' ||
        typeof end !== 'number' ||
        !integer(start) ||
        !integer(end) ||
        start < cursor ||
        end <= start ||
        end > code.length ||
        typeof external !== 'boolean'
      )
        throw new NativeError('Invalid worklet import range');
      if (external && !strings.startsWith(target, 'blob:'))
        throw new NativeError('Worklet external dependency is not local');
      cursor = end;
      imports.push(internalRecord({ start, end, target, external }));
    }
    chunks.push(internalRecord({ name, code, imports }));
  }
  for (const chunk of chunks)
    for (const item of chunk.imports)
      if (!item.external && !names.has(item.target))
        throw new NativeError('Worklet dependency has no local chunk');
  const modules = internalSet<string>();
  const facades = internalArray<WorkletGraph['facades'][number]>();
  for (const candidate of list(field(value, 'facades'))) {
    const module = text(field(candidate, 'module'));
    const chunk = text(field(candidate, 'chunk'));
    if (modules.has(module) || !names.has(chunk))
      throw new NativeError('Invalid worklet facade');
    modules.add(module);
    facades.push(internalRecord({ module, chunk }));
  }
  if (!modules.has(entry)) throw new NativeError('Worklet entry has no local facade');
  return internalRecord({ entry, chunks, facades });
}
