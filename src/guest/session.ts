import { BrowserEnvironment } from './browser.ts';
import { GuestEngine } from './engine.ts';
import type {
  GuestContextCatalog,
  GuestWorkerSession,
  GuestWorkerInitialization,
} from './contexts/types.ts';

export interface GuestWindowSession {
  engine: GuestEngine;
  environment: BrowserEnvironment;
  render(html: string): Promise<void>;
  close(): void;
}

export async function createGuestWindow(
  catalog: GuestContextCatalog,
  window: Window,
  signal?: AbortSignal,
): Promise<GuestWindowSession> {
  signal?.throwIfAborted();
  const environment = new BrowserEnvironment({
    catalog,
    global: window,
    createWindow: async (childCatalog, childWindow, html, preparation) => {
      const session = await createGuestWindow(childCatalog, childWindow, preparation);
      try {
        preparation.throwIfAborted();
        await session.render(html);
        preparation.throwIfAborted();
        return session;
      } catch (error) {
        session.close();
        throw error;
      }
    },
  });
  let engine: GuestEngine;
  try {
    const wasmModule = await WebAssembly.compile(catalog.engineWasm);
    signal?.throwIfAborted();
    engine = await GuestEngine.create({
      host: environment.host,
      globalObject: window,
      wasmModule,
      modules: environment.resources.modules,
      memoryLimit: 512 * 1024 * 1024,
      onError: (error) => console.error('Application error', error),
    });
  } catch (error) {
    environment.dispose();
    throw error;
  }
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    signal?.removeEventListener('abort', close);
    try {
      engine.dispose();
    } finally {
      environment.dispose();
    }
  };
  signal?.addEventListener('abort', close, { once: true });
  if (signal?.aborted) {
    close();
    signal.throwIfAborted();
  }
  try {
    environment.attach(engine);
    signal?.throwIfAborted();
  } catch (error) {
    close();
    throw error;
  }
  const pagehide = (event: PageTransitionEvent) => {
    if (event.isTrusted && !event.persisted) close();
  };
  window.addEventListener('pagehide', pagehide);
  engine.onDispose(() => window.removeEventListener('pagehide', pagehide));
  return {
    engine,
    environment,
    render(html) {
      if (closed) throw new Error('Guest window session is closed');
      signal?.throwIfAborted();
      return environment.dom!.render(html);
    },
    close,
  };
}

export async function createGuestWorkerSession(
  initialization: GuestWorkerInitialization,
  scope: DedicatedWorkerGlobalScope | SharedWorkerGlobalScope,
): Promise<GuestWorkerSession> {
  const { catalog, entryURL, scriptType } = initialization;
  const workerCatalog = { ...catalog, sourceURL: entryURL, documentBase: entryURL };
  const environment = new BrowserEnvironment({
    catalog: workerCatalog,
    global: scope,
    kind: 'onconnect' in scope ? 'shared-worker' : 'dedicated-worker',
    entryURL,
    name: initialization.name,
  });
  const engine = await GuestEngine.create({
    host: environment.host,
    globalObject: scope,
    wasmModule: await WebAssembly.compile(catalog.engineWasm),
    modules: environment.resources.modules,
    memoryLimit: 512 * 1024 * 1024,
    onError: (error) => console.error('Worker application error', error),
  }).catch((error: unknown) => {
    environment.dispose();
    throw error;
  });
  try {
    environment.attach(engine);
  } catch (error) {
    engine.dispose();
    environment.dispose();
    throw error;
  }
  engine.set('name', initialization.name || '');
  const address = new URL(entryURL);
  const location: Record<string, unknown> = { toString: () => address.href };
  for (const key of [
    'href',
    'origin',
    'protocol',
    'host',
    'hostname',
    'port',
    'pathname',
    'search',
    'hash',
  ] as const)
    Object.defineProperty(location, key, { enumerable: true, get: () => address[key] });
  const close = () =>
    queueMicrotask(() => {
      engine.dispose();
      environment.dispose();
      scope.close();
    });
  const globals: Record<string, unknown> = {
    location,
    close,
    name: initialization.name || '',
  };
  if ('postMessage' in scope)
    globals.postMessage = (
      message: unknown,
      options: Transferable[] | StructuredSerializeOptions = [],
    ) => {
      const transfer = Array.isArray(options) ? options : options.transfer || [];
      scope.postMessage(message, { transfer });
      engine.detachTransferred(transfer);
    };
  globals.importScripts = (...inputs: string[]) => {
    if (scriptType === 'module')
      throw new TypeError('importScripts is unavailable in module workers');
    for (const input of inputs) {
      const source = environment.resources.source(String(input), entryURL);
      engine.evaluate(source.code, source.url);
    }
  };
  for (const [name, value] of Object.entries(globals)) {
    environment.globals[name] = value;
    engine.set(name, value);
  }
  return {
    async start(url, type) {
      const source = environment.resources.source(url);
      const completion = engine.evaluate(
        source.code,
        source.url,
        type === 'module' ? 'module' : 'global',
      );
      if (type === 'module') await completion;
    },
    close() {
      engine.dispose();
      environment.dispose();
    },
  };
}
