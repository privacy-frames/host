import { internalRecord } from '../shared/primordials.ts';
import { mime } from '../shared/policy.ts';
import { resourceURL } from '../shared/runtime-url.ts';
import type { Resource } from '../shared/types.ts';
import { ContextRegistry } from './contexts/model.ts';
import { css } from './document.ts';
import { response } from './response-policy.ts';
import { manifestURL, webManifest } from './pwa.ts';
import { getApp, getResource, type StoredInstallation } from './storage.ts';

interface ResourceStore {
  getApp: typeof getApp;
  getResource: typeof getResource;
}

type ResourceTransform = (
  app: StoredInstallation,
  resource: Resource,
  response: Response,
) => Promise<Response>;

/** Browser manifest/icon loads and authenticated reads expose the same data. */
export async function readPublicInstallationResource(
  app: StoredInstallation,
  url: URL,
  base: URL,
  readResource: typeof getResource = getResource,
): Promise<Response | undefined> {
  if (url.search || url.hash) return;
  if (url.href === manifestURL(app, base).href)
    return response(JSON.stringify(webManifest(app, base)), 'application/manifest+json');
  const directory = new URL('__icon/', manifestURL(app, base));
  if (url.origin !== directory.origin || !url.pathname.startsWith(directory.pathname))
    return;
  const icons = webManifest(app, base).icons;
  if (!icons.some((icon) => new URL(icon.src, base).href === url.href)) return;
  const index = url.pathname.match(/\/__icon\/(\d+)$/)?.[1];
  const resource = index === undefined ? undefined : app.resources[Number(index)];
  if (!resource) return;
  return response(
    await readResource(app.id, resource.path, app.generation),
    resource.contentType || mime(resource.path),
  );
}

/** HTTP and message callers share admission, publisher handling and relocation. */
export async function readInstalledResource(
  client: Pick<Client, 'id' | 'url' | 'type'> | undefined,
  request: Request,
  contexts: ContextRegistry,
  base: URL,
  transform: ResourceTransform = async (_app, _resource, value) => value,
  store: ResourceStore = internalRecord({ getApp, getResource }),
): Promise<Response> {
  if (!client || request.method !== 'GET' || request.mode === 'navigate')
    throw new Error('Installed GET resource required');
  const identity = await contexts.resolve(client);
  if (!identity) throw new Error('Resource client not authorized');
  const app = await store.getApp(identity.application);
  if (!app || identity.installationGeneration !== app.generation)
    throw new Error('Installation unavailable');
  const url = new URL(request.url);
  url.hash = '';
  const original =
    url.origin === base.origin
      ? new URL(url.pathname + url.search, new URL(app.source).origin).href
      : undefined;
  let result = await readPublicInstallationResource(app, url, base, store.getResource);
  const resource = app.resources.find(
    (item) =>
      resourceURL(app, item.path, base).href === url.href ||
      item.url === url.href ||
      item.url === original,
  );
  if (!result) {
    if (!resource) throw new Error('Resource not admitted');
    const bytes = await store.getResource(app.id, resource.path, app.generation);
    result = await transform(
      app,
      resource,
      response(bytes, resource.contentType || mime(resource.path)),
    );
  }
  if (!(await contexts.isCurrent(client, identity)))
    throw new Error('Resource authority changed');
  const current = await store.getApp(app.id);
  if (!current || current.generation !== app.generation)
    throw new Error('Installation changed');
  if (
    !resource ||
    !result.ok ||
    result.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'text/css'
  )
    return result;
  const rewritten = response(
    css(app, await result.text(), resource.url, base),
    'text/css',
    result.status,
  );
  for (const name of [
    'content-language',
    'cache-control',
    'expires',
    'last-modified',
    'etag',
    'vary',
  ]) {
    const value = result.headers.get(name);
    if (value !== null) rewritten.headers.set(name, value);
  }
  return rewritten;
}

/** Clone-data validation precedes construction of the local native Request. */
export function parseResourceRequest(packet: unknown): Request {
  if (
    !packet ||
    typeof packet !== 'object' ||
    !('url' in packet) ||
    typeof packet.url !== 'string' ||
    !('headers' in packet) ||
    !Array.isArray(packet.headers) ||
    packet.headers.length > 256
  )
    throw new Error('Invalid resource request');
  const url = new URL(packet.url);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    url.href !== packet.url
  )
    throw new Error('Invalid resource URL');
  const headers = new Headers();
  for (const pair of packet.headers) {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      typeof pair[0] !== 'string' ||
      typeof pair[1] !== 'string'
    )
      throw new Error('Invalid resource header');
    headers.append(pair[0], pair[1]);
  }
  return new Request(url.href, { headers, credentials: 'omit' });
}
