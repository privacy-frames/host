import type { GuestContextCatalog } from './types.ts';

/** Called only for a top-level trusted startup, before any guest source executes.
 * The native registry owns stable Blob URLs across app tabs; guest-created child
 * contexts inherit those URLs and never reconnect to its HTTP bootstrap.
 */
export async function prepareGuestWorkerBootstraps(
  catalog: GuestContextCatalog,
): Promise<GuestContextCatalog> {
  if (catalog.workerBootstrapURLs) return catalog;
  if (typeof SharedWorker !== 'function') {
    const urls = {
      dedicated: URL.createObjectURL(
        new Blob([catalog.workerBootstrap.dedicated], { type: 'text/javascript' }),
      ),
      shared: URL.createObjectURL(
        new Blob([catalog.workerBootstrap.shared], { type: 'text/javascript' }),
      ),
    };
    const closed = (event: PageTransitionEvent) => {
      if (!event.isTrusted || event.persisted) return;
      removeEventListener('pagehide', closed);
      URL.revokeObjectURL(urls.dedicated);
      URL.revokeObjectURL(urls.shared);
    };
    addEventListener('pagehide', closed);
    return { ...catalog, workerBootstrapURLs: urls };
  }
  const registry = new SharedWorker(
    new URL('__guest_worker_registry__.js', catalog.runtimeURL),
    {
      name: 'privacy-frames:trusted-worker-bootstrap-registry',
      type: 'classic',
    },
  );
  const port = registry.port;
  const close = (event: PageTransitionEvent) => {
    if (!event.isTrusted || event.persisted) return;
    removeEventListener('pagehide', close);
    port.close();
  };
  addEventListener('pagehide', close);
  try {
    const urls = await new Promise<{ dedicated: string; shared: string }>(
      (resolve, reject) => {
        const timer = setTimeout(
          () => finish(new Error('Trusted worker bootstrap registry timed out')),
          30000,
        );
        const finish = (error?: Error, value?: { dedicated: string; shared: string }) => {
          clearTimeout(timer);
          registry.removeEventListener('error', failed);
          port.removeEventListener('message', received);
          if (error) reject(error);
          else if (value) resolve(value);
        };
        const failed = () =>
          finish(new Error('Trusted worker bootstrap registry could not start'));
        const received = (event: MessageEvent<unknown>) => {
          const value = event.data;
          if (typeof value !== 'object' || value === null)
            return finish(new TypeError('Invalid bootstrap registry response'));
          if ('error' in value) return finish(new Error(String(value.error)));
          if (!('urls' in value) || typeof value.urls !== 'object' || !value.urls)
            return finish(new TypeError('Missing worker bootstrap URLs'));
          const urls = value.urls;
          if (
            !('dedicated' in urls) ||
            !('shared' in urls) ||
            typeof urls.dedicated !== 'string' ||
            typeof urls.shared !== 'string'
          )
            return finish(new TypeError('Invalid worker bootstrap URLs'));
          const origin = new URL(catalog.runtimeURL).origin;
          if (
            ![urls.dedicated, urls.shared].every(
              (url) =>
                new URL(url).protocol === 'blob:' && new URL(url).origin === origin,
            )
          )
            return finish(new TypeError('Worker bootstrap URL has another origin'));
          finish(undefined, { dedicated: urls.dedicated, shared: urls.shared });
        };
        registry.addEventListener('error', failed);
        port.addEventListener('message', received);
        port.start();
        port.postMessage({
          application: catalog.application,
          generation: catalog.generation,
          workerBootstrap: catalog.workerBootstrap,
        });
      },
    );
    return { ...catalog, workerBootstrapURLs: urls };
  } catch (error) {
    removeEventListener('pagehide', close);
    port.close();
    throw error;
  }
}
