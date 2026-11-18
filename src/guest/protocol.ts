/** Native operations are policy decisions supplied by the owning browser host. */
export interface GuestHost {
  get(target: object, key: PropertyKey): unknown;
  set(target: object, key: PropertyKey, value: unknown): boolean;
  delete?(target: object, key: PropertyKey): boolean;
  /** Web IDL named/indexed setters may accept keys not yet present on the object. */
  settable?(target: object, key: PropertyKey): boolean;
  call(target: Function, receiver: unknown, arguments_: unknown[]): unknown;
  construct(target: Function, arguments_: unknown[]): object;
  ownKeys(target: object): (string | symbol)[];
  descriptor(target: object, key: PropertyKey): PropertyDescriptor | undefined;
  prototype(target: object): object | null;
}

export interface GuestEngineOptions {
  host: GuestHost;
  /** A precompiled module also works in native worklets without fetch. */
  wasmModule?: WebAssembly.Module;
  wasmURL?: string;
  modules?: ReadonlyMap<string, string>;
  resolveModule?: (specifier: string, referrer: string) => string;
  globalObject?: object;
  memoryLimit?: number;
  stackSize?: number;
  onError?: (error: Error) => void;
}

export type GuestEvaluationMode = 'global' | 'module';
