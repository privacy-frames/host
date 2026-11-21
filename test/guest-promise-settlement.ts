/** Bundle actual production engine source; fault controls exist only in temporary bundles. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { build } from 'esbuild';

const execute = promisify(execFile);
const root = new URL('../', import.meta.url);
const enginePath = new URL('src/guest/engine.ts', root).pathname;
const fixture = new URL('test/guest-promise-settlement.fixture.ts', root).pathname;
const receipt = new URL('results/quickjs-confinement/promise-settlement/node.json', root);
const source = await readFile(enginePath, 'utf8');
const hash = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const conversion = `            if (this.closed) return;
            encoded = this.exception(error);
            rejected = true;`;
assert.equal(source.split(conversion).length, 2);
const rejectConversion = `        } catch (failure) {
          rejectPromise(this.promiseFailure(failure));
        } finally {`;
assert.equal(source.split(rejectConversion).length, 2);
const reporting = '.catch((error: unknown) => this.reportPromiseFailure(error));';
assert.equal(source.split(reporting).length, 3);
const setupCleanup = `      } catch (error) {
        rejectPromise(this.promiseFailure(error));
        this.pendingPromises.delete(rejectPromise);
        throw error;
      } finally {`;
assert.equal(source.split(setupCleanup).length, 2);
const adoption = 'new Promise<unknown>((resolve) => resolve(value))';
assert.equal(source.split(adoption).length, 2);
const cases = [
  { name: 'production', source },
  {
    name: 'missing-private-adoption',
    source: source.replace(adoption, 'Promise.resolve(value)'),
    failure: 'host constructor failure must be adopted as rejection',
  },
  {
    name: 'missing-guest-setup-cleanup',
    source: source.replace(
      setupCleanup,
      '      } catch (error) { throw error; } finally {',
    ),
    failure: 'failed observer setup must remove its native waiter',
  },
  {
    name: 'missing-native-conversion-rejection',
    source: source.replace(conversion, '          throw error;'),
    failure: 'native conversion failure must reject the guest promise once',
  },
  {
    name: 'missing-guest-rejection-conversion',
    source: source.replace(
      rejectConversion,
      '        } catch (failure) { throw failure; } finally {',
    ),
    failure: 'guest conversion failure must reject the native promise',
  },
  {
    name: 'missing-host-rejection-observer',
    source: source.replace(reporting, ';'),
    failure: 'entry failure remains primary over cleanup failure',
  },
];
const extraInputs = [
  'vendor/quickjs/generated/engine.wasm',
  'vendor/quickjs/generated/build.json',
  'test/guest-promise-settlement.ts',
  'package-lock.json',
];
const extraBefore = new Map<string, string>();
for (const path of extraInputs)
  extraBefore.set(path, hash(await readFile(new URL(path, root))));
const nodeHash = hash(await readFile(process.execPath));
const directory = await mkdtemp(join(tmpdir(), 'pf-promise-settlement-'));
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
        env: { ...process.env, PF_PROMISE_PROJECT: root.pathname },
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
      assert.equal(result.observations.length, 12);
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
  for (const path of extraInputs) {
    const current = hash(await readFile(new URL(path, root)));
    assert.equal(current, extraBefore.get(path), 'fixture runtime input remains stable');
    inputs[path] = current;
  }
  assert.equal(hash(await readFile(process.execPath)), nodeHash);
  await mkdir(new URL('.', receipt), { recursive: true });
  await writeFile(
    receipt,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        scope:
          'Actual engine promise conversion, rejection observation, close and deferred cleanup',
        node: {
          version: process.version,
          executable: process.execPath,
          sha256: nodeHash,
        },
        sourceHashes: inputs,
        observations,
        conversionContract: [
          'Native Promise/thenable adoption uses one private ordinary native Promise after caching the guest identity; source lookup failures become asynchronous rejection',
          'Guest observer setup failure rejects its private native waiter, removes it from pending cleanup and rethrows the primary conversion error',
          'A conversion failure during an admitted native settlement rejects through the existing mediated exception path',
          'Async failure reporting observes the primary error even when a reporter throws; no secondary unobserved reporting chain is created',
        ],
        remainingPremises: [
          'esbuild, the SDK and C-to-Wasm compilation are trusted',
          'The fixture uses an explicit trusted local Host and controlled host-object faults; it does not qualify GenericBrowser producers, arbitrary native objects or application compatibility',
          'All guest application execution uses engine-owned entry/job/Wasm paths; raw public SDK context calls are outside this contract',
          'The probes check selected actual synchronous and asynchronous paths, not an inductive proof of every caller history',
          'A live pre-action entry failure is reported and retains deferred roots until terminal cleanup; it does not promise guest settlement',
          'Pinned SDK deferred disposal is idempotent, including after reentrant terminal cleanup',
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
  'Twelve actual promise settlement cases passed and five omission controls failed as intended.',
);
