import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NativeBinary } from '../src/guest/native-binary.ts';

test('copyWithin effects are confined to a branded receiver with primitive indices', () => {
  const binary = new NativeBinary();
  const view = new Uint8Array([1, 2, 3, 4]);
  const copy = Uint8Array.prototype.copyWithin;
  assert.equal(binary.copyWithinBuffer(copy, view, [0, 1, 3]), view.buffer);
  assert.equal(
    binary.copyWithinBuffer(binary.bindings.invoke, undefined, [
      'TypedArray',
      'copyWithin',
      'value',
      view,
      [0, 1, 3],
    ]),
    view.buffer,
  );
  const result = binary.call(copy, view, [0, 1, 3]);
  assert(result instanceof Uint8Array);
  assert.deepEqual([...result], [2, 3, 3, 4]);
});

test('callback-capable coercions and same-named replacements keep full barriers', () => {
  const binary = new NativeBinary();
  const view = new Uint8Array(4);
  let coercions = 0;
  const index = {
    valueOf() {
      coercions++;
      return 0;
    },
  };
  assert.equal(binary.copyWithinBuffer(view.copyWithin, view, [index, 1]), undefined);
  assert.equal(coercions, 0, 'Effect discovery must not run application coercions');
  assert.equal(
    binary.copyWithinBuffer(function copyWithin() {}, view, [0, 1]),
    undefined,
  );
  assert.equal(
    binary.copyWithinBuffer(view.copyWithin, { buffer: view.buffer }, [0, 1]),
    undefined,
  );
  assert.equal(
    binary.copyWithinBuffer(view.copyWithin, new DataView(view.buffer), [0, 1]),
    undefined,
  );
  assert.equal(
    binary.copyWithinBuffer(binary.bindings.invoke, undefined, [
      'TypedArray',
      'fill',
      'value',
      view,
      [0, 1],
    ]),
    undefined,
  );
});
