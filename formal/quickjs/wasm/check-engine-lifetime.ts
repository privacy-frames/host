/** Bundle actual production engine source; fault controls exist only in temporary bundles. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { build } from 'esbuild';

const execute = promisify(execFile);
const root = new URL('../../../', import.meta.url);
const enginePath = new URL('src/guest/engine.ts', root).pathname;
const fixture = new URL('test/guest-engine-lifetime.fixture.ts', root).pathname;
const receipt = new URL(
  'results/quickjs-confinement/wasm-authority-engine-lifetime.json',
  root,
);
const source = await readFile(enginePath, 'utf8');
const hash = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const idle = '    if (this.depth || this.pumping || this.wasmDepth) return;';
assert.equal(source.split(idle).length, 2);
const bindStart = source.indexOf('  bind(name: string, target: object');
const bindEnd = source.indexOf('\n  call(', bindStart);
assert(bindStart >= 0 && bindEnd > bindStart);
const bind = source.slice(bindStart, bindEnd);
assert.equal(bind.split('this.assertOpen();').length, 3);
const bindingControl =
  source.slice(0, bindStart) +
  bind.replaceAll('this.assertOpen();', '') +
  source.slice(bindEnd);
const jobCleanup = `        } finally {
          jobs.error.dispose();
        }`;
assert.equal(source.split(jobCleanup).length, 2);
const setStart = source.indexOf('  set(name: string, value: unknown): void {');
const setEnd = source.indexOf('\n  /** Install a dynamic native property', setStart);
assert(setStart >= 0 && setEnd > setStart);
const set = source.slice(setStart, setEnd);
assert.equal(set.split('this.enter(() => {').length, 2);
assert(set.endsWith('    });\n  }\n'));
const setControl =
  source.slice(0, setStart) +
  set
    .replace('this.enter(() => {', '(() => {')
    .replace('    });\n  }\n', '    })();\n  }\n') +
  source.slice(setEnd);
const cases = [
  { name: 'production', source },
  {
    name: 'eager-cleanup',
    source: source.replace(idle, ''),
    failure: 'physical indexed release waits for every engine-owned stack',
  },
  {
    name: 'missing-terminal-bind-guards',
    source: bindingControl,
    failure: 'bound native operations are denied after logical close',
  },
  {
    name: 'missing-set-entry',
    source: setControl,
    failure: 'physical indexed release waits for every engine-owned stack',
  },
  {
    name: 'missing-job-error-release',
    source: source.replace(jobCleanup, '        } finally {}'),
    failure: 'failed job error conversion releases its SDK root',
  },
];
const directory = await mkdtemp(join(tmpdir(), 'pf-engine-lifetime-'));
const observations = [];
try {
  const allInputs = new Set<string>();
  const before = new Map<string, string>();
  for (const item of cases) {
    const outfile = join(directory, item.name + '.mjs');
    const bundled = await build({
      absWorkingDir: root.pathname,
      entryPoints: [fixture],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'es2022',
      metafile: true,
      plugins: [
        {
          name: 'scoped-engine-source',
          setup(builder) {
            builder.onLoad({ filter: /\.(?:ts|mjs|js)$/ }, async (args) => {
              const bytes = await readFile(args.path, 'utf8');
              const actual = args.path === enginePath ? source : bytes;
              if (args.path === enginePath) assert.equal(bytes, source);
              const current = hash(actual);
              if (before.has(args.path))
                assert.equal(
                  current,
                  before.get(args.path),
                  'loaded input remains stable',
                );
              before.set(args.path, current);
              return {
                contents: args.path === enginePath ? item.source : bytes,
                loader: args.path.endsWith('.ts') ? 'ts' : 'js',
                resolveDir: dirname(args.path),
              };
            });
          },
        },
      ],
    });
    for (const path of Object.keys(bundled.metafile.inputs)) {
      const absolute = resolve(root.pathname, path);
      allInputs.add(absolute);
      const current = hash(await readFile(absolute));
      if (before.has(absolute))
        assert.equal(current, before.get(absolute), 'bundled input is stable');
      before.set(absolute, current);
    }
    let stdout = '',
      stderr = '',
      failed = false;
    try {
      const result = await execute(process.execPath, [outfile], {
        env: { ...process.env, PF_LIFETIME_PROJECT: root.pathname },
        timeout: 30000,
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error) {
      assert(
        error && typeof error === 'object' && 'stdout' in error && 'stderr' in error,
      );
      stdout = String(error.stdout);
      stderr = String(error.stderr);
      failed = true;
    }
    if (item.failure) {
      assert(failed, item.name + ': control must fail');
      assert(
        (stdout + stderr).includes(item.failure),
        item.name + ': intended lifetime assertion must fail\n' + stdout + stderr,
      );
    } else {
      assert(!failed, stdout + stderr);
      assert.equal(stderr, '');
      const result = JSON.parse(stdout.trim());
      assert.equal(result.observations.length, 7);
    }
    observations.push({
      name: item.name,
      sourceHash: hash(item.source),
      bundleHash: hash(await readFile(outfile)),
      failed,
      expectedFailure: item.failure,
      stdout,
      stderr,
    });
  }
  const inputs: Record<string, string> = {};
  for (const path of allInputs) {
    const current = hash(await readFile(path));
    assert.equal(current, before.get(path), 'bundled source remains stable');
    const dependency = path.indexOf('/node_modules/');
    const label = path.startsWith(root.pathname)
      ? path.slice(root.pathname.length)
      : dependency >= 0
        ? path.slice(dependency + 1)
        : path;
    inputs[label] = current;
  }
  for (const path of [
    'vendor/quickjs/generated/engine.wasm',
    'vendor/quickjs/generated/build.json',
    'test/fixtures/wasm/memory.wasm',
    'formal/quickjs/wasm/check-engine-lifetime.ts',
    'package-lock.json',
  ]) {
    inputs[path] = hash(await readFile(new URL(path, root)));
  }
  await writeFile(
    receipt,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        scope:
          'Actual engine SDK-stack quiescence, terminal native bindings and failed-job root release',
        node: process.version,
        sourceHashes: inputs,
        observations,
        remainingPremises: [
          'esbuild, the SDK and C-to-Wasm compilation are trusted',
          'All guest application execution uses engine-owned entry/job/Wasm paths; raw public SDK context calls are outside this contract',
          'The probes check selected actual synchronous and asynchronous paths, not an inductive proof of every caller history',
        ],
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log(
  'Seven actual engine lifecycle cases passed; eager release, terminal binding, set-entry and job-root controls failed as intended.',
);
