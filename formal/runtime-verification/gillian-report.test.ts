import assert from 'node:assert/strict';
import test from 'node:test';
import { checkVerificationReport } from './gillian.ts';

const summary = 'All specs succeeded: 0.1';
const one = (paths: string) =>
  `Obtained 1 symbolic tests in total\nVerifying one spec of procedure gate... ${paths}\n${summary}`;

test('all successful paths are required and counted', () => {
  assert.deepEqual(checkVerificationReport(one('s s s Success'), ['gate']), [
    { procedure: 'gate', paths: 3, failedPaths: 0 },
  ]);
});
test('a fault requires an actual failed path and postcondition diagnostic', () => {
  const report =
    one('s f Failure').replace('\n' + summary, '') + "\nCouldn't satisfy postcondition";
  assert.deepEqual(checkVerificationReport(report, ['gate'], 'gate'), [
    { procedure: 'gate', paths: 2, failedPaths: 1 },
  ]);
  assert.throws(() => checkVerificationReport(report + '\n' + summary, ['gate'], 'gate'));
  assert.throws(() => checkVerificationReport(one('s Failure'), ['gate'], 'gate'));
  assert.throws(() => checkVerificationReport(one('f Failure'), ['gate'], 'gate'));
});
test('a summary cannot replace named paths or establish zero-contract verification', () => {
  assert.throws(() => checkVerificationReport(summary, ['gate']));
  assert.throws(() =>
    checkVerificationReport('Obtained 0 symbolic tests in total\n' + summary, []),
  );
});
test('failed, unknown and contradictory path outcomes cannot be successful', () => {
  for (const paths of [
    'f Success',
    's f Success',
    'e Success',
    'Success',
    's Failure',
    's Success extra',
  ])
    assert.throws(() => checkVerificationReport(one(paths), ['gate']));
});
test('missing, duplicate, extra and substituted procedure reports are rejected', () => {
  const valid = one('s Success');
  assert.throws(() => checkVerificationReport(valid, ['other']));
  assert.throws(() => checkVerificationReport(valid, ['gate', 'gate']));
  assert.throws(() =>
    checkVerificationReport(valid.replace('1 symbolic', '2 symbolic'), ['gate']),
  );
  assert.throws(() =>
    checkVerificationReport(
      valid + '\nVerifying one spec of procedure extra... s Success',
      ['gate'],
    ),
  );
  assert.throws(() => checkVerificationReport(valid + '\n' + summary, ['gate']));
});
