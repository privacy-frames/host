import { BrowserEnvironment } from '../src/guest/browser.ts';
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
  const frames = Array.from({ length: 3 }, () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    return frame;
  });
  for (const frame of frames)
    if (frame.contentDocument?.readyState !== 'complete')
      await new Promise<void>((done) =>
        frame.addEventListener('load', () => done(), { once: true }),
      );
  const [unpreparedFrame, pendingFrame, bootstrapFrame] = frames;
  const unknown = unpreparedFrame.contentWindow,
    pending = pendingFrame.contentWindow,
    bootstrap = bootstrapFrame.contentWindow;
  check(unknown && pending && bootstrap, 'Native blank windows exist');
  check(
    Object.getPrototypeOf(unknown) !== null && unpreparedFrame.contentDocument !== null,
    'Native reflection positive control',
  );
  const key = '__window_delete_marker__';
  Object.defineProperty(unknown, key, { configurable: true, value: 'local' });
  check(Reflect.deleteProperty(unknown, key), 'Native delete positive control');
  Object.defineProperty(unknown, key, { configurable: true, value: 'local' });
  const catalog: GuestContextCatalog = {
    application: 'window-reflection',
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
  const parent = await createGuestWindow(catalog, window);
  let child: Awaited<ReturnType<typeof createGuestWindow>> | undefined;
  const own = new BrowserEnvironment({ catalog, global: bootstrap });
  async function withheld(target: Window, frame: HTMLIFrameElement, label: string) {
    let refused = false;
    try {
      parent.environment.host.prototype(target);
    } catch {
      refused = true;
    }
    check(refused, label + ' prototype withheld');
    check(
      parent.environment.host.get(target, 'document') === undefined,
      label + ' window document withheld',
    );
    check(
      parent.environment.host.get(target, 'AbortController') === undefined &&
        parent.environment.host.get(target, 'fetch') === undefined,
      label + ' constructor and APIs withheld',
    );
    check(
      parent.environment.host.get(target, 'closed') === target.closed,
      label + ' native closed observation retained',
    );

    check(
      parent.environment.host.get(frame, 'contentDocument') === null,
      label + ' document withheld',
    );
    check(
      parent.environment.host.delete?.(target, key) === false,
      label + ' delete denied',
    );
    parent.engine.set('retainedWindow', target);
    parent.engine.set('retainedFrame', frame);
    const result = await parent.engine.evaluate(`(() => {
      let denied=false;try {Object.getPrototypeOf(retainedWindow);}catch{denied=true;}
      const getter=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'contentDocument').get;
      const windowGetter=Object.getOwnPropertyDescriptor(retainedWindow,'document').get;
      return JSON.stringify({denied,windowDoc:retainedWindow.document===undefined,windowReflected:windowGetter.call(retainedWindow)===undefined,constructor:retainedWindow.AbortController===undefined,api:retainedWindow.fetch===undefined,direct:retainedFrame.contentDocument===null,reflected:getter.call(retainedFrame)===null,keys:Array.isArray(Object.getOwnPropertyNames(retainedWindow))});
    })()`);
    const checks = JSON.parse(String(result));
    check(
      (checks.denied || label === 'Disposed') &&
        checks.windowDoc &&
        checks.windowReflected &&
        checks.constructor &&
        checks.api &&
        checks.direct &&
        checks.reflected &&
        checks.keys,
      label + ' guest reflection withheld without hiding keys',
    );
  }
  try {
    check(
      own.host.prototype(bootstrap) === Object.getPrototypeOf(bootstrap),
      'Trusted own bootstrap retains native prototype',
    );
    let borrowed = false;
    try {
      parent.environment.host.prototype(bootstrap);
    } catch {
      borrowed = true;
    }
    check(borrowed, 'Other environment cannot borrow own-bootstrap exception');
    await withheld(unknown, unpreparedFrame, 'Unprepared');
    const gate = deferred<WebAssembly.Module>();
    const compile = WebAssembly.compile;
    WebAssembly.compile = (bytes) =>
      bytes === catalog.engineWasm ? gate.promise : compile(bytes);
    let preparation: ReturnType<typeof createGuestWindow>;
    try {
      preparation = createGuestWindow(catalog, pending);
    } finally {
      WebAssembly.compile = compile;
    }
    await withheld(pending, pendingFrame, 'Pending');
    gate.resolve(await compile(catalog.engineWasm));
    child = await preparation;
    const ready = await parent.engine.evaluate(`(() => {
      const first=Object.getPrototypeOf(retainedWindow), second=Object.getPrototypeOf(retainedWindow);
      const getter=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'contentDocument').get;
      const document=retainedFrame.contentDocument;
      return first!==null && first===second && document.defaultView===retainedWindow && getter.call(retainedFrame)===document && retainedWindow.document===document;
    })()`);
    check(
      ready === true,
      'Retained window gains stable usable prototype after readiness',
    );
    check(
      parent.environment.host.get(pendingFrame, 'contentDocument') ===
        pendingFrame.contentDocument,
      'Ready document native identity',
    );
    child.close();
    await withheld(pending, pendingFrame, 'Disposed');
    own.dispose();
    let ownClosed = false;
    try {
      own.host.prototype(bootstrap);
    } catch {
      ownClosed = true;
    }
    check(ownClosed, 'Disposed own environment has no bootstrap exception');
    return {
      nativePositive: true,
      ownBootstrap: true,
      unpreparedDenied: true,
      pendingDenied: true,
      retainedReady: true,
      contentDocumentReady: true,
      disposedDenied: true,
    };
  } finally {
    child?.close();
    own.dispose();
    parent.close();
    for (const frame of frames) frame.remove();
  }
}
run()
  .then((result) => Reflect.set(window, '__reflectionResult', result))
  .catch((error) =>
    Reflect.set(
      window,
      '__reflectionFailure',
      String(error) + (error instanceof Error ? '\n' + error.stack : ''),
    ),
  );
