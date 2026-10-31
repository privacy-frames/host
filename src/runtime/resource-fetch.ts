import {
  internalArray,
  internalData,
  internalRecord,
  ownDescriptor,
} from '../shared/primordials.ts';

type ReadResource = (url: string, headers: [string, string][]) => Promise<unknown>;
const apply = Reflect.apply;
const NativeRequest = Request;
const NativeResponse = Response;
const NativeURL = URL;
const getURLProtocol = ownDescriptor(URL.prototype, 'protocol')!.get!;
const getURLHref = ownDescriptor(URL.prototype, 'href')!.get!;
const setURLHash = ownDescriptor(URL.prototype, 'hash')!.set!;
const NativeError = TypeError;
const NativePromise = Promise;
const nativeFetch = fetch;
const NativeBlob = Blob;
const createURL = URL.createObjectURL;
const revokeURL = URL.revokeObjectURL;
const nativeGlobal = globalThis;
const then = Promise.prototype.then;
const getRequestURL = ownDescriptor(Request.prototype, 'url')!.get!;
const getMethod = ownDescriptor(Request.prototype, 'method')!.get!;
const getIntegrity = ownDescriptor(Request.prototype, 'integrity')!.get!;
const getSignal = ownDescriptor(Request.prototype, 'signal')!.get!;
const getHeaders = ownDescriptor(Request.prototype, 'headers')!.get!;
const getAborted = ownDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const getReason = ownDescriptor(AbortSignal.prototype, 'reason')!.get!;
const add = EventTarget.prototype.addEventListener;
const remove = EventTarget.prototype.removeEventListener;
const forEachHeader = Headers.prototype.forEach;
const getURL = ownDescriptor(Response.prototype, 'url')!.get!;
const getType = ownDescriptor(Response.prototype, 'type')!.get!;
const clone = Response.prototype.clone;
const length = ownDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const array = Array.isArray;
const NativeWeakMap = WeakMap;
const weakGet = WeakMap.prototype.get;
const weakSet = WeakMap.prototype.set;
const weakHas = WeakMap.prototype.has;

function validBody(value: unknown): value is ArrayBuffer {
  try {
    return apply(length, value, []) <= 100 * 1024 * 1024;
  } catch {
    return false;
  }
}

function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || array(value))
    throw new NativeError('Invalid local resource response');
  return ownDescriptor(value, key)?.value;
}

/** A local Response keeps native body, cloning and streaming implementations. */
export function createResourceFetch(
  read: ReadResource,
  tools: {
    accessor(object: object, key: PropertyKey, descriptor: PropertyDescriptor): unknown;
    method(object: object, key: PropertyKey, value: Function): unknown;
  },
) {
  const responses = new NativeWeakMap<Response, string>();
  tools.accessor(
    NativeResponse.prototype,
    'url',
    internalRecord({
      get(this: Response) {
        return apply(weakGet, responses, [this]) ?? apply(getURL, this, []);
      },
    }),
  );
  tools.accessor(
    NativeResponse.prototype,
    'type',
    internalRecord({
      get(this: Response) {
        return apply(weakHas, responses, [this]) ? 'basic' : apply(getType, this, []);
      },
    }),
  );
  tools.method(NativeResponse.prototype, 'clone', function (this: Response) {
    const result: Response = apply(clone, this, []);
    const url = apply(weakGet, responses, [this]);
    if (url !== undefined) apply(weakSet, responses, [result, url]);
    return result;
  });

  function response(raw: unknown, url: string): Response {
    const value: unknown = internalData(raw);
    const status = field(value, 'status');
    const statusText = field(value, 'statusText');
    const headers = field(value, 'headers');
    const body = field(value, 'body');
    if (
      field(value, 'url') !== url ||
      typeof status !== 'number' ||
      status < 200 ||
      status > 599 ||
      typeof statusText !== 'string' ||
      !array(headers) ||
      headers.length > 256
    )
      throw new NativeError('Invalid local resource metadata');
    if (!validBody(body)) throw new NativeError('Invalid local resource body');
    const checked = internalArray<[string, string]>();
    for (let index = 0; index < headers.length; index++) {
      const pair: unknown = headers[index];
      if (
        !array(pair) ||
        pair.length !== 2 ||
        typeof pair[0] !== 'string' ||
        typeof pair[1] !== 'string'
      )
        throw new NativeError('Invalid local response header');
      const entry: [string, string] = [pair[0], pair[1]];
      internalArray(entry);
      checked[index] = entry;
    }
    // A native Response constructor validates status and header syntax as well.
    const result = new NativeResponse(
      status === 204 || status === 205 || status === 304 ? null : body,
      internalRecord({ status, statusText, headers: checked }),
    );
    apply(weakSet, responses, [result, url]);
    return result;
  }

  async function verifyIntegrity(value: unknown, integrity: string, signal: AbortSignal) {
    const body = field(value, 'body');
    if (!validBody(body)) throw new NativeError('Invalid local resource body');
    const url: string = apply(createURL, NativeURL, [
      new NativeBlob(internalArray([body])),
    ]);
    try {
      // Delegate integrity parsing and digest selection to native Fetch. The
      // verification URL is local; it never names an HTTP endpoint.
      await apply(nativeFetch, nativeGlobal, [
        url,
        internalRecord({ integrity, signal }),
      ]);
    } finally {
      apply(revokeURL, NativeURL, [url]);
    }
  }

  return function resourceFetch(input: RequestInfo | URL, init?: RequestInit) {
    return new NativePromise<Response>((resolve, reject) => {
      try {
        const request = new NativeRequest(input, init);
        const target = new NativeURL(apply(getRequestURL, request, []));
        apply(setURLHash, target, ['']);
        const protocol = apply(getURLProtocol, target, []);
        const url: string = apply(getURLHref, target, []);
        if (protocol === 'blob:' || protocol === 'data:') {
          resolve(apply(nativeFetch, nativeGlobal, [request]));
          return;
        }
        if (
          (protocol !== 'http:' && protocol !== 'https:') ||
          apply(getMethod, request, []) !== 'GET'
        )
          throw new NativeError('Local resource fetch requires GET');
        const integrity: string = apply(getIntegrity, request, []);
        const signal: AbortSignal = apply(getSignal, request, []);
        const aborted = () => {
          apply(remove, signal, ['abort', aborted]);
          reject(apply(getReason, signal, []));
        };
        if (apply(getAborted, signal, [])) {
          aborted();
          return;
        }
        apply(add, signal, ['abort', aborted, internalRecord({ once: true })]);
        const headers = internalArray<[string, string]>();
        apply(forEachHeader, apply(getHeaders, request, []), [
          (value: string, name: string) => {
            const pair: [string, string] = [name, value];
            internalArray(pair);
            headers[headers.length] = pair;
          },
        ]);
        const finish = () => apply(remove, signal, ['abort', aborted]);
        try {
          apply(then, read(url, headers), [
            async (value: unknown) => {
              try {
                if (apply(getAborted, signal, [])) {
                  reject(apply(getReason, signal, []));
                  return;
                }
                const result = response(value, url);
                if (integrity) await verifyIntegrity(value, integrity, signal);
                if (apply(getAborted, signal, [])) reject(apply(getReason, signal, []));
                else resolve(result);
              } catch (error) {
                reject(error);
              } finally {
                finish();
              }
            },
            (error: unknown) => {
              finish();
              reject(
                new NativeError(
                  'Local resource unavailable',
                  internalRecord({ cause: error }),
                ),
              );
            },
          ]);
        } catch (error) {
          finish();
          reject(
            new NativeError(
              'Local resource unavailable',
              internalRecord({ cause: error }),
            ),
          );
        }
      } catch (error) {
        reject(error);
      }
    });
  };
}
