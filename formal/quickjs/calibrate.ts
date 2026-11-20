import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gillianImage, verifyFixture } from '../runtime-verification/gillian.ts';

const root = resolve(import.meta.dirname, '../..');
const directory = resolve(root, '.tools/quickjs-proof/calibration');
const output = resolve(root, 'results/quickjs-confinement/calibration.json');
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const revision = '469aa5c134ba7790c40669bd4bc50483aff36d7b';
const sourceURL =
  `https://raw.githubusercontent.com/GillianPlatform/Gillian/${revision}/` +
  'Gillian-JS/Examples/JaVerT/IDGen.js';
const expected = '32b1829ee190fbf535ab2d4748f1567e039e796fa18e9effeafc2c17651cf308';
await mkdir(directory, { recursive: true });
const cached = resolve(directory, 'upstream-idgen.js');
let source: string;
try {
  source = await readFile(cached, 'utf8');
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
    throw error;
  const response = await fetch(sourceURL, { signal: AbortSignal.timeout(30_000) });
  assert(response.ok, 'Pinned calibration source is unavailable');
  source = await response.text();
  assert.equal(hash(source), expected, 'Calibration source changed');
  await writeFile(cached, source);
}
assert.equal(hash(source), expected);
assert.equal(source.split('count++').length, 2, 'Calibration fault anchor changed');
const procedures = ['getId', 'reset', 'makeIdGen'];
const results = [
  await verifyFixture({ directory, name: 'closure', code: source, procedures }),
  await verifyFixture({
    directory,
    name: 'missing-increment',
    code: source.replace('count++', 'count'),
    procedures,
    failedProcedure: 'getId',
  }),
];
await mkdir(resolve(root, 'results/quickjs-confinement'), { recursive: true });
await writeFile(
  output,
  JSON.stringify(
    {
      scope: 'Fresh verifier calibration, not verification of the QuickJS runtime.',
      mode: 'verify',
      image: gillianImage,
      upstreamRevision: revision,
      sourceURL,
      sourceSHA256: expected,
      runnerSHA256: hash(await readFile(import.meta.filename, 'utf8')),
      results,
      completed: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Gillian calibration passed; removing the increment fails its postcondition.',
);
