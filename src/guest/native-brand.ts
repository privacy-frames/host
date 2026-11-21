const apply = Reflect.apply;

/** Memoize internal-slot membership, never an attribute's value or authorization.
 * The supplied native probe must retain the same success/failure result for the
 * receiver's lifetime, including after public prototype changes. */
export function nativeBrand<T extends object>(
  read: ((this: unknown) => unknown) | undefined,
): (value: unknown) => value is T {
  const cache = new WeakMap<object, boolean>();
  return (value: unknown): value is T => {
    if (
      !read ||
      value === null ||
      (typeof value !== 'object' && typeof value !== 'function')
    )
      return false;
    const known = cache.get(value);
    if (known !== undefined) return known;
    let accepted = false;
    try {
      apply(read, value, []);
      accepted = true;
    } catch {
      // Native internal-slot checks reject receivers of another type.
    }
    cache.set(value, accepted);
    return accepted;
  };
}
