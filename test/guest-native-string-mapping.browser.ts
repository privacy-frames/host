import { rewriteGuestCSS } from '../src/guest/css.ts';
import { createNativeStringMapping } from '../src/guest/native-string-mapping.ts';
import { createGuestWindow } from '../src/guest/session.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const same = (a: unknown, b: unknown, label: string) =>
  check(JSON.stringify(a) === JSON.stringify(b), label + ': ' + JSON.stringify({ a, b }));

async function run() {
  let mappings: string[] = [];
  const mapping = createNativeStringMapping({
    global: window,
    css(value) {
      mappings.push(value);
      return value;
    },
    url(value) {
      mappings.push(value);
      return value;
    },
  });
  const unrelated = [17];
  check(
    mapping.call(Math.abs, unrelated) === unrelated &&
      mapping.construct(Array, unrelated) === unrelated,
    'unrelated operations retain argument identity',
  );
  const cases = [];
  // Compare actual native conversion/order/errors with policy-forwarded calls.
  for (const variant of [
    'objects',
    'null',
    'undefined',
    'symbol',
    'throw',
    'missing',
    'priorityUndefined',
    'priorityNull',
    'reentry',
  ] as const) {
    const outcomes = [];
    for (const mediated of [false, true]) {
      const trace: string[] = [];
      const object = (name: string, value: string) => ({
        [Symbol.toPrimitive](hint: string) {
          trace.push(name + ':' + hint);
          if (variant === 'reentry' && name === 'value')
            style.setProperty('--reentry', 'seen');
          if (variant === 'throw' && name === 'value') throw new Error('fixture');
          return value;
        },
      });
      const input =
        variant === 'null'
          ? null
          : variant === 'undefined'
            ? undefined
            : variant === 'symbol'
              ? Symbol()
              : object('value', 'red');
      const args =
        variant === 'missing'
          ? [object('name', 'color')]
          : [
              object('name', 'color'),
              input,
              variant === 'priorityUndefined'
                ? undefined
                : variant === 'priorityNull'
                  ? null
                  : object('priority', 'important'),
            ];
      const style = document.createElement('div').style;
      let error: string | undefined;
      mappings = [];
      try {
        Reflect.apply(
          style.setProperty,
          style,
          mediated ? mapping.call(style.setProperty, args) : args,
        );
      } catch (caught) {
        error = caught instanceof Error ? caught.name : String(caught);
      }
      outcomes.push({ trace, error, css: style.cssText });
      if (mediated && !['missing', 'symbol', 'throw'].includes(variant))
        check(mappings.length === 1, 'one mapped native value');
    }
    same(outcomes[0], outcomes[1], 'setProperty native parity ' + variant);
    cases.push('setProperty:' + variant);
  }
  for (const key of ['backgroundImage', 'background-image', 'cssText']) {
    const style = document.createElement('div').style;
    let reads = 0;
    const value = {
      toString() {
        reads++;
        return key === 'cssText' ? 'color:red' : 'none';
      },
    };
    mappings = [];
    Reflect.set(style, key, mapping.set(style, key, value));
    check(reads === 1 && mappings.length === 1, 'captured CSS setter ' + key);
  }
  for (const [key, expected] of [
    ['cssText', 'null'],
    ['color', ''],
  ] as const) {
    const style = document.createElement('div').style;
    mappings = [];
    Reflect.set(style, key, mapping.set(style, key, null));
    same(mappings, [expected], 'setter native null conversion ' + key);
  }
  const style = document.createElement('div').style;
  const expando = {
    toString() {
      throw new Error('expando must not convert');
    },
  };
  Reflect.set(style, 'fixtureExpando', mapping.set(style, 'fixtureExpando', expando));
  check(Reflect.get(style, 'fixtureExpando') === expando, 'expando identity');
  // Only Firefox's ordinary inherited attribute permits an own data shadow;
  // Chromium exposes this name through its legacy CSS named-property exotic.
  if (!Object.hasOwn(style, 'backgroundImage')) {
    Object.defineProperty(style, 'backgroundImage', {
      configurable: true,
      writable: true,
      value: null,
    });
    Reflect.set(style, 'backgroundImage', mapping.set(style, 'backgroundImage', expando));
    const shadow: unknown = Reflect.get(style, 'backgroundImage');
    check(shadow === expando, 'own data shadow is unchanged');
  }
  let setter: ((value: unknown) => void) | undefined;
  for (
    let owner: object | null = Object.getPrototypeOf(style);
    owner;
    owner = Object.getPrototypeOf(owner)
  ) {
    setter = Object.getOwnPropertyDescriptor(owner, 'cssText')?.set;
    if (setter) break;
  }
  check(setter, 'native cssText setter exists');
  mappings = [];
  Reflect.apply(
    setter,
    document.createElement('div').style,
    mapping.call(setter, [
      {
        toString() {
          return 'color:red';
        },
      },
    ]),
  );
  check(mappings.length === 1, 'borrowed setter uses captured identity');
  let changedReads = 0;
  Object.defineProperty(style, 'fixtureUnknown', {
    configurable: true,
    set(value) {
      check(value === expando, 'changed setter retains object');
      changedReads++;
    },
  });
  Reflect.set(style, 'fixtureUnknown', mapping.set(style, 'fixtureUnknown', expando));
  check(changedReads === 1, 'changed descriptor is unclaimed');
  const sheet = new CSSStyleSheet();
  for (const name of ['insertRule', 'replaceSync', 'replace'] as const) {
    mappings = [];
    let reads = 0;
    const input = {
      toString() {
        reads++;
        return '.fixture{--value: "\ud800"}';
      },
    };
    const target = sheet[name];
    await Reflect.apply(target, sheet, mapping.call(target, [input]));
    check(reads === 1 && mappings.length === 1, name + ' once');
    if (name !== 'insertRule')
      check(
        mappings[0].includes('\ufffd') && !mappings[0].includes('\ud800'),
        'USV normalization precedes mapping',
      );
  }
  for (const args of [
    [],
    [undefined],
    [null],
    [Symbol()],
    [
      {
        toString() {
          return 'data:audio/wav,';
        },
      },
    ],
  ]) {
    const outcomes = [];
    for (const mediated of [false, true]) {
      try {
        const audio = Reflect.construct(
          Audio,
          mediated ? mapping.construct(Audio, args) : args,
        );
        outcomes.push({ src: audio.getAttribute('src') });
      } catch (error) {
        outcomes.push({ error: error instanceof Error ? error.name : String(error) });
      }
    }
    same(outcomes[0], outcomes[1], 'Audio optional native parity');
  }
  const computedURLs = [];
  const urlInputs = [
    ...[
      'https://fixture.invalid/base/',
      'data:text/plain,',
      'blob:https://fixture.invalid/',
    ].flatMap((prefix) => [
      `url("${prefix}\ud800")`,
      `u\\72l("${prefix}\\d800 ")`,
      `url("${prefix}\0")`,
      `url(${prefix}\\0 )`,
    ]),
    'url("https://fixture.invalid/base/😀")',
    'url("https://fixture.invalid/base/\\d83d\\de00")',
    'url("https://fixture.invalid/base/%ED%A0%80")',
  ];
  for (const input of urlInputs) {
    const native = document.createElement('div');
    const mediated = document.createElement('div');
    const rewritten = document.createElement('div');
    native.style.backgroundImage = input;
    Reflect.set(
      mediated.style,
      'backgroundImage',
      mapping.set(mediated.style, 'backgroundImage', input),
    );
    same(
      native.style.backgroundImage,
      mediated.style.backgroundImage,
      'native per-operation string conversion',
    );
    const mapped: string[] = [];
    rewritten.style.backgroundImage = rewriteGuestCSS(
      input,
      (url) => {
        mapped.push(url);
        return new URL(url, 'https://fixture.invalid/base/').href;
      },
      'value',
    );
    document.body.append(native, rewritten);
    const expected = getComputedStyle(native).backgroundImage;
    const actual = getComputedStyle(rewritten).backgroundImage;
    same(expected, actual, 'native computed URL classification');
    computedURLs.push({
      input,
      declared: native.style.backgroundImage,
      expected,
      actual,
      mapped,
    });
    native.remove();
    rewritten.remove();
  }
  let unquotedNULMapped = false;
  check(
    rewriteGuestCSS(
      'url(./\0)',
      () => {
        unquotedNULMapped = true;
        return 'data:,';
      },
      'value',
    ) === '' && !unquotedNULMapped,
    'unquoted raw NUL remains unsupported and fails closed',
  );
  const catalog: GuestContextCatalog = {
    application: 'string-mapping',
    generation: 'fixture',
    sourceURL: 'https://fixture.invalid/',
    documentBase: 'https://fixture.invalid/',
    runtimeURL: location.origin + '/',
    applicationURL: location.origin + '/app/',
    engineWasm: await (await fetch('/engine.wasm')).arrayBuffer(),
    workerBootstrap: {
      dedicated: new ArrayBuffer(0),
      shared: new ArrayBuffer(0),
      worklet: new ArrayBuffer(0),
    },
    resources: [],
  };
  const session = await createGuestWindow(catalog, window);
  try {
    const result = session.engine.evaluate(
      `(() => {
      let count = 0;
      const style = document.createElement('div').style;
      style.backgroundImage = { toString() { count++; return 'url(https://fixture.invalid/unknown.png)'; } };
      const first = style.backgroundImage;
      style.backgroundImage = 'url(https://fixture.invalid/primitive.png)';
      const primitive = style.backgroundImage;
      style.setProperty('background-image', { toString() { count++; return 'url(https://fixture.invalid/unknown2.png)'; } });
      const second = style.backgroundImage;
      const sheet = new CSSStyleSheet();
      sheet.insertRule({ toString() { count++; return '.fixture{background:url(https://fixture.invalid/unknown3.png)}'; } });
      const third = sheet.cssRules[0].cssText;
      const audio = new Audio({ toString() { count++; return 'https://fixture.invalid/unknown.wav'; } });
      return { count, first, primitive, second, third, audio: audio.getAttribute('src') };
    })()`,
      'string-mapping:actual',
    );
    check(result && typeof result === 'object', 'actual result');
    Reflect.set(window, '__stringMappingObserved', result);
    check(Reflect.get(result, 'count') === 4, 'actual guest converts once');
    for (const key of ['first', 'primitive', 'second', 'third', 'audio'])
      check(
        String(Reflect.get(result, key)).includes('data:application/octet-stream,'),
        'actual unknown URL mapped: ' + key,
      );
    Reflect.set(window, '__stringMappingResult', {
      cases,
      computedURLs,
      actual: true,
    });
  } finally {
    session.close();
  }
}
run().catch((error) => Reflect.set(window, '__stringMappingFailure', String(error)));
