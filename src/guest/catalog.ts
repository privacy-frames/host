import { applicationURL } from '../shared/runtime-url.ts';
import type { StoredInstallation } from '../runtime/storage.ts';
import { getResource } from '../runtime/storage.ts';
import type { GuestContextCatalog } from './contexts/types.ts';

export const GUEST_BOOTSTRAP_REQUEST = 'privacy-frames:guest-bootstrap';

/** Called only after the service worker authenticates the actual browser client. */
export async function createGuestCatalog(
  app: StoredInstallation,
  base: URL,
  engineWasm: ArrayBuffer,
): Promise<GuestContextCatalog> {
  const resources = await Promise.all(
    app.resources.map(async (resource) => ({
      url: resource.url,
      path: resource.path,
      contentType: resource.contentType,
      bytes: await getResource(app.id, resource.path, app.generation),
    })),
  );
  return {
    application: app.id,
    generation: app.generation,
    sourceURL: app.source,
    documentBase: app.documentBase || app.source,
    applicationURL: applicationURL(app, base).href,
    runtimeURL: base.href,
    engineWasm,
    resources,
  };
}
