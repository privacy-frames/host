import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beginContextPublication,
  closeContextPublication,
  isCurrentContextPublication,
} from '../src/guest/contexts/lifecycle-kernel.ts';

test('object epochs invalidate retained continuations after numeric counters stop advancing', () => {
  let numeric = Number.MAX_SAFE_INTEGER + 1;
  const oldNumeric = numeric;
  numeric++;
  assert.equal(numeric, oldNumeric, 'Native numeric saturation control');
  const framed = {};
  const state = { token: {}, closed: true, framed };
  const retained = beginContextPublication(state);
  assert.equal(isCurrentContextPublication(state, retained), true);
  closeContextPublication(state);
  assert.equal(isCurrentContextPublication(state, retained), false);
  const tokens = new Set([retained]);
  for (let attempt = 0; attempt < 1000; attempt++) {
    const next = beginContextPublication(state);
    assert.equal(tokens.has(next), false);
    tokens.add(next);
    assert.equal(isCurrentContextPublication(state, retained), false);
    closeContextPublication(state);
    assert.equal(isCurrentContextPublication(state, next), false);
  }
  assert.equal(state.framed, framed, 'Unrelated owned state remains framed');
});
