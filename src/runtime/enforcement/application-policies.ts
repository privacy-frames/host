import { internalArray, internalRecord, internalSet } from '../../shared/primordials.ts';
import { SCRIPT_URL_POLICY_NAME } from '../../shared/script-url-policy.ts';

const apply = Reflect.apply;
const get = Reflect.get;
const define = Object.defineProperty;
const create = Object.create;
const slice = Array.prototype.slice;
const NativeString = String;
const NativeTypeError = TypeError;

function text(value: unknown): string {
  if (typeof value === 'symbol') throw new NativeTypeError('Text cannot be a Symbol');
  return NativeString(value);
}

function callback(options: object | undefined, name: string): Function | undefined {
  const value: unknown = options ? get(options, name) : undefined;
  if (value === undefined) return;
  if (typeof value !== 'function')
    throw new NativeTypeError('Policy callback is required');
  return value;
}

/** Application policies can use only the HTML/Script authority already public
 * through the default policy. Native CSP still denies every other URL issuer. */
export function installApplicationPolicies(factory: object, defaultPolicy: object): void {
  const nativeHTML: unknown = get(defaultPolicy, 'createHTML');
  const nativeScript: unknown = get(defaultPolicy, 'createScript');
  if (typeof nativeHTML !== 'function' || typeof nativeScript !== 'function')
    throw new NativeTypeError('Native HTML/Script policy methods are unavailable');
  const htmlMint: Function = nativeHTML;
  const scriptMint: Function = nativeScript;
  const names = internalSet<string>([SCRIPT_URL_POLICY_NAME, 'default']);
  function createPolicy(this: unknown, input: unknown, supplied: unknown) {
    'use strict';
    if (this !== factory || arguments.length < 2)
      throw new NativeTypeError('Policy name and callbacks are required');
    const name = text(input);
    let options: object | undefined;
    if (supplied != null) {
      if (typeof supplied !== 'object' && typeof supplied !== 'function')
        throw new NativeTypeError('Policy callbacks must be a dictionary');
      options = supplied;
    }
    const html = callback(options, 'createHTML');
    const parser = callback(options, 'createParserOptions');
    const script = callback(options, 'createScript');
    const url = callback(options, 'createScriptURL');
    if (parser || url)
      throw new NativeTypeError(
        'Application policies cannot mint script URLs or parser options',
      );
    if (names.has(name)) throw new NativeTypeError('Policy name is already reserved');
    const policy: object = create(null);
    function converter(convert: Function | undefined, mint: Function) {
      return function (this: unknown, input: unknown) {
        'use strict';
        if (this !== policy || !arguments.length || !convert)
          throw new NativeTypeError('Policy conversion is unavailable');
        const parameters: unknown[] = internalArray(apply(slice, arguments, []));
        parameters[0] = text(input);
        const value: unknown = apply(convert, undefined, parameters);
        return apply(
          mint,
          defaultPolicy,
          internalArray([value == null ? '' : text(value)]),
        );
      };
    }
    for (const [key, value] of internalArray([
      ['name', name],
      ['createHTML', converter(html, htmlMint)],
      ['createScript', converter(script, scriptMint)],
      [
        'createScriptURL',
        function () {
          throw new NativeTypeError('Private script URL required');
        },
      ],
      [
        'createParserOptions',
        function () {
          throw new NativeTypeError('Application parser options are unavailable');
        },
      ],
    ] as const))
      define(policy, key, internalRecord({ value, enumerable: true }));
    names.add(name);
    return policy;
  }
  define(factory, 'createPolicy', internalRecord({ value: createPolicy }));
}
