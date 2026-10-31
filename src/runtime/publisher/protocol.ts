import { CONTEXT_POLICY_VERSION } from '../../shared/context-policy.ts';
import type { PublisherRegistration } from './store.ts';
import { strings, internalRecord, internalData } from '../../shared/primordials.ts';
const namespace = 'privacy-publisher-policy-' + CONTEXT_POLICY_VERSION + ':';
const stringifyJSON = JSON.stringify;
const arrayIsArray = Array.isArray;
const parseJSON = JSON.parse;
export const PUBLISHER_RPC = 'privacy-publisher-rpc';
export const PUBLISHER_LAUNCH = 'privacy-publisher-launch';
export interface PublisherLaunch {
  registration: PublisherRegistration;
  ticket: string;
  url: string;
  name: string;
}
export function publisherObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || arrayIsArray(value))
    throw new Error('Invalid publisher-worker message');
  return internalRecord(value as Record<string, unknown>);
}
export function publisherString(value: unknown): string {
  if (typeof value !== 'string' || value.length > 32768)
    throw new Error('Invalid publisher-worker string');
  return value;
}
export function publisherName(application: string, generation: string, id: string) {
  return namespace + stringifyJSON([application, generation, id]);
}
export function parsePublisherName(value: string): [string, string, string] {
  if (!strings.startsWith(value, namespace))
    throw new Error('Invalid publisher-worker namespace');
  const fields: unknown = internalData(parseJSON(strings.slice(value, namespace.length)));
  if (
    !arrayIsArray(fields) ||
    fields.length !== 3 ||
    fields.some((field) => typeof field !== 'string' || !field)
  )
    throw new Error('Invalid publisher-worker owner');
  return [fields[0], fields[1], fields[2]];
}
export interface PublisherClientDescription {
  id: string;
  url: string;
  type: 'window';
  frameType: 'top-level' | 'nested' | 'auxiliary' | 'none';
  visibilityState: DocumentVisibilityState;
  focused: boolean;
}

export function parsePublisherRegistration(value: unknown): PublisherRegistration {
  const record = publisherObject(value);
  if (record.type !== 'classic' && record.type !== 'module')
    throw new Error('Invalid publisher worker type');
  if (
    record.state !== 'registered' &&
    record.state !== 'active' &&
    record.state !== 'closed'
  )
    throw new Error('Invalid publisher worker state');
  if (typeof record.lifecycleCompleted !== 'boolean')
    throw new Error('Invalid publisher lifecycle state');
  return internalRecord({
    id: publisherString(record.id),
    application: publisherString(record.application),
    generation: publisherString(record.generation),
    script: publisherString(record.script),
    scope: publisherString(record.scope),
    type: record.type,
    state: record.state,
    lifecycleCompleted: record.lifecycleCompleted,
  });
}
