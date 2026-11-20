import { createNativeHost } from './native-host.ts';
import {
  NativePolicy,
  NativePolicyError,
  type NativeContract,
  type NativeMemberRule,
  type NativeReadOperation,
} from './native-policy.ts';
import type { GuestHost } from './protocol.ts';

export interface GuestTextPolicyOptions {
  TextEncoder: typeof TextEncoder;
  TextDecoder: typeof TextDecoder;
}
export interface GuestTextPolicy extends GuestHost {
  readonly TextEncoder: typeof TextEncoder;
  readonly TextDecoder: typeof TextDecoder;
  admit(value: unknown): boolean;
}

const apply = Reflect.apply;
const construct = Reflect.construct;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const object = (value: unknown): value is object =>
  value !== null && (typeof value === 'object' || typeof value === 'function');
const readNative = ({ receiver, descriptor }: NativeReadOperation): unknown =>
  descriptor.get ? apply(descriptor.get, receiver, []) : descriptor.value;
const contract = (
  id: string,
  result: NativeContract['result'] = 'data',
): NativeContract => ({ id, result, callbacks: 'none', effect: 'local-data' });

/** Standalone native text codecs. Binary outputs retain their binary owner;
 * stream APIs and binary-member access belong to separate domains. */
export function createGuestTextPolicy(options: GuestTextPolicyOptions): GuestTextPolicy {
  const registry = new NativePolicy();
  const encoder = options.TextEncoder;
  const decoder = options.TextDecoder;
  const encoderPrototype = encoder.prototype;
  const decoderPrototype = decoder.prototype;
  const objectPrototype = prototype(encoderPrototype);
  const functionPrototype = prototype(encoder);
  if (
    prototype(decoderPrototype) !== objectPrototype ||
    prototype(decoder) !== functionPrototype
  )
    throw new TypeError('Text codecs must belong to one native realm');

  function getter(owner: object, key: string): Function {
    const native = descriptor(owner, key)?.get;
    if (!native) throw new TypeError('Native text attribute unavailable: ' + key);
    return native;
  }
  const encoderBrand = getter(encoderPrototype, 'encoding');
  const decoderBrands = ['encoding', 'fatal', 'ignoreBOM'].map((key) =>
    getter(decoderPrototype, key),
  );
  const owned = new WeakSet<object>([
    encoder,
    decoder,
    encoderPrototype,
    decoderPrototype,
  ]);
  const unrelated = new WeakSet<object>();
  function branded(value: object, getters: readonly Function[]): boolean {
    try {
      for (const native of getters) apply(native, value, []);
      return true;
    } catch {
      return false;
    }
  }
  const isEncoder = (value: object) => branded(value, [encoderBrand]);
  const isDecoder = (value: object) => branded(value, decoderBrands);
  function admit(value: unknown): boolean {
    if (!object(value)) return false;
    if (
      value === encoder ||
      value === decoder ||
      value === encoderPrototype ||
      value === decoderPrototype
    )
      return true;
    const expected = isEncoder(value)
      ? encoderPrototype
      : isDecoder(value)
        ? decoderPrototype
        : null;
    if (!expected) return false;
    if (prototype(value) !== expected)
      throw new NativePolicyError(
        'admit',
        'Text',
        undefined,
        'value belongs to another native realm or prototype',
      );
    registry.admitObject(value);
    owned.add(value);
    return true;
  }
  const host = createNativeHost({
    registry,
    name: 'Text',
    functionPrototype,
    admit,
    owns(target) {
      if (owned.has(target)) return true;
      if (unrelated.has(target)) return false;
      if (isEncoder(target) || isDecoder(target)) return true;
      unrelated.add(target);
      return false;
    },
    result(value, rule) {
      if (rule.result === 'reference' && (!object(value) || !admit(value)))
        throw new NativePolicyError(
          'return',
          rule.id,
          undefined,
          'unexpected text reference result',
        );
      return value;
    },
    prototype(target) {
      return target === encoderPrototype || target === decoderPrototype
        ? objectPrototype
        : registry.prototype(target);
    },
  });

  function data(
    owner: object,
    family: string,
    key: PropertyKey,
    result: NativeContract['result'] = 'data',
  ): NativeMemberRule {
    const captured = descriptor(owner, key);
    if (!captured || !('value' in captured))
      throw new TypeError('Native text data member unavailable: ' + String(key));
    return {
      key,
      read: { contract: contract(`${family}.${String(key)}`, result), read: readNative },
    };
  }
  function attribute(owner: object, family: string, key: string): NativeMemberRule {
    const native = getter(owner, key);
    const rule = contract(`${family}.${key}.get`);
    host.captureCallableShape(rule.id, native);
    return { key, read: { contract: rule, read: readNative } };
  }
  function method(owner: object, family: string, key: string): NativeMemberRule {
    const native: unknown = descriptor(owner, key)?.value;
    if (typeof native !== 'function')
      throw new TypeError('Native text method unavailable: ' + key);
    const rule = contract(`${family}.${key}`);
    host.captureCallableShape(rule.id, native);
    return {
      key,
      call: {
        contract: rule,
        call: ({ target, receiver, arguments: args }) => apply(target, receiver, args),
      },
    };
  }

  for (const [family, target, brand, attributes, methods] of [
    ['TextEncoder', encoder, isEncoder, ['encoding'], ['encode', 'encodeInto']],
    ['TextDecoder', decoder, isDecoder, ['encoding', 'fatal', 'ignoreBOM'], ['decode']],
  ] as const) {
    const nativePrototype = target.prototype;
    registry.registerPrototype(nativePrototype, {
      name: family,
      accepts: (value) => value === nativePrototype || brand(value),
      members: [
        data(nativePrototype, family, 'constructor', 'callable'),
        data(nativePrototype, family, Symbol.toStringTag),
        ...attributes.map((key) => attribute(nativePrototype, family, key)),
        ...methods.map((key) => method(nativePrototype, family, key)),
      ],
    });
    const token = registry.registerConstructor(target, {
      contract: contract(`${family}.constructor`, 'reference'),
      construct: (native, args) => construct(native, args),
    });
    host.registerConstructor(target, token);
    registry.registerFacade(target, {
      name: family + ' constructor',
      members: [
        data(target, family, 'name'),
        data(target, family, 'length'),
        data(target, family, 'prototype', 'reference'),
      ],
    });
  }
  return { ...host, TextEncoder: encoder, TextDecoder: decoder, admit };
}
