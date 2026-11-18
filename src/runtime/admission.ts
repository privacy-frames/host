import { digest, LIMITS, safePath, validateMetadata } from '../shared/policy.ts';
import { applicationURL, publicAlias, resourceURL } from '../shared/runtime-url.ts';
import type {
  DownloadedResource,
  PreparedInstallation,
  ResourceCaptureSummary,
  UnavailableResource,
} from '../shared/types.ts';
import { listApps } from './storage.ts';

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function object(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new Error('Expected an object');
  return value;
}

function publicURL(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a resource URL');
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    !['https:', 'http:'].includes(url.protocol) ||
    (url.protocol === 'http:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    throw new Error('Resource requires HTTPS');
  return url.href;
}

function captureSummary(value: unknown, resources: Set<string>): ResourceCaptureSummary {
  const input = object(value);
  if (
    !Array.isArray(input.additionalResources) ||
    input.additionalResources.length > LIMITS.files ||
    !Array.isArray(input.unavailableResources) ||
    input.unavailableResources.length > LIMITS.files
  )
    throw new Error('Invalid resource capture summary');
  const listed = new Set<string>();
  const additionalResources = input.additionalResources.map((value) => {
    const url = publicURL(value);
    if (listed.has(url) || !resources.has(url))
      throw new Error('Additional resource was not captured');
    listed.add(url);
    return url;
  });
  const unavailableResources: UnavailableResource[] = [];
  const unavailable = new Set<string>();
  for (const item of input.unavailableResources) {
    const diagnostic = object(item);
    const url = publicURL(diagnostic.url);
    if (
      unavailable.has(url) ||
      resources.has(url) ||
      (diagnostic.reason !== 'network' &&
        diagnostic.reason !== 'http' &&
        diagnostic.reason !== 'body') ||
      (diagnostic.reason === 'http'
        ? typeof diagnostic.status !== 'number' ||
          !Number.isInteger(diagnostic.status) ||
          diagnostic.status < 100 ||
          diagnostic.status > 599 ||
          (diagnostic.status >= 200 && diagnostic.status < 300)
        : diagnostic.status !== undefined)
    )
      throw new Error('Invalid unavailable resource diagnostic');
    unavailable.add(url);
    unavailableResources.push({
      url,
      reason: diagnostic.reason,
      ...(typeof diagnostic.status === 'number' ? { status: diagnostic.status } : {}),
    });
  }
  return { additionalResources, unavailableResources };
}

export async function admitInstallation(
  input: unknown,
  runtime: URL,
): Promise<PreparedInstallation> {
  const value = object(input);
  if (value.format !== 'offline-resources-v1')
    throw new Error('Unsupported installation format');
  const manifest = validateMetadata(value.manifest);
  const source = publicURL(value.source);
  const id = manifest.id + '-' + (await digest(new TextEncoder().encode(source)));
  if (value.id !== id) throw new Error('Installation identity mismatch');
  if (
    !Array.isArray(value.resources) ||
    !value.resources.length ||
    value.resources.length > LIMITS.files
  )
    throw new Error('Invalid resource count');
  const paths = new Set<string>(),
    urls = new Set<string>();
  let size = 0;
  const resources: DownloadedResource[] = [];
  for (const item of value.resources) {
    const resource = object(item),
      path = safePath(resource.path),
      url = publicURL(resource.url);
    if (paths.has(path) || urls.has(url)) throw new Error('Duplicate resource');
    paths.add(path);
    urls.add(url);
    if (
      !(resource.bytes instanceof ArrayBuffer) ||
      typeof resource.contentType !== 'string' ||
      resource.contentType.length > 200
    )
      throw new Error('Invalid resource');
    size += resource.bytes.byteLength;
    const sha256 = await digest(resource.bytes);
    if (size > LIMITS.bytes || sha256 !== resource.sha256)
      throw new Error('Resource integrity or size check failed');
    resources.push({
      path,
      url,
      bytes: resource.bytes,
      contentType: resource.contentType,
      sha256,
      ...(resource.documentBase === undefined
        ? {}
        : { documentBase: publicURL(resource.documentBase) }),
    });
  }
  const entry = resources.find((resource) => resource.path === manifest.entry);
  if (!entry) throw new Error('Missing entry');
  const capture = captureSummary(value.capture, urls);
  let publisherManifest: PreparedInstallation['publisherManifest'] = null;
  if (value.publisherManifest) {
    const metadata = object(value.publisherManifest);
    publisherManifest = { url: publicURL(metadata.url), value: object(metadata.value) };
  }
  const app: PreparedInstallation = {
    format: 'offline-resources-v1',
    id,
    manifest,
    source,
    documentBase:
      value.documentBase === undefined ? source : publicURL(value.documentBase),
    resources,
    size,
    publisherManifest,
    installedAt: new Date().toISOString(),
    capture,
  };
  const appURL = applicationURL(app, runtime).href;
  const resolvedPaths = new Set<string>();
  for (const resource of resources) {
    const resolved = resourceURL(app, resource.path, runtime).href;
    if (resolved === appURL || !resolved.startsWith(appURL))
      throw new Error('Resource path leaves its application');
    if (resolvedPaths.has(resolved)) throw new Error('Duplicate resolved resource path');
    resolvedPaths.add(resolved);
  }
  if (
    (await listApps()).some(
      (other) => other.id !== id && publicAlias(other.id) === publicAlias(id),
    )
  )
    throw new Error('Installation alias collision');
  return app;
}
