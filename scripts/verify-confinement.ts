import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const root = resolve(import.meta.dirname, '..');
const directory = resolve(root, 'results/quickjs-confinement/component-verification');
const scope = 'Component checks only; not complete confinement or release qualification.';
const execute = promisify(execFile);
const sha = (value: Uint8Array | string) =>
  createHash('sha256').update(value).digest('hex');

interface Check {
  name: string;
  runner: string;
  receipt: string;
}

// Each driver checks named contracts and its own negative controls. This list
// does not claim complete policy coverage or application/release qualification.
const checks: readonly Check[] = [
  { name: 'calibration', runner: 'calibrate.ts', receipt: 'calibration.json' },
  {
    name: 'identity',
    runner: 'identity-check.ts',
    receipt: 'identity-implementation.json',
  },
  { name: 'identity-model', runner: 'check-identity.py', receipt: 'identity-model.json' },
  {
    name: 'management',
    runner: 'management-authority-check.ts',
    receipt: 'management-authority-implementation.json',
  },
  {
    name: 'management-composition',
    runner: 'management-composition/check.ts',
    receipt: 'management-composition/result.json',
  },
  {
    name: 'resource-publication',
    runner: 'resource-publication/check.ts',
    receipt: 'resource-publication/model.json',
  },
  {
    name: 'publication',
    runner: 'context-publication-check.ts',
    receipt: 'context-publication-implementation.json',
  },
  {
    name: 'publication-model',
    runner: 'context-publication-lean.py',
    receipt: 'context-publication-lean.json',
  },
  { name: 'wasm-modules', runner: 'wasm/check.ts', receipt: 'wasm-authority.json' },
  {
    name: 'wasm-bounds',
    runner: 'wasm/check-bounds.py',
    receipt: 'wasm-authority-bounds.json',
  },
  {
    name: 'wasm-records',
    runner: 'wasm/check-records.py',
    receipt: 'wasm-authority-records.json',
  },
  {
    name: 'wasm-branches',
    runner: 'wasm/check-fastpaths.py',
    receipt: 'wasm-authority-fastpaths.json',
  },
  {
    name: 'wasm-invalidation',
    runner: 'wasm/check-invalidation.ts',
    receipt: 'wasm-authority-invalidation.json',
  },
  {
    name: 'engine-lifetime',
    runner: 'wasm/check-engine-lifetime.ts',
    receipt: 'wasm-authority-engine-lifetime.json',
  },
  { name: 'worklets', runner: 'worklets/check.ts', receipt: 'worklets.json' },
];

async function inputs(): Promise<Record<string, string>> {
  const paths = execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      'src',
      'scripts',
      'test',
      'formal',
      'vendor',
      'patches',
      'deployment',
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'REPORT.md',
      'publisher-source-ref.txt',
      '.github/workflows',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  const files = [
    ...new Set([
      ...paths.split('\0').filter(Boolean),
      'vendor/quickjs/generated/engine.wasm',
      'vendor/quickjs/generated/engine.mjs',
      'vendor/quickjs/generated/build.json',
    ]),
  ].sort();
  return Object.fromEntries(
    await Promise.all(
      files.map(async (path) => [path, sha(await readFile(resolve(root, path)))]),
    ),
  );
}

await mkdir(directory, { recursive: true });
const summary = resolve(directory, 'result.json');
await writeFile(
  summary,
  JSON.stringify(
    {
      scope,
      passed: false,
      started: new Date().toISOString(),
      expectedChecks: checks.map((check) => check.name),
      checks: [],
      failedCheck: 'input-collection',
    },
    null,
    2,
  ) + '\n',
);
const before = await inputs();
const results: {
  name: string;
  receipt: string;
  receiptSHA256: string;
  logSHA256: string;
}[] = [];
let passed = false;
let currentCheck: string | undefined;
try {
  for (const check of checks) {
    currentCheck = check.name;
    const receipt = resolve(root, 'results/quickjs-confinement', check.receipt);
    // A stale receipt cannot satisfy a fresh invocation that fails to write one.
    await rm(receipt, { force: true });
    const runner = resolve(root, 'formal/quickjs', check.runner);
    const python = runner.endsWith('.py');
    const command = python ? 'python3' : process.execPath;
    const args = python ? [runner] : ['--import', 'tsx', runner];
    console.log(`Checking ${check.name}`);
    let log: string;
    try {
      const run = await execute(command, args, {
        cwd: root,
        timeout: 20 * 60_000,
        maxBuffer: 16 * 1024 * 1024,
      });
      log = run.stdout + run.stderr;
    } catch (error) {
      // Keep the actual failed invocation; never replace it with an old success.
      const output =
        error instanceof Error && 'stdout' in error && 'stderr' in error
          ? String(error.stdout) + String(error.stderr)
          : String(error);
      await writeFile(resolve(directory, check.name + '.log'), output);
      throw error;
    }
    await writeFile(resolve(directory, check.name + '.log'), log);
    const bytes = await readFile(receipt);
    const parsed: unknown = JSON.parse(bytes.toString());
    assert(parsed !== null && typeof parsed === 'object', 'Missing component receipt');
    results.push({
      name: check.name,
      receipt: check.receipt,
      receiptSHA256: sha(bytes),
      logSHA256: sha(log),
    });
  }
  currentCheck = 'input-stability';
  assert.deepEqual(await inputs(), before, 'Verification inputs changed during the run');
  passed = true;
} finally {
  await writeFile(
    summary,
    JSON.stringify(
      {
        scope,
        passed,
        completed: new Date().toISOString(),
        node: process.version,
        expectedChecks: checks.map((check) => check.name),
        ...(passed ? {} : { failedCheck: currentCheck }),
        inputHashes: before,
        checks: results,
      },
      null,
      2,
    ) + '\n',
  );
}
console.log(`${results.length} component drivers passed on unchanged inputs.`);
