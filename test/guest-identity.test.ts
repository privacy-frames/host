import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateIdentity } from '../src/guest/identity.ts';

test('identity exhaustion rejects without rounding, repetition or record mutation', () => {
  const state = { next: 9007199254740990 };
  assert.equal(allocateIdentity(state), 9007199254740990);
  assert.equal(allocateIdentity(state), 9007199254740991);
  assert.equal(state.next, 9007199254740992);
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.equal(allocateIdentity(state), undefined);
    assert.equal(state.next, 9007199254740992);
  }
});

test('private identity domains advance independently without inherited setters', () => {
  let intercepted = false;
  const prototype = {
    set next(_value: number) {
      intercepted = true;
    },
  };
  const first = Object.create(prototype, {
    next: { value: 1, writable: true, configurable: true },
  });
  const second = { next: 1 };
  assert.equal(allocateIdentity(first), 1);
  assert.equal(allocateIdentity(first), 2);
  assert.equal(allocateIdentity(second), 1);
  assert.equal(intercepted, false);
  assert.equal(Object.getPrototypeOf(first), prototype);
});
