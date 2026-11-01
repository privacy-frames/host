import type { WorkletGraph } from './worklet-graph.ts';

export const WORKLET_POLICY_VERSION = 2;
export const WORKLET_REQUEST = 'privacy-worklet-prepare';
export const WORKLET_IMPORTS = 'privacy-frames:worklet-imports';
export type WorkletKind = 'audio' | 'paint';
export interface WorkletIdentity {
  version: number;
  id: string;
  application: string;
  generation: string;
  parentClient: string;
  kind: WorkletKind;
}
export type WorkletModuleSource =
  | { kind: 'resource'; url: string }
  | { kind: 'blob'; url: string; text: string; contentType: string };
export interface WorkletRegistration {
  id: string;
  kind: WorkletKind;
  entry: string;
  guard: string;
  graph: WorkletGraph | null;
}
