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
    parent.engine.set('ownGraph', {
      date: ownDate,
      map: new Map([[ownDate, 'value']]),
      set: new Set([ownDate]),
    });
    const ownGraphIdentity = await parent.engine.evaluate(
      "ownGraph.map.get(ownGraph.date) === 'value' && ownGraph.set.has(ownGraph.date)",
    );
    Reflect.set(window, '__crossDataObserved', { observations, ownGraphIdentity });
    check(
      observations.every((value) => value.ok === true) && ownGraphIdentity === true,
      'Cross-realm data methods and shared graph identity: ' +
        JSON.stringify({ observations, ownGraphIdentity }),
    );
    return { observations, ownGraphIdentity, disposal: true };
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
