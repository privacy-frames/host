/** Operations captured before publisher execution; no build-time rewriting. */
const apply = Reflect.apply;
const define = Object.defineProperty;
const descriptor = Object.getOwnPropertyDescriptor;
const ownKeys = Reflect.ownKeys;
const hasOwn = Object.hasOwn;
const getPrototype = Object.getPrototypeOf;
const setPrototype = Object.setPrototypeOf;
const create = Object.create;
const freeze = Object.freeze;
const NativeArray = Array;
const arrayPrototype = Array.prototype;
const isArray = Array.isArray;
const objectPrototype = Object.prototype;
const NativeWeakSet = WeakSet;
const seenHas = WeakSet.prototype.has;
const seenAdd = WeakSet.prototype.add;
const privateRecordPrototype: object = freeze(create(null));

/** Internally allocated records never inherit application prototype extensions. */
export function internalRecord<T extends object>(record: T): T {
  return setPrototype(record, privateRecordPrototype);
}

/** Native descriptor records are detached before optional fields are examined. */
export function ownDescriptor(
  object: object,
  key: PropertyKey,
): PropertyDescriptor | undefined {
  const result = descriptor(object, key);
  return result === undefined ? undefined : internalRecord(result);
}

/** Normalize trusted JSON/structured-clone records without evaluating accessors. */
export function internalData<T>(value: T): T {
  const seen = new NativeWeakSet<object>();
  function normalize(candidate: unknown): void {
    if (candidate === null || typeof candidate !== 'object') return;
    const prototype = getPrototype(candidate);
    const array = isArray(candidate);
    if (
      array
        ? prototype !== arrayPrototype &&
          prototype !== privatePrototype &&
          prototype !== null
        : prototype !== objectPrototype &&
          prototype !== null &&
          prototype !== privateRecordPrototype
    )
      return;
    if (apply(seenHas, seen, [candidate])) return;
    apply(seenAdd, seen, [candidate]);
    if (array) internalArray(candidate);
    else internalRecord(candidate);
    for (const key of internalArray(ownKeys(candidate))) {
      const property = descriptor(candidate, key)!;
      if (hasOwn(property, 'value')) normalize(property.value);
    }
  }
  normalize(value);
  return value;
}

const NativeMap = Map;
const NativeSet = Set;
const privateMapPrototype: object = create(null);
const privateSetPrototype: object = create(null);
for (const [native, target] of [
  [NativeMap.prototype, privateMapPrototype],
  [NativeSet.prototype, privateSetPrototype],
]) {
  for (const key of ownKeys(native)) define(target, key, descriptor(native, key)!);
  freeze(target);
}

/** Runtime records inherit captured operations, including no application hooks. */
export function internalMap<K, V>(entries?: Iterable<readonly [K, V]> | null): Map<K, V> {
  return setPrototype(new NativeMap<K, V>(entries), privateMapPrototype);
}

export function internalSet<T>(values?: Iterable<T> | null): Set<T> {
  return setPrototype(new NativeSet<T>(values), privateSetPrototype);
}

const privatePrototype: object = create(null);

/** Runtime-owned arrays do not inherit application-added indexed accessors. */
export function internalArray<T>(values: T[] = []): T[] {
  if (isArray(values)) setPrototype(values, privatePrototype);
  return values;
}

function InternalArray(length?: number): unknown[] {
  return internalArray(new NativeArray<unknown>(length === undefined ? 0 : length));
}
for (const key of ownKeys(arrayPrototype)) {
  if (key !== 'constructor')
    define(privatePrototype, key, descriptor(arrayPrototype, key)!);
}
define(privatePrototype, 'constructor', { value: InternalArray });
define(InternalArray, Symbol.species, { value: InternalArray });
const sample: unknown[] = [];
const nativeIterator = sample[Symbol.iterator];
const next = sample[Symbol.iterator]().next;
define(privatePrototype, Symbol.iterator, {
  value: function (this: unknown[]) {
    const iterator = apply(nativeIterator, this, []);
    return freeze({
      next: () => apply(next, iterator, []),
      [Symbol.iterator]() {
        return this;
      },
    });
  },
  configurable: true,
});
freeze(privatePrototype);
freeze(InternalArray);

function capture<Arguments extends unknown[], Result>(
  operation: (this: string, ...args: Arguments) => Result,
): (value: string, ...args: Arguments) => Result {
  return (value, ...args) => apply(operation, value, args);
}
const nativeSplit = String.prototype.split;
const nativeMatch = String.prototype.match;
const nativeReplace = String.prototype.replace;

export const strings = freeze({
  trim: capture(String.prototype.trim),
  toLowerCase: capture(String.prototype.toLowerCase),
  startsWith: capture(String.prototype.startsWith),
  endsWith: capture(String.prototype.endsWith),
  includes: capture(String.prototype.includes),
  indexOf: capture(String.prototype.indexOf),
  lastIndexOf: capture(String.prototype.lastIndexOf),
  slice: capture(String.prototype.slice),
  charCodeAt: capture(String.prototype.charCodeAt),
  padStart: capture(String.prototype.padStart),
  split(value: string, separator?: string | RegExp, limit?: number): string[] {
    return internalArray(apply(nativeSplit, value, [separator, limit]));
  },
  match(value: string, pattern: string | RegExp): RegExpMatchArray | null {
    const result = apply(nativeMatch, value, [pattern]);
    if (result !== null) internalArray(result);
    return result;
  },
  replace(
    value: string,
    pattern: string | RegExp,
    replacement: string | Parameters<String['replace']>[1],
  ): string {
    return apply(nativeReplace, value, [pattern, replacement]);
  },
});
