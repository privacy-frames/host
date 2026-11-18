import { getQuickJS, type QuickJSHandle } from 'quickjs-emscripten';
import { bindings, fixture } from './guest.ts';

export const run = async () => {
  const started = performance.now();
  const engine = await getQuickJS();
  const loaded = performance.now();
  const runtime = engine.newRuntime();
  runtime.setMemoryLimit(32 * 1024 * 1024);
  runtime.setMaxStackSize(512 * 1024);
  const vm = runtime.newContext();
  const initialized = performance.now();
  const objects = new Map<number, HTMLElement | Event>();
  const ids = new WeakMap<object, number>();
  const listeners: Array<() => void> = [];
  const errors: unknown[] = [];
  const events: unknown[] = [];
  let nextId = 1;
  let deliver: QuickJSHandle;
  const identify = (object: HTMLElement | Event) => {
    let id = ids.get(object);
    if (id === undefined) {
      id = nextId++;
      ids.set(object, id);
      objects.set(id, object);
    }
    return id;
  };
  const evaluate = (source: string) => {
    const result = vm.evalCode(source);
    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      throw new Error(JSON.stringify(error));
    }
    const value: unknown = vm.dump(result.value);
    if (result.value.alive) result.value.dispose();
    return value;
  };
  const host = vm.newFunction('__host', (opHandle, idHandle, argsHandle) => {
    const op = vm.getString(opHandle);
    const id = vm.getNumber(idHandle);
    const args: Array<string | number[] | number | boolean> = JSON.parse(
      vm.getString(argsHandle),
    );
    const object = objects.get(id);
    let value: unknown = null;
    switch (op) {
      case 'query': {
        const node = document.getElementById(String(args[0]));
        if (!node) throw new Error('unknown fixture element');
        value = identify(node);
        break;
      }
      case 'value':
        if (object instanceof HTMLInputElement) value = object.value;
        break;
      case 'setValue':
        if (object instanceof HTMLInputElement) object.value = String(args[0]);
        break;
      case 'text':
        if (object instanceof HTMLElement) value = object.textContent;
        break;
      case 'setText':
        if (object instanceof HTMLElement) object.textContent = String(args[0]);
        break;
      case 'store':
        localStorage.setItem('quickjs-study:' + args[0], String(args[1]));
        break;
      case 'load':
        value = localStorage.getItem('quickjs-study:' + args[0]);
        break;
      case 'pixels': {
        if (!(object instanceof HTMLCanvasElement) || !Array.isArray(args[0]))
          throw new Error('invalid canvas');
        object
          .getContext('2d')!
          .putImageData(new ImageData(new Uint8ClampedArray(args[0]), 1, 1), 0, 0);
        break;
      }
      case 'prevent':
        if (object instanceof Event) object.preventDefault();
        break;
      case 'prevented':
        if (object instanceof Event) value = object.defaultPrevented;
        break;
      case 'listen': {
        if (!(object instanceof HTMLElement)) throw new Error('invalid listener target');
        const type = String(args[0]);
        const listener = Number(args[1]);
        const callback = (event: Event) => {
          const handles = [
            vm.newNumber(listener),
            vm.newNumber(identify(event)),
            vm.newString(type),
          ];
          const result = vm.callFunction(deliver, vm.undefined, ...handles);
          handles.forEach((handle) => handle.dispose());
          if (result.error) {
            errors.push(vm.dump(result.error));
            result.error.dispose();
          } else if (result.value.alive) result.value.dispose();
        };
        object.addEventListener(type, callback);
        listeners.push(() => object.removeEventListener(type, callback));
        break;
      }
      case 'dispatch': {
        if (!(object instanceof HTMLElement)) throw new Error('invalid event target');
        const event = new Event(String(args[0]), { cancelable: Boolean(args[1]) });
        value = object.dispatchEvent(event);
        events.push({
          type: event.type,
          returned: value,
          defaultPrevented: event.defaultPrevented,
        });
        break;
      }
      case 'noop':
        value = 1;
        break;
      case 'fail':
        throw new Error('host-operation-failure');
      default:
        throw new Error('operation denied');
    }
    return vm.newString(JSON.stringify(value));
  });
  vm.setProp(vm.global, '__host', host);
  host.dispose();
  evaluate(bindings);
  deliver = vm.getProp(vm.global, '__deliver');
  evaluate(fixture);
  const beforeJobs = evaluate('promiseDone');
  const jobs = runtime.executePendingJobs();
  if (jobs.error) throw new Error(JSON.stringify(vm.dump(jobs.error)));
  jobs.dispose();
  const afterJobs = evaluate('promiseDone');
  const state = evaluate(
    'JSON.stringify({identity, prototype, expando, dispatched, log, caughtHost, persisted: ++persisted})',
  );
  const nativeControl = new Event('control', { cancelable: true });
  const controlReturn = document.getElementById('button')!.dispatchEvent(nativeControl);
  const errorEvent = new Event('throws', { cancelable: true });
  const errorDispatch = document.getElementById('button')!.dispatchEvent(errorEvent);
  runtime.setModuleLoader((name) => {
    if (name === 'local:math') return 'export const answer = 42;';
    throw new Error('module not admitted: ' + name);
  });
  const module = vm.evalCode(
    "import {answer} from 'local:math'; globalThis.moduleAnswer = answer;",
    'local:main',
    { type: 'module' },
  );
  if (module.error) throw new Error(JSON.stringify(vm.dump(module.error)));
  module.value.dispose();
  const moduleJobs = runtime.executePendingJobs();
  moduleJobs.dispose();
  const moduleAnswer = evaluate('moduleAnswer');
  evaluate(
    "globalThis.dynamicAnswer = 0; import('local:math').then(m => dynamicAnswer = m.answer)",
  );
  const dynamicJobs = runtime.executePendingJobs();
  dynamicJobs.dispose();
  const dynamicAnswer = evaluate('dynamicAnswer');
  const deniedModule = vm.evalCode(
    "import 'https://example.invalid/denied.js'",
    'local:denied',
    { type: 'module' },
  );
  const moduleDenied = Boolean(deniedModule.error);
  deniedModule.dispose();
  const deniedGlobals = evaluate(
    "JSON.stringify(Object.fromEntries(['fetch','XMLHttpRequest','Worker','WebAssembly','window','Function','eval'].map(k => [k, typeof globalThis[k]])))",
  );
  const deniedOperation = evaluate(
    "(() => { try { __host('fetch', 0, '[]'); return false; } catch (e) { return e.message === 'operation denied'; } })()",
  );
  const prototypeControl = Object.prototype.hasOwnProperty.call(
    HTMLElement.prototype,
    'label',
  );
  const originalBytes = new Uint8Array([1, 2, 3, 4]);
  const buffer = vm.newArrayBuffer(originalBytes.buffer);
  vm.setProp(vm.global, 'hostBuffer', buffer);
  originalBytes[0] = 99;
  const initialGuestByte = evaluate('new Uint8Array(hostBuffer)[0]');
  evaluate('new Uint8Array(hostBuffer)[1] = 77');
  const copiedBack = vm.getArrayBuffer(buffer);
  const buffers = {
    initialGuestByte,
    hostOriginal: Array.from(originalBytes),
    guestBytes: Array.from(copiedBack.value),
  };
  copiedBack.dispose();
  buffer.dispose();
  const tla = vm.evalCode(
    'globalThis.tlaValue = await Promise.resolve(43)',
    'local:tla',
    { type: 'module' },
  );
  tla.dispose();
  const tlaJobs = runtime.executePendingJobs();
  tlaJobs.dispose();
  const tlaValue = evaluate('tlaValue');
  const costStart = performance.now();
  evaluate("for (let i = 0; i < 10000; i++) __host('noop', 0, '[]');");
  const bridge10000Ms = performance.now() - costStart;
  const loopStart = performance.now();
  evaluate('let sum = 0; for (let i = 0; i < 10000; i++) sum += i;');
  const guestLoop10000Ms = performance.now() - loopStart;
  let deadline = performance.now() + 30;
  runtime.setInterruptHandler(() => performance.now() > deadline);
  const interrupted = vm.evalCode('while (true) {}');
  const interruptError = interrupted.error ? vm.dump(interrupted.error) : null;
  interrupted.dispose();
  runtime.removeInterruptHandler();
  const recovered = evaluate('persisted');
  const receipt = {
    startup: { loadMs: loaded - started, contextMs: initialized - loaded },
    state,
    events,
    errors,
    beforeJobs,
    afterJobs,
    moduleAnswer,
    dynamicAnswer,
    moduleDenied,
    controls: {
      controlReturn,
      controlDefaultPrevented: nativeControl.defaultPrevented,
      errorDispatch,
      prototypeControl,
      deniedGlobals,
      deniedOperation,
    },
    native: {
      input: (document.getElementById('input') as HTMLInputElement).value,
      text: document.getElementById('output')!.textContent,
      storage: localStorage.getItem('quickjs-study:note'),
      pixel: Array.from(
        (document.getElementById('canvas') as HTMLCanvasElement)
          .getContext('2d')!
          .getImageData(0, 0, 1, 1).data,
      ),
    },
    buffers,
    tlaValue,
    costs: { bridge10000Ms, guestLoop10000Ms },
    interruptError,
    recovered,
    resources: performance
      .getEntriesByType('resource')
      .map((entry) => ({ name: entry.name, duration: entry.duration })),
  };
  const appSource = await fetch('/app-source.js').then((response) => response.text());
  const appResult = vm.evalCode(appSource, 'unchanged-pitch.js');
  const unchangedApp = appResult.error
    ? vm.dump(appResult.error)
    : 'evaluation completed';
  appResult.dispose();
  listeners.forEach((remove) => remove());
  deliver.dispose();
  vm.dispose();
  runtime.dispose();
  localStorage.removeItem('quickjs-study:note');
  return { ...receipt, unchangedApp };
};
Object.assign(globalThis, { study: run() });
