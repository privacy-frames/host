import { isJavaScriptMIME } from '../shared/javascript-mime.ts';

/** Encode trusted cached kernel bytes without a subsequent HTTP script load. */
export async function bootstrapSource(value: Response | undefined): Promise<string> {
  if (!value?.ok || !isJavaScriptMIME(value.headers.get('content-type') || ''))
    throw new Error('Trusted bootstrap is unavailable');
  const bytes = new Uint8Array(await value.arrayBuffer());
  if (!bytes.length) throw new Error('Trusted bootstrap is empty');
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  return 'data:text/javascript;charset=utf-8;base64,' + btoa(chunks.join(''));
}
