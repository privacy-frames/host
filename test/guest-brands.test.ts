import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeBrand } from '../src/guest/contexts/brands.ts';

test('native brands check each receiver once, including failed receivers', () => {
  const size = Object.getOwnPropertyDescriptor(Blob.prototype, 'size')?.get;
  assert(size);
  let calls = 0;
  const isBlob = nativeBrand<Blob>(function () {
    calls++;
    return Reflect.apply(size, this, []);
  });
  const blob = new Blob(['local bytes']);
  const fake = Object.create(Blob.prototype);
  for (let index = 0; index < 1000; index++) {
    assert(isBlob(blob));
    assert(!isBlob(fake));
  }
  assert.equal(calls, 2);

  Object.setPrototypeOf(blob, null);
  Object.setPrototypeOf(fake, null);
  assert(isBlob(blob));
  assert(!isBlob(fake));
  assert.equal(calls, 2);
});

test('functions can be checked, while primitive inputs never invoke a getter', () => {
  let calls = 0;
  const predicate = nativeBrand<object>(function () {
    calls++;
    throw new TypeError('Illegal receiver');
  });
  for (const primitive of [undefined, null, true, 42, 1n, 'text', Symbol('local')])
    assert(!predicate(primitive));
  assert.equal(calls, 0);
  const callable = () => {};
  assert(!predicate(callable));
  assert(!predicate(callable));
  assert.equal(calls, 1);
  assert(!nativeBrand(undefined)({}));
});
