import type {
  InstallationRequest,
  PreparedInstallation,
  ResourceListInput,
} from '../shared/types.ts';
import { prepareDocument } from './document.ts';
import { digest } from '../shared/policy.ts';
import { ResourceCapture, CaptureLimitError } from './resource-capture.ts';
import {
  parseResourceList,
  publicResourceURL,
  RESOURCE_LIST_BYTES,
} from './resource-list.ts';

function resourceList(input: unknown): ResourceListInput | undefined {
  if (input === undefined) return;
  if (!input || typeof input !== 'object') throw new Error('Invalid resource list');
  if (
    'kind' in input &&
    input.kind === 'url' &&
    'url' in input &&
    typeof input.url === 'string'
  )
    return { kind: 'url', url: publicResourceURL(input.url).href };
  if (
    'kind' in input &&
    input.kind === 'text' &&
    'text' in input &&
    typeof input.text === 'string'
  )
    return { kind: 'text', text: input.text };
  throw new Error('Invalid resource list');
}

/** Installation only downloads and parses declared resources. */
export async function downloadWebsite(
  input: InstallationRequest,
  { onProgress = () => {} }: { onProgress?: (message: string) => void } = {},
): Promise<PreparedInstallation> {
  if (!input || typeof input !== 'object' || typeof input.url !== 'string')
    throw new Error('Invalid installation request');
  const source = publicResourceURL(input.url);
  const scope = new URL('./', source);
  const capture = new ResourceCapture(source, scope, onProgress);
  try {
    const supplied = resourceList(input.resourceList);
    const additionalResources = supplied
      ? parseResourceList(
          supplied.kind === 'text'
            ? supplied.text
            : await capture.readList(supplied.url, RESOURCE_LIST_BYTES),
        )
      : [];
    for (const url of additionalResources) capture.add(url, true);
    const entry = await capture.download(source.href);
    const document = prepareDocument(new TextDecoder().decode(entry.bytes), source.href);
    capture.document(document, source.href);
    let publisherManifest: PreparedInstallation['publisherManifest'] = null;
    if (document.manifestURL) {
      try {
        const resource = await capture.download(document.manifestURL);
        const decoded: unknown = JSON.parse(new TextDecoder().decode(resource.bytes));
        if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded))
          throw new Error('Invalid web application manifest');
        const value = decoded as Record<string, unknown>;
        publisherManifest = { value, url: resource.url };
        for (const icon of (Array.isArray(value.icons) ? value.icons : []).slice(0, 8))
          if (icon && typeof icon === 'object' && typeof icon.src === 'string')
            capture.add(new URL(icon.src, resource.url).href);
      } catch (error) {
        if (error instanceof CaptureLimitError) throw error;
        onProgress('Optional manifest unavailable: ' + document.manifestURL);
      }
    }
    await capture.discover();
    const finalized = await capture.finalize();
    const label =
      (
        scope.pathname.split('/').filter(Boolean).at(-1) ||
        document.title.trim() ||
        source.hostname
      )
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .slice(0, 48) || 'application';
    const installation: PreparedInstallation = {
      format: 'offline-resources-v1',
      id: label + '-' + (await digest(new TextEncoder().encode(source.href))),
      manifest: {
        id: label,
        name: document.title.trim().slice(0, 100) || label,
        entry: 'index.html',
      },
      source: source.href,
      documentBase: document.baseURL,
      resources: finalized.resources,
      size: finalized.size,
      publisherManifest,
      installedAt: new Date().toISOString(),
      capture: {
        additionalResources,
        unavailableResources: finalized.unavailableResources,
      },
    };
    return installation;
  } finally {
    capture.close();
  }
}
