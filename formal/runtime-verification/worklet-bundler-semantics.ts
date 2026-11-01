import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { build, version as compilerVersion } from 'esbuild';
import { chromium, firefox } from 'playwright';
import { launch } from '../../test/browser-profile.ts';
import { testProvenance } from '../../test/provenance.ts';

// A compatibility calibration, not a production compiler or confinement test.
// Native ESM must reject this cyclic access before its binding is initialized.
const graph: Record<string, string> = {
  '/entry.js': `import {a} from './a.js';
globalThis.fixtureAnswer=a;
registerProcessor('probe',class extends AudioWorkletProcessor {
  process(inputs,outputs){outputs[0][0].fill(0.19);return false;}
});`,
  '/a.js': "import {b} from './b.js'; export let a=b;",
  '/b.js': "import {a} from './a.js'; export let b=a;",
};
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const before = await testProvenance(import.meta.url);
const runnerBefore = digest(await readFile(new URL(import.meta.url), 'utf8'));
const compiled = (
  await build({
    entryPoints: ['/entry.js'],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'esnext',
    plugins: [
      {
        name: 'owned-graph',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) => ({
            path: new URL(args.path, 'https://fixture.invalid' + (args.importer || '/'))
              .pathname,
            namespace: 'fixture',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => {
            const source = graph[args.path];
            if (typeof source !== 'string') throw new Error('Unknown fixture module');
            return { contents: source, loader: 'js' };
          });
        },
      },
    ],
  })
).outputFiles[0].text;
const rollupVersion = '4.67.4';
const rollupIntegrity =
  'PLPrwhHGCYCKIbpdPY1CfvPTMtrC/yX5rl/Q+P0wD1GfEnxUlAW8opUQRh6As268fNp9lxCZsn1Qa5psBGratA==';
const directory = new URL(
  '../../.tools/runtime-verification/rollup-browser/',
  import.meta.url,
);
await mkdir(directory, { recursive: true });
const archive = await fetch(
  `https://registry.npmjs.org/@rollup/browser/-/browser-${rollupVersion}.tgz`,
);
assert(archive.ok, 'Pinned browser compiler is unavailable');
const bytes = Buffer.from(await archive.arrayBuffer());
assert.equal(createHash('sha512').update(bytes).digest('base64'), rollupIntegrity);
const archivePath = new URL('package.tgz', directory);
await writeFile(archivePath, bytes);
execFileSync('tar', [
  '-xzf',
  archivePath.pathname,
  '--strip-components=1',
  '-C',
  directory.pathname,
]);
const rollupPath = new URL('dist/es/rollup.browser.js', directory);
const wasmPath = new URL('dist/es/bindings_wasm_bg.wasm', directory);
const browserCompiler: unknown = await import(rollupPath.href);
assert(
  browserCompiler &&
    typeof browserCompiler === 'object' &&
    'rollup' in browserCompiler &&
    typeof browserCompiler.rollup === 'function',
);
// The assessment executes the browser distribution in Node. Supply only its
// pinned local WASM bytes; no application code executes in this compiler process.
const nativeFetch = globalThis.fetch;
let rollupCompiled: string;
try {
  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== wasmPath.href) throw new Error('Unexpected compiler request');
    return new Response(new Uint8Array(await readFile(wasmPath)), {
      headers: { 'Content-Type': 'application/wasm' },
    });
  };
  const bundle: unknown = await browserCompiler.rollup({
    input: '/entry.js',
    treeshake: false,
    plugins: [
      {
        name: 'owned-graph',
        resolveId(source: string, importer?: string) {
          return new URL(source, 'https://fixture.invalid' + (importer || '/')).pathname;
        },
        load(id: string) {
          if (!Object.hasOwn(graph, id)) throw new Error('Unknown compiler input');
          return graph[id];
        },
      },
    ],
  });
  assert(
    bundle &&
      typeof bundle === 'object' &&
      'generate' in bundle &&
      typeof bundle.generate === 'function' &&
      'close' in bundle &&
      typeof bundle.close === 'function',
  );
  try {
    const generated: unknown = await bundle.generate({
      format: 'es',
      generatedCode: 'es2015',
    });
    assert(
      generated &&
        typeof generated === 'object' &&
        'output' in generated &&
        Array.isArray(generated.output) &&
        generated.output.length === 1,
    );
    const chunk: unknown = generated.output[0];
    assert(
      chunk &&
        typeof chunk === 'object' &&
        'code' in chunk &&
        typeof chunk.code === 'string',
    );
    rollupCompiled = chunk.code;
  } finally {
    await bundle.close();
  }
} finally {
  globalThis.fetch = nativeFetch;
}
const requests: string[] = [];
const server = http.createServer((request, response) => {
  const path = new URL(request.url || '/', 'http://fixture.invalid').pathname;
  requests.push(path);
  response.setHeader('Cache-Control', 'no-store');
  if (path === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self' blob: 'unsafe-inline'",
    );
    response.end('<!doctype html><title>Worklet compiler calibration</title>');
  } else if (Object.hasOwn(graph, path)) {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(graph[path]);
  } else response.writeHead(404).end();
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;
const rows = [];
let completed = false;
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      for (const compiler of ['native', 'esbuild', 'rollup'] as const) {
        const context = await browser.newContext();
        try {
          const page = await context.newPage();
          await page.goto(origin);
          const baseline = requests.length;
          const result = await page.evaluate(
            async ({ bundled, compiled }) => {
              const audio = new OfflineAudioContext(1, 256, 44100);
              const blob = URL.createObjectURL(
                new Blob([compiled], { type: 'text/javascript' }),
              );
              try {
                await audio.audioWorklet.addModule(bundled ? blob : '/entry.js');
                const node = new AudioWorkletNode(audio, 'probe');
                node.connect(audio.destination);
                const rendered = await audio.startRendering();
                node.port.close();
                return { loaded: true, sample: rendered.getChannelData(0)[0], error: '' };
              } catch (error) {
                return { loaded: false, sample: 0, error: String(error) };
              } finally {
                URL.revokeObjectURL(blob);
              }
            },
            {
              bundled: compiler !== 'native',
              compiled: compiler === 'rollup' ? rollupCompiled : compiled,
            },
          );
          const traffic = requests.slice(baseline);
          rows.push({ name, version: browser.version(), compiler, result, traffic });
          // A detected mismatch completes this calibration, not compiler admission.
          assert.equal(result.loaded, compiler === 'esbuild');
          if (result.loaded) assert(Math.abs(result.sample - 0.19) < 0.00001);
          if (compiler !== 'native') {
            assert.deepEqual(traffic, []);
          } else assert.deepEqual([...traffic].sort(), Object.keys(graph).sort());
          console.log(`${name}: compiler=${compiler} loaded=${result.loaded}`);
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
  completed = true;
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const after = await testProvenance(import.meta.url);
  const runnerAfter = digest(await readFile(new URL(import.meta.url), 'utf8'));
  const sourceStable = before.sourceSHA256 === after.sourceSHA256;
  const artifactsStable =
    JSON.stringify(before.artifacts) === JSON.stringify(after.artifacts);
  const runnerStable = runnerBefore === runnerAfter;
  await writeFile(
    new URL('./worklet-bundler-semantics.json', import.meta.url),
    JSON.stringify(
      {
        scope:
          'Native cyclic lexical initialization compared with esbuild and the pinned Rollup browser distribution. This calibration records one semantic mismatch and one matching rejection; neither compiler is admitted to production.',
        completed: completed && sourceStable && artifactsStable && runnerStable,
        compilerAccepted: false,
        compilerVersion,
        graph,
        compiled,
        compiledSHA256: digest(compiled),
        rollup: {
          version: rollupVersion,
          integrity: rollupIntegrity,
          javascriptSHA256: digest(await readFile(rollupPath, 'utf8')),
          wasmSHA256: createHash('sha256')
            .update(await readFile(wasmPath))
            .digest('hex'),
          compiled: rollupCompiled,
          compiledSHA256: digest(rollupCompiled),
          environment:
            'Browser distribution executed in Node with pinned local WASM fetch; generated code executed in actual AudioWorklets',
        },
        before,
        after,
        runnerBefore,
        runnerAfter,
        sourceStable,
        artifactsStable,
        runnerStable,
        rows,
      },
      null,
      2,
    ) + '\n',
  );
  assert(sourceStable && artifactsStable && runnerStable);
}
