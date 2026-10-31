export const INSTALLED_CONTENT_REQUEST = 'privacy-installed-content';

/** Publicly downloaded resources become immutable installation inputs. */
export interface Resource {
  path: string;
  url: string;
  contentType: string;
  sha256: string;
  documentBase?: string;
}
export interface DownloadedResource extends Resource {
  bytes: ArrayBuffer;
}
export interface InstallationMetadata {
  id: string;
  name: string;
  entry: string;
}
export type ResourceListInput =
  { kind: 'url'; url: string } | { kind: 'text'; text: string };
export interface InstallationRequest {
  url: string;
  resourceList?: ResourceListInput;
}
export interface UnavailableResource {
  url: string;
  reason: 'network' | 'http' | 'body';
  status?: number;
}
export interface ResourceCaptureSummary {
  additionalResources: string[];
  unavailableResources: UnavailableResource[];
}
export interface Installation {
  format: 'offline-resources-v1';
  id: string;
  documentBase?: string;
  manifest: InstallationMetadata;
  source: string;
  resources: Resource[];
  publisherManifest?: { url: string; value: Record<string, unknown> } | null;
  size: number;
  installedAt: string;
  capture: ResourceCaptureSummary;
}
export interface PreparedInstallation extends Omit<Installation, 'resources'> {
  resources: DownloadedResource[];
}
export interface HostConfig {
  managerURL: string;
  runtimeURL: string;
  installationURL: string;
  managerOrigins: string[];
  examples: { name: string; url: string; resourceListURL?: string }[];
}
export type ManagementOperation = 'install' | 'list' | 'remove' | 'events';
export interface RuntimeEvent {
  kind: string;
  url: string;
  method: string;
  time: string;
}
