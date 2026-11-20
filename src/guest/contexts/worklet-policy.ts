import { createNativeHost } from '../native-host.ts';
import {
  NativePolicy,
  NativePolicyError,
  type NativeContract,
  type NativeMemberRule,
} from '../native-policy.ts';
import { registerMessagePortPolicy } from '../message-port-policy.ts';

export interface WorkletHostOptions {
  global: object;
  console: Console;
  controlPort: MessagePort;
  isGuestValue(value: object): boolean;
  registerProcessor(name: unknown, parameters: unknown): void;
  takePort(): MessagePort;
  detachTransferred(values: readonly object[]): void;
}

const apply = Reflect.apply;
const descriptor = Object.getOwnPropertyDescriptor;
const object = (value: unknown): value is object =>
  value !== null && (typeof value === 'object' || typeof value === 'function');
const contract = (
  id: string,
  result: NativeContract['result'] = 'data',
): NativeContract => ({ id, result, effect: 'local-data', callbacks: 'none' });

/** No native worklet capability is exposed without an explicit declaration. */
export function createWorkletHost(options: WorkletHostOptions) {
  const owned = new WeakSet<object>();
  const registry = new NativePolicy({ isGuestValue: options.isGuestValue });
  const host = createNativeHost({
    name: 'AudioWorklet',
    registry,
    owns: (target) => owned.has(target),
    admit: (target) => owned.has(target),
    result(value, contract) {
      if (contract.result === 'reference' && object(value) && !owned.has(value))
        throw new NativePolicyError(
          'return',
          contract.id,
          undefined,
          'unowned worklet reference',
        );
      return value;
    },
    functionPrototype: Function.prototype,
    prototype: (target) =>
      target === options.global || target === options.console || target === callbacks
        ? Object.prototype
        : (registry.prototype(target) ?? Object.prototype),
  });
  const ports = registerMessagePortPolicy({
    registry,
    owned,
    controlPort: options.controlPort,
    isGuestValue: options.isGuestValue,
    captureCallableShape: host.captureCallableShape,
    detachTransferred: options.detachTransferred,
  });
  const callbacks = {
    registerProcessor: options.registerProcessor,
    takePort() {
      const port = options.takePort();
      ports.admitPort(port);
      return port;
    },
  };
  registry.registerFacade(callbacks, {
    name: 'Worklet callbacks',
    members: [
      {
        key: 'registerProcessor',
        call: {
          contract: contract('Worklet.registerProcessor', 'none'),
          receiver: 'ignored',
          call: ({ arguments: args }) => options.registerProcessor(args[0], args[1]),
        },
      },
      {
        key: 'takePort',
        call: {
          contract: contract('Worklet.takePort', 'reference'),
          receiver: 'ignored',
          call: () => callbacks.takePort(),
        },
      },
    ],
  });
  owned.add(callbacks);
  const numeric: NativeMemberRule[] = [];
  for (const key of ['currentFrame', 'currentTime', 'sampleRate']) {
    if (!Reflect.has(options.global, key)) continue;
    numeric.push({
      key,
      read: {
        contract: contract(`AudioWorklet.${key}`),
        read: ({ receiver, descriptor }) => {
          const value: unknown = descriptor.get
            ? apply(descriptor.get, receiver, [])
            : descriptor.value;
          if (typeof value !== 'number')
            throw new TypeError('Audio timing property is not numeric');
          return value;
        },
      },
    });
  }
  registry.registerFacade(options.global, {
    name: 'AudioWorklet timing',
    members: numeric,
  });
  owned.add(options.global);

  const logs: NativeMemberRule[] = [];
  for (const key of [
    'assert',
    'clear',
    'count',
    'countReset',
    'debug',
    'dir',
    'dirxml',
    'error',
    'group',
    'groupCollapsed',
    'groupEnd',
    'info',
    'log',
    'table',
    'time',
    'timeEnd',
    'timeLog',
    'trace',
    'warn',
  ]) {
    let owner: object | null = options.console;
    let captured: PropertyDescriptor | undefined;
    while (owner && !(captured = descriptor(owner, key)))
      owner = Object.getPrototypeOf(owner);
    if (typeof captured?.value !== 'function') continue;
    const id = `console.${key}`;
    host.captureCallableShape(id, captured.value);
    logs.push({
      key,
      call: {
        contract: contract(id, 'none'),
        receiver: 'ignored',
        call: ({ target, arguments: args }) => apply(target, options.console, args),
      },
    });
  }
  registry.registerFacade(options.console, { name: 'Worklet console', members: logs });
  owned.add(options.console);
  return {
    host,
    registerProcessor: host.get(callbacks, 'registerProcessor'),
    takePort: host.get(callbacks, 'takePort'),
    console: options.console,
  };
}
