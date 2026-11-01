import { internalArray, internalRecord } from '../../shared/primordials.ts';
import { SCRIPT_URL_POLICY_NAME } from '../../shared/script-url-policy.ts';
import { installApplicationPolicies } from './application-policies.ts';

export type ScriptURLGate = (url: string) => unknown;

const apply = Reflect.apply;
const construct = Reflect.construct;
const get = Reflect.get;
const NativeError = Error;
const NativeTypeError = TypeError;
const NativeURL = URL;
const NativeBlob = Blob;
const createURL = URL.createObjectURL;
const revokeURL = URL.revokeObjectURL;

/** Private minting capability. Call only during trusted preparation; never expose it. */
export function prepareScriptURLs(target: object = globalThis): ScriptURLGate {
  const factory: unknown = get(target, 'trustedTypes');
  if (!factory || typeof factory !== 'object')
    throw new NativeError('Native Trusted Types enforcement is unavailable');
  const create: unknown = get(factory, 'createPolicy');
  if (typeof create !== 'function')
    throw new NativeError('Native Trusted Types policy creation is unavailable');
  const policy: unknown = apply(create, factory, [
    SCRIPT_URL_POLICY_NAME,
    internalRecord({ createScriptURL: (value: string) => value }),
  ]);
  if (!policy || typeof policy !== 'object')
    throw new NativeError('Private script URL policy is unavailable');
  const mint: unknown = get(policy, 'createScriptURL');
  if (typeof mint !== 'function')
    throw new NativeError('Private script URL minting is unavailable');
  const refusal = new NativeTypeError('Private script URL required');
  const defaultPolicy: unknown = apply(create, factory, [
    'default',
    internalRecord({
      createHTML: (value: string) => value,
      createScript: (value: string) => value,
      createScriptURL() {
        throw refusal;
      },
    }),
  ]);

  // API presence is insufficient: an actual native URL sink must call the
  // refusing default policy. The empty Blob cannot execute application code or
  // fetch a remote script if the required CSP was accidentally omitted.
  const NativeWorker: unknown = get(target, 'Worker');
  const nativeImport: unknown = get(target, 'importScripts');
  let terminate: unknown;
  if (typeof NativeWorker === 'function') {
    const prototype: unknown = get(NativeWorker, 'prototype');
    if (!prototype || typeof prototype !== 'object')
      throw new NativeError('Native worker prototype is unavailable');
    terminate = get(prototype, 'terminate');
    if (typeof terminate !== 'function')
      throw new NativeError('Native worker termination is unavailable');
  } else if (typeof nativeImport !== 'function')
    throw new NativeError('Native script URL enforcement is unavailable');
  const probe: string = apply(createURL, NativeURL, [
    new NativeBlob(internalArray(['']), internalRecord({ type: 'text/javascript' })),
  ]);
  let enforced = false;
  try {
    let handle: unknown;
    try {
      if (typeof NativeWorker === 'function') handle = construct(NativeWorker, [probe]);
      else if (typeof nativeImport === 'function') apply(nativeImport, target, [probe]);
    } catch (error) {
      if (error !== refusal) throw error;
      enforced = true;
    }
    if (handle !== undefined && typeof terminate === 'function')
      apply(terminate, handle, []);
    if (!enforced) throw new NativeError('Native worker URL gate is not enforced');
  } finally {
    apply(revokeURL, NativeURL, [probe]);
  }
  if (!defaultPolicy || typeof defaultPolicy !== 'object')
    throw new NativeError('Default script policy is unavailable');
  installApplicationPolicies(factory, defaultPolicy);
  return (url) => {
    if (typeof url !== 'string') throw new NativeTypeError('Script URL must be text');
    return apply(mint, policy, internalArray([url]));
  };
}
