const get = Reflect.get;
const nativeString = String;
const nativeObject = Object;
// Object identity also recognizes legacy HTMLAllCollection values (document.all).
const object = (value: unknown): value is object => nativeObject(value) === value;

export interface EventListenerArguments {
  readonly arguments: unknown[];
  /** Read only after the native EventTarget call has completed successfully. */
  cleanup(): [string, unknown, boolean];
}

/** Observe native Web IDL conversion without duplicating its options dictionary.
 * The private wrappers preserve getter receivers, values and native access order.
 * Cleanup retains primitives rather than guest objects with live conversions. */
export function captureEventListenerArguments(
  args: readonly unknown[],
): EventListenerArguments {
  let type: string | undefined;
  const supplied = args[2];
  let capture = object(supplied) ? false : Boolean(supplied);
  const forwarded = [...args];
  if (args.length)
    forwarded[0] = {
      [Symbol.toPrimitive]() {
        if (typeof args[0] === 'symbol')
          throw new TypeError('A Symbol is not a DOMString');
        type = nativeString(args[0]);
        return type;
      },
    };
  if (object(supplied))
    forwarded[2] = new Proxy(supplied, {
      get(_target, key) {
        const value: unknown = get(supplied, key, supplied);
        if (key === 'capture') capture = Boolean(value);
        return value;
      },
    });
  return {
    arguments: forwarded,
    cleanup() {
      if (type === undefined)
        throw new Error('Native event type conversion was not observed');
      return [type, args[1], capture];
    },
  };
}
