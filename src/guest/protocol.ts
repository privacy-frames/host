/** Native operations are policy decisions supplied by the owning browser host. */
export interface GuestHost {
  /** Recognize host-specific native brands before probing unrelated builtins. */
  owns?(target: object): boolean;
  get(target: object, key: PropertyKey): unknown;
  set(target: object, key: PropertyKey, value: unknown): boolean;
  delete?(target: object, key: PropertyKey): boolean;
  /** Web IDL named/indexed setters may accept keys not yet present on the object. */
  settable?(target: object, key: PropertyKey): boolean;
  call(target: Function, receiver: unknown, arguments_: unknown[]): unknown;
  construct(target: Function, arguments_: unknown[], newTarget?: Function): object;
  ownKeys(target: object): (string | symbol)[];
  descriptor(target: object, key: PropertyKey): PropertyDescriptor | undefined;
  /** Undefined defers prototype production: ordinary lookup may stop, but must
   * retry later. Explicit prototype reflection rejects until a value is ready. */
  prototype(target: object): object | null | undefined;
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
