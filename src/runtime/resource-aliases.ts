import {
  internalArray,
  internalMap,
  internalSet,
  internalRecord,
  strings,
} from '../shared/primordials.ts';
import type { PolicyTools } from './enforcement/native.ts';

type AliasTools = Pick<PolicyTools, 'method' | 'accessor' | 'descriptor' | 'apply'> & {
  target?: object;
  baseURL?: () => string;
  documentSourceURL?: () => string;
  fetchResource?: typeof fetch;
};

export interface ResourceAliases {
  mapURL(input: unknown): string;
  mapNavigationURL(input: unknown): string;
  isInstalledURL(input: unknown): boolean;
  sourceURL(input: unknown): string | undefined;
  install(
    entries: Iterable<readonly [string, string]>,
    publisherURL?: string,
    rootEntries?: Iterable<readonly [string, string]>,
  ): void;
}

// Translate captured publisher URLs before native request creation. CSP permits
// only the runtime origin; the worker independently checks resource ownership.
export function resourceAliases({
  method,
  accessor,
  descriptor,
  apply,
  target = globalThis,
  baseURL,
  documentSourceURL,
  fetchResource,
}: AliasTools): ResourceAliases {
  const NativeURL = URL;
  const NativeRequest = Request;
  const NativeString = String;
  const nativeFetch = fetchResource || fetch;
  const nativeDocument = typeof document === 'object' ? document : null;
  const nativeBase =
    typeof Node === 'function' ? descriptor(Node.prototype, 'baseURI')?.get : undefined;
  const fallbackBase = location.href;
  const getBase =
    baseURL ||
    (() =>
      nativeDocument && nativeBase
        ? (apply(nativeBase, nativeDocument, []) as string)
        : fallbackBase);
  const readHref = descriptor(NativeURL.prototype, 'href')!.get!;
  const readHash = descriptor(NativeURL.prototype, 'hash')!.get!;
  const readOrigin = descriptor(NativeURL.prototype, 'origin')!.get!;
  const readSearch = descriptor(NativeURL.prototype, 'search')!.get!;
  const writeSearch = descriptor(NativeURL.prototype, 'search')!.set!;
  const runtimeOrigin: string = apply(readOrigin, new NativeURL(fallbackBase), []);
  const writeHash = descriptor(NativeURL.prototype, 'hash')!.set!;
  const requestURL = descriptor(Request.prototype, 'url')?.get;
  if (!requestURL) throw new Error('Native request URL access is required');
  const readRequestURL = requestURL;

  let aliases = internalMap<string, string>();
  let installed = internalSet<string>();
  let sources = internalMap<string, string>();
  let cachePaths = internalMap<string, string | undefined>();

  function address(input: unknown): { href: string; hash: string } {
    const url = new NativeURL(NativeString(input), getBase());
    const hash: string = apply(readHash, url, []);
    apply(writeHash, url, ['']);
    return internalRecord({ href: apply(readHref, url, []), hash });
  }

  function mapURL(input: unknown): string {
    const { href, hash } = address(input);
    return (aliases.get(href) ?? href) + hash;
  }

  function mapNavigationURL(input: unknown): string {
    const value = NativeString(input);
    const { href, hash } = address(value);
    if (
      nativeDocument &&
      documentSourceURL &&
      strings.startsWith(strings.trim(value), '#') &&
      href === address(documentSourceURL()).href
    ) {
      // Keep a same-document fragment relative: native URL resolution tracks
      // live clean/history paths and queries instead of the cached HTML path.
      return hash || '#';
    }
    return (aliases.get(href) ?? href) + hash;
  }

  function isInstalledURL(input: unknown): boolean {
    try {
      const { href } = address(input);
      return installed.has(aliases.get(href) ?? href);
    } catch {
      return false;
    }
  }

  function mapRequest(input: RequestInfo | URL): RequestInfo {
    return input instanceof NativeRequest
      ? new NativeRequest(mapURL(apply(readRequestURL, input, [])), input)
      : mapURL(input);
  }
  function logicalRequest(input: RequestInfo | URL): Request {
    let original: string | undefined;
    try {
      original = apply(readRequestURL, input, []);
    } catch {
      /* String/URL input. */
    }
    const value = original === undefined ? NativeString(input) : original;
    const { href, hash } = address(value);
    const mapped = aliases.get(href) ?? href;
    let logical = sources.get(mapped);
    if (logical === undefined) {
      const candidate = new NativeURL(href);
      const query: string = apply(readSearch, candidate, []);
      apply(writeSearch, candidate, ['']);
      const path = cachePaths.get(apply(readHref, candidate, []));
      if (path !== undefined) logical = path + query;
    }
    // Resource aliases have a stable publisher identity, including query
    // variants inspected with ignoreSearch. Other cache keys retain the native
    // execution base so URL, Request and relative-string forms agree.
    if (logical === undefined)
      return original === undefined ? new NativeRequest(value) : (input as Request);
    return original === undefined
      ? new NativeRequest(logical + hash)
      : new NativeRequest(logical + hash, input as Request);
  }

  const getPrototype = Object.getPrototypeOf;
  let fetchOwner: object | null = target;
  while (fetchOwner && !descriptor(fetchOwner, 'fetch'))
    fetchOwner = getPrototype(fetchOwner);
  if (!fetchOwner) throw new Error('Native fetch owner is required');
  method(
    fetchOwner,
    'fetch',
    function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      return apply(nativeFetch, this, [mapRequest(input), init]);
    },
  );

  if (typeof XMLHttpRequest === 'function') {
    const nativeOpen = XMLHttpRequest.prototype.open;
    method(
      XMLHttpRequest.prototype,
      'open',
      function (
        this: XMLHttpRequest,
        verb: string,
        url: string | URL,
        ...rest: [async?: boolean, username?: string | null, password?: string | null]
      ): void {
        apply(nativeOpen, this, [verb, mapURL(url), ...rest]);
      },
    );
  }

  const nativePut = Cache.prototype.put;
  const nativeCacheMatch = Cache.prototype.match;
  const nativeCacheMatchAll = Cache.prototype.matchAll;
  const nativeCacheDelete = Cache.prototype.delete;
  const nativeCacheKeys = Cache.prototype.keys;
  const responseOK = descriptor(Response.prototype, 'ok')!.get!;
  const responseStatus = descriptor(Response.prototype, 'status')!.get!;
  const methodName = descriptor(Request.prototype, 'method')!.get!;
  method(Cache.prototype, 'add', async function (this: Cache, input: RequestInfo | URL) {
    const request = logicalRequest(input);
    if (
      apply(methodName, request, []) !== 'GET' ||
      !isInstalledURL(apply(readRequestURL, request, []))
    )
      throw new TypeError('Cache source is not an installed GET resource');
    const response = await nativeFetch(mapRequest(request));
    if (!apply(responseOK, response, []) || apply(responseStatus, response, []) === 206) {
      throw new TypeError('Cache download failed');
    }
    await apply(nativePut, this, [request, response]);
  });

  method(
    Cache.prototype,
    'addAll',
    async function (this: Cache, inputs: Iterable<RequestInfo | URL>) {
      const requests = internalArray(Array.from(inputs, logicalRequest));
      if (
        requests.some(
          (request) =>
            apply(methodName, request, []) !== 'GET' ||
            !isInstalledURL(apply(readRequestURL, request, [])),
        )
      )
        throw new TypeError('Cache source is not an installed GET resource');
      if (
        internalSet(
          requests.map((request) => address(apply(readRequestURL, request, [])).href),
        ).size !== requests.length
      ) {
        throw new TypeError('Duplicate cache requests');
      }
      const responses = await Promise.all(
        requests.map((request) => nativeFetch(mapRequest(request))),
      );
      if (
        responses.some(
          (response) =>
            !apply(responseOK, response, []) ||
            apply(responseStatus, response, []) === 206,
        )
      ) {
        throw new TypeError('Cache download failed');
      }
      for (let index = 0; index < requests.length; index++) {
        await apply(nativePut, this, [requests[index], responses[index]]);
      }
    },
  );
  // These operations differ only in the native method and second argument.
  for (const [key, native] of [
    ['put', nativePut],
    ['match', nativeCacheMatch],
    ['delete', nativeCacheDelete],
  ] as const)
    method(
      Cache.prototype,
      key,
      function (
        this: Cache,
        input: RequestInfo | URL,
        argument?: Response | CacheQueryOptions,
      ) {
        return apply(native, this, [logicalRequest(input), argument]);
      },
    );
  method(
    Cache.prototype,
    'matchAll',
    function (this: Cache, input?: RequestInfo | URL, options?: CacheQueryOptions) {
      return apply(
        nativeCacheMatchAll,
        this,
        input === undefined ? [undefined, options] : [logicalRequest(input), options],
      );
    },
  );
  method(
    Cache.prototype,
    'keys',
    async function (this: Cache, input?: RequestInfo | URL, options?: CacheQueryOptions) {
      const values: readonly Request[] = await apply(
        nativeCacheKeys,
        this,
        input === undefined ? [undefined, options] : [logicalRequest(input), options],
      );
      return values.map(logicalRequest);
    },
  );

  const urlProperties: readonly [{ prototype: HTMLElement } | undefined, string][] = [
    [globalThis.HTMLImageElement, 'src'],
    [globalThis.HTMLMediaElement, 'src'],
    [globalThis.HTMLSourceElement, 'src'],
    [globalThis.HTMLInputElement, 'src'],
    [globalThis.HTMLVideoElement, 'poster'],
    [globalThis.HTMLAnchorElement, 'href'],
    [globalThis.HTMLAreaElement, 'href'],
  ];
  for (const [constructor, key] of urlProperties) {
    if (!constructor) continue;
    const original = descriptor(constructor.prototype, key);
    const nativeSet = original?.set;
    if (!nativeSet) continue;
    const map =
      constructor === globalThis.HTMLAnchorElement ||
      constructor === globalThis.HTMLAreaElement
        ? mapNavigationURL
        : mapURL;
    accessor(
      constructor.prototype,
      key,
      internalRecord({
        set(this: HTMLElement, value: unknown) {
          return apply(nativeSet, this, [map(value)]);
        },
      }),
    );
  }

  return Object.freeze(
    internalRecord({
      mapURL,
      mapNavigationURL,
      isInstalledURL,
      sourceURL(input: unknown) {
        const { href, hash } = address(input);
        const original = sources.get(aliases.get(href) ?? href);
        return original === undefined ? undefined : original + hash;
      },
      install(
        entries: Iterable<readonly [string, string]>,
        publisherURL?: string,
        rootEntries: Iterable<readonly [string, string]> = [],
      ) {
        const next = internalMap<string, string>();
        const targets = internalSet<string>();
        const originals = internalMap<string, string>();
        for (const [source, destination] of entries) {
          if (typeof source !== 'string' || typeof destination !== 'string')
            throw new TypeError('Resource aliases must be URL strings');
          const original = address(source).href;
          const mapped = address(destination).href;
          next.set(original, mapped);
          targets.add(mapped);
          originals.set(mapped, original);
        }
        for (const [source, destination] of rootEntries) {
          if (typeof source !== 'string' || typeof destination !== 'string')
            throw new TypeError('Resource aliases must be URL strings');
          const original = address(source).href;
          const mapped = address(destination).href;
          if (!targets.has(mapped))
            throw new TypeError('Root alias target is not an installed resource');
          // Logical root URLs must not change physical targets or publisher bases.
          if (!next.has(original) && !targets.has(original)) next.set(original, mapped);
        }
        if (publisherURL) {
          const publisherOrigin = apply(readOrigin, new NativeURL(publisherURL), []);
          for (const [mapped, original] of originals) {
            const source = new NativeURL(original);
            if (apply(readOrigin, source, []) !== publisherOrigin) continue;
            const candidate = new NativeURL(
              source.pathname + source.search,
              runtimeOrigin,
            ).href;
            // Only captured resources receive publisher-path aliases. Existing
            // physical targets and explicit mappings retain their identity.
            if (!next.has(candidate) && !targets.has(candidate))
              next.set(candidate, mapped);
          }
        }
        aliases = next;
        installed = targets;
        sources = originals;
        const paths = internalMap<string, string | undefined>();
        for (const [source, destination] of next) {
          const original = originals.get(destination);
          if (original === undefined) continue;
          const originalURL = new NativeURL(original);
          apply(writeSearch, originalURL, ['']);
          const value: string = apply(readHref, originalURL, []);
          for (const address of internalArray([source, destination])) {
            const sourceURL = new NativeURL(address);
            apply(writeSearch, sourceURL, ['']);
            const key: string = apply(readHref, sourceURL, []);
            if (!paths.has(key) || paths.get(key) === value) paths.set(key, value);
            else paths.set(key, undefined);
          }
        }
        cachePaths = paths;
      },
    }),
  );
}
