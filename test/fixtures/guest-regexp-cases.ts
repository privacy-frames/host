/** Shared input program; browser results are independent controls for QuickJS. */
export function legacyRegExpCases() {
  const read = (name: string): string => {
    const value: unknown = Reflect.get(RegExp, name);
    if (typeof value !== 'string')
      throw new Error('Missing legacy RegExp property ' + name);
    return value;
  };
  const snapshot = () => ({
    input: read('input'),
    lastMatch: read('lastMatch'),
    lastParen: read('lastParen'),
    leftContext: read('leftContext'),
    rightContext: read('rightContext'),
    captures: Array.from({ length: 9 }, (_, index) => read('$' + (index + 1))),
    aliases: ['$_', '$&', '$+', '$`', "$'"].map(read),
  });
  const results: {
    operation: string;
    value: unknown;
    state: ReturnType<typeof snapshot>;
  }[] = [];
  const record = (operation: string, value: unknown) =>
    results.push({ operation, value, state: snapshot() });
  /^$/.exec('');
  record('reset', true);
  const regex = /(a)(b)?/g;
  record('exec-unmatched-capture', regex.exec('za!'));
  record('exec-lastIndex', regex.lastIndex);
  record('test', /(ab)/g.test('0ab1ab2'));
  record('match-global', '0ab1ac2'.match(/a(.)/g));
  record('replace-global', 'a1b2'.replace(/([a-z])(\d)/g, '$2$1'));
  const searched = /(\d+)/g;
  searched.lastIndex = 3;
  record('search', 'x12y'.search(searched));
  record('search-lastIndex-restored', searched.lastIndex);
  record('split', 'x1y2z'.split(/(\d)/));
  const all = 'x1y2z'.matchAll(/(\d)/g);
  record('matchAll-lazy', true);
  record('matchAll-first', all.next().value);
  record('matchAll-second', all.next().value);
  record('matchAll-done', all.next().done);
  record('failed-match-keeps-state', /missing/.exec('different'));
  const empty = /()/g;
  record('empty-match', empty.exec('ab'));
  record('empty-lastIndex', empty.lastIndex);
  let coercions = 0;
  Reflect.set(RegExp, 'input', {
    toString() {
      coercions++;
      return 'manual input';
    },
  });
  record('input-setter', coercions);
  Reflect.set(RegExp, '$_', 'alias input');
  record('input-alias-setter', true);
  let symbolInputError = '';
  try {
    Reflect.set(RegExp, 'input', Symbol('input'));
  } catch (error) {
    symbolInputError = error instanceof Error ? error.name : String(error);
  }
  record('symbol-input-ToString-error', symbolInputError);
  let invalidReceiver = '';
  try {
    Reflect.apply(RegExp.prototype.exec, {}, ['invalid']);
  } catch (error) {
    invalidReceiver = error instanceof Error ? error.name : String(error);
  }
  record('invalid-receiver-preserves-state', invalidReceiver);
  class Derived extends RegExp {}
  new Derived('(derived)').exec('xderivedy');
  record('browser-subclass-match', true);
  const getCapture = Object.getOwnPropertyDescriptor(RegExp, '$1')?.get;
  if (!getCapture) throw new Error('Missing capture getter');
  record('browser-borrowed-getter', Reflect.apply(getCapture, {}, []));
  const detached = /(detached)/;
  Object.setPrototypeOf(detached, null);
  record(
    'regexp-public-prototype-change',
    Reflect.apply(RegExp.prototype.exec, detached, ['xdetachedy']),
  );
  const originalCapture = read('$1');
  Reflect.set(RegExp, '$1', 'ignored');
  record('capture-assignment-does-not-change-value', read('$1') === originalCapture);
  const descriptor = Object.getOwnPropertyDescriptor(RegExp, '$1');
  record('property-shape', {
    configurable: descriptor?.configurable,
    enumerable: descriptor?.enumerable,
    getter: typeof descriptor?.get,
  });
  const removed = Reflect.deleteProperty(RegExp, '$9');
  /(after)/.exec('after');
  return {
    results,
    deletedPropertyStaysDeleted: removed && !Object.hasOwn(RegExp, '$9'),
  };
}
