import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeEngineUTF8 } from '../src/guest/contexts/utf8.ts';

const reference = new TextDecoder();
const check = (bytes: number[] | Uint8Array) => {
  const input = new Uint8Array(bytes);
  assert.equal(decodeEngineUTF8(input), reference.decode(input), String(input));
};

test('engine UTF-8 fallback matches native decoding at invalid sequence boundaries', () => {
  for (const bytes of [
    [],
    [0xef, 0xbb, 0xbf],
    [0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf],
    [0xc0, 0x80],
    [0xed, 0xa0, 0x80],
    [0xf4, 0x8f, 0xbf, 0xbf],
    [0xf4, 0x90, 0x80, 0x80],
    [0xe0, 0x9f, 0xbf],
    [0xe1, 0x80],
    [0xe1, 0x80, 0x41],
    [0xf0, 0x9f, 0x8e, 0xb5],
    [0xe2, 0x82, 0xac, 0],
  ])
    check(bytes);

  for (let first = 0; first < 256; first++) {
    check([first]);
    for (let second = 0; second < 256; second++) check([first, second]);
  }
});

test('engine UTF-8 fallback preserves valid strings and randomized malformed data', () => {
  const encoder = new TextEncoder();
  for (const string of [
    'ASCII',
    '©🎵水',
    '\uFEFFfirst',
    'x\uFEFFlater',
    '🎵'.repeat(5000),
  ])
    check(encoder.encode(string));

  let state = 0x7f4a7c15;
  for (let iteration = 0; iteration < 5000; iteration++) {
    const bytes = new Uint8Array(iteration % 31);
    for (let index = 0; index < bytes.length; index++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      bytes[index] = state & 255;
    }
    check(bytes);
  }
});
