import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  maintenanceCoverage,
  type MaintenanceSample,
} from './guest-context-maintenance-coverage.ts';

function paired(profile: string, positive: boolean): MaintenanceSample[] {
  return [false, true].flatMap((confined) =>
    ['0', '1'].map((bit) => {
      const requests = !confined && bit === '1' && positive ? [{ path: '/sw.js' }] : [];
      return {
        profile,
        version: 'fixture',
        kind: 'classic',
        confined,
        bit,
        result: bit === '0' ? 'skipped' : 'ready',
        runtime: [],
        publisher: requests,
        updates: requests,
      };
    }),
  );
}

test('inactive update scheduling remains explicit when another profile supplies the mechanism control', () => {
  const result = maintenanceCoverage(
    [...paired('inactive', false), ...paired('active', true)],
    [{ profile: 'inactive', requests: [{ path: '/sensor' }] }],
  );
  assert.equal(result.passed, true);
  assert.deepEqual(result.inactiveNativeGroups, [
    { profile: 'inactive', kind: 'classic', samples: 1, positiveSamples: 0 },
  ]);
});

test('a quiet implementation does not pass without a positive native mechanism control', () => {
  assert.equal(
    maintenanceCoverage(paired('inactive', false), [
      { profile: 'inactive', requests: [{ path: '/sensor' }] },
    ]).passed,
    false,
  );
});

test('a fixed trusted URL still fails the no-HTTP gate', () => {
  const samples = paired('active', true);
  samples
    .find((sample) => sample.confined && sample.bit === '1')!
    .runtime.push({ path: '/runtime/sw.js' });
  assert.equal(maintenanceCoverage(samples).passed, false);
});

test('missing private-bit comparison fails despite active controls', () => {
  assert.equal(
    maintenanceCoverage(
      paired('active', true).filter((sample) => !sample.confined || sample.bit !== '0'),
    ).passed,
    false,
  );
});

test('one profile cannot borrow another profile physical HTTP sensor', () => {
  const result = maintenanceCoverage([
    ...paired('inactive', false),
    ...paired('active', true),
  ]);
  assert.equal(result.passed, false);
  assert(
    result.errors.some((message) => message.startsWith('inactive: physical HTTP sensor')),
  );
});
