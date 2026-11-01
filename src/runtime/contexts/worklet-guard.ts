import { ownDescriptor, internalRecord } from '../../shared/primordials.ts';
import { sealRuntimeBindings } from '../bindings.ts';
import { prepareRuntimeIntrinsics } from '../intrinsics.ts';
import { createPolicyTools } from '../enforcement/native.ts';
import { installEffectPolicy } from '../enforcement/effects.ts';
import { WORKLET_POLICY_VERSION, type WorkletIdentity } from './worklet-types.ts';

declare const __privacyWorkletMetadata: unknown;
const descriptor = ownDescriptor;
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Missing worklet identity');
  const property = descriptor(value, key);
  if (!property || !('value' in property)) throw new Error('Invalid worklet identity');
  return property.value;
}
function label(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 512)
    throw new Error('Invalid worklet label');
  return value;
}
function metadata(value: unknown): WorkletIdentity {
  const version = field(value, 'version'),
    kind = field(value, 'kind');
  if (version !== WORKLET_POLICY_VERSION || (kind !== 'audio' && kind !== 'paint'))
    throw new Error('Unsupported worklet policy');
  const id = label(field(value, 'id'));
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id))
    throw new Error('Invalid worklet identifier');
  return internalRecord({
    version,
    id,
    kind,
    application: label(field(value, 'application')),
    generation: label(field(value, 'generation')),
    parentClient: label(field(value, 'parentClient')),
  });
}
const context = metadata(__privacyWorkletMetadata);
const registration = Reflect.get(
  globalThis,
  context.kind === 'audio' ? 'registerProcessor' : 'registerPaint',
);
if (typeof registration !== 'function')
  throw new Error('Native worklet kind is unavailable');
// Module loading is the only admitted resource path in this profile. New browser
// HTTP/storage APIs require an adapter before publisher code can use this realm.
for (const name of [
  'fetch',
  'XMLHttpRequest',
  'importScripts',
  'indexedDB',
  'caches',
  'navigator',
])
  if (name in globalThis)
    throw new Error('Worklet exposes an unsupported resource capability: ' + name);
prepareRuntimeIntrinsics();
installEffectPolicy(createPolicyTools(), () => null, internalRecord({}), globalThis);
sealRuntimeBindings();
