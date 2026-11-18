import type {
  GuestScriptType,
  GuestWorkerFactoryOptions,
  GuestWorkerInitialization,
} from './types.ts';

interface WorkerConstructors {
  Worker?: typeof Worker;
  SharedWorker?: typeof SharedWorker;
  dispose(): void;
}

function workerOptions(value: unknown, shared = false): WorkerOptions {
  if (
    shared &&
    value !== null &&
    !['object', 'function', 'undefined'].includes(typeof value)
  )
    return { name: String(value) };
  if (
    value !== undefined &&
    value !== null &&
    typeof value !== 'object' &&
    typeof value !== 'function'
  )
    throw new TypeError('Worker options must be a dictionary');
  const type = value == null ? undefined : Reflect.get(value, 'type');
  const credentials = value == null ? undefined : Reflect.get(value, 'credentials');
  const name = value == null ? undefined : Reflect.get(value, 'name');
  const scriptType = type === undefined ? 'classic' : String(type);
  if (scriptType !== 'classic' && scriptType !== 'module')
    throw new TypeError('Invalid worker type');
  if (
    credentials !== undefined &&
    !['omit', 'same-origin', 'include'].includes(String(credentials))
  )
    throw new TypeError('Invalid worker credentials');
  return { type: scriptType, name: name === undefined ? '' : String(name) };
}

/** Only trusted bootstrap URLs are ever given to native worker constructors. */
export function createGuestWorkers(
  options: GuestWorkerFactoryOptions,
): WorkerConstructors {
  const NativeWorker = globalThis.Worker;
  const NativeSharedWorker = globalThis.SharedWorker;
  const workers = new Set<Worker>();
  const ports = new Set<MessagePort>();

  function initialization(
    input: string | URL,
    type?: WorkerType,
  ): GuestWorkerInitialization {
    const entry = new URL(String(input), options.catalog.documentBase).href;
    const scriptType: GuestScriptType = type === 'module' ? 'module' : 'classic';
    const prepared = options.prepare(entry, scriptType);
    if (
      prepared.catalog.application !== options.catalog.application ||
      prepared.catalog.generation !== options.catalog.generation ||
      prepared.entryURL !== entry ||
      prepared.scriptType !== scriptType
    ) {
      throw new DOMException(
        'Worker preparation changed its owner or entry',
        'SecurityError',
      );
    }
    return prepared;
  }

  function bootstrap(shared: boolean): URL {
    const urls = options.catalog.workerBootstrapURLs;
    if (!urls)
      throw new Error(
        'Trusted worker bootstraps were not prepared before guest execution',
      );
    const url = new URL(shared ? urls.shared : urls.dedicated);
    if (
      url.protocol !== 'blob:' ||
      url.origin !== new URL(options.catalog.applicationURL).origin
    )
      throw new DOMException(
        'Worker bootstrap is not a local application Blob',
        'SecurityError',
      );
    return url;
  }

  let Dedicated: typeof Worker | undefined;
  if (typeof NativeWorker === 'function') {
    class ConfinedWorker extends NativeWorker {
      constructor(input: string | URL, suppliedOptions: WorkerOptions = {}) {
        const normalized = workerOptions(suppliedOptions);
        const prepared = initialization(input, normalized.type);
        prepared.name = normalized.name;
        super(bootstrap(false), { name: prepared.name, type: 'classic' });
        workers.add(this);
        // This is sent before the instance is returned to guest code. Application
        // messages therefore cannot precede the trusted initialization packet.
        NativeWorker.prototype.postMessage.call(this, prepared);
      }

      override postMessage(
        message: unknown,
        transferOrOptions: Transferable[] | StructuredSerializeOptions = [],
      ): void {
        const transfer = Array.isArray(transferOrOptions)
          ? transferOrOptions
          : transferOrOptions?.transfer || [];
        NativeWorker.prototype.postMessage.call(this, message, { transfer });
        options.commitTransfers(transfer);
      }

      override terminate(): void {
        workers.delete(this);
        NativeWorker.prototype.terminate.call(this);
      }
    }
    Object.defineProperty(ConfinedWorker, 'name', { value: 'Worker' });
    Dedicated = ConfinedWorker;
  }

  let Shared: typeof SharedWorker | undefined;
  if (typeof NativeSharedWorker === 'function') {
    class ConfinedSharedWorker extends NativeSharedWorker {
      constructor(input: string | URL, optionsOrName: string | WorkerOptions = {}) {
        const sharedOptions = workerOptions(optionsOrName, true);
        const prepared = initialization(input, sharedOptions.type);
        prepared.name = sharedOptions.name || '';
        const name = JSON.stringify([
          prepared.catalog.application,
          prepared.catalog.generation,
          prepared.entryURL,
          prepared.name,
        ]);
        super(bootstrap(true), { name, type: 'classic' });
        ports.add(this.port);
        this.port.postMessage(prepared);
      }
    }
    Object.defineProperty(ConfinedSharedWorker, 'name', { value: 'SharedWorker' });
    Shared = ConfinedSharedWorker;
  }

  return {
    Worker: Dedicated,
    SharedWorker: Shared,
    dispose() {
      for (const worker of workers) NativeWorker.prototype.terminate.call(worker);
      for (const port of ports) port.close();
      workers.clear();
      ports.clear();
    },
  };
}
