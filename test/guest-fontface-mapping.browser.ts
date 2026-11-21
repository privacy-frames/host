import { createGuestWindow } from '../src/guest/session.ts';
import { nativeFontFaceChecks } from './fixtures/native-fontface.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function run() {
  const native = nativeFontFaceChecks(window);
  const worker = new Worker('/worker.js', { type: 'module' });
  const workerResult: unknown = await new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<unknown>) => resolve(event.data);
    worker.onerror = reject;
  }).finally(() => worker.terminate());
  check(
    workerResult &&
      typeof workerResult === 'object' &&
      !Reflect.has(workerResult, 'error'),
    'Native worker FontFace checks: ' + JSON.stringify(workerResult),
  );
  const catalog: GuestContextCatalog = {
    application: 'fontface',
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
    const resources: { input: string; output: string }[] = [];
    const nativeURL = session.environment.resources.nativeURL.bind(
      session.environment.resources,
    );
    session.environment.resources.nativeURL = (input, base) => {
      const output = nativeURL(input, base);
      resources.push({ input, output });
      return output;
    };
    const actual = session.engine.evaluate(
      `(() => {
      let calls = 0;
      const font = new FontFace('Fixture', { toString() { calls++; return 'url(https://fixture.invalid/missing.woff)'; } });
      font.loaded.catch(() => undefined);
      const primitive = new FontFace('Primitive', 'url(https://fixture.invalid/primitive.woff)');
      primitive.loaded.catch(() => undefined);
      const bytes = new Uint8Array(8);
      let binaryCalls = 0;
      bytes[Symbol.toPrimitive] = () => { binaryCalls++; throw new Error('native buffer must not stringify'); };
      const binary = new FontFace('Fixture', bytes);
      binary.loaded.catch(() => undefined);
      return { calls, binaryCalls, status: font.status };
    })()`,
      'fontface:actual',
    );
    Reflect.set(window, '__fontFaceObserved', { resources, actual });
    check(
      resources.length === 2 &&
        resources[0].input === 'https://fixture.invalid/missing.woff' &&
        resources[0].output === 'data:application/octet-stream,' &&
        resources[1].input === 'https://fixture.invalid/primitive.woff' &&
        resources[1].output === 'data:application/octet-stream,',
      'FontFace source resource mapping omitted',
    );
    check(
      actual &&
        typeof actual === 'object' &&
        Reflect.get(actual, 'calls') === 1 &&
        Reflect.get(actual, 'binaryCalls') === 0,
      'Actual guest source conversion and binary identity',
    );
    Reflect.set(window, '__fontFaceResult', {
      native,
      worker: workerResult,
      actual,
      resources,
    });
  } finally {
    session.close();
  }
}
run().catch((error) => Reflect.set(window, '__fontFaceFailure', String(error)));
