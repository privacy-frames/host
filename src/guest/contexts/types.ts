export type GuestContextKind = 'window' | 'dedicated-worker' | 'shared-worker';
export type GuestScriptType = 'classic' | 'module';

export interface GuestAudioParamDescriptor {
  name: string;
  defaultValue?: number;
  minValue?: number;
  maxValue?: number;
  automationRate?: AutomationRate;
}

/** Immutable admitted bytes are supplied before any guest source executes. */
export interface GuestContextResource {
  url: string;
  path: string;
  contentType: string;
  bytes: ArrayBuffer;
}

export interface GuestContextCatalog {
  application: string;
  generation: string;
  sourceURL: string;
  documentBase: string;
  runtimeURL: string;
  applicationURL: string;
  engineWasm: ArrayBuffer;
  resources: GuestContextResource[];
}

export interface GuestWorkerInitialization {
  kind: 'privacy-frames:guest-worker';
  catalog: GuestContextCatalog;
  entryURL: string;
  scriptType: GuestScriptType;
  name?: string;
}

export interface GuestWorkerSession {
  /** Guest source is evaluated only after its complete environment is prepared. */
  start(entryURL: string, type: GuestScriptType): void | Promise<void>;
  close(): void;
}

export type GuestWorkerSessionFactory = (
  initialization: GuestWorkerInitialization,
  scope: DedicatedWorkerGlobalScope | SharedWorkerGlobalScope,
) => Promise<GuestWorkerSession>;

export interface GuestWorkerFactoryOptions {
  catalog: GuestContextCatalog;
  /** Maps an admitted resource or a host-created Blob URL to guest source. */
  prepare(entryURL: string, type: GuestScriptType): GuestWorkerInitialization;
  /** Called only after the browser accepts the transfer operation. */
  commitTransfers(transfer: readonly Transferable[]): void;
}
