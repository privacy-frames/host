import test from 'node:test';
import assert from 'node:assert/strict';
import { waitUntil } from './helpers/poll.ts';

test('asynchronous false results do not satisfy a readiness condition', async () => {
  let attempts = 0;
  await waitUntil(async () => ++attempts === 3, 'Readiness did not arrive', 1000, 0);
  assert.equal(attempts, 3);
});

test('a permanently false condition fails the observation deadline', async () => {
  await assert.rejects(
    waitUntil(async () => false, 'Condition remained false', 20, 0),
    { message: 'Condition remained false' },
  );
});

test('a pending observation cannot bypass its deadline', async () => {
  await assert.rejects(
    waitUntil(() => new Promise<boolean>(() => {}), 'Observation did not finish', 20),
    { message: 'Observation did not finish' },
  );
});

test('an observation error propagates without becoming a successful wait', async () => {
  const failure = new Error('Receiver failed');
  await assert.rejects(
    waitUntil(async () => {
      throw failure;
    }, 'Unreachable timeout'),
    (error) => error === failure,
  );
});
