import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rewriteGuestCSS } from '../src/guest/css.ts';

test('decoded CSS resource URLs normalize invalid scalar input before mapping', () => {
  const seen = (text: string) => {
    const urls: string[] = [];
    rewriteGuestCSS(
      text,
      (url) => {
        urls.push(url);
        return 'data:,';
      },
      'value',
    );
    return urls;
  };
  for (const prefix of ['./', 'data:text/plain,', 'blob:https://fixture.invalid/']) {
    assert.deepEqual(seen(`url("${prefix}\ud800")`), [prefix + '\ufffd']);
    assert.deepEqual(seen(`u\\72l("${prefix}\\d800 ")`), [prefix + '\ufffd']);
    assert.deepEqual(seen(`url("${prefix}\0")`), [prefix + '\ufffd']);
    assert.deepEqual(seen(`url(${prefix}\\0 )`), [prefix + '\ufffd']);
  }
  assert.deepEqual(seen('url("./😀")'), ['./😀']);
  assert.deepEqual(seen('url("./\\d83d\\de00")'), ['./\ufffd\ufffd']);
  assert.deepEqual(seen('url("./%ED%A0%80")'), ['./%ED%A0%80']);
});

test('unquoted raw NUL remains an unsupported parser input and fails closed', () => {
  let mapped = false;
  assert.equal(
    rewriteGuestCSS(
      'url(./\0)',
      () => {
        mapped = true;
        return 'data:,';
      },
      'value',
    ),
    '',
  );
  assert.equal(mapped, false);
});
