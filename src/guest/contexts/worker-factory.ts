import type {
  GuestScriptType,
  GuestWorkerFactoryOptions,
  GuestWorkerInitialization,
} from './types.ts';

interface WorkerConstructors {
  Worker: typeof Worker;
  SharedWorker?: typeof SharedWorker;
  dispose(): void;
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
    return new URL(
      shared ? '__guest_shared_worker__.js' : '__guest_worker__.js',
      options.catalog.applicationURL,
    );
  }

  class ConfinedWorker extends NativeWorker {
    constructor(input: string | URL, workerOptions: WorkerOptions = {}) {
      const prepared = initialization(input, workerOptions?.type);
      prepared.name = workerOptions?.name || '';
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
        : transferOrOptions.transfer || [];
      NativeWorker.prototype.postMessage.call(this, message, { transfer });
      options.commitTransfers(transfer);
    }

    override terminate(): void {
      workers.delete(this);
      NativeWorker.prototype.terminate.call(this);
    }
  }
  Object.defineProperty(ConfinedWorker, 'name', { value: 'Worker' });

  let Shared: typeof SharedWorker | undefined;
  if (typeof NativeSharedWorker === 'function') {
    class ConfinedSharedWorker extends NativeSharedWorker {
      constructor(input: string | URL, optionsOrName: string | WorkerOptions = {}) {
        const sharedOptions =
          typeof optionsOrName === 'string'
            ? { name: optionsOrName }
            : optionsOrName || {};
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
    Worker: ConfinedWorker,
    SharedWorker: Shared,
    dispose() {
      for (const worker of workers) NativeWorker.prototype.terminate.call(worker);
      for (const port of ports) port.close();
      workers.clear();
      ports.clear();
    },
  };
}
