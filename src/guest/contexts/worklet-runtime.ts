import type { GuestAudioParamDescriptor } from './types.ts';

/** Trusted setup evaluated inside QuickJS; application processor source is unchanged. */
export function installWorkletGuestRuntime() {
  interface Processor {
    process(
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>,
    ): boolean;
  }
  interface ProcessorState {
    instance: Processor;
    inputs: Float32Array[][];
    outputs: Float32Array[][];
    parameters: Record<string, Float32Array>;
  }
  type ProcessorConstructor = {
    new (options: AudioWorkletNodeOptions): Processor;
    prototype: Processor;
    parameterDescriptors?: GuestAudioParamDescriptor[];
  };
  const nativeRegister: (name: string, parameters: GuestAudioParamDescriptor[]) => void =
    Reflect.get(globalThis, '__privacyRegisterProcessor');
  const takePort: () => MessagePort = Reflect.get(globalThis, '__privacyProcessorPort');
  Reflect.deleteProperty(globalThis, '__privacyRegisterProcessor');
  Reflect.deleteProperty(globalThis, '__privacyProcessorPort');

  const constructors = new Map<string, ProcessorConstructor>();
  const instances = new Map<number, ProcessorState>();
  const construct = Reflect.construct;
  const ProxyConstructor = Proxy;
  let nextInstance = 1;

  class GuestAudioWorkletProcessor {
    readonly port: MessagePort;

    constructor() {
      this.port = takePort();
    }
  }
  Object.defineProperty(GuestAudioWorkletProcessor, 'name', {
    value: 'AudioWorkletProcessor',
  });
  Reflect.set(globalThis, 'AudioWorkletProcessor', GuestAudioWorkletProcessor);
  Reflect.set(
    globalThis,
    'registerProcessor',
    (name: string, constructor: ProcessorConstructor) => {
      if (
        typeof constructor !== 'function' ||
        typeof constructor.prototype?.process !== 'function'
      )
        throw new TypeError('Audio processor must provide a process method');
      // A proxy has [[Construct]] only when its target does. Its trap avoids
      // invoking user code merely to validate the registration constructor.
      construct(new ProxyConstructor(constructor, { construct: () => ({}) }), []);
      const logicalName = String(name);
      if (logicalName.startsWith('privacy-frames:'))
        throw new TypeError('Audio processor name is reserved by the host');
      nativeRegister(logicalName, constructor.parameterDescriptors || []);
      constructors.set(logicalName, constructor);
    },
  );

  function channels(
    previous: Float32Array[][],
    next: Float32Array[][],
  ): Float32Array[][] {
    previous.length = next.length;
    for (let bus = 0; bus < next.length; bus++) {
      const current = previous[bus] || [];
      current.length = next[bus].length;
      for (let channel = 0; channel < next[bus].length; channel++) {
        const values = next[bus][channel];
        if (!current[channel] || current[channel].length !== values.length)
          current[channel] = new Float32Array(values.length);
        current[channel].set(values);
      }
      previous[bus] = current;
    }
    return previous;
  }

  return {
    construct(name: string, options: AudioWorkletNodeOptions): number {
      const Constructor = constructors.get(name);
      if (!Constructor) throw new TypeError('Audio processor is not registered');
      const instance = new Constructor(options);
      const id = nextInstance++;
      instances.set(id, { instance, inputs: [], outputs: [], parameters: {} });
      return id;
    },
    process(
      id: number,
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>,
    ) {
      const current = instances.get(id);
      if (!current) return { active: false, outputs };
      channels(current.inputs, inputs);
      channels(current.outputs, outputs);
      for (const key of Object.keys(current.parameters)) {
        if (!(key in parameters)) delete current.parameters[key];
      }
      for (const [name, values] of Object.entries(parameters)) {
        const previous = current.parameters[name];
        if (!previous || previous.length !== values.length)
          current.parameters[name] = new Float32Array(values.length);
        current.parameters[name].set(values);
      }
      const active = Boolean(
        current.instance.process(current.inputs, current.outputs, current.parameters),
      );
      if (!active) instances.delete(id);
      return { active, outputs: current.outputs };
    },
    release(id: number): void {
      instances.delete(id);
    },
  };
}
