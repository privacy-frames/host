import type { InstallationRequest } from '../shared/types.ts';
import type { AppSummary } from './types.ts';
import { installationInput } from '../installation/session.ts';
import {
  parseResourceList,
  publicResourceURL,
  RESOURCE_LIST_BYTES,
} from '../installation/resource-list.ts';

// Keep copied URLs bounded independently of the installer's decoded list limit.
export const SHARE_LINK_LENGTH = 32 * 1024;
const fields = new Set(['v', 'url', 'list-url', 'list', 'list-gzip']);

function validatedRecipe(value: unknown): InstallationRequest {
  const request = installationInput(value);
  const url = publicResourceURL(request.url).href;
  const list = request.resourceList;
  return {
    url,
    ...(list && {
      resourceList:
        list.kind === 'url'
          ? { kind: 'url', url: publicResourceURL(list.url).href }
          : { kind: 'text', text: parseResourceList(list.text).join('\n') },
    }),
  };
}

async function readBounded(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RESOURCE_LIST_BYTES) throw new Error('Resource list exceeds 256 KiB.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function compress(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = await readBounded(stream);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function decompress(encoded: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('Invalid compressed list.');
  const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new TextDecoder('utf-8', { fatal: true }).decode(await readBounded(stream));
}

/** A share link carries installation inputs, never management authority or app data. */
export async function createShareURL(
  input: InstallationRequest,
  managerURL: string | URL,
): Promise<string> {
  const request = validatedRecipe(input);
  const url = new URL(managerURL);
  url.search = '';
  const parameters = new URLSearchParams({ v: '1', url: request.url });
  const list = request.resourceList;
  if (list?.kind === 'url') parameters.set('list-url', list.url);
  if (list?.kind === 'text') {
    parameters.set('list', list.text);
    if (list.text.length > 1024 && typeof CompressionStream !== 'undefined') {
      const compressed = await compress(list.text);
      if (
        compressed.length < new URLSearchParams({ list: list.text }).toString().length
      ) {
        parameters.delete('list');
        parameters.set('list-gzip', compressed);
      }
    }
  }
  url.hash = parameters.toString();
  if (url.href.length > SHARE_LINK_LENGTH)
    throw new Error(
      'This resource list is too large to share as a link. Use a list URL.',
    );
  return url.href;
}

export async function readShareHash(hash: string): Promise<InstallationRequest | null> {
  if (!hash || hash === '#' || hash === '#install') return null;
  if (hash.length > SHARE_LINK_LENGTH) throw new Error('This share link is too large.');
  const parameters = new URLSearchParams(hash.replace(/^#/, ''));
  for (const key of parameters.keys()) {
    if (!fields.has(key) || parameters.getAll(key).length !== 1)
      throw new Error('Invalid share link parameters.');
  }
  if (parameters.get('v') !== '1') throw new Error('Unsupported share link version.');
  const kinds = ['list-url', 'list', 'list-gzip'].filter((key) => parameters.has(key));
  if (kinds.length > 1)
    throw new Error('A share link must contain only one resource list.');
  let resourceList;
  if (parameters.has('list-url'))
    resourceList = { kind: 'url', url: parameters.get('list-url') };
  else if (parameters.has('list'))
    resourceList = { kind: 'text', text: parameters.get('list') };
  else if (parameters.has('list-gzip'))
    resourceList = {
      kind: 'text',
      text: await decompress(parameters.get('list-gzip') || ''),
    };
  return validatedRecipe({ url: parameters.get('url'), resourceList });
}

export function applicationRecipe(app: AppSummary): InstallationRequest {
  return {
    url: app.source,
    ...(app.additionalResources.length > 0 && {
      resourceList: { kind: 'text', text: app.additionalResources.join('\n') },
    }),
  };
}

export function matchingInstallation(
  request: InstallationRequest,
  apps: AppSummary[],
): AppSummary | undefined {
  // A share link launches an existing local copy. Its recipe is only needed for
  // the first installation; opening must not download or replace publisher content.
  return apps.find((app) => app.source === request.url);
}
