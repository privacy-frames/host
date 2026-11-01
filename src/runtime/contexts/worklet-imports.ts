const NativePromise = Promise;
const reject = Promise.reject;
const NativeTypeError = TypeError;
const NativeString = String;
const apply = Reflect.apply;

/** Match the native unsupported dynamic-import profile after host preparation. */
export function rejectDynamicImport(input: unknown, _options?: unknown): Promise<never> {
  try {
    NativeString(input);
  } catch (error) {
    return apply(reject, NativePromise, [error]);
  }
  return apply(reject, NativePromise, [
    new NativeTypeError(
      'Dynamic import is not supported in the confined worklet profile',
    ),
  ]);
}
