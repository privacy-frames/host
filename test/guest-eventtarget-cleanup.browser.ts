import { createGuestWindow } from '../src/guest/session.ts';
import { captureEventListenerArguments } from '../src/guest/event-listener-arguments.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function nativeCase(tracked: boolean, mode: string) {
  const trace: string[] = [];
  const controller = new AbortController();
  const options = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of Object.entries({
    capture: true,
    once: false,
    passive: undefined,
    signal: controller.signal,
  }))
    Object.defineProperty(options, key, {
      get() {
        check(this === options, 'Native dictionary getter receiver');
        trace.push('options.' + key);
        if (mode === 'throwing-options' && key === 'capture')
          throw new Error('capture failure');
        return value;
      },
    });
  const all = Reflect.get(document, 'all');
  Object.defineProperty(all, 'capture', {
    configurable: true,
    get() {
      check(this === all, 'Legacy dictionary getter receiver');
      trace.push('options.capture');
      return true;
    },
  });
  const callable = () => {};
  Object.defineProperty(callable, 'capture', {
    get() {
      check(this === callable, 'Function dictionary getter receiver');
      trace.push('options.capture');
      return true;
    },
  });
  const provided = (
    {
      dictionary: options,
      'document-all': all,
      'throwing-options': options,
      null: null,
      undefined,
      false: false,
      true: true,
      zero: 0,
      one: 1,
      text: 'truthy',
      symbol: Symbol('options'),
      function: callable,
      frozen: Object.freeze({ capture: true }),
    } as Record<string, unknown>
  )[mode];
  const type =
    mode === 'symbol-type'
      ? Symbol('type')
      : {
          [Symbol.toPrimitive](hint: string) {
            trace.push('type.' + hint);
            return 'fixture';
          },
        };
  const target = new EventTarget();
  let delivered = 0;
  const listener = () => {
    delivered++;
  };
  const input = [type, listener, provided];
  const observed = tracked ? captureEventListenerArguments(input) : undefined;
  let error: string | undefined;
  try {
    Reflect.apply(
      EventTarget.prototype.addEventListener,
      target,
      observed?.arguments ?? input,
    );
  } catch (value) {
    error = value instanceof Error ? value.name : String(value);
  }
  if (!error) {
    target.dispatchEvent(new Event('fixture'));
    const capture =
      mode === 'dictionary' ||
      mode === 'document-all' ||
      mode === 'function' ||
      mode === 'frozen' ||
      (provided !== null &&
        typeof provided !== 'object' &&
        typeof provided !== 'function' &&
        Boolean(provided));
    const cleanup = observed?.cleanup() ?? ['fixture', listener, capture];
    const before = trace.length;
    Reflect.apply(EventTarget.prototype.removeEventListener, target, cleanup);
    target.dispatchEvent(new Event('fixture'));
    check(delivered === 1, 'Native cleanup matches registration');
    check(trace.length === before, 'Cleanup uses only captured primitives');
  } else {
    target.dispatchEvent(new Event('fixture'));
    check(delivered === 0, 'Failed native conversion has no listener effect');
  }
  return { trace, delivered, error };
}

async function run() {
  const modes = [
    'dictionary',
    'document-all',
    'throwing-options',
    'null',
    'undefined',
    'false',
    'true',
    'zero',
    'one',
    'text',
    'symbol',
    'function',
    'frozen',
    'symbol-type',
  ];
  for (const mode of modes)
    check(
      JSON.stringify(nativeCase(true, mode)) === JSON.stringify(nativeCase(false, mode)),
      'Native conversion trace differs: ' + mode,
    );
  const catalog: GuestContextCatalog = {
    application: 'eventtarget-cleanup-fixture',
    generation: 'fixture-generation',
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
  const probe = new URL(location.href).searchParams.get('probe');
  const observations: unknown[] = [];
  const selected = probe ? [probe] : ['capture', 'type', 'failure'];
  for (const mode of selected) {
    let removals = 0;
    const remove = EventTarget.prototype.removeEventListener;
    if (mode === 'type')
      EventTarget.prototype.removeEventListener = function (type, listener, options) {
        const result = Reflect.apply(remove, this, [type, listener, options]);
        if (type === 'type-cleanup-fixture') removals++;
        return result;
      };
    try {
      const session = await createGuestWindow(catalog, window);
      const environment = session.environment;
      const counts: Record<string, number> = {};
      for (const name of [
        'workers',
        'windows',
        'audio',
        'customElements',
        'dom',
        'resources',
      ]) {
        const target: unknown = Reflect.get(environment, name);
        if (!target || typeof target !== 'object') continue;
        const original: unknown = Reflect.get(target, 'dispose');
        if (typeof original !== 'function') continue;
        counts[name] = 0;
        Reflect.set(target, 'dispose', () => {
          counts[name]++;
          return Reflect.apply(original, target, []);
        });
      }
      const cleanups: Set<() => void> = Reflect.get(environment, 'cleanups');
      const before = cleanups.size;
      if (mode === 'capture') {
        session.engine.evaluate(`globalThis.captureReads=0;globalThis.deliveries=0;
        const options={};Object.defineProperty(options,'capture',{get(){
          captureReads++;if(captureReads>1)throw new Error('capture-read-again');return false;
        }});
        try{window.addEventListener('capture-cleanup-fixture',()=>{deliveries++},options)}
        catch(error){globalThis.registrationError=error.message}`);
        window.dispatchEvent(new Event('capture-cleanup-fixture'));
        const captureReads = session.engine.get('captureReads');
        const registrationError = session.engine.get('registrationError');
        const deliveries = session.engine.get('deliveries');
        const observed = {
          mode,
          captureReads,
          registrationError,
          deliveries,
          tracked: cleanups.size - before,
        };
        Reflect.set(window, '__eventtargetObserved', observed);
        check(
          captureReads === 1 &&
            registrationError === undefined &&
            deliveries === 1 &&
            cleanups.size === before + 1,
          'Capture options must be consumed once before bookkeeping',
        );
        session.close();
        observations.push(observed);
      } else if (mode === 'type') {
        session.engine.evaluate(`globalThis.typeReads=0;const type={toString(){
        typeReads++;if(typeReads>1)throw new Error('type-read-again');return 'type-cleanup-fixture';
      }};window.addEventListener(type,()=>{});`);
        const typeReads = session.engine.get('typeReads');
        session.close();
        const observed = {
          mode,
          typeReads,
          removals,
          counts,
          contextAlive: session.engine.context.alive,
        };
        Reflect.set(window, '__eventtargetObserved', observed);
        check(
          typeReads === 1 &&
            removals === 1 &&
            Object.values(counts).every((value) => value === 1),
          'Primitive listener cleanup must release every owned subsystem',
        );
        observations.push(observed);
      } else if (mode === 'failure') {
        let later = 0;
        cleanups.add(() => {
          throw undefined;
        });
        cleanups.add(() => {
          later++;
          throw new Error('later cleanup failure');
        });
        cleanups.add(() => {
          later++;
        });
        let caught = false;
        let failure: unknown;
        try {
          environment.dispose();
        } catch (error) {
          caught = true;
          failure = error;
        }
        const observed = {
          mode,
          caught,
          firstFailurePreserved: failure === undefined,
          later,
          counts,
          remainingCleanups: cleanups.size,
        };
        Reflect.set(window, '__eventtargetObserved', observed);
        check(
          caught &&
            failure === undefined &&
            later === 2 &&
            Object.values(counts).every((value) => value === 1) &&
            cleanups.size === 0,
          'Every owned subsystem must be attempted after cleanup failure',
        );
        session.close();
        observations.push(observed);
      }
    } finally {
      EventTarget.prototype.removeEventListener = remove;
    }
  }
  return { nativeComparisons: modes.length, observations };
}
run()
  .then((result) => Reflect.set(window, '__eventtargetResult', result))
  .catch((error) =>
    Reflect.set(
      window,
      '__eventtargetFailure',
      String(error) + (error instanceof Error ? '\n' + error.stack : ''),
    ),
  );
