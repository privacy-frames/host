import assert from 'node:assert/strict';
import test from 'node:test';
import { captureMessageTransfer } from '../src/guest/message-transfer.ts';

test('postMessage options getter and sequence iterator are each captured once', () => {
  const buffer = new ArrayBuffer(8);
  let getters = 0,
    iterators = 0,
    starts = 0;
  const sequence = {
    get [Symbol.iterator]() {
      iterators++;
      return function* () {
        starts++;
        yield buffer;
      };
    },
  };
  const transfer = captureMessageTransfer({
    get transfer() {
      getters++;
      return sequence;
    },
  });
  assert.deepEqual(transfer, [buffer]);
  assert.deepEqual([getters, iterators, starts], [1, 1, 1]);
  assert.notEqual(transfer, sequence);
});
test('iterable overload reads its iterator once and does not inspect transfer options', () => {
  const port = {} as Transferable;
  let iterators = 0;
  const sequence = {
    get transfer() {
      assert.fail('Sequence overload is not a dictionary');
    },
    get [Symbol.iterator]() {
      iterators++;
      return function* () {
        yield port;
      };
    },
  };
  assert.deepEqual(captureMessageTransfer(sequence), [port]);
  assert.equal(iterators, 1);
  assert.deepEqual(captureMessageTransfer(undefined), []);
  assert.deepEqual(captureMessageTransfer(null), []);
  assert.deepEqual(captureMessageTransfer({}), []);
});
test('invalid transfer conversion closes the iterator and preserves the thrown error', () => {
  let closed = 0;
  assert.throws(
    () =>
      captureMessageTransfer({
        transfer: {
          *[Symbol.iterator]() {
            try {
              yield 1;
            } finally {
              closed++;
            }
          },
        },
      }),
    TypeError,
  );
  assert.equal(closed, 1);
  const error = new Error('conversion failed');
  assert.throws(
    () =>
      captureMessageTransfer({
        get transfer() {
          throw error;
        },
      }),
    (value) => value === error,
  );
  for (const value of [1, 'bad', { transfer: null }, { transfer: {} }])
    assert.throws(() => captureMessageTransfer(value), TypeError);
});
