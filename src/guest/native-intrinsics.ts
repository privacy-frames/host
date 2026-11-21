/** Ordinary intrinsic roles, independent of any native object's public name. */
export const ordinaryIntrinsicNames = [
  'Object',
  'Function',
  'Array',
  'Boolean',
  'Number',
  'String',
  'Symbol',
  'BigInt',
  'Date',
  'RegExp',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Promise',
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'AggregateError',
  'ArrayBuffer',
  'SharedArrayBuffer',
  'DataView',
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float16Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array',
] as const;
export type OrdinaryIntrinsicName = (typeof ordinaryIntrinsicNames)[number];
export type NativeIntrinsicRole =
  OrdinaryIntrinsicName | `${OrdinaryIntrinsicName}.prototype`;

interface NativeRealmSnapshot {
  readonly global: object;
  readonly document?: object;
  readonly entries: readonly {
    readonly value: object;
    readonly role: NativeIntrinsicRole;
  }[];
}
const identities = new WeakMap<object, NativeIntrinsicRole>();
const snapshots = new WeakMap<object, NativeRealmSnapshot>();
const globals = new WeakMap<object, NativeRealmSnapshot>();
const descriptor = Object.getOwnPropertyDescriptor;
const freeze = Object.freeze;

/** Called only by trusted native realm setup, before application exposure. The
 * private owner and actual document distinguish preparations of a WindowProxy.
 * Identity entries retain roles, never an environment or its engine. */
export function captureNativeIntrinsics(
  global: object,
  provenance: { owner: object; document?: object },
  aliases: readonly (readonly [string, Function])[] = [],
): void {
  const previous = snapshots.get(provenance.owner);
  if (previous) {
    if (previous.global !== global || previous.document !== provenance.document)
      throw new TypeError('Native intrinsic owner was reused for another realm');
    return;
  }
  const captured = new Map<object, NativeIntrinsicRole>();
  const remember = (value: object, role: NativeIntrinsicRole) => {
    const known = captured.get(value) ?? identities.get(value);
    if (known !== undefined && known !== role)
      throw new TypeError('Native intrinsic identity has conflicting roles');
    captured.set(value, role);
  };
  for (const name of ordinaryIntrinsicNames) {
    const property = descriptor(global, name);
    if (!property || !('value' in property) || typeof property.value !== 'function')
      continue;
    const constructor: Function = property.value;
    remember(constructor, name);
    const prototype = descriptor(constructor, 'prototype');
    if (
      prototype &&
      'value' in prototype &&
      prototype.value !== null &&
      (typeof prototype.value === 'object' || typeof prototype.value === 'function')
    )
      remember(prototype.value, `${name}.prototype`);
  }
  for (const [name, constructor] of aliases) {
    const role = ordinaryIntrinsicNames.find((candidate) => candidate === name);
    if (!role) throw new TypeError('Unknown trusted intrinsic alias role');
    remember(constructor, role);
    const prototype = descriptor(constructor, 'prototype');
    if (
      prototype &&
      'value' in prototype &&
      prototype.value !== null &&
      (typeof prototype.value === 'object' || typeof prototype.value === 'function')
    )
      remember(prototype.value, `${role}.prototype`);
  }
  for (const [value, role] of captured) identities.set(value, role);
  const snapshot = freeze({
    global,
    document: provenance.document,
    entries: freeze([...captured].map(([value, role]) => freeze({ value, role }))),
  });
  snapshots.set(provenance.owner, snapshot);
  globals.set(global, snapshot);
}

/** Exact identity lookup; a brand, constructor name or caller assertion cannot
 * enroll a value. Ordinary intrinsic aliases remain safe after owner closure. */
export function nativeIntrinsicRole(value: object): NativeIntrinsicRole | undefined {
  return identities.get(value);
}

/** Reads only a previously captured setup record, never live global properties. */
export function capturedNativeIntrinsics(global: object): NativeRealmSnapshot['entries'] {
  return globals.get(global)?.entries ?? [];
}
