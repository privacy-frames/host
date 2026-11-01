import {
  internalArray,
  internalMap,
  internalRecord,
  internalSet,
  strings,
} from '../../shared/primordials.ts';
import { readWorkletGraph } from './worklet-graph-schema.ts';

const NativeBlob = Blob;
const NativeURL = URL;
const NativeError = Error;
const apply = Reflect.apply;
const create = URL.createObjectURL;
const revoke = URL.revokeObjectURL;
const stringify = JSON.stringify;

function sourceURL(code: string): string {
  return apply(create, NativeURL, [
    new NativeBlob(internalArray([code]), internalRecord({ type: 'text/javascript' })),
  ]);
}

/** Keep authenticated host preparation outside the application compiler graph.
 * A failed first dependency must prevent evaluation of the application entry.
 * Revoking these URLs does not terminate an already running native worklet.
 */
export function createWorkletBootstrap(hostSource: string) {
  const guard = sourceURL(hostSource);
  const entries = internalMap<string, string>();
  let closed = false;
  return internalRecord({
    entry(application: string): string {
      if (closed) throw new NativeError('Worklet bootstrap is closed');
      if (!strings.startsWith(application, 'blob:'))
        throw new NativeError('Worklet entry is not local');
      const known = entries.get(application);
      if (known) return known;
      const url = sourceURL(
        'import ' + stringify(guard) + ';\nimport ' + stringify(application) + ';',
      );
      entries.set(application, url);
      return url;
    },
    close() {
      closed = true;
      for (const url of entries.values()) apply(revoke, NativeURL, [url]);
      entries.clear();
      apply(revoke, NativeURL, [guard]);
    },
  });
}

/** Link a trusted compiler response using operations captured before guest code.
 * Admission and actor authentication belong to the private controller protocol.
 * No JavaScript parser, compiler, HTTP reader or application evaluation runs here.
 */
export function createWorkletChunks(graph: unknown) {
  const plan = readWorkletGraph(graph);
  const chunks = internalMap<string, (typeof plan.chunks)[number]>();
  const urls = internalMap<string, string>();
  const active = internalSet<string>();
  function close() {
    for (const url of urls.values()) apply(revoke, NativeURL, [url]);
    urls.clear();
  }
  for (const chunk of plan.chunks) {
    chunks.set(chunk.name, chunk);
  }
  function local(name: string): string {
    const known = urls.get(name);
    if (known) return known;
    const chunk = chunks.get(name);
    if (!chunk || active.has(name))
      throw new NativeError('Worklet chunks are missing or cyclic');
    active.add(name);
    let code = '';
    let cursor = 0;
    for (const edit of chunk.imports) {
      let target: string;
      if (edit.external) {
        target = edit.target;
      } else target = local(edit.target);
      code += strings.slice(chunk.code, cursor, edit.start) + stringify(target);
      cursor = edit.end;
    }
    code += strings.slice(chunk.code, cursor);
    const url = sourceURL(code);
    urls.set(name, url);
    active.delete(name);
    return url;
  }
  try {
    const facades = internalMap<string, string>();
    for (const facade of plan.facades) {
      facades.set(facade.module, local(facade.chunk));
    }
    const entry = facades.get(plan.entry);
    if (!entry) throw new NativeError('Worklet entry has no local facade');
    return internalRecord({ entry, facades, close });
  } catch (error) {
    close();
    throw error;
  }
}
