import { createGuestWindow } from '../src/guest/session.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function run() {
  const catalog: GuestContextCatalog = {
    application: 'window-writes',
    generation: 'fixture',
    sourceURL: 'https://publisher.invalid/',
    documentBase: 'https://publisher.invalid/',
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
  const frames: HTMLIFrameElement[] = [];
  const children: { close(): void }[] = [];
  const key = '__pf_window_write_fixture__';
  let setterCalls = 0,
    getterCalls = 0;
  function child() {
    const frame = document.createElement('iframe');
    frames.push(frame);
    document.body.append(frame);
    const target = frame.contentWindow;
    check(target, 'Native blank frame exists');
    Object.defineProperty(target, key, {
      configurable: true,
      get() {
        getterCalls++;
        return 'native';
      },
      set(_value: unknown) {
        setterCalls++;
      },
    });
    return target;
  }
  const unprepared = child();
  const preparingWindow = child();
  for (const frame of frames) {
    if (frame.contentDocument?.readyState !== 'complete')
      await new Promise<void>((done) =>
        frame.addEventListener('load', () => done(), { once: true }),
      );
  }
  const parent = await createGuestWindow(catalog, window);

  async function deniedWrites(target: Window, label: string) {
    parent.engine.set('writeTarget', target);
    await parent.engine.evaluate(`(() => {
      try { writeTarget.${key} = 'assignment'; } catch {}
    })()`);
    check(
      setterCalls === 0 && getterCalls === 0,
      label + ' assignment never executes native accessors',
    );
    await parent.engine.evaluate(`(() => {
      const descriptor = Object.getOwnPropertyDescriptor(writeTarget, ${JSON.stringify(key)});
      if (!descriptor || typeof descriptor.set !== 'function') throw Error('Missing mediated setter');
      descriptor.set.call(writeTarget, 'borrowed');
    })()`);
    check(
      setterCalls === 0 && getterCalls === 0,
      label + ' reflected setter never executes native accessors',
    );
    check(
      parent.environment.host.set(target, key, 'direct') === false,
      label + ' direct host write refused',
    );
    check(
      setterCalls === 0 && getterCalls === 0,
      label + ' never executes native accessors',
    );
  }
  try {
    Reflect.set(unprepared, key, 'native-positive');
    check(
      setterCalls === 1 && getterCalls === 0,
      'Native benign setter positive control',
    );
    setterCalls = 0;
    await deniedWrites(unprepared, 'Unprepared window');

    const gate = deferred<WebAssembly.Module>();
    const nativeCompile = WebAssembly.compile;
    let held = false;
    WebAssembly.compile = (bytes) => {
      if (bytes === catalog.engineWasm) {
        held = true;
        return gate.promise;
      }
      return nativeCompile(bytes);
    };
    let preparing: ReturnType<typeof createGuestWindow>;
    try {
      preparing = createGuestWindow(catalog, preparingWindow);
    } finally {
      WebAssembly.compile = nativeCompile;
    }
    check(held, 'Actual child preparation paused before engine creation');
    await deniedWrites(preparingWindow, 'Preparing window');
    gate.resolve(await nativeCompile(catalog.engineWasm));
    const prepared = await preparing;
    children.push(prepared);
    check(
      parent.environment.host.set(preparingWindow, key, 'prepared-direct'),
      'Prepared foreign write accepted',
    );
    check(
      prepared.engine.get(key) === 'prepared-direct',
      'Prepared write targets child guest engine',
    );
    parent.engine.set('writeTarget', preparingWindow);
    await parent.engine.evaluate(`writeTarget.${key} = 'prepared-assignment'`);
    check(
      prepared.engine.get(key) === 'prepared-assignment',
      'Guest assignment reaches prepared guest engine',
    );
    await parent.engine.evaluate(
      `Object.getOwnPropertyDescriptor(writeTarget, ${JSON.stringify(key)}).set.call(writeTarget,'prepared-borrowed')`,
    );
    check(
      prepared.engine.get(key) === 'prepared-borrowed',
      'Reflected setter reaches prepared guest engine',
    );
    check(
      setterCalls === 0 && getterCalls === 0,
      'Prepared routing does not touch native marker',
    );
    prepared.close();
    await deniedWrites(preparingWindow, 'Closed window');
    return {
      nativeSetterPositive: true,
      unpreparedDenied: true,
      pendingPreparationDenied: true,
      preparedGuestRouting: true,
      closedDenied: true,
      nativeAccessorCalls: setterCalls + getterCalls,
    };
  } finally {
    for (const child of children) child.close();
    parent.close();
    for (const frame of frames) frame.remove();
  }
}
run()
  .then((result) => Reflect.set(window, '__windowWritesResult', result))
  .catch((error) =>
    Reflect.set(
      window,
      '__windowWritesFailure',
      String(error) + (error instanceof Error ? '\n' + error.stack : ''),
    ),
  );
