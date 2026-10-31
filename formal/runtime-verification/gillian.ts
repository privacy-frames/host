import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const gillianImage =
  'ghcr.io/gillianplatform/gillian@sha256:ce41de968aba0964774e1929416ce60b9c3b770d2e58f96e63990b629cfe2ed6';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

interface Fixture {
  directory: string;
  name: string;
  code: string;
  procedures: readonly string[];
  failedProcedure?: string;
}

/** Validate named contracts and every path marker, rather than a summary alone. */
export function checkVerificationReport(
  output: string,
  procedures: readonly string[],
  failedProcedure?: string,
) {
  assert(procedures.length > 0, 'A successful zero-contract run is not verification');
  assert.equal(
    new Set(procedures).size,
    procedures.length,
    'Duplicate expected procedure',
  );
  assert(!failedProcedure || procedures.includes(failedProcedure));
  const lines = output.split(/\r?\n/);
  const totals = lines.filter((line) =>
    /^Obtained \d+ symbolic tests in total$/.test(line),
  );
  assert.deepEqual(
    totals,
    [`Obtained ${procedures.length} symbolic tests in total`],
    'Wrong number of procedure contracts checked',
  );
  const prefix = 'Verifying one spec of procedure ';
  const reports = lines.filter((line) => line.startsWith(prefix));
  assert.equal(reports.length, procedures.length, 'Missing or extra procedure reports');
  const checked = procedures.map((procedure) => {
    const beginning = prefix + procedure + '... ';
    const matching = reports.filter((line) => line.startsWith(beginning));
    assert.equal(matching.length, 1, 'Missing or duplicate outcome for ' + procedure);
    const parsed = /^((?:[sf] )+)(Success|Failure)$/.exec(
      matching[0].slice(beginning.length),
    );
    assert(parsed, 'Malformed path outcome for ' + procedure);
    const paths = parsed[1].trim().split(' ');
    const failedPaths = paths.filter((path) => path === 'f').length;
    if (procedure === failedProcedure) {
      assert.equal(parsed[2], 'Failure', 'Expected failed contract: ' + procedure);
      assert(failedPaths > 0, 'Failed contract has no failing path: ' + procedure);
    } else {
      assert.equal(parsed[2], 'Success', 'Unexpected failed contract: ' + procedure);
      assert.equal(failedPaths, 0, 'Success report contains a failed path: ' + procedure);
    }
    return { procedure, paths: paths.length, failedPaths };
  });
  const summaries = lines.filter((line) => line.startsWith('All specs succeeded:'));
  if (failedProcedure) {
    assert.match(output, /Couldn't satisfy postcondition/);
    assert.equal(summaries.length, 0, 'Failed report has a successful summary');
  } else assert.equal(summaries.length, 1, 'Missing or duplicate successful summary');
  return checked;
}

export async function verifyFixture(fixture: Fixture) {
  const { directory, name, code, procedures, failedProcedure } = fixture;
  assert(/^[a-z0-9-]+$/.test(name));
  assert(procedures.length > 0, 'A successful zero-contract run is not verification');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, name + '.js'), code);
  const container = `pf-deductive-${process.pid}-${name}`;
  const run = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--name',
      container,
      '--network',
      'none',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--user',
      `${process.getuid?.()}:${process.getgid?.()}`,
      '--mount',
      `type=bind,src=${directory},dst=/work`,
      '--workdir',
      '/work',
      gillianImage,
      'gillian-js',
      'verify',
      name + '.js',
      '--ci',
      '--logging',
      'normal',
      '--result-dir',
      '.gillian-' + name,
    ],
    { encoding: 'utf8', timeout: 180_000, maxBuffer: 4 * 1024 * 1024 },
  );
  if (run.error) {
    spawnSync('docker', ['rm', '--force', container], { encoding: 'utf8' });
    throw run.error;
  }
  const output = run.stdout + run.stderr;
  await writeFile(resolve(directory, name + '.log'), output);
  assert.equal(run.status, failedProcedure ? 1 : 0, output);
  const checkedProcedures = checkVerificationReport(output, procedures, failedProcedure);
  return {
    name,
    expectedSuccess: !failedProcedure,
    checkedProcedures,
    exitCode: run.status,
    inputSHA256: hash(code),
    driverSHA256: hash(await readFile(import.meta.filename, 'utf8')),
    outputSHA256: hash(output),
    outputSummary: output.trim(),
  };
}
