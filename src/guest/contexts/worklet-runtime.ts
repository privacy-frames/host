import type { IdentityState } from '../identity.ts';
import type { GuestAudioParamDescriptor } from './types.ts';

/** Trusted setup evaluated inside QuickJS; application processor source is unchanged. */
export function installWorkletGuestRuntime(
  allocateIdentity: (state: IdentityState) => number | undefined,
) {
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
  const get = Reflect.get;
  const apply = Reflect.apply;
  const construct = Reflect.construct;
  const set = Reflect.set;
  const remove = Reflect.deleteProperty;
  const define = Object.defineProperty;
  const create = Object.create;
  const keys = Object.keys;
  const arrayIsArray = Array.isArray;
  const StringValue = String;
  const BooleanValue = Boolean;
  const TypeErrorConstructor = TypeError;
  const RangeErrorConstructor = RangeError;
  const startsWith = String.prototype.startsWith;
  const MapConstructor = Map;
  const mapGet = Map.prototype.get;
  const mapSet = Map.prototype.set;
  const mapDelete = Map.prototype.delete;
  const Float32 = Float32Array;
  const typedPrototype = Object.getPrototypeOf(Float32.prototype);
  const typedLength = Object.getOwnPropertyDescriptor(typedPrototype, 'length')!.get!;
  const typedName = Object.getOwnPropertyDescriptor(
    typedPrototype,
    Symbol.toStringTag,
  )!.get!;
  const typedSet = Float32.prototype.set;
  const ProxyConstructor = Proxy;
  const nativeRegister: (name: string, parameters: GuestAudioParamDescriptor[]) => void =
    get(globalThis, '__privacyRegisterProcessor');
  const takePort: () => MessagePort = get(globalThis, '__privacyProcessorPort');
  remove(globalThis, '__privacyRegisterProcessor');
  remove(globalThis, '__privacyProcessorPort');

  const constructors = new MapConstructor<string, ProcessorConstructor>();
  const instances = new MapConstructor<number, ProcessorState>();
  const instanceIdentity: IdentityState = { next: 1 };

  class GuestAudioWorkletProcessor {
    readonly port: MessagePort;

    constructor() {
      this.port = takePort();
    }
  }
  define(GuestAudioWorkletProcessor, 'name', { value: 'AudioWorkletProcessor' });
  set(globalThis, 'AudioWorkletProcessor', GuestAudioWorkletProcessor);
  set(
    globalThis,
    'registerProcessor',
    (name: string, constructor: ProcessorConstructor) => {
      if (typeof name === 'symbol')
        throw new TypeErrorConstructor('A Symbol is not a processor name');
      const logicalName = StringValue(name);
      if (apply(startsWith, logicalName, ['privacy-frames:']))
        throw new TypeErrorConstructor('Audio processor name is reserved by the host');
      if (
        typeof constructor !== 'function' ||
        typeof constructor.prototype?.process !== 'function'
      )
        throw new TypeErrorConstructor('Audio processor must provide a process method');
      // Testing [[Construct]] must not invoke the application's constructor.
      const handler = create(null);
      define(handler, 'construct', { value: () => create(null) });
      construct(new ProxyConstructor(constructor, handler), []);
      nativeRegister(logicalName, constructor.parameterDescriptors || []);
      apply(mapSet, constructors, [logicalName, constructor]);
    },
  );

  function retainedBuffer(value: unknown, length: number): value is Float32Array {
    try {
      return (
        apply(typedName, value, []) === 'Float32Array' &&
        apply(typedLength, value, []) === length
      );
    } catch {
      return false;
    }
  }

  function copyBuffer(previous: unknown, values: Float32Array): Float32Array {
    const length: number = apply(typedLength, values, []);
    const target = retainedBuffer(previous, length) ? previous : new Float32(length);
    apply(typedSet, target, [values]);
    return target;
  }

  function element(target: unknown[], index: number, value: unknown): void {
    define(target, index, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  function channels(
    previous: Float32Array[][],
    next: Float32Array[][],
  ): Float32Array[][] {
    previous.length = next.length;
    for (let bus = 0; bus < next.length; bus++) {
      const retained = previous[bus];
      const current = arrayIsArray(retained) ? retained : [];
      current.length = next[bus].length;
      for (let channel = 0; channel < next[bus].length; channel++)
        element(current, channel, copyBuffer(current[channel], next[bus][channel]));
      element(previous, bus, current);
    }
    return previous;
  }

  return {
    construct(name: string, options: AudioWorkletNodeOptions): number {
      const Constructor: ProcessorConstructor | undefined = apply(mapGet, constructors, [
        name,
      ]);
      if (!Constructor)
        throw new TypeErrorConstructor('Audio processor is not registered');
      const id = allocateIdentity(instanceIdentity);
      if (id === undefined)
        throw new RangeErrorConstructor('Audio processor identities exhausted');
      const instance = new Constructor(options);
      apply(mapSet, instances, [
        id,
        {
          instance,
          inputs: [],
          outputs: [],
          parameters: create(null),
        },
      ]);
      return id;
    },
    process(
      id: number,
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>,
    ) {
      const current: ProcessorState | undefined = apply(mapGet, instances, [id]);
      if (!current) return { active: false, outputs };
      channels(current.inputs, inputs);
      channels(current.outputs, outputs);
      const retainedNames = keys(current.parameters);
      for (let index = 0; index < retainedNames.length; index++) {
        const key = retainedNames[index];
        if (!(key in parameters)) remove(current.parameters, key);
      }
      const parameterNames = keys(parameters);
      for (let index = 0; index < parameterNames.length; index++) {
        const name = parameterNames[index];
        define(current.parameters, name, {
          value: copyBuffer(current.parameters[name], parameters[name]),
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
      const active = BooleanValue(
        current.instance.process(current.inputs, current.outputs, current.parameters),
      );
      if (!active) apply(mapDelete, instances, [id]);
      return { active, outputs: current.outputs };
    },
    release(id: number): void {
      apply(mapDelete, instances, [id]);
    },
  };
}
