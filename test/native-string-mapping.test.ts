import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapNativeString } from '../src/guest/native-string-mapping.ts';

test('mapping defers original string conversion and preserves the original receiver', () => {
  const seen: string[] = [];
  const original = {
    [Symbol.toPrimitive](hint: string) {
      assert.equal(this, original);
      seen.push(hint);
      return 'value';
    },
  };
  const wrapped = mapNativeString(
    original,
    (value) => {
      seen.push('map:' + value);
      return 'mapped';
    },
    { type: 'DOMString' },
  );
  assert.deepEqual(seen, []);
  assert.equal(String(wrapped), 'mapped');
  assert.deepEqual(seen, ['string', 'map:value']);
});

test('null conversion, USV normalization and Symbol errors precede mapping', () => {
  const identity = (value: string) => value;
  assert.equal(String(mapNativeString(null, identity, { type: 'DOMString' })), 'null');
  assert.equal(
    String(
      mapNativeString(null, identity, {
        type: 'DOMString',
        legacyNullToEmptyString: true,
      }),
    ),
    '',
  );
  assert.equal(
    String(
      mapNativeString(undefined, identity, {
        type: 'DOMString',
        legacyNullToEmptyString: true,
      }),
    ),
    'undefined',
  );
  let calls = 0;
  const map = (value: string) => {
    calls++;
    assert.equal(value, '\ufffd');
    return value;
  };
  assert.equal(String(mapNativeString('\ud800', map, { type: 'USVString' })), '\ufffd');
  assert.throws(
    () => String(mapNativeString(Symbol(), map, { type: 'DOMString' })),
    TypeError,
  );
  assert.equal(calls, 1);
});
