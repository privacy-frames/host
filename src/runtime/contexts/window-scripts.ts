import { internalRecord, ownDescriptor } from '../../shared/primordials.ts';
import { relocateImportMeta } from '../../shared/module-source.ts';
import { createClassicScripts } from './classic-scripts.ts';
import { relocateRuntimeModule } from '../modules.ts';
import type { ResourceAliases } from '../resource-aliases.ts';

const NativeURL = URL;
const NativeBlob = Blob;
const NativeError = Error;
const NativeFunction = Function;
const apply = Reflect.apply;
const createURL = URL.createObjectURL;
const revokeURL = URL.revokeObjectURL;
const stringify = JSON.stringify;
const decoder = new TextDecoder();
const decode = TextDecoder.prototype.decode;
const protocol = ownDescriptor(NativeURL.prototype, 'protocol')!.get!;
const href = ownDescriptor(NativeURL.prototype, 'href')!.get!;
const createElement = Document.prototype.createElementNS;
const append = Node.prototype.appendChild;
const remove = Node.prototype.removeChild;
const setAttribute = Element.prototype.setAttribute;
const setText = ownDescriptor(Node.prototype, 'textContent')!.set!;
const head = ownDescriptor(Document.prototype, 'head')!.get!;
const root = ownDescriptor(Document.prototype, 'documentElement')!.get!;
const supports = HTMLScriptElement.supports;
const nativeDocument = document;

/** Local Blob sources with native Window module linking and lifecycle behavior. */
export function createWindowScripts(
  resources: ResourceAliases,
  read: typeof fetch,
  nonce: string,
) {
  let ready = false;
  let closed = false;
  let classic: ReturnType<typeof createClassicScripts> | undefined;
  let unavailable: string | undefined;
  const nativeImport = new NativeFunction('url', 'options', 'return import(url,options)');
  function blob(code: string): string {
    return apply(createURL, NativeURL, [
      new NativeBlob([code], internalRecord({ type: 'text/javascript' })),
    ]);
  }
  function missing(): string {
    if (!unavailable) {
      unavailable = blob('');
      apply(revokeURL, NativeURL, [unavailable]);
    }
    return unavailable;
  }
  function resolve(url: string, module: boolean): string {
    if (!classic || !ready || closed)
      throw new NativeError('Window scripts are not ready');
    if (apply(protocol, new NativeURL(url), []) === 'blob:') return url;
    return resources.isInstalledURL(url) ? classic.resolve(url, module) : missing();
  }
  return internalRecord({
    async prepare(urls: readonly string[]) {
      if (
        classic ||
        closed ||
        typeof supports !== 'function' ||
        !apply(supports, HTMLScriptElement, ['importmap'])
      )
        throw new NativeError('Native Window module maps are unavailable');
      classic = createClassicScripts(urls, read, (body, url, module) => {
        const base = resources.sourceURL(url) || url;
        const source: string = apply(decode, decoder, [body]);
        return relocateRuntimeModule(
          module ? relocateImportMeta(source, base) : source,
          // Captured imports are relative to their installed resource path.
          // The publisher address remains the logical import.meta location.
          url,
          resources,
          true,
        );
      });
      await classic.prepare();
      if (closed) throw new NativeError('Window scripts are closed');
      const imports = internalRecord<Record<string, string>>({});
      for (const url of urls) {
        const local = classic.resolve(url, true);
        imports[url] = local;
        const original = resources.sourceURL(url);
        if (original) imports[original] = local;
      }
      const probe = blob('export default 1;');
      const probeKey = 'privacy-frames:module-probe';
      imports[probeKey] = probe;
      const script = apply(createElement, nativeDocument, [
        'http://www.w3.org/1999/xhtml',
        'script',
      ]);
      apply(setAttribute, script, ['type', 'importmap']);
      apply(setAttribute, script, ['nonce', nonce]);
      apply(setText, script, [stringify(internalRecord({ imports }))]);
      const parent = apply(head, nativeDocument, []) || apply(root, nativeDocument, []);
      apply(append, parent, [script]);
      try {
        const result: unknown = await apply(nativeImport, undefined, [probeKey]);
        if (
          !result ||
          typeof result !== 'object' ||
          !('default' in result) ||
          result.default !== 1
        )
          throw new NativeError('Native Window module map did not apply');
        if (closed) throw new NativeError('Window scripts are closed');
        ready = true;
      } finally {
        apply(remove, parent, [script]);
        apply(revokeURL, NativeURL, [probe]);
      }
    },
    async importModule(
      value: unknown,
      options?: unknown,
      base?: unknown,
    ): Promise<unknown> {
      const text = `${value}`;
      if (!ready || closed) throw new NativeError('Window scripts are not ready');
      let source: string;
      try {
        if (
          typeof base !== 'string' ||
          !/^(?:\.?\.?\/|[A-Za-z][A-Za-z\d+.-]*:)/.test(text)
        )
          throw new NativeError('Unresolved module specifier');
        const canonical = resources.mapURL(apply(href, new NativeURL(text, base), []));
        source = resolve(canonical, true);
      } catch {
        source = missing();
      }
      return apply(nativeImport, undefined, [source, options]);
    },
    resolve,
    close() {
      closed = true;
      ready = false;
      classic?.close();
    },
  });
}
