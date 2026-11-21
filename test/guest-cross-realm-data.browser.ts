import { createGuestWindow } from '../src/guest/session.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function construct(global: object, name: string, args: unknown[]): object {
  const descriptor = Object.getOwnPropertyDescriptor(global, name);
  check(
    descriptor && 'value' in descriptor && typeof descriptor.value === 'function',
    'Native data constructor ' + name,
  );
  return Reflect.construct(descriptor.value, args);
}
async function run() {
  const frame = document.createElement('iframe');
  await new Promise<void>((resolve) => {
    frame.addEventListener('load', () => resolve(), { once: true });
    document.body.append(frame);
  });
  const childWindow = frame.contentWindow;
  check(childWindow, 'Native child exists');
  const catalog: GuestContextCatalog = {
    application: 'cross-realm-data',
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
  const parent = await createGuestWindow(catalog, window);
  const child = await createGuestWindow(catalog, childWindow);
  try {
    const epoch = 1700000000123;
    const date = construct(childWindow, 'Date', [epoch]);
    const map = construct(childWindow, 'Map', [[['key', 17]]]);
    const set = construct(childWindow, 'Set', [[3, 5]]);
    const regexp = construct(childWindow, 'RegExp', ['a+', 'gi']);
    check(
      Reflect.apply(Date.prototype.getTime, date, []) === epoch &&
        Reflect.apply(Map.prototype.get, map, ['key']) === 17 &&
        Reflect.apply(Set.prototype.has, set, [5]) === true &&
        Reflect.apply(RegExp.prototype.test, regexp, ['AAA']) === true,
      'Native methods accept the actual prepared-child data instances',
    );
    Reflect.set(regexp, 'lastIndex', 0);
    const observations: { name: string; ok?: unknown; error?: string }[] = [];
    for (const [name, value, expression] of [
      ['Date', date, `foreign instanceof Date && foreign.getTime() === ${epoch}`],
      [
        'Map',
        map,
        "foreign instanceof Map && foreign.size === 1 && foreign.get('key') === 17",
      ],
      ['Set', set, 'foreign instanceof Set && foreign.size === 2 && foreign.has(5)'],
      [
        'RegExp',
        regexp,
        "foreign instanceof RegExp && foreign.source === 'a+' && foreign.flags === 'gi' && foreign.test('AAA')",
      ],
    ] as const) {
      try {
        parent.engine.set('foreign', value);
        observations.push({ name, ok: await parent.engine.evaluate(expression) });
      } catch (error) {
        observations.push({ name, error: String(error) });
      }
    }
    const ownDate = new Date(epoch);
    const ownGraph = {
      date: ownDate,
      map: new Map([[ownDate, 'value']]),
      set: new Set([ownDate]),
    };
    check(
      ownGraph.map.get(ownGraph.date) === 'value' && ownGraph.set.has(ownGraph.date),
      'Native graph starts with one shared Date identity',
    );
    parent.engine.set('ownGraph', ownGraph);
    const ownGraphIdentity = await parent.engine.evaluate(
      "ownGraph.map.get(ownGraph.date) === 'value' && ownGraph.set.has(ownGraph.date)",
    );
    Reflect.set(window, '__crossDataObserved', { observations, ownGraphIdentity });
    check(
      observations.every((value) => value.ok === true) && ownGraphIdentity === true,
      'Cross-realm data methods and shared graph identity: ' +
        JSON.stringify({ observations, ownGraphIdentity }),
    );
    let overriddenReads = 0;
    const poison = {
      configurable: true,
      get() {
        overriddenReads++;
        throw new Error('Data override was read');
      },
    };
    for (const [value, names] of [
      [date, ['getTime']],
      [map, ['size', 'forEach', Symbol.iterator]],
      [set, ['size', 'forEach', Symbol.iterator]],
      [regexp, ['source', 'flags']],
    ] as const)
      for (const key of names) Object.defineProperty(value, key, poison);
    Reflect.apply(Map.prototype.set, map, [date, 'value']);
    Reflect.apply(Map.prototype.set, map, ['self', map]);
    Reflect.apply(Map.prototype.set, map, ['set', set]);
    Reflect.apply(Set.prototype.add, set, [date]);
    Reflect.apply(Set.prototype.add, set, [map]);
    Reflect.apply(Set.prototype.add, set, [set]);
    parent.engine.set('graph', {
      date,
      map,
      mapAgain: map,
      set,
      setAgain: set,
      regexp,
      regexpAgain: regexp,
    });
    check(
      await parent.engine.evaluate(`
      graph.date.getTime() === ${epoch} && graph.map.get(graph.date) === 'value' &&
      graph.set.has(graph.date) && graph.map === graph.mapAgain && graph.set === graph.setAgain &&
      graph.map.get('self') === graph.map && graph.map.get('set') === graph.set &&
      graph.set.has(graph.map) && graph.set.has(graph.set) && graph.regexp === graph.regexpAgain &&
      graph.regexp.source === 'a+' && graph.regexp.flags === 'gi'
    `),
      'Foreign collection cycles and repeated data identity',
    );
    check(
      overriddenReads === 0,
      'Data copying ignores public method, size and iterator overrides',
    );
    const decoded: unknown = await parent.engine.evaluate('graph');
    check(decoded && typeof decoded === 'object', 'Graph decodes as data');
    const decodedDate: unknown = Reflect.get(decoded, 'date');
    const decodedMap: unknown = Reflect.get(decoded, 'map');
    const decodedSet: unknown = Reflect.get(decoded, 'set');
    check(
      decodedMap instanceof Map && decodedSet instanceof Set,
      'Decoded native collection brands',
    );
    check(
      decodedMap.get(decodedDate) === 'value' &&
        decodedSet.has(decodedDate) &&
        decodedMap === Reflect.get(decoded, 'mapAgain') &&
        decodedSet === Reflect.get(decoded, 'setAgain') &&
        decodedMap.get('self') === decodedMap &&
        decodedMap.get('set') === decodedSet &&
        decodedSet.has(decodedMap) &&
        decodedSet.has(decodedSet) &&
        Reflect.get(decoded, 'regexp') === Reflect.get(decoded, 'regexpAgain'),
      'Decoded graph retains shared identities',
    );
    const plainDate = construct(childWindow, 'Date', [epoch]);
    const plainMap = construct(childWindow, 'Map', [[['key', 17]]]);
    const plainSet = construct(childWindow, 'Set', [[5]]);
    const plainRegExp = construct(childWindow, 'RegExp', ['a+', 'i']);
    for (const value of [plainDate, plainMap, plainSet, plainRegExp])
      Object.setPrototypeOf(value, null);
    parent.engine.set('changedPrototypes', {
      date: plainDate,
      map: plainMap,
      set: plainSet,
      regexp: plainRegExp,
    });
    check(
      await parent.engine.evaluate(`changedPrototypes.date.getTime() === ${epoch} &&
      changedPrototypes.map.get('key') === 17 && changedPrototypes.set.has(5) && changedPrototypes.regexp.test('AAA')`),
      'Native slots determine data type after public prototype changes',
    );
    Reflect.apply(Date.prototype.setTime, date, [epoch + 1]);
    parent.engine.set('changedDate', date);
    parent.engine.set('invalidDate', construct(childWindow, 'Date', [NaN]));
    check(
      await parent.engine.evaluate(
        `changedDate.getTime() === ${epoch + 1} && Number.isNaN(invalidDate.getTime())`,
      ),
      'Brand memoization does not cache mutable Date values or reject NaN',
    );
    const fake = { [Symbol.toStringTag]: 'Map', key: 29 };
    parent.engine.set('fake', fake);
    check(
      await parent.engine.evaluate('!(fake instanceof Map) && fake.key === 29'),
      'Public tags do not grant collection membership',
    );
    const errorMap = construct(childWindow, 'Map', []);
    const badValue = Object.defineProperty({}, Symbol.toStringTag, {
      get() {
        throw new Error('Controlled data copy failure');
      },
    });
    Reflect.apply(Map.prototype.set, errorMap, [
      construct(childWindow, 'Date', [epoch]),
      badValue,
    ]);
    let failed = false;
    try {
      parent.engine.set('failedCopy', errorMap);
    } catch (error) {
      failed = String(error).includes('Controlled data copy failure');
    }
    check(failed, 'Controlled entry-copy failure propagates');
    let calleeCalls = 0;
    const callee = () => {
      calleeCalls++;
    };
    parent.engine.set('dataCallee', callee);
    let argumentsFailed = false;
    try {
      parent.engine.call(callee, [date, errorMap], { receiver: 'owned' });
    } catch (error) {
      argumentsFailed = String(error).includes('Controlled data copy failure');
    }
    check(
      argumentsFailed && calleeCalls === 0,
      'Failed argument data never reaches the native callee',
    );
    for (const value of [[date, badValue], { earlier: date, bad: badValue }]) {
      let refused = false;
      try {
        parent.engine.set('failedContainer', value);
      } catch (error) {
        refused = String(error).includes('Controlled data copy failure');
      }
      check(refused, 'Array and record result handles close after child-copy failure');
    }
    parent.engine.set('healthyCopy', construct(childWindow, 'Map', [[['ok', 31]]]));
    check(
      await parent.engine.evaluate("healthyCopy.get('ok') === 31"),
      'Encoding remains usable after graph-copy failure',
    );
    return {
      observations,
      nativeControl: true,
      ownGraphIdentity,
      graphCycles: true,
      roundTripIdentity: true,
      capturedDataOperations: true,
      changedPrototypes: true,
      freshDate: true,
      forgedTagDenied: true,
      failureCleanup: true,
      argumentsRefusedBeforeCallee: true,
      disposal: true,
    };
  } finally {
    parent.close();
    child.close();
    frame.remove();
  }
}
run()
  .then((result) => Reflect.set(window, '__crossDataResult', result))
  .catch((error) =>
    Reflect.set(
      window,
      '__crossDataFailure',
      String(error) + (error.stack ? '\n' + error.stack : ''),
    ),
  );
