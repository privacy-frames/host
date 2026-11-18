export interface GuestResult {
  identity: boolean;
  appendIdentity: boolean;
  instance: boolean;
  branding: string;
  nativeRead: string;
  conversion: string;
  extension: string;
  forgedReceiverRejected: boolean;
  wrongArgumentRejected: boolean;
  illegalConstructorRejected: boolean;
  guestConstructor: string;
}

export interface BindingSuccess {
  status: 'passed';
  guest: GuestResult;
  nativeMutation: string;
  nativeText: string | null;
  nodeCount: number;
  engineStartupMs: number;
  totalMs: number;
  nativeScriptExecuted: boolean;
}

export type BindingObservation =
  | BindingSuccess
  | {
      status: 'failed';
      error: string;
      stack?: string;
    };

declare global {
  var probeResult: BindingObservation | undefined;
}
