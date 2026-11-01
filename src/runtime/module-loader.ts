import source from 'trusted:module-loader-source';
import { internalRecord } from '../shared/primordials.ts';

const scope = globalThis;
const apply = Reflect.apply;
const get = Reflect.get;
const define = Object.defineProperty;
const nativeEval = eval;
const NativeError = Error;
const NativeTypeError = TypeError;
const NativePromise = Promise;
const resolve = Promise.resolve;
const entries = Object.entries;

/** Local graph loading is a compatibility service, not an HTTP admission gate. */
export function createModuleLoader(
  fetchResource: typeof fetch,
  transform: (code: string, url: string) => string,
) {
  let importer: Function | undefined;
  async function sourceHook(
    url: unknown,
    options: unknown,
    parent: unknown,
    defaultSource: unknown,
  ) {
    if (typeof defaultSource !== 'function' || typeof url !== 'string')
      throw new NativeTypeError('Invalid module source hook');
    const result: unknown = await apply(defaultSource, undefined, [url, options, parent]);
    if (!result || typeof result !== 'object')
      throw new NativeTypeError('Module source is unavailable');
    const type: unknown = get(result, 'type');
    if (type !== 'js') return result;
    const code: unknown = get(result, 'source');
    const location: unknown = get(result, 'url');
    if (
      typeof code !== 'string' ||
      (location !== undefined && typeof location !== 'string')
    )
      throw new NativeTypeError('Invalid JavaScript module source');
    const base = location || url;
    return internalRecord({ type, url: base, source: transform(code, base) });
  }
  function prepare() {
    if (!importer) {
      if (get(scope, 'importShim') !== undefined)
        throw new NativeError('Module loader was installed before trusted preparation');
      // Initialize only after the realm and its execution base are prepared.
      // The dependency captures the already mediated fetch operation. Its public
      // registry is application state; native policy must deny HTTP independently.
      define(
        scope,
        'esmsInitOptions',
        internalRecord({
          value: internalRecord({
            shimMode: true,
            nativePassthrough: false,
            fetch: fetchResource,
            source: sourceHook,
          }),
          writable: true,
          configurable: true,
        }),
      );
      apply(nativeEval, scope, [source]);
      const candidate: unknown = get(scope, 'importShim');
      if (typeof candidate !== 'function')
        throw new NativeError('Local module loader did not initialize');
      importer = candidate;
    }
    return importer;
  }
  function load(url: string, options?: object, base?: string): Promise<unknown> {
    const ready = prepare();
    return apply(resolve, NativePromise, [apply(ready, scope, [url, options, base])]);
  }
  async function importModule(value: unknown, options?: unknown, base?: unknown) {
    // Match ImportCall's synchronous coercion and attribute reads before the
    // loader suspends. Abrupt conversions reject this native async promise.
    const url = `${value}`;
    if (base !== undefined && typeof base !== 'string')
      throw new NativeTypeError('Import base must be a URL string');
    let checked: { with: Record<string, string> } | undefined;
    if (options !== undefined) {
      if (
        options === null ||
        (typeof options !== 'object' && typeof options !== 'function')
      )
        throw new NativeTypeError('Import options must be an object');
      const attributes: unknown = get(options, 'with');
      if (attributes !== undefined) {
        if (
          attributes === null ||
          (typeof attributes !== 'object' && typeof attributes !== 'function')
        )
          throw new NativeTypeError('Import attributes must be an object');
        const values = internalRecord<Record<string, string>>({});
        for (const [key, item] of entries(attributes)) {
          if (key !== 'type' || typeof item !== 'string')
            throw new NativeTypeError('Unsupported import attribute');
          values[key] = item;
        }
        checked = internalRecord({ with: values });
      }
    }
    return load(url, checked, base);
  }
  return internalRecord({ prepare, load, importModule });
}
