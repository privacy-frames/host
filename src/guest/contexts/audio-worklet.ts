import { allocateIdentity, type IdentityState } from '../identity.ts';
import type { GuestContextCatalog } from './types.ts';

export interface GuestAudioModule {
  url: string;
  modules: ReadonlyMap<string, string>;
}

export interface GuestAudioWorkletOptions {
  catalog: GuestContextCatalog;
  prepare(input: string): GuestAudioModule;
}

interface PendingModule {
  resolve(): void;
  reject(error: Error): void;
}

interface AudioController {
  node: AudioWorkletNode;
  ready: Promise<void>;
  queue: Promise<void>;
  pending: Map<number, PendingModule>;
  loaded: Set<string>;
  failed: Map<string, Error>;
  identities: IdentityState;
  closed: boolean;
  fail(error: Error): void;
}

interface ContextOwnership {
  owners: Set<object>;
  controller?: AudioController;
}

const contexts = new WeakMap<
  BaseAudioContext,
  {
    application: string;
    generation: string;
    ownership: ContextOwnership;
    loading: Promise<AudioController>;
  }
>();

/** Native worklets load only the trusted interpreter entry; guest modules use its port. */
export function createGuestAudioWorklets(options: GuestAudioWorkletOptions) {
  const owned = new Set<ContextOwnership>();
  const owner = {};
  let compiled: Promise<WebAssembly.Module> | undefined;
  let disposed = false;

  async function controller(context: BaseAudioContext): Promise<AudioController> {
    if (disposed) throw new Error('Guest audio worklet manager is closed');
    const existing = contexts.get(context);
    if (existing) {
      if (
        existing.application !== options.catalog.application ||
        existing.generation !== options.catalog.generation
      )
        throw new DOMException(
          'Audio context belongs to another installation',
          'SecurityError',
        );
      existing.ownership.owners.add(owner);
      owned.add(existing.ownership);
      const value = await existing.loading;
      if (disposed || value.closed) throw new Error('Guest audio environment is closed');
      return value;
    }
    const ownership: ContextOwnership = {
      owners: new Set([owner]),
      controller: undefined,
    };
    owned.add(ownership);
    const loading = (async () => {
      const address = URL.createObjectURL(
        new Blob([options.catalog.workerBootstrap.worklet], { type: 'text/javascript' }),
      );
      try {
        await context.audioWorklet.addModule(address);
      } finally {
        URL.revokeObjectURL(address);
      }
      if (!ownership.owners.size)
        throw new Error('Guest audio worklet manager is closed');
      const module = await (compiled ||= WebAssembly.compile(options.catalog.engineWasm));
      if (!ownership.owners.size)
        throw new Error('Guest audio worklet manager is closed');
      const node = new AudioWorkletNode(context, 'privacy-frames:bootstrap', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { module },
      });
      let resolveReady: () => void;
      let rejectReady: (error: Error) => void;
      const ready = new Promise<void>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      });
      const value: AudioController = {
        node,
        ready,
        queue: ready,
        pending: new Map(),
        loaded: new Set(),
        failed: new Map(),
        identities: { next: 1 },
        closed: false,
        fail(error) {
          if (value.closed) return;
          value.closed = true;
          rejectReady(error);
          for (const pending of value.pending.values()) pending.reject(error);
          value.pending.clear();
          try {
            node.port.postMessage({ type: 'close' });
          } finally {
            node.port.close();
            node.disconnect();
          }
        },
      };
      const fail = value.fail;
      node.addEventListener('processorerror', () =>
        fail(new Error('Guest audio engine failed')),
      );
      node.port.onmessage = (event: MessageEvent<unknown>) => {
        const packet = event.data;
        if (value.closed) return;
        if (typeof packet !== 'object' || packet === null || !('type' in packet)) return;
        if (packet.type === 'ready') {
          if ('ok' in packet && packet.ok === true) resolveReady();
          else
            fail(
              new Error(
                'error' in packet ? String(packet.error) : 'Guest audio engine failed',
              ),
            );
        } else if (
          packet.type === 'module' &&
          'id' in packet &&
          typeof packet.id === 'number'
        ) {
          const pending = value.pending.get(packet.id);
          if (!pending) return;
          value.pending.delete(packet.id);
          if ('ok' in packet && packet.ok === true) pending.resolve();
          else
            pending.reject(
              new Error('error' in packet ? String(packet.error) : 'Audio module failed'),
            );
        }
      };
      ownership.controller = value;
      if (!ownership.owners.size)
        value.fail(new Error('Guest audio environment is closed'));
      await ready;
      return value;
    })();
    contexts.set(context, {
      application: options.catalog.application,
      generation: options.catalog.generation,
      ownership,
      loading,
    });
    try {
      const value = await loading;
      if (disposed || value.closed) throw new Error('Guest audio environment is closed');
      return value;
    } catch (error) {
      if (
        (!ownership.controller || ownership.controller.closed) &&
        contexts.get(context)?.ownership === ownership
      )
        contexts.delete(context);
      throw error;
    }
  }

  return {
    async addModule(context: BaseAudioContext, input: string): Promise<void> {
      const prepared = options.prepare(input);
      const target = await controller(context);
      const load = target.queue.then(() => {
        if (disposed || target.closed)
          throw new Error('Guest audio environment is closed');
        if (target.loaded.has(prepared.url)) return;
        const failed = target.failed.get(prepared.url);
        if (failed) throw failed;
        return new Promise<void>((resolve, reject) => {
          const id = allocateIdentity(target.identities);
          if (id === undefined) {
            reject(new RangeError('Audio module identities exhausted'));
            return;
          }
          target.pending.set(id, {
            resolve() {
              target.loaded.add(prepared.url);
              resolve();
            },
            reject(error) {
              target.failed.set(prepared.url, error);
              reject(error);
            },
          });
          try {
            target.node.port.postMessage({
              type: 'module',
              id,
              url: prepared.url,
              modules: [...prepared.modules],
            });
          } catch (error) {
            target.pending.delete(id);
            reject(error);
          }
        });
      });
      target.queue = load.catch(() => {});
      return load;
    },
    dispose(): void {
      disposed = true;
      for (const ownership of owned) {
        ownership.owners.delete(owner);
        if (!ownership.owners.size)
          ownership.controller?.fail(new Error('Guest audio worklet manager is closed'));
      }
      owned.clear();
    },
  };
}
