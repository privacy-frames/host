import {
  internalArray,
  internalMap,
  internalRecord,
  ownDescriptor,
  strings,
} from '../../shared/primordials.ts';
import { LIMITS } from '../../shared/policy.ts';
import { isJavaScriptMIME } from '../../shared/javascript-mime.ts';

const NativeBlob = Blob;
const NativeURL = URL;
const NativeException = DOMException;
const apply = Reflect.apply;
const createURL = URL.createObjectURL;
const revokeURL = URL.revokeObjectURL;
const ok = ownDescriptor(Response.prototype, 'ok')!.get!;
const headers = ownDescriptor(Response.prototype, 'headers')!.get!;
const header = Headers.prototype.get;
const bytes = Response.prototype.arrayBuffer;
const byteLength = ownDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;

interface ClassicScript {
  body: ArrayBuffer;
  type: string;
  sources: Map<boolean, string>;
}

/** Preload the admitted script set so importScripts stays synchronous and local. */
export function createClassicScripts(
  urls: readonly string[],
  load: (url: string) => Promise<Response>,
  relocate: (body: ArrayBuffer, url: string, module: boolean) => BlobPart = (body) =>
    body,
) {
  const local = internalMap<string, ClassicScript>();
  let pending: Promise<void> | undefined;
  let ready = false;
  let closed = false;
  function close() {
    closed = true;
    ready = false;
    for (const script of local.values())
      for (const source of script.sources.values()) apply(revokeURL, NativeURL, [source]);
    local.clear();
  }
  async function collect() {
    let total = 0;
    try {
      for (const url of urls) {
        if (closed) throw new NativeException('Script preparation closed', 'AbortError');
        const response = await load(url);
        if (closed) throw new NativeException('Script preparation closed', 'AbortError');
        const type: unknown = apply(header, apply(headers, response, []), [
          'content-type',
        ]);
        if (
          !apply(ok, response, []) ||
          typeof type !== 'string' ||
          !isJavaScriptMIME(type)
        )
          throw new NativeException(
            'Classic script is unavailable or has an invalid MIME type',
            'NetworkError',
          );
        const body: ArrayBuffer = await apply(bytes, response, []);
        if (closed) throw new NativeException('Script preparation closed', 'AbortError');
        total += apply(byteLength, body, []);
        if (total > LIMITS.bytes)
          throw new NativeException(
            'Classic script set exceeds the installation limit',
            'QuotaExceededError',
          );
        local.set(
          url,
          internalRecord({ body, type, sources: internalMap<boolean, string>() }),
        );
      }
      if (closed) throw new NativeException('Script preparation closed', 'AbortError');
      ready = true;
    } catch (error) {
      close();
      throw error;
    }
  }
  return internalRecord({
    prepare() {
      return (pending ??= collect());
    },
    resolve(url: string, module = false): string {
      const separator = strings.indexOf(url, '#');
      const key = separator < 0 ? url : strings.slice(url, 0, separator);
      const fragment = separator < 0 ? '' : strings.slice(url, separator);
      const script = ready ? local.get(key) : undefined;
      if (!script)
        throw new NativeException(
          'Classic script is not locally prepared',
          'NetworkError',
        );
      const existing = script.sources.get(module);
      if (existing) return existing + fragment;
      const body = relocate(script.body, key, module);
      if (closed) throw new NativeException('Script preparation closed', 'AbortError');
      const source: string = apply(createURL, NativeURL, [
        new NativeBlob(internalArray([body]), internalRecord({ type: script.type })),
      ]);
      script.sources.set(module, source);
      return source + fragment;
    },
    close,
  });
}
