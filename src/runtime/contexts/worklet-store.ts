import { strings, ownDescriptor, internalRecord } from '../../shared/primordials.ts';
import { LIMITS, isExecutableScriptType } from '../../shared/policy.ts';
import {
  WORKLET_POLICY_VERSION,
  type WorkletIdentity,
  type WorkletKind,
  type WorkletModuleSource,
} from './worklet-types.ts';
export interface WorkletActor {
  application: string;
  generation: string;
  parentClient: string;
}
export interface WorkletEntry {
  id: string;
  source: WorkletModuleSource;
}
export interface StoredWorklet extends WorkletIdentity {
  state: 'open' | 'closed';
  entries: WorkletEntry[];
}
export interface WorkletStorage {
  get(id: string): Promise<StoredWorklet | undefined>;
  put(value: StoredWorklet): Promise<void>;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const mint = crypto.randomUUID.bind(crypto);
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid worklet data');
  const property = ownDescriptor(value, key);
  if (!property || !('value' in property))
    throw new Error('Invalid worklet data property');
  return property.value;
}
export function workletIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value))
    throw new Error('Invalid worklet identifier');
  return value;
}
function label(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 512)
    throw new Error('Invalid worklet owner');
  return value;
}
export function workletKind(value: unknown): WorkletKind {
  if (value !== 'audio' && value !== 'paint') throw new Error('Invalid worklet kind');
  return value;
}
export function workletModuleSource(value: unknown): WorkletModuleSource {
  const kind = field(value, 'kind');
  const input = field(value, 'url');
  if (typeof input !== 'string') throw new Error('Missing worklet source');
  const url = new URL(input);
  if (url.username || url.password) throw new Error('Worklet URL credentials refused');
  if (kind === 'resource' && ['https:', 'http:'].includes(url.protocol))
    return internalRecord({ kind, url: url.href });
  if (kind !== 'blob' || url.protocol !== 'blob:')
    throw new Error('Unsupported worklet source');
  const text = field(value, 'text'),
    contentType = field(value, 'contentType');
  if (
    typeof text !== 'string' ||
    new TextEncoder().encode(text).byteLength > LIMITS.bytes ||
    typeof contentType !== 'string' ||
    !strings.includes(contentType, '/') ||
    !isExecutableScriptType(strings.split(contentType, ';')[0])
  )
    throw new Error('Worklet Blob requires JavaScript');
  return internalRecord({ kind, url: url.href, text, contentType });
}
function parse(value: unknown): StoredWorklet {
  const state = field(value, 'state'),
    version = field(value, 'version');
  if ((state !== 'open' && state !== 'closed') || version !== WORKLET_POLICY_VERSION)
    throw new Error('Unsupported stored worklet');
  const entries = field(value, 'entries');
  if (!Array.isArray(entries) || entries.length > LIMITS.files)
    throw new Error('Invalid worklet modules');
  return internalRecord({
    state,
    version,
    id: workletIdentifier(field(value, 'id')),
    kind: workletKind(field(value, 'kind')),
    application: label(field(value, 'application')),
    generation: label(field(value, 'generation')),
    parentClient: label(field(value, 'parentClient')),
    entries: entries.map((entry) =>
      internalRecord({
        id: workletIdentifier(field(entry, 'id')),
        source: workletModuleSource(field(entry, 'source')),
      }),
    ),
  });
}
export function workletStorage(base: URL): WorkletStorage {
  const key = (id: string) =>
    new URL('__host-worklet/' + workletIdentifier(id), base).href;
  return internalRecord({
    async get(id) {
      const value = await (await caches.open('pf-worklet-contexts-v2')).match(key(id));
      return value ? parse(await value.json()) : undefined;
    },
    async put(value) {
      await (
        await caches.open('pf-worklet-contexts-v2')
      ).put(
        key(value.id),
        new Response(
          JSON.stringify(value),
          internalRecord({
            headers: internalRecord({ 'Content-Type': 'application/json' }),
          }),
        ),
      );
    },
  });
}
/** Worklets have an owning Window but no independent browser Client identity. */
export class WorkletRegistry {
  private queue: Promise<void> = Promise.resolve();
  private readonly storage: WorkletStorage;
  constructor(storage: WorkletStorage) {
    this.storage = storage;
  }
  async resolve(id: string, actor: WorkletActor): Promise<StoredWorklet | undefined> {
    const value = await this.storage.get(workletIdentifier(id));
    return value?.version === WORKLET_POLICY_VERSION &&
      value.state === 'open' &&
      value.application === actor.application &&
      value.generation === actor.generation &&
      value.parentClient === actor.parentClient
      ? value
      : undefined;
  }
  register(
    actor: WorkletActor,
    kind: WorkletKind,
    source: WorkletModuleSource,
    existing?: string,
  ): Promise<{
    identity: StoredWorklet;
    entry: WorkletEntry;
  }> {
    const operation = this.queue.then(async () => {
      const checked = internalRecord({
        application: label(actor.application),
        generation: label(actor.generation),
        parentClient: label(actor.parentClient),
      });
      const previous = existing ? await this.resolve(existing, checked) : undefined;
      if (existing && (!previous || previous.kind !== kind))
        throw new Error('Worklet is not owned by this Window');
      const identity: StoredWorklet =
        previous ||
        internalRecord({
          ...checked,
          version: WORKLET_POLICY_VERSION,
          id: mint(),
          kind,
          state: 'open',
          entries: [],
        });
      if (identity.entries.length >= LIMITS.files)
        throw new Error('Too many worklet modules');
      const entry: WorkletEntry = internalRecord({
        id: mint(),
        source: workletModuleSource(source),
      });
      const updated = internalRecord({
        ...identity,
        entries: [...identity.entries, entry],
      });
      await this.storage.put(updated);
      return internalRecord({ identity: updated, entry });
    });
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}
