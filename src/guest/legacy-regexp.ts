/**
 * Browser legacy capture properties, installed only inside a guest realm.
 * Ordinary matching follows native browser behavior; this does not implement the
 * proposal's unshipped subclass/cross-realm invalidation or prototype.compile.
 */
export function installGuestRegExpLegacy(): void {
  const Constructor = RegExp;
  const defineProperty = Object.defineProperty;
  const descriptor = Object.getOwnPropertyDescriptor;
  const apply = Reflect.apply;
  const execute = Constructor.prototype.exec;
  const slice = String.prototype.slice;
  if (descriptor(Constructor, '$1')) return;

  let input = '';
  let lastMatch = '';
  let lastParen = '';
  let leftContext = '';
  let rightContext = '';
  const captures: string[] = [];

  const property = (
    name: string,
    read: () => string,
    write: (value: unknown) => void = () => {},
  ) => defineProperty(Constructor, name, { configurable: true, get: read, set: write });
  const setInput = (value: unknown) => {
    input = `${value}`;
  };
  property('input', () => input, setInput);
  property('$_', () => input, setInput);
  for (const name of ['lastMatch', '$&']) property(name, () => lastMatch);
  for (const name of ['lastParen', '$+']) property(name, () => lastParen);
  for (const name of ['leftContext', '$`']) property(name, () => leftContext);
  for (const name of ['rightContext', "$'"]) property(name, () => rightContext);
  for (let index = 0; index < 9; index++)
    property('$' + (index + 1), () => captures[index] ?? '');

  defineProperty(Constructor.prototype, 'exec', {
    ...descriptor(Constructor.prototype, 'exec'),
    value: function exec(this: RegExp, value: string): RegExpExecArray | null {
      const match: RegExpExecArray | null = apply(execute, this, [value]);
      if (match !== null) {
        input = match.input;
        lastMatch = match[0];
        lastParen = match.length > 1 ? (match[match.length - 1] ?? '') : '';
        leftContext = apply(slice, input, [0, match.index]);
        rightContext = apply(slice, input, [match.index + lastMatch.length]);
        for (let index = 0; index < 9; index++) captures[index] = match[index + 1] ?? '';
      }
      return match;
    },
  });
}
