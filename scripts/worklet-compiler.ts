import type { Plugin } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Bundle the pinned compiler and its parser bytes without a runtime URL fetch. */
export function workletCompilerPlugin(root: string): Plugin {
  const directory = resolve(root, 'node_modules/@rollup/browser');
  return {
    name: 'local-worklet-compiler',
    setup(builder) {
      builder.onResolve({ filter: /^trusted:worklet-compiler$/ }, () => ({
        path: 'compiler',
        namespace: 'local-worklet-compiler',
      }));
      builder.onLoad({ filter: /.*/, namespace: 'local-worklet-compiler' }, async () => {
        const source = await readFile(
          resolve(directory, 'dist/es/rollup.browser.js'),
          'utf8',
        );
        const license = await readFile(resolve(directory, 'LICENSE.md'), 'utf8');
        const address = 'new URL("bindings_wasm_bg.wasm",import.meta.url)';
        const binding = '__privacyCompilerParserBytes';
        if (source.split(address).length !== 2 || source.includes(binding))
          throw new Error('The pinned worklet compiler initialization has changed');
        return {
          contents:
            `/*!\n${license}\n*/\nimport ${binding} from 'trusted:worklet-compiler-wasm';\n` +
            source.replace(address, binding),
          loader: 'js',
        };
      });
      builder.onResolve({ filter: /^trusted:worklet-compiler-wasm$/ }, () => ({
        path: 'parser',
        namespace: 'local-worklet-parser',
      }));
      builder.onLoad({ filter: /.*/, namespace: 'local-worklet-parser' }, async () => ({
        contents: await readFile(resolve(directory, 'dist/es/bindings_wasm_bg.wasm')),
        loader: 'binary',
      }));
    },
  };
}
