import type { HostConfig } from '../types';
import {
  installationConfiguration,
  installationInput,
  isRecord,
} from '../../installation/session.ts';

export function catalogExamples(value: unknown): HostConfig['examples'] {
  if (!Array.isArray(value)) return [];
  const examples: HostConfig['examples'] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== 'string' || typeof item.url !== 'string')
      continue;
    if (item.resourceListURL === undefined) {
      examples.push({ name: item.name, url: item.url });
      continue;
    }
    if (typeof item.resourceListURL !== 'string')
      throw new Error('Invalid example resource list URL.');
    installationInput({
      url: item.url,
      resourceList: { kind: 'url', url: item.resourceListURL },
    });
    examples.push({
      name: item.name,
      url: item.url,
      resourceListURL: item.resourceListURL,
    });
  }
  return examples;
}

export async function loadConfig(base: URL): Promise<HostConfig> {
  const response = await fetch(new URL('config.json', base));
  if (!response.ok) throw new Error('Host configuration unavailable.');
  const config: unknown = await response.json();
  if (!config || typeof config !== 'object')
    throw new Error('Invalid host configuration.');

  const value = config as Record<string, unknown>;
  if (
    typeof value.managerURL !== 'string' ||
    typeof value.runtimeURL !== 'string' ||
    typeof value.installationURL !== 'string'
  ) {
    throw new Error('Host origins are not configured.');
  }

  const manager = new URL(value.managerURL);
  const runtime = new URL(value.runtimeURL);
  const installation = new URL(value.installationURL);
  installationConfiguration(value, installation.origin);
  if (manager.origin !== location.origin) {
    location.replace(manager.href);
    throw new Error('Opening the app manager…');
  }
  if (runtime.origin === manager.origin) {
    throw new Error('Application storage requires a separate runtime origin.');
  }

  const examples = catalogExamples(value.examples);

  return {
    managerURL: manager.href,
    runtimeURL: runtime.href,
    installationURL: installation.href,
    examples,
  };
}

/** Management authority is issued only after a worker-controlled navigation. */
export async function initializeManager(base: URL): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('This browser does not support service workers.');
  }

  const initiallyControlled = Boolean(navigator.serviceWorker.controller);
  let registration: ServiceWorkerRegistration | undefined;
  try {
    registration = await navigator.serviceWorker.register(new URL('sw.js', base), {
      scope: base.pathname,
      updateViaCache: 'none',
    });
  } catch (error) {
    registration = await navigator.serviceWorker.getRegistration(base.pathname);
    if (!registration?.active) throw error;
  }

  await navigator.serviceWorker.ready;
  await registration.navigationPreload?.disable();
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
        once: true,
      });
    });
  }

  if (!initiallyControlled) {
    location.reload();
    await new Promise<never>(() => {});
  }
}
