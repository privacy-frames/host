import { GuestEngine } from '../engine.ts';
import { allocateIdentity } from '../identity.ts';
import { guestProcessorName } from './processor-name.ts';
import {
  closeContextPublication,
  isCurrentContextPublication,
  type ContextPublicationState,
} from './lifecycle-kernel.ts';
import { createWorkletHost } from './worklet-policy.ts';
import { installWorkletGuestRuntime } from './worklet-runtime.ts';

interface NativeProcessor {
  readonly port: MessagePort;
}
interface NativeProcessorConstructor {
  new (options?: AudioWorkletNodeOptions): NativeProcessor;
}
declare const AudioWorkletProcessor: NativeProcessorConstructor;
declare function registerProcessor(
  name: string,
  constructor: NativeProcessorConstructor,
): void;

interface GuestProcessorHelpers {
  construct: Function;
  process: Function;
  release: Function;
}

interface WorkletState extends ContextPublicationState {
  engine?: GuestEngine;
  helpers?: GuestProcessorHelpers;
  constructingPort?: MessagePort;
  modules: Map<string, string>;
}

function close(state: WorkletState, port: MessagePort): void {
  if (state.closed) return;
  closeContextPublication(state);
  const engine = state.engine;
  state.engine = undefined;
  state.helpers = undefined;
  state.constructingPort = undefined;
  state.modules.clear();
  try {
    engine?.dispose();
  } finally {
    port.close();
  }
}

function helpersFrom(value: unknown): GuestProcessorHelpers {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('construct' in value) ||
    !('process' in value) ||
    !('release' in value) ||
    typeof value.construct !== 'function' ||
    typeof value.process !== 'function' ||
    typeof value.release !== 'function'
  )
    throw new Error('Guest audio processor helpers are unavailable');
  return { construct: value.construct, process: value.process, release: value.release };
}

function registerGuestProcessor(
  state: WorkletState,
  name: unknown,
  parameters: unknown,
): void {
  const logicalName = guestProcessorName(name);
  const token = state.token;
  if (!isCurrentContextPublication(state, token))
    throw new Error('Guest audio environment is closed');
  class ConfinedProcessor extends AudioWorkletProcessor {
    private instance: number;

    constructor(options: AudioWorkletNodeOptions = {}) {
      super(options);
      const engine = state.engine;
      const helpers = state.helpers;
      if (!isCurrentContextPublication(state, token) || !engine || !helpers)
        throw new Error('Guest audio engine is not initialized');
      const previousPort = state.constructingPort;
      state.constructingPort = this.port;
      try {
        const instance = engine.call(helpers.construct, [logicalName, options]);
        if (
          typeof instance !== 'number' ||
          !Number.isSafeInteger(instance) ||
          instance < 1
        )
          throw new TypeError('Invalid guest audio instance');
        this.instance = instance;
      } finally {
        state.constructingPort = previousPort;
      }
    }

    static get parameterDescriptors(): unknown {
      return parameters;
    }

    process(
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>,
    ): boolean {
      const engine = state.engine;
      const helpers = state.helpers;
      if (!isCurrentContextPublication(state, token) || !engine || !helpers) return false;
      const result = engine.call(helpers.process, [
        this.instance,
        inputs,
        outputs,
        parameters,
      ]);
      if (!isCurrentContextPublication(state, token)) return false;
      if (
        typeof result !== 'object' ||
        result === null ||
        !('active' in result) ||
        !('outputs' in result) ||
        !Array.isArray(result.outputs)
      )
        throw new TypeError('Guest audio process returned an invalid result');
      for (let bus = 0; bus < outputs.length; bus++) {
        const channels: unknown = result.outputs[bus];
        if (!Array.isArray(channels) || channels.length !== outputs[bus].length)
          throw new TypeError('Guest audio channel count changed');
        for (let channel = 0; channel < outputs[bus].length; channel++) {
          const values: unknown = channels[channel];
          if (
            !(values instanceof Float32Array) ||
            values.length !== outputs[bus][channel].length
          )
            throw new TypeError('Guest audio buffer length changed');
          outputs[bus][channel].set(values);
        }
      }
      return Boolean(result.active);
    }
  }
  registerProcessor(logicalName, ConfinedProcessor);
}

registerProcessor(
  'privacy-frames:bootstrap',
  class extends AudioWorkletProcessor {
    constructor(options?: AudioWorkletNodeOptions) {
      super(options);
      const module: unknown = options?.processorOptions?.module;
      if (!(module instanceof WebAssembly.Module))
        throw new TypeError('Trusted audio engine module is missing');
      const state: WorkletState = {
        token: {},
        engine: undefined,
        helpers: undefined,
        constructingPort: undefined,
        modules: new Map(),
        closed: false,
      };
      const token = state.token;
      this.port.onmessage = (event: MessageEvent<unknown>) => {
        if (!isCurrentContextPublication(state, token)) return;
        const packet = event.data;
        if (typeof packet !== 'object' || packet === null || !('type' in packet)) return;
        if (packet.type === 'close') {
          close(state, this.port);
          return;
        }
        if (
          packet.type !== 'module' ||
          !('id' in packet) ||
          !('url' in packet) ||
          !('modules' in packet) ||
          typeof packet.id !== 'number' ||
          !Number.isSafeInteger(packet.id) ||
          packet.id < 1 ||
          typeof packet.url !== 'string' ||
          !Array.isArray(packet.modules)
        )
          return;
        const id = packet.id;
        const url = packet.url;
        const suppliedModules = packet.modules;
        void (async () => {
          const engine = state.engine;
          if (!engine) throw new Error('Guest audio engine is unavailable');
          const admitted = new Map<string, string>();
          for (const pair of suppliedModules) {
            if (
              !Array.isArray(pair) ||
              pair.length !== 2 ||
              pair.some((item) => typeof item !== 'string')
            )
              throw new TypeError('Invalid guest audio module catalog');
            admitted.set(pair[0], pair[1]);
          }
          const source = admitted.get(url);
          if (source === undefined) throw new TypeError('Audio module is not installed');
          for (const [url, source] of admitted) state.modules.set(url, source);
          await engine.evaluate(source, url, 'module');
          if (!isCurrentContextPublication(state, token) || state.engine !== engine)
            return;
          engine.drainJobs();
          this.port.postMessage({ type: 'module', id, ok: true });
        })().catch((error: unknown) => {
          if (isCurrentContextPublication(state, token))
            this.port.postMessage({
              type: 'module',
              id,
              ok: false,
              error: String(error),
            });
        });
      };
      const policy = createWorkletHost({
        global: globalThis,
        console,
        controlPort: this.port,
        isGuestValue: (value) => state.engine?.ownsGuestValue(value) ?? false,
        registerProcessor: (name, parameters) =>
          registerGuestProcessor(state, name, parameters),
        takePort: () => {
          if (!isCurrentContextPublication(state, token) || !state.constructingPort)
            throw new TypeError('Audio processor construction is not active');
          return state.constructingPort;
        },
        detachTransferred: (values) => state.engine?.detachTransferred(values),
      });
      void GuestEngine.create({
        wasmModule: module,
        modules: state.modules,
        host: policy.host,
      })
        .then((created) => {
          if (!isCurrentContextPublication(state, token)) {
            created.dispose();
            return;
          }
          try {
            created.set('__privacyRegisterProcessor', policy.registerProcessor);
            created.set('__privacyProcessorPort', policy.takePort);
            created.set('console', policy.console);
            for (const name of ['currentFrame', 'currentTime', 'sampleRate'])
              created.bind(name, globalThis);
            const helpers = helpersFrom(
              created.evaluate(
                `(${installWorkletGuestRuntime.toString()})(${allocateIdentity.toString()})`,
              ),
            );
            state.engine = created;
            state.helpers = helpers;
            this.port.postMessage({ type: 'ready', ok: true });
          } catch (error) {
            created.dispose();
            throw error;
          }
        })
        .catch((error: unknown) => {
          if (!isCurrentContextPublication(state, token)) return;
          try {
            this.port.postMessage({ type: 'ready', ok: false, error: String(error) });
          } finally {
            close(state, this.port);
          }
        });
      this.running = () => isCurrentContextPublication(state, token);
    }

    private running: () => boolean;

    process(): boolean {
      return this.running();
    }
  },
);
