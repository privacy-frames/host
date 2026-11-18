import type { ManagementOperation } from '../shared/types.ts';

interface ManagementRequest {
  id: number;
  operation: ManagementOperation;
  payload?: unknown;
}

interface WorkerReply {
  ok: boolean;
  value?: unknown;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function managerOrigins(value: unknown): Set<string> {
  if (
    !isRecord(value) ||
    !Array.isArray(value.managerOrigins) ||
    !value.managerOrigins.length ||
    !value.managerOrigins.every(
      (origin: unknown) =>
        typeof origin === 'string' && new URL(origin).origin === origin,
    )
  ) {
    throw new Error('Trusted manager origins are unavailable');
  }
  return new Set(value.managerOrigins);
}

function managementRequest(value: unknown): ManagementRequest | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    !Number.isSafeInteger(value.id) ||
    value.id < 0
  ) {
    return null;
  }
  const { id, operation, payload } = value;
  if (
    operation !== 'install' &&
    operation !== 'list' &&
    operation !== 'remove' &&
    operation !== 'events'
  ) {
    return null;
  }
  if (operation === 'remove' && typeof payload !== 'string') return null;
  return { id, operation, payload };
}

function workerReply(value: unknown): WorkerReply {
  if (
    !isRecord(value) ||
    typeof value.ok !== 'boolean' ||
    (!value.ok && typeof value.error !== 'string')
  ) {
    throw new Error('Invalid runtime response');
  }
  return {
    ok: value.ok,
    value: value.value,
    error: typeof value.error === 'string' ? value.error : undefined,
  };
}

function requiredStatus(): HTMLElement {
  const element = document.getElementById('status');
  if (!element) throw new Error('Runtime status element is missing');
  return element;
}

const base = new URL('./', location.href);
const status = requiredStatus();
let controller: ServiceWorker | null = null;
let port: MessagePort | null = null;
let storageRequired = false;

async function initializeStorage(): Promise<void> {
  // Test storage operations themselves: cookie access does not establish that
  // IndexedDB and the controller share the top-level application's partition.
  try {
    localStorage.getItem('pf-storage-check');
    await indexedDB.databases();
  } catch (error) {
    document.documentElement.dataset.runtimeState = 'storage-required';
    storageRequired = true;
    port?.postMessage({ type: 'pf-storage-required' });
    const button = document.querySelector<HTMLButtonElement>('#reconnect');
    if (!button) throw new Error('Storage permission button is missing');
    button.hidden = false;
    status.textContent = 'Allow access to installed application storage.';
    await new Promise<void>((resolve, reject) => {
      button.onclick = async () => {
        try {
          if (!document.requestStorageAccess) throw error;
          await document.requestStorageAccess();
          button.hidden = true;
          resolve();
        } catch (permissionError) {
          reject(permissionError);
        }
      };
    });
  }

  const initiallyControlled = navigator.serviceWorker.controller !== null;
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
  if (registration.navigationPreload) await registration.navigationPreload.disable();
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
        once: true,
      });
    });
  }
  if (!initiallyControlled) {
    location.reload();
    await new Promise<void>(() => {});
  }
  controller = navigator.serviceWorker.controller;
  if (!controller) throw new Error('Runtime worker control is unavailable');
  document.documentElement.dataset.runtimeState = 'ready';
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    controller = navigator.serviceWorker.controller;
  });
}

function forwardRequest(candidate: MessagePort, data: unknown): void {
  const request = managementRequest(data);
  if (!request) {
    candidate.postMessage({
      id: isRecord(data) && typeof data.id === 'number' ? data.id : undefined,
      ok: false,
      error: 'Invalid manager request',
    });
    return;
  }

  const reply = new MessageChannel();
  reply.port1.onmessage = (event: MessageEvent<unknown>) => {
    reply.port1.close();
    try {
      const result = workerReply(event.data);
      if (result.ok && request.operation === 'remove') {
        const prefix = `pf:${request.payload}:`;
        for (const storage of [localStorage, sessionStorage]) {
          for (const key of Object.keys(storage)) {
            if (key.startsWith(prefix)) storage.removeItem(key);
          }
        }
      }
      candidate.postMessage({ id: request.id, ...result });
    } catch (error) {
      candidate.postMessage({ id: request.id, ok: false, error: errorMessage(error) });
    }
  };
  try {
    if (!controller) throw new Error('Runtime worker control is unavailable');
    controller.postMessage({ operation: request.operation, payload: request.payload }, [
      reply.port2,
    ]);
  } catch (error) {
    reply.port1.close();
    reply.port2.close();
    candidate.postMessage({ id: request.id, ok: false, error: errorMessage(error) });
  }
}

async function initialize(): Promise<void> {
  const response = await fetch(new URL('config.json', base));
  if (!response.ok) throw new Error('Runtime configuration is unavailable');
  const config: unknown = await response.json();
  const allowed = managerOrigins(config);

  // This document is trusted host code. Neither URL parameters nor claimed
  // message roles can authorize an application window as the manager.
  window.addEventListener('message', async (event: MessageEvent<unknown>) => {
    if (
      !event.isTrusted ||
      port ||
      window.parent === window ||
      event.source !== window.parent ||
      !allowed.has(event.origin) ||
      !isRecord(event.data) ||
      event.data.type !== 'pf-connect' ||
      event.ports.length !== 1
    ) {
      for (const rejected of event.ports) rejected.close();
      return;
    }
    const candidate = event.ports[0];
    port = candidate;
    try {
      if (storageRequired) candidate.postMessage({ type: 'pf-storage-required' });
      await ready;
      candidate.onmessage = (message: MessageEvent<unknown>) => {
        forwardRequest(candidate, message.data);
      };
      candidate.start();
      candidate.postMessage({ type: 'pf-ready', base: base.href });
      status.textContent = 'Application storage ready.';
    } catch (error) {
      candidate.postMessage({ type: 'pf-error', error: errorMessage(error) });
      candidate.close();
      port = null;
    }
  });

  const ready = initializeStorage();
  ready.catch((error: unknown) => {
    document.documentElement.dataset.runtimeState = 'failed';
    status.textContent = errorMessage(error);
  });
  if (window.parent === window) {
    status.textContent = 'Open the application library to manage installations.';
  }
}

initialize().catch((error: unknown) => {
  document.documentElement.dataset.runtimeState = 'failed';
  status.textContent = errorMessage(error);
});
