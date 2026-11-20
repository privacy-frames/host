import assert from 'node:assert/strict';
import test from 'node:test';
import { guestProcessorName } from '../src/guest/contexts/processor-name.ts';

test('application processor names exclude the host namespace after one conversion', () => {
  assert.equal(guestProcessorName('gain'), 'gain');
  let reads = 0;
  const input = {
    toString() {
      reads++;
      return reads === 1 ? 'gain' : 'privacy-frames:bootstrap';
    },
  };
  const name = guestProcessorName(input);
  assert.equal(name, 'gain');
  assert.equal(reads, 1);
  assert.throws(() => guestProcessorName('privacy-frames:bootstrap'), {
    name: 'SecurityError',
  });
  assert.throws(() => guestProcessorName({ toString: () => 'privacy-frames:other' }), {
    name: 'SecurityError',
  });
  assert.throws(() => guestProcessorName(Symbol('gain')), TypeError);
});
