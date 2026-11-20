import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const directory = resolve(root, '.tools/quickjs-proof/worklets');
const receipt = resolve(root, 'results/quickjs-confinement/worklets.json');
const browser = process.argv.includes('--browser');
const inputs = [
  'src/guest/contexts/audio-worklet.ts',
  'src/guest/contexts/worklet-entry.ts',
  'src/guest/contexts/worklet-runtime.ts',
  'src/guest/contexts/lifecycle-kernel.ts',
  'src/guest/contexts/processor-name.ts',
  'src/guest/identity.ts',
  'test/guest-audio-worklet.test.ts',
  'test/guest-worklet-bootstrap.test.ts',
  'test/guest-worklet-runtime.test.ts',
];
const tests = inputs.filter((path) => path.endsWith('.test.ts'));
const sha = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex');
async function snapshot(paths: readonly string[]) {
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [path, sha(await readFile(resolve(root, path)))]),
    ),
  );
}
function run(name: string, args: string[]) {
  const output = execFileSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return writeFile(resolve(directory, name + '.log'), output).then(() => output);
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
await mkdir(directory, { recursive: true });
const before = await snapshot(inputs);
const output = await run('unit', [
  '--import',
  'tsx',
  '--test',
  '--test-reporter=tap',
  ...tests,
]);
assert.match(output, /\n# tests 12\n/);
assert.match(output, /\n# pass 12\n/);
assert.match(output, /\n# fail 0\n/);
const browserObservations: Record<string, unknown>[] = [];
let artifacts: Record<string, string> = {};
if (browser) {
  await run('browser', ['--import', 'tsx', 'test/guest-contexts.ts']);
  const result: unknown = JSON.parse(
    await readFile(resolve(root, 'results/guest-contexts.json'), 'utf8'),
  );
  assert(record(result) && Array.isArray(result.receipts));
  const rows: unknown[] = result.receipts;
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert(
      record(row) && typeof row.browser === 'string' && typeof row.version === 'string',
    );
    assert(record(row.observation) && record(row.observation.result));
    const audio = row.observation.result;
    assert.equal(audio.sample, 0.25);
    assert.equal(audio.nativePortDetached, true);
    assert.deepEqual(audio.workletMessages, [
      { bytes: [4, 4] },
      { detached: true, wasm: 'object' },
    ]);
    browserObservations.push({
      browser: row.browser,
      version: row.version,
      sample: audio.sample,
      messages: audio.workletMessages,
      nativePortDetached: audio.nativePortDetached,
    });
  }
  assert.deepEqual(browserObservations.map((row) => row.browser).sort(), [
    'chromium',
    'firefox',
  ]);
  artifacts = await snapshot([
    '.tools/guest-context-test/browser.js',
    '.tools/guest-context-test/worklet.js',
    '.tools/guest-context-test/worker.js',
    '.tools/guest-context-test/registry.js',
    'vendor/quickjs/generated/engine.wasm',
  ]);
}
assert.deepEqual(
  await snapshot(inputs),
  before,
  'Worklet contract inputs changed during verification',
);
await mkdir(resolve(root, 'results/quickjs-confinement'), { recursive: true });
await writeFile(
  receipt,
  JSON.stringify(
    {
      scope:
        'Controlled tests of actual audio-worklet source and helper bookkeeping; ' +
        'selected browser integration when requested. Not a complete worklet confinement proof.',
      sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      node: process.version,
      sourceHashes: before,
      runnerSHA256: sha(await readFile(import.meta.filename)),
      unit: {
        tests: 12,
        passed: 12,
        failed: 0,
        outputSHA256: sha(output),
        actualLateCloseGuardRemovalDetected: true,
      },
      browser: { checked: browser, observations: browserObservations, artifacts },
      remaining: [
        'Native worklet host operation mediation.',
        'Caller ownership/private-port authentication and browser worklet/message lifetime contracts.',
        'Composition with the verified shared publication kernel and the full guest boundary.',
      ],
      completed: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Worklet contract tests passed; browser integration ${browser ? 'passed' : 'not requested'}.`,
);
