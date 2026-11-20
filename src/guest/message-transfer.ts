const apply = Reflect.apply;
const get = Reflect.get;
const arrayFrom = Array.from;
const object = (value: unknown): value is object =>
  value !== null && (typeof value === 'object' || typeof value === 'function');

/** Capture the postMessage overload's transfer sequence before native execution.
 * Guest getters/iterators run once; native send and detachment share this array. */
export function captureMessageTransfer(supplied: unknown): object[] {
  if (supplied == null) return [];
  if (!object(supplied)) throw new TypeError('Transfer options must be an object');
  const iterator: unknown = get(supplied, Symbol.iterator);
  const sequence: unknown = iterator == null ? get(supplied, 'transfer') : supplied;
  if (sequence === undefined) return [];
  if (!object(sequence)) throw new TypeError('Transfer sequence must be an object');
  const method: unknown = iterator == null ? get(sequence, Symbol.iterator) : iterator;
  if (typeof method !== 'function')
    throw new TypeError('Transfer sequence is not iterable');
  // Array.from supplies IteratorClose on conversion failure. The wrapper retains
  // the already-read method instead of looking up the guest iterator again.
  return arrayFrom(
    {
      [Symbol.iterator]() {
        const iterator: unknown = apply(method, sequence, []);
        if (!object(iterator)) throw new TypeError('Transfer iterator must be an object');
        return iterator as Iterator<unknown>;
      },
    },
    (value) => {
      if (!object(value)) throw new TypeError('Transfer entries must be objects');
      return value;
    },
  );
}
