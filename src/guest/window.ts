import { createControllerClient } from '../runtime/controller-client.ts';
import { GUEST_BOOTSTRAP_REQUEST } from './catalog.ts';
import { createGuestWindow } from './session.ts';
import { prepareGuestWorkerBootstraps } from './contexts/worker-registry.ts';
import type { GuestContextCatalog } from './contexts/types.ts';

const bootstrap = document.currentScript;
bootstrap?.remove();

function catalog(value: unknown): GuestContextCatalog {
  if (
    !value ||
    typeof value !== 'object' ||
    !('application' in value) ||
    typeof value.application !== 'string' ||
    !('generation' in value) ||
    typeof value.generation !== 'string' ||
    !('sourceURL' in value) ||
    typeof value.sourceURL !== 'string' ||
    !('documentBase' in value) ||
    typeof value.documentBase !== 'string' ||
    !('runtimeURL' in value) ||
    typeof value.runtimeURL !== 'string' ||
    !('applicationURL' in value) ||
    typeof value.applicationURL !== 'string' ||
    !('engineWasm' in value) ||
    !(value.engineWasm instanceof ArrayBuffer) ||
    !('workerBootstrap' in value) ||
    !value.workerBootstrap ||
    typeof value.workerBootstrap !== 'object' ||
    !('dedicated' in value.workerBootstrap) ||
    !(value.workerBootstrap.dedicated instanceof ArrayBuffer) ||
    !('shared' in value.workerBootstrap) ||
    !(value.workerBootstrap.shared instanceof ArrayBuffer) ||
    !('resources' in value) ||
    !Array.isArray(value.resources)
  )
    throw new Error('Invalid guest catalog');
  const resources = value.resources.map((resource: unknown) => {
    if (
      !resource ||
      typeof resource !== 'object' ||
      !('url' in resource) ||
      typeof resource.url !== 'string' ||
      !('path' in resource) ||
      typeof resource.path !== 'string' ||
      !('contentType' in resource) ||
      typeof resource.contentType !== 'string' ||
      !('bytes' in resource) ||
      !(resource.bytes instanceof ArrayBuffer)
    )
      throw new Error('Invalid guest resource');
    return {
      url: resource.url,
      path: resource.path,
      contentType: resource.contentType,
      bytes: resource.bytes,
    };
  });
  return {
    application: value.application,
    generation: value.generation,
    sourceURL: value.sourceURL,
    documentBase: value.documentBase,
    runtimeURL: value.runtimeURL,
    applicationURL: value.applicationURL,
    engineWasm: value.engineWasm,
    workerBootstrap: {
      dedicated: value.workerBootstrap.dedicated,
      shared: value.workerBootstrap.shared,
    },
    resources,
  };
}

async function start() {
  if (window.top !== window || window.opener !== null)
    throw new Error('Applications require a top-level window without an opener');
  if (!navigator.serviceWorker.controller)
    throw new Error('Trusted host control is required');
  const controller = createControllerClient();
  const data = await prepareGuestWorkerBootstraps(
    catalog(await controller.request({ type: GUEST_BOOTSTRAP_REQUEST })),
  );
  const entry = data.resources.find((resource) => resource.path === 'index.html');
  if (!entry) throw new Error('Application entry document is missing');
  const session = await createGuestWindow(data, window);
  try {
    await session.render(new TextDecoder().decode(entry.bytes));
  } catch (error) {
    session.close();
    throw error;
  }
  const manifest = document.createElement('link');
  manifest.rel = 'manifest';
  manifest.href =
    new URL(data.applicationURL).pathname.split('/').slice(0, -2).join('/') +
    '/__manifest.webmanifest';
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.href = new URL('pwa-192.png', data.runtimeURL).href;
  document.head.append(manifest, icon);
  document.documentElement.dataset.privacyRuntime = 'ready';
}

void start().catch((error: unknown) => {
  document.documentElement.dataset.privacyRuntime = 'failed';
  document.body.replaceChildren();
  const heading = document.createElement('h1');
  heading.textContent = 'Application could not start';
  const description = document.createElement('p');
  description.textContent = error instanceof Error ? error.message : String(error);
  document.body.append(heading, description);
  console.error(error);
});
