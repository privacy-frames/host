import { build, type Plugin } from 'esbuild';
import { resolve } from 'node:path';

/** Build trusted code as data; it executes only in the private computation context. */
export async function trustedPolicyPlugin(
  root: string,
  workerPlugins: Plugin[] = [],
): Promise<Plugin> {
  // The worker embeds this same source in descendants. The initial compilation
  // leaves that binding in the enclosing trusted Blob wrapper, avoiding recursion.
  const worker = await build({
    entryPoints: [resolve(root, 'src/runtime/contexts/worker-guard.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    plugins: [
      ...workerPlugins,
      {
        name: 'worker-source-binding',
        setup(builder) {
          builder.onResolve({ filter: /^trusted:worker-source$/ }, () => ({
            path: 'worker',
            namespace: 'worker-source-binding',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'worker-source-binding' }, () => ({
            contents: 'export default __privacyWorkerBootstrapSource;',
            loader: 'js',
          }));
        },
      },
    ],
  });
  const workerSource = worker.outputFiles[0].text;
  const result = await build({
    entryPoints: [resolve(root, 'src/runtime/trusted/entry.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: '__trustedPolicy',
    target: 'es2022',
    banner: { js: '"use strict";' },
  });
  const source = `(() => {${result.outputFiles[0].text}\nreturn __trustedPolicy.dispatch;})()`;
  return {
    name: 'trusted-policy-source',
    setup(builder) {
      builder.onResolve({ filter: /^trusted:policy-source$/ }, () => ({
        path: 'source',
        namespace: 'trusted-policy',
      }));
      builder.onLoad({ filter: /.*/, namespace: 'trusted-policy' }, () => ({
        contents: `export default ${JSON.stringify(source)};`,
        loader: 'js',
      }));
      builder.onResolve({ filter: /^trusted:worker-source$/ }, () => ({
        path: 'worker',
        namespace: 'trusted-worker',
      }));
      builder.onLoad({ filter: /.*/, namespace: 'trusted-worker' }, () => ({
        contents: `export default ${JSON.stringify(workerSource)};`,
        loader: 'js',
      }));
    },
  };
}
