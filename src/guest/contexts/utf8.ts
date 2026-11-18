/**
 * Decode engine strings in native worklets, where TextDecoder is unavailable.
 * Implements the Encoding Standard UTF-8 decoder's replacement mode and BOM
 * handling for complete, non-streaming byte sequences.
 */
export function decodeEngineUTF8(input: Uint8Array): string {
  const output: number[] = [];
  let codePoint = 0;
  let needed = 0;
  let seen = 0;
  let lower = 0x80;
  let upper = 0xbf;

  for (let index = 0; index < input.length; index++) {
    const byte = input[index];
    if (needed === 0) {
      if (byte <= 0x7f) {
        output.push(byte);
      } else if (byte >= 0xc2 && byte <= 0xdf) {
        needed = 1;
        codePoint = byte & 0x1f;
      } else if (byte >= 0xe0 && byte <= 0xef) {
        needed = 2;
        codePoint = byte & 0x0f;
        if (byte === 0xe0) lower = 0xa0;
        if (byte === 0xed) upper = 0x9f;
      } else if (byte >= 0xf0 && byte <= 0xf4) {
        needed = 3;
        codePoint = byte & 0x07;
        if (byte === 0xf0) lower = 0x90;
        if (byte === 0xf4) upper = 0x8f;
      } else {
        output.push(0xfffd);
      }
      continue;
    }

    if (byte < lower || byte > upper) {
      needed = seen = codePoint = 0;
      lower = 0x80;
      upper = 0xbf;
      output.push(0xfffd);
      index--;
      continue;
    }

    lower = 0x80;
    upper = 0xbf;
    codePoint = (codePoint << 6) | (byte & 0x3f);
    if (++seen === needed) {
      output.push(codePoint);
      needed = seen = codePoint = 0;
    }
  }

  if (needed !== 0) output.push(0xfffd);
  if (output[0] === 0xfeff) output.shift();
  const chunks: string[] = [];
  for (let index = 0; index < output.length; index += 4096)
    chunks.push(String.fromCodePoint(...output.slice(index, index + 4096)));
  return chunks.join('');
}

/** The engine glue uses only this complete-buffer decode operation. */
export class EngineTextDecoder {
  private readonly native = typeof TextDecoder === 'function' ? new TextDecoder() : undefined;

  decode(input: Uint8Array): string {
    return this.native ? this.native.decode(input) : decodeEngineUTF8(input);
  }
}
