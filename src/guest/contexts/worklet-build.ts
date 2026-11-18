import type { Plugin } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Adapt the pinned trusted loader; guest application source is never rewritten. */
export function guestWorkletLoaderPlugin(root: string): Plugin {
  const decoder = resolve(root, 'src/guest/contexts/utf8.ts');
  return {
    name: 'guest-worklet-loader',
    setup(build) {
      build.onLoad(
        {
          filter: /quickjs-wasmfile-release-sync\/dist\/emscripten-module\.browser\.mjs$/,
        },
        async ({ path }) => {
          const source = await readFile(path, 'utf8');
          const matches = source.match(/new TextDecoder\b/g);
          if (matches?.length !== 1)
            throw new Error('QuickJS worklet loader changed its decoder initialization');
          return {
            contents:
              `import { EngineTextDecoder } from ${JSON.stringify(decoder)};\n` +
              source.replace(/new TextDecoder\b/, 'new EngineTextDecoder'),
            loader: 'js',
            resolveDir: resolve(path, '..'),
          };
        },
      );
    },
  };
}
