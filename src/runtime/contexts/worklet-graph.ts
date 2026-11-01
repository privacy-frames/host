import type { rollup, Plugin } from '@rollup/browser';
import { parse } from 'es-module-lexer/js';

export interface WorkletChunkImport {
  start: number;
  end: number;
  target: string;
  external: boolean;
}
export interface WorkletChunk {
  name: string;
  code: string;
  imports: WorkletChunkImport[];
}
export interface WorkletGraph {
  entry: string;
  chunks: WorkletChunk[];
  facades: { module: string; chunk: string }[];
}
interface GraphOptions {
  entry: string;
  readModule(id: string): Promise<string>;
  /** Previously prepared modules in this worklet's static dependency closure. */
  external: ReadonlyMap<string, string>;
}

/** Compile immutable source data in a trusted realm without application code.
 * The caller supplies admitted reads and a compiler initialized with local WASM.
 * This module supplies no network reader and grants no execution authority.
 */
export async function compileWorkletGraph(
  compiler: typeof rollup,
  options: GraphOptions,
): Promise<WorkletGraph> {
  const external = new Map(options.external);
  for (const url of external.values())
    if (new URL(url).protocol !== 'blob:')
      throw new Error('Prepared worklet modules must use Blob URLs');
  if (external.has(options.entry)) throw new Error('Worklet entry already prepared');
  const sources = new Map<string, string>();
  let discovery = true;
  const plugin: Plugin = {
    name: 'admitted-worklet-graph',
    resolveId(source, importer) {
      if (!/^(?:\.?\.?\/|\/|[A-Za-z][A-Za-z\d+.-]*:)/.test(source))
        throw new Error('Bare worklet imports are not supported');
      const id = new URL(source, importer || options.entry).href;
      const local = external.get(id);
      return local ? { id: local, external: true } : id;
    },
    async load(id) {
      const known = sources.get(id);
      if (known !== undefined) return known;
      if (!discovery) throw new Error('Worklet static graph changed during compilation');
      const code: unknown = await options.readModule(id);
      if (typeof code !== 'string') throw new Error('Worklet source is unavailable');
      sources.set(id, code);
      return code;
    },
  };
  const first = await compiler({
    input: options.entry,
    treeshake: false,
    preserveEntrySignatures: 'strict',
    plugins: [plugin],
  });
  try {
    // Give every discovered module a facade. A later entry can import an existing
    // facade rather than evaluating another copy of its shared dependencies.
    discovery = false;
    const bundle = await compiler({
      input: [...sources.keys()],
      cache: first.cache,
      treeshake: false,
      preserveEntrySignatures: 'strict',
      plugins: [plugin],
    });
    try {
      const generated = await bundle.generate({ format: 'es', generatedCode: 'es2015' });
      const chunks: WorkletChunk[] = [];
      const facades: WorkletGraph['facades'] = [];
      const names = new Set(generated.output.map((item) => item.fileName));
      const externalURLs = new Set(external.values());
      for (const item of generated.output) {
        if (item.type !== 'chunk' || item.dynamicImports.length)
          throw new Error('Unsupported worklet compiler output');
        if (item.facadeModuleId)
          facades.push({ module: item.facadeModuleId, chunk: item.fileName });
        const imports: WorkletChunkImport[] = [];
        for (const reference of parse(item.code)[0]) {
          if (reference.type !== 'static' || !reference.specifier)
            throw new Error('Unexpected worklet import syntax');
          const isExternal = externalURLs.has(reference.specifier);
          const target = isExternal
            ? reference.specifier
            : new URL(
                reference.specifier,
                'https://worklet.invalid/' + item.fileName,
              ).pathname.slice(1);
          if (!isExternal && !names.has(target))
            throw new Error('Worklet compiler emitted an unknown dependency');
          imports.push({
            start: reference.start - 1,
            end: reference.end + 1,
            target,
            external: isExternal,
          });
        }
        chunks.push({ name: item.fileName, code: item.code, imports });
      }
      if (
        facades.length !== sources.size ||
        [...sources.keys()].some((id) => !facades.some((item) => item.module === id))
      )
        throw new Error('Worklet compiler omitted a module facade');
      return { entry: options.entry, chunks, facades };
    } finally {
      await bundle.close();
    }
  } finally {
    await first.close();
  }
}
