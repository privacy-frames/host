import { GuestEngine } from '../engine.ts';
import type { GuestHost } from '../protocol.ts';
import { installWorkletGuestRuntime } from './worklet-runtime.ts';
import type { GuestAudioParamDescriptor } from './types.ts';

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

let engine: GuestEngine | undefined;
let helpers: GuestProcessorHelpers | undefined;
let constructingPort: MessagePort | undefined;
const modules = new Map<string, string>();

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

const host: GuestHost = {
  get: (target, key) => Reflect.get(target, key),
  set: (target, key, value) => Reflect.set(target, key, value),
  ownKeys: (target) => Reflect.ownKeys(target),
  descriptor: (target, key) => Reflect.getOwnPropertyDescriptor(target, key),
  prototype: (target) => Reflect.getPrototypeOf(target),
  construct: (target, args) => Reflect.construct(target, args),
  call(target, receiver, args) {
    const value = Reflect.apply(target, receiver, args);
    if (
      typeof MessagePort !== 'undefined' &&
      receiver instanceof MessagePort &&
      target === MessagePort.prototype.postMessage
    ) {
      const options = args[1];
      const transfer = Array.isArray(options)
        ? options
        : options && typeof options === 'object' && 'transfer' in options
          ? options.transfer
          : [];
      if (Array.isArray(transfer)) engine?.detachTransferred(transfer);
    }
    return value;
  },
};

function registerGuestProcessor(
  name: string,
  parameters: GuestAudioParamDescriptor[],
): void {
  class ConfinedProcessor extends AudioWorkletProcessor {
    private instance: number;

    constructor(options: AudioWorkletNodeOptions = {}) {
      super(options);
      if (!engine || !helpers) throw new Error('Guest audio engine is not initialized');
      constructingPort = this.port;
      try {
        const instance = engine.call(helpers.construct, [name, options]);
        if (typeof instance !== 'number')
          throw new TypeError('Invalid guest audio instance');
        this.instance = instance;
      } finally {
        constructingPort = undefined;
      }
    }

    static get parameterDescriptors(): GuestAudioParamDescriptor[] {
      return parameters;
    }

    process(
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>,
    ): boolean {
      if (!engine || !helpers) return false;
      const result = engine.call(helpers.process, [
        this.instance,
        inputs,
        outputs,
        parameters,
      ]);
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
  registerProcessor(name, ConfinedProcessor);
}

registerProcessor(
  'privacy-frames:bootstrap',
  class extends AudioWorkletProcessor {
    constructor(options?: AudioWorkletNodeOptions) {
      super(options);
      const module: unknown = options?.processorOptions?.module;
      if (!(module instanceof WebAssembly.Module))
        throw new TypeError('Trusted audio engine module is missing');
      this.port.onmessage = (event: MessageEvent<unknown>) => {
        const packet = event.data;
        if (typeof packet !== 'object' || packet === null || !('type' in packet)) return;
        if (packet.type === 'close') {
          engine?.dispose();
          engine = undefined;
          helpers = undefined;
          modules.clear();
          this.port.close();
          return;
        }
        if (
          packet.type !== 'module' ||
          !('id' in packet) ||
          !('url' in packet) ||
          !('modules' in packet) ||
          typeof packet.id !== 'number' ||
          typeof packet.url !== 'string' ||
          !Array.isArray(packet.modules)
        )
          return;
        const id = packet.id;
        const url = packet.url;
        const suppliedModules = packet.modules;
        void (async () => {
          if (!engine) throw new Error('Guest audio engine is unavailable');
          for (const pair of suppliedModules) {
            if (
              !Array.isArray(pair) ||
              pair.length !== 2 ||
              pair.some((item) => typeof item !== 'string')
            )
              throw new TypeError('Invalid guest audio module catalog');
            modules.set(pair[0], pair[1]);
          }
          const source = modules.get(url);
          if (source === undefined) throw new TypeError('Audio module is not installed');
          await engine.evaluate(source, url, 'module');
          engine.drainJobs();
          this.port.postMessage({ type: 'module', id, ok: true });
        })().catch((error: unknown) => {
          this.port.postMessage({ type: 'module', id, ok: false, error: String(error) });
        });
      };
      void GuestEngine.create({ wasmModule: module, modules, host })
        .then((created) => {
          engine = created;
          created.set('__privacyRegisterProcessor', registerGuestProcessor);
          created.set('__privacyProcessorPort', () => {
            if (!constructingPort)
              throw new TypeError('Audio processor construction is not active');
            return constructingPort;
          });
          created.set('console', console);
          for (const name of ['currentFrame', 'currentTime', 'sampleRate'])
            created.bind(name, globalThis);
          helpers = helpersFrom(
            created.evaluate(`(${installWorkletGuestRuntime.toString()})()`),
          );
          this.port.postMessage({ type: 'ready', ok: true });
        })
        .catch((error: unknown) => {
          this.port.postMessage({ type: 'ready', ok: false, error: String(error) });
        });
    }

    process(): boolean {
      return true;
    }
  },
);
