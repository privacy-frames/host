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
  owners: Set<object>;
  closed: boolean;
  fail(error: Error): void;
}

const contexts = new WeakMap<
  BaseAudioContext,
  {
    application: string;
    generation: string;
    loading: Promise<AudioController>;
  }
>();

/** Native worklets load only the trusted interpreter entry; guest modules use its port. */
export function createGuestAudioWorklets(options: GuestAudioWorkletOptions) {
  const active = new Set<AudioController>();
  const owner = {};
  let compiled: Promise<WebAssembly.Module> | undefined;
  let nextModule = 1;
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
      const value = await existing.loading;
      if (value.closed) throw new Error('Guest audio environment is closed');
      value.owners.add(owner);
      active.add(value);
      return value;
    }
    const loading = (async () => {
      const address = new URL('guest-worklet.js', options.catalog.runtimeURL);
      await context.audioWorklet.addModule(address);
      const module = await (compiled ||= WebAssembly.compile(options.catalog.engineWasm));
      if (disposed) throw new Error('Guest audio worklet manager is closed');
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
        owners: new Set([owner]),
        closed: false,
        fail(error) {
          rejectReady(error);
          for (const pending of value.pending.values()) pending.reject(error);
          value.pending.clear();
        },
      };
      const fail = value.fail;
      node.addEventListener('processorerror', () =>
        fail(new Error('Guest audio engine failed')),
      );
      node.port.onmessage = (event: MessageEvent<unknown>) => {
        const packet = event.data;
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
      active.add(value);
      await ready;
      return value;
    })();
    contexts.set(context, {
      application: options.catalog.application,
      generation: options.catalog.generation,
      loading,
    });
    try {
      return await loading;
    } catch (error) {
      contexts.delete(context);
      throw error;
    }
  }

  return {
    async addModule(context: BaseAudioContext, input: string): Promise<void> {
      const prepared = options.prepare(input);
      const target = await controller(context);
      const load = target.queue.then(() => {
        if (target.loaded.has(prepared.url)) return;
        const failed = target.failed.get(prepared.url);
        if (failed) throw failed;
        return new Promise<void>((resolve, reject) => {
          if (disposed) {
            reject(new Error('Guest audio worklet manager is closed'));
            return;
          }
          const id = nextModule++;
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
      for (const target of active) {
        target.owners.delete(owner);
        if (target.owners.size) continue;
        target.closed = true;
        target.fail(new Error('Guest audio worklet manager is closed'));
        target.node.port.postMessage({ type: 'close' });
        target.node.port.close();
        target.node.disconnect();
      }
      active.clear();
    },
  };
}
