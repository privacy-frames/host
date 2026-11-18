import assert from 'node:assert/strict';
import { build, type Plugin } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
type Projection = 'full' | 'runtime';

const projectionControl = (projection: Projection): Plugin => ({
  name: 'binding-projection-control',
  setup(build) {
    build.onResolve({ filter: /^\.\/(?:runtime-)?interfaces\.ts$/ }, (args) =>
      args.importer.endsWith('/src/guest/browser.ts')
        ? {
            path: resolve(
              root,
              'src/guest',
              projection === 'full' ? 'interfaces.ts' : 'runtime-interfaces.ts',
            ),
          }
        : undefined,
    );
  },
});

const observations = [];
for (const entry of ['window', 'worker-entry', 'shared-worker-entry']) {
  const variants = [];
  for (const projection of ['full', 'runtime'] as const) {
    const bundle = await build({
      entryPoints: [resolve(root, 'src/guest', entry + '.ts')],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      define: {
        __BUILD_ID__: '"projection-comparison"',
        'process.env.NODE_ENV': '"production"',
      },
      metafile: true,
      plugins: [projectionControl(projection)],
    });
    const code = bundle.outputFiles[0].contents;
    const inputs = Object.keys(bundle.metafile.inputs);
    variants.push({
      projection,
      bytes: code.byteLength,
      sha256: createHash('sha256').update(code).digest('hex'),
      fullMetadataIncluded: inputs.some((input) =>
        input.endsWith('generated-interfaces.ts'),
      ),
      runtimeMetadataIncluded: inputs.some((input) =>
        input.endsWith('generated-runtime-interfaces.ts'),
      ),
    });
  }
  const [full, runtime] = variants;
  assert(full.fullMetadataIncluded && !full.runtimeMetadataIncluded);
  assert(!runtime.fullMetadataIncluded && runtime.runtimeMetadataIncluded);
  assert(
    runtime.bytes < full.bytes / 2,
    'Detailed conversion metadata must not dominate runtime entries',
  );
  observations.push({ entry, variants, reduction: 1 - runtime.bytes / full.bytes });
}
const receipt = { completed: new Date().toISOString(), observations };
console.log(JSON.stringify(receipt, null, 2));
await mkdir(resolve(root, 'results/guest-runtime'), { recursive: true });
await writeFile(
  resolve(root, 'results/guest-runtime/interface-projection.json'),
  JSON.stringify(receipt, null, 2) + '\n',
);
