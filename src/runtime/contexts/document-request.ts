import {
  internalArray,
  ownDescriptor,
  internalRecord,
  internalData,
} from '../../shared/primordials.ts';
import { LIMITS, mime } from '../../shared/policy.ts';
import { decodeDocumentDataURL, documentMediaKind } from '../../shared/document-data.ts';
import { resourceURL } from '../../shared/runtime-url.ts';
import type { StoredInstallation } from '../storage.ts';
import type { DocumentContentInput } from './document-content-types.ts';

interface DocumentResourceStore {
  getResource(id: string, path: string, generation: string): Promise<ArrayBuffer>;
}

function field(value: unknown, name: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid document source request');
  const own = ownDescriptor(value, name);
  if (!own) return undefined;
  if (!('value' in own)) throw new Error('Document source must contain data properties');
  return own.value;
}

function text(value: unknown): string {
  if (
    typeof value !== 'string' ||
    new TextEncoder().encode(value).byteLength > LIMITS.bytes
  )
    throw new Error('Document source exceeds the supported text limit');
  return value;
}

function address(value: unknown, base?: string): URL {
  const url = new URL(text(value), base);
  if (url.username || url.password) throw new Error('Document URL credentials refused');
  return url;
}

/** Resolve source data against an authenticated application's admitted graph only. */
export async function documentRequestInput(
  value: unknown,
  app: StoredInstallation,
  runtime: URL,
  store: DocumentResourceStore,
): Promise<DocumentContentInput> {
  const source = field(value, 'source');
  const requestedBase = field(value, 'baseURL');
  let baseURL = requestedBase === undefined ? app.source : address(requestedBase).href;
  const kind = field(source, 'kind');
  const aliases: [string, string][] = app.resources.map((resource) => [
    resource.url,
    resourceURL(app, resource.path, runtime).href,
  ]);
  const unavailableURLs = app.capture.unavailableResources.map((item) => item.url);
  if (kind === 'empty')
    return internalRecord({
      kind: 'html',
      text: '<!doctype html>',
      sourceURL: baseURL,
      baseURL,
      aliases,
      unavailableURLs,
    });
  if (kind === 'srcdoc') {
    const sourceBase = field(source, 'baseURL');
    if (sourceBase !== undefined) baseURL = address(sourceBase).href;
    return internalRecord({
      kind: 'html',
      text: text(field(source, 'text')),
      sourceURL: baseURL,
      baseURL,
      aliases,
      unavailableURLs,
    });
  }
  if (kind === 'data') {
    const input = address(field(source, 'url'));
    if (input.protocol !== 'data:') throw new Error('Invalid document data source');
    const sourceBase = field(source, 'baseURL');
    if (sourceBase !== undefined) baseURL = address(sourceBase).href;
    return internalRecord({
      ...decodeDocumentDataURL(input.href),
      sourceURL: baseURL,
      baseURL,
      aliases,
      unavailableURLs,
    });
  }
  if (kind === 'blob') {
    const input = address(field(source, 'url'));
    if (input.protocol !== 'blob:' || input.origin !== runtime.origin)
      throw new Error('Only runtime-origin Blob documents are supported');
    const sourceBase = field(source, 'baseURL');
    if (sourceBase !== undefined) baseURL = address(sourceBase).href;
    const body = field(value, 'blobContent');
    return internalRecord({
      kind: documentMediaKind(text(field(body, 'contentType'))),
      text: text(field(body, 'text')),
      sourceURL: input.href,
      baseURL,
      aliases,
      unavailableURLs,
    });
  }
  if (kind === 'url') {
    const input = address(field(source, 'url'), baseURL);
    input.hash = '';
    const resource = app.resources.find(
      (candidate) =>
        candidate.url === input.href ||
        resourceURL(app, candidate.path, runtime).href === input.href,
    );
    if (!resource) throw new Error('Document source was not installed');
    return internalRecord({
      kind: documentMediaKind(resource.contentType || mime(resource.path)),
      text: new TextDecoder().decode(
        await store.getResource(app.id, resource.path, app.generation),
      ),
      sourceURL: resource.url,
      baseURL:
        resource.documentBase ||
        (resource.url === app.source ? app.documentBase || resource.url : resource.url),
      aliases,
      unavailableURLs,
    });
  }
  throw new Error('Unsupported document source');
}

/** Message and HTTP readers enforce the same complete JSON text bound. */
export function parseDocumentRequest(value: unknown): unknown {
  if (
    typeof value !== 'string' ||
    !value ||
    new TextEncoder().encode(value).byteLength > LIMITS.bytes
  )
    throw new Error('Document request exceeds size limit or is missing');
  return internalData(JSON.parse(value));
}

/** Bound the complete request before JSON parsing, including escaped source text. */
export async function readDocumentRequest(request: Request): Promise<unknown> {
  // Firefox exposes a null stream for some service-worker POST requests while
  // their body remains available through the native body-reading methods.
  if (!request.body) {
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength) throw new Error('Missing document source request');
    if (bytes.byteLength > LIMITS.bytes)
      throw new Error('Document request exceeds size limit');
    return internalData(
      JSON.parse(new TextDecoder('utf-8', internalRecord({ fatal: true })).decode(bytes)),
    );
  }
  const reader = request.body.getReader();
  const chunks = internalArray<Uint8Array>();
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > LIMITS.bytes) throw new Error('Document request exceeds size limit');
      chunks.push(chunk.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return internalData(
    JSON.parse(new TextDecoder('utf-8', internalRecord({ fatal: true })).decode(bytes)),
  );
}
