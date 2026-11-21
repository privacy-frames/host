import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureNativeIntrinsics,
  capturedNativeIntrinsics,
  nativeIntrinsicRole,
} from '../src/guest/native-intrinsics.ts';

test('trusted captures classify exact constructor/prototype identities without names or getters', () => {
  function DifferentPublicName() {}
  function Unknown() {}
  let reads = 0;
  const realm = { Object: DifferentPublicName };
  Object.defineProperty(realm, 'Function', {
    get() {
      reads++;
      return Unknown;
    },
  });
  const owner = {},
    document = {};
  captureNativeIntrinsics(realm, { owner, document });
  assert.equal(reads, 0);
  assert.equal(nativeIntrinsicRole(DifferentPublicName), 'Object');
  assert.equal(nativeIntrinsicRole(DifferentPublicName.prototype), 'Object.prototype');
  assert.equal(nativeIntrinsicRole(Unknown), undefined);
  Object.defineProperty(DifferentPublicName, 'name', { value: 'Changed' });
  assert.equal(nativeIntrinsicRole(DifferentPublicName), 'Object');
  const entries = capturedNativeIntrinsics(realm);
  assert(Object.isFrozen(entries));
  assert(entries.every(Object.isFrozen));
  assert.equal(entries.length, 2);
});
test('snapshot owner cannot be reused across documents or global identities', () => {
  function Local() {}
  const realm = { Object: Local },
    owner = {},
    document = {};
  captureNativeIntrinsics(realm, { owner, document });
  captureNativeIntrinsics(realm, { owner, document });
  assert.throws(
    () => captureNativeIntrinsics(realm, { owner, document: {} }),
    /owner was reused/,
  );
  assert.throws(
    () => captureNativeIntrinsics({ Object: Local }, { owner, document }),
    /owner was reused/,
  );
});
test('conflicting role captures fail before publishing any partial identity', () => {
  function First() {}
  function Second() {}
  captureNativeIntrinsics({ Object: First }, { owner: {} });
  assert.throws(
    () => captureNativeIntrinsics({ Object: Second, Function: First }, { owner: {} }),
    /conflicting roles/,
  );
  assert.equal(nativeIntrinsicRole(Second), undefined);
  assert.equal(nativeIntrinsicRole(First), 'Object');
});
test('optional ordinary binary constructor roles are captured from data properties', () => {
  function Shared() {}
  function Half() {}
  captureNativeIntrinsics(
    { SharedArrayBuffer: Shared, Float16Array: Half },
    { owner: {} },
  );
  assert.equal(nativeIntrinsicRole(Shared), 'SharedArrayBuffer');
  assert.equal(nativeIntrinsicRole(Shared.prototype), 'SharedArrayBuffer.prototype');
  assert.equal(nativeIntrinsicRole(Half), 'Float16Array');
  assert.equal(nativeIntrinsicRole(Half.prototype), 'Float16Array.prototype');
});

test('trusted binary producer supplements hidden roles without reading an accessor global', () => {
  function HiddenShared() {}
  let reads = 0;
  const source = Object.create(null) as object;
  Object.defineProperty(source, 'SharedArrayBuffer', {
    get() {
      reads++;
      return HiddenShared;
    },
  });
  captureNativeIntrinsics(source, { owner: {} }, [['SharedArrayBuffer', HiddenShared]]);
  assert.equal(reads, 0);
  assert.equal(nativeIntrinsicRole(HiddenShared), 'SharedArrayBuffer');
  assert.equal(
    nativeIntrinsicRole(HiddenShared.prototype),
    'SharedArrayBuffer.prototype',
  );
  function Unsupported() {}
  assert.throws(
    () => captureNativeIntrinsics({}, { owner: {} }, [['Unreviewed', Unsupported]]),
    /Unknown trusted intrinsic alias role/,
  );
  assert.equal(nativeIntrinsicRole(Unsupported), undefined);
});
