import { internalSet, strings } from './primordials.ts';

// https://mimesniff.spec.whatwg.org/#javascript-mime-type
const types = internalSet([
  'application/ecmascript',
  'application/javascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
]);

export function isJavaScriptMIME(value: string): boolean {
  const essence = strings.replace(
    strings.split(value, ';')[0],
    /^[\t\n\r ]+|[\t\n\r ]+$/g,
    '',
  );
  return types.has(strings.toLowerCase(essence));
}
