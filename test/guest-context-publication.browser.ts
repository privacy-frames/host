import { createGuestDocuments } from '../src/guest/contexts/documents.ts';
import { createGuestWindowContexts } from '../src/guest/contexts/window-contexts.ts';
import { createGuestWindow } from '../src/guest/session.ts';
import { GuestResources } from '../src/guest/resources.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
async function until(predicate: () => boolean) {
  for (let count = 0; count < 500; count++) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Expected context publication transition did not occur');
}
function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function run() {
  const errors: unknown[] = [];
  const frame = document.createElement('iframe');
  document.body.append(frame);
  let loads = 0;
  frame.addEventListener('load', (event) => {
    if (!event.isTrusted) loads++;
  });
  const first = deferred<{ close(): void }>();
  const second = deferred<{ close(): void }>();
  const signals: AbortSignal[] = [];
  let closedFirst = 0,
    closedSecond = 0;
  const documents = createGuestDocuments({
    baseURL: 'https://fixture.invalid/',
    prepare(_frame, _source, signal) {
      signals.push(signal);
      return signals.length === 1 ? first.promise : second.promise;
    },
    report(error) {
      errors.push(error);
    },
  });
  documents.track(frame);
  const old = documents.connected(frame);
  const current = documents.configure(frame, {
    kind: 'markup',
    html: 'new',
    baseURL: 'https://fixture.invalid/',
  });
  check(
    signals[0].aborted && !signals[1].aborted,
    'Replacement must synchronously abort old preparation',
  );
  second.resolve({
    close() {
      closedSecond++;
    },
  });
  await current;
  first.resolve({
    close() {
      closedFirst++;
    },
  });
  await old;
  check(
    closedFirst === 1 && closedSecond === 0 && loads === 1,
    'Stale completion must close without logical load',
  );
  documents.dispose();
  check(closedSecond === 1, 'Published session must close on factory disposal');
  frame.remove();

  const pendingFrame = document.createElement('iframe');
  document.body.append(pendingFrame);
  const pending = deferred<{ close(): void }>();
  let pendingSignal: AbortSignal | undefined;
  let pendingClosed = 0,
    pendingLoads = 0;
  pendingFrame.addEventListener('load', (event) => {
    if (!event.isTrusted) pendingLoads++;
  });
  const closing = createGuestDocuments({
    baseURL: 'https://fixture.invalid/',
    prepare(_frame, _source, signal) {
      pendingSignal = signal;
      return pending.promise;
    },
    report(error) {
      errors.push(error);
    },
  });
  const finishing = closing.connected(pendingFrame);
  closing.dispose();
  check(pendingSignal?.aborted, 'Disposal must abort pending preparation');
  pending.resolve({
    close() {
      pendingClosed++;
    },
  });
  await finishing;
  check(
    pendingClosed === 1 && pendingLoads === 0,
    'Disposed completion must never publish',
  );
  pendingFrame.remove();

  const reentrantFrame = document.createElement('iframe');
  document.body.append(reentrantFrame);
  const preparedSources: string[] = [];
  let reenter = true;
  let reentrant: ReturnType<typeof createGuestDocuments>;
  reentrant = createGuestDocuments({
    baseURL: 'https://fixture.invalid/',
    async prepare(_frame, source) {
      preparedSources.push(source.kind === 'markup' ? source.html : source.url);
      return {
        close() {
          if (!reenter) return;
          reenter = false;
          void reentrant.configure(reentrantFrame, {
            kind: 'markup',
            html: 'inner',
            baseURL: 'https://fixture.invalid/',
          });
        },
      };
    },
    report(error) {
      errors.push(error);
    },
  });
  await reentrant.connected(reentrantFrame);
  await reentrant.configure(reentrantFrame, {
    kind: 'markup',
    html: 'outer',
    baseURL: 'https://fixture.invalid/',
  });
  check(
    preparedSources.join('|') === '|inner',
    'Reentrant cleanup must not erase the newer preparation',
  );
  reentrant.dispose();
  reentrantFrame.remove();

  const cleanupFrames = [
    document.createElement('iframe'),
    document.createElement('iframe'),
  ];
  document.body.append(...cleanupFrames);
  let cleanupCalls = 0;
  const cleanupFailure = new Error('Fixture cleanup failure');
  const throwing = createGuestDocuments({
    baseURL: 'https://fixture.invalid/',
    async prepare() {
      return {
        close() {
          cleanupCalls++;
          if (cleanupCalls === 1) throw cleanupFailure;
        },
      };
    },
    report(error) {
      errors.push(error);
    },
  });
  await Promise.all(cleanupFrames.map((element) => throwing.connected(element)));
  let cleanupErrors = 0;
  try {
    throwing.dispose();
  } catch (error) {
    if (!(error instanceof AggregateError)) throw error;
    cleanupErrors = error.errors.length;
    check(error.errors[0] === cleanupFailure, 'Cleanup must retain the actual failure');
  }
  check(
    cleanupCalls === 2 && cleanupErrors === 1,
    'One throwing cleanup must not prevent the other context from closing',
  );
  for (const element of cleanupFrames) element.remove();

  const bytes = await (await fetch('/engine.wasm')).arrayBuffer();
  const catalog: GuestContextCatalog = {
    application: 'context-publication-fixture',
    generation: 'fixture-generation',
    sourceURL: 'https://fixture.invalid/',
    documentBase: 'https://fixture.invalid/',
    applicationURL: location.origin + '/app/',
    runtimeURL: location.origin + '/',
    engineWasm: bytes,
    workerBootstrap: {
      dedicated: new ArrayBuffer(0),
      shared: new ArrayBuffer(0),
      worklet: new ArrayBuffer(0),
    },
    resources: [],
  };
  const resources = new GuestResources(catalog);
  let delivered = 0;
  const receive = (event: MessageEvent) => {
    if (event.data === 'queued-context-fixture') delivered++;
  };
  window.addEventListener('message', receive);
  const windows = createGuestWindowContexts({
    catalog,
    resources,
    nativeWindow: window,
    async createSession() {
      return { close() {} };
    },
    report(error) {
      errors.push(error);
    },
  });
  windows.postMessage(window, 'queued-context-fixture', '*');
  await tick();
  check(delivered === 1, 'Live queued-message control must deliver');
  windows.postMessage(window, 'queued-context-fixture', '*');
  windows.dispose();
  await tick();
  check(delivered === 1, 'Producer disposal must drop queued messages');
  window.removeEventListener('message', receive);
  resources.dispose();

  const popupStarts: AbortSignal[] = [];
  const popupFirst = deferred<{ close(): void }>();
  const popupSecond = deferred<{ close(): void }>();
  let popupFirstClosed = 0,
    popupSecondClosed = 0;
  const popupResources = new GuestResources(catalog);
  const popupWindows = createGuestWindowContexts({
    catalog,
    resources: popupResources,
    nativeWindow: window,
    createSession(_catalog, _window, _html, signal) {
      popupStarts.push(signal);
      return popupStarts.length === 1 ? popupFirst.promise : popupSecond.promise;
    },
    report(error) {
      errors.push(error);
    },
  });
  const popup = popupWindows.open('about:blank', 'publication-fixture-popup');
  if (!popup) throw new Error('Native popup control must be available');
  await until(() => popupStarts.length === 1);
  const reusedPopup = popupWindows.open('about:blank', 'publication-fixture-popup');
  check(
    reusedPopup === popup && popupStarts[0].aborted,
    'Named popup replacement must preserve Window identity and abort old preparation',
  );
  await until(() => popupStarts.length === 2);
  popupSecond.resolve({
    close() {
      popupSecondClosed++;
    },
  });
  await tick();
  popupFirst.resolve({
    close() {
      popupFirstClosed++;
    },
  });
  await tick();
  check(
    popupFirstClosed === 1 && popupSecondClosed === 0,
    'Stale popup completion must close without replacing current session',
  );
  popupWindows.dispose();
  check(
    popupSecondClosed === 1 && popup.closed,
    'Popup disposal must close current session and native window',
  );
  popupResources.dispose();

  const root = await createGuestWindow(catalog, window);
  const notifications: number[] = [];
  root.engine.set('notifyPublication', (value: number) => notifications.push(value));
  const compiled = await WebAssembly.compile(bytes);
  const held = deferred<WebAssembly.Module>();
  const originalCompile = WebAssembly.compile;
  let waitingForEngine = false;
  WebAssembly.compile = (() => {
    waitingForEngine = true;
    return held.promise;
  }) as typeof WebAssembly.compile;
  try {
    root.engine.evaluate(`
      globalThis.pendingChild = document.createElement('iframe');
      pendingChild.srcdoc = '<script>parent.notifyPublication(1)</script>';
      document.body.append(pendingChild);
    `);
    await until(() => waitingForEngine);
  } finally {
    WebAssembly.compile = originalCompile;
  }
  root.engine.evaluate('pendingChild.remove()');
  await tick();
  held.resolve(compiled);
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  check(
    notifications.length === 0,
    'Cancelled real child must not execute its first script',
  );
  root.engine.evaluate(`
    globalThis.liveChild = document.createElement('iframe');
    liveChild.srcdoc = '<script>parent.notifyPublication(2)</script>';
    document.body.append(liveChild);
  `);
  await until(() => notifications.length === 1);
  check(notifications[0] === 2, 'Uncancelled real child control must execute');
  root.close();
  check(errors.length === 0, 'Independent factories must report no preparation error');
  return {
    staleClosed: closedFirst,
    publishedClosed: closedSecond,
    logicalLoads: loads,
    pendingClosed,
    pendingLoads,
    reentrantSources: preparedSources,
    queuedDeliveries: delivered,
    cancelledRealChildExecutions: notifications.filter((value) => value === 1).length,
    liveRealChildExecutions: notifications.filter((value) => value === 2).length,
    popupFirstClosed,
    popupSecondClosed,
    cleanupCalls,
    cleanupErrors,
  };
}
run()
  .then((result) => Reflect.set(window, '__publicationResult', result))
  .catch((error) => {
    Reflect.set(
      window,
      '__publicationFailure',
      error instanceof Error ? error.stack : String(error),
    );
  });
