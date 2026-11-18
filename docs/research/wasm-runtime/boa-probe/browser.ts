import initializeWasm, * as runtime from './pkg/boa_browser_probe.js';

type Receipt = { name: string; passed: boolean; detail: unknown };
const receipts: Receipt[] = [];
const record = (name: string, passed: boolean, detail: unknown) => {
  receipts.push({ name, passed, detail });
};
const run = (name: string, source: string, expected = 'true') => {
  try {
    const detail = runtime.evaluate(source);
    record(name, detail === expected, detail);
  } catch (error) {
    record(name, false, String(error));
  }
};

const node = document.createElement('button');
document.body.append(node);
const bindingParent = document.createElement('div');
const bindingChild = document.createElement('span');
document.body.append(bindingParent);
const bindingNodes = new Map<number, Node>([
  [1, bindingParent],
  [2, bindingChild],
]);
const bindingNode = (id: number) => {
  const node = bindingNodes.get(id);
  if (!node) throw Error('invalid fixture handle');
  return node;
};
const events: Event[] = [];
let listenerErrors: string[] = [];
let nativeDispatchCount = 0;
let deniedResources = 0;
let allowedResources = 0;
const listener = () => {
  const event = events.at(-1)!;
  const id =
    event.type === 'outer' ? 'outer' : event.type === 'throw' ? 'throw' : 'inner';
  try {
    if (new URLSearchParams(location.search).has('nested-eval-control'))
      runtime.evaluate(`listeners.${id}()`);
    else runtime.call_listener(id);
  } catch (error) {
    listenerErrors.push(String(error));
  }
};
for (const type of ['outer', 'inner', 'throw']) node.addEventListener(type, listener);

// This deliberately small, fixed operation table is fixture plumbing, not a DOM.
Object.assign(globalThis, {
  probeBrowserCall(operation: string, argument: string): string {
    switch (operation) {
      case 'dispatch':
      case 'dispatch-naive': {
        const event = new Event(argument, { cancelable: true });
        events.push(event);
        nativeDispatchCount++;
        const returned = node.dispatchEvent(event);
        events.pop();
        return JSON.stringify({ returned, canceled: event.defaultPrevented });
      }
      case 'prevent':
        events.at(-1)!.preventDefault();
        return 'ok';
      case 'node':
        return 'node:1';
      case 'storage-set':
        localStorage.setItem('boa-probe:app-a', argument);
        return 'ok';
      case 'storage-get':
        return localStorage.getItem('boa-probe:app-a') ?? '';
      case 'canvas': {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        const pixels = Uint8ClampedArray.from(JSON.parse(argument));
        context.putImageData(new ImageData(pixels, 1, 1), 0, 0);
        return JSON.stringify(Array.from(context.getImageData(0, 0, 1, 1).data));
      }
      case 'throw-host':
        throw new Error('native sentinel');
      case 'binding-read': {
        const [id, property] = JSON.parse(argument);
        const node = bindingNode(id);
        if (property === 'nodeName') return node.nodeName;
        if (property === 'textContent') return node.textContent ?? '';
        throw Error('unsupported property');
      }
      case 'binding-write': {
        const [id, property, value] = JSON.parse(argument);
        if (property !== 'textContent') throw Error('unsupported write');
        bindingNode(id).textContent = value;
        return '';
      }
      case 'binding-parent':
        return String(bindingNode(Number(argument)).parentNode === bindingParent ? 1 : 0);
      case 'binding-append': {
        const [parent, child] = JSON.parse(argument);
        bindingNode(parent).appendChild(bindingNode(child));
        return '';
      }
      case 'resource':
        if (argument === '/admitted.txt') {
          allowedResources++;
          return 'admitted bytes';
        }
        deniedResources++;
        throw new Error('resource denied');
      default:
        throw new Error(`unknown operation: ${operation}`);
    }
  },
});

const started = performance.now();
await initializeWasm();
const loaded = performance.now();
runtime.initialize();
const initialized = performance.now();
run('persistent-write', 'globalThis.persisted = 41', '41');
run('persistent-read', 'persisted += 1', '42');
run(
  'install-fixture',
  `
  globalThis.log = [];
  globalThis.listeners = {
    outer() {
      log.push('outer-start');
      host('prevent');
      const nested = JSON.parse(host('dispatch', 'inner'));
      if (nested.returned || !nested.canceled) throw Error('nested cancellation failed');
      log.push('outer-end');
    },
    inner() { log.push('inner'); host('prevent'); },
    throw() { throw Error('guest sentinel'); }
  };
  true
`,
);
listenerErrors = [];
run(
  'naive-reentry-control',
  `
  const naive = JSON.parse(host('dispatch-naive', 'outer'));
  !naive.canceled && naive.returned
`,
);
record(
  'naive-reentry-error',
  listenerErrors.some((e) => e.includes('Context already borrowed')),
  listenerErrors,
);
listenerErrors = [];
run(
  'scoped-native-nested-reentry',
  `
  log.length = 0;
  const scoped = JSON.parse(host('dispatch', 'outer'));
  scoped.canceled && !scoped.returned && log.join(',') === 'outer-start,inner,outer-end'
`,
);
record('scoped-no-listener-errors', listenerErrors.length === 0, listenerErrors);
listenerErrors = [];
run(
  'guest-listener-error-native-dispatch-semantics',
  `
  const thrown = JSON.parse(host('dispatch', 'throw'));
  thrown.returned && !thrown.canceled
`,
);
record(
  'guest-listener-error-reported',
  listenerErrors.some((e) => e.includes('guest sentinel')),
  listenerErrors,
);
run(
  'host-exception-catchable',
  `
  (() => { try { host('throw-host'); return false; } catch (e) { return String(e).includes('native sentinel'); } })()
`,
);
run('context-recovers-after-errors', 'persisted === 42');
run(
  'wrapper-identity-expando-prototype',
  `
  class ProbeNode { constructor(id) { this.id = id; } }
  const wrappers = new Map();
  function getNode() {
    const id = host('node');
    if (!wrappers.has(id)) wrappers.set(id, new ProbeNode(id));
    return wrappers.get(id);
  }
  ProbeNode.prototype.marker = function () { return this.extra + 1; };
  getNode().extra = 7;
  getNode() === getNode() && getNode().marker() === 8
`,
);
run(
  'typedarray-canvas-copy-roundtrip',
  `
  const rgba = new Uint8ClampedArray([17, 34, 51, 255]);
  const result = new Uint8ClampedArray(JSON.parse(host('canvas', JSON.stringify(Array.from(rgba)))));
  result.join(',') === rgba.join(',') && result.buffer !== rgba.buffer
`,
);
run(
  'storage-string-roundtrip',
  `host('storage-set', 'persisted value'); host('storage-get') === 'persisted value'`,
);
run(
  'promise-before-drain',
  `globalThis.jobResult = 0; Promise.resolve(8).then(v => jobResult = v); jobResult === 0`,
);
runtime.jobs();
run('promise-after-drain', 'jobResult === 8');
const moduleState = runtime.module(
  'export const n = await Promise.resolve(9); globalThis.moduleResult = n;',
);
record('module-top-level-await', moduleState.startsWith('Fulfilled'), moduleState);
run('module-visible-result', 'moduleResult === 9');
const imported = runtime.module(
  "import { value } from '/admitted.mjs'; globalThis.importedResult = value;",
);
record('admitted-module-import', imported.startsWith('Fulfilled'), imported);
run('admitted-module-value', 'importedResult === 23');
run(
  'dynamic-import-start',
  "globalThis.dynamicResult = 0; import('/admitted.mjs').then(m => dynamicResult = m.value); true",
);
runtime.jobs();
run('dynamic-import-result', 'dynamicResult === 23');
const missingModule = runtime.module("import '/not-admitted.mjs';");
record(
  'module-unconfigured-import-rejected',
  missingModule.startsWith('Rejected'),
  missingModule,
);
run('admitted-resource', `host('resource', '/admitted.txt') === 'admitted bytes'`);
run(
  'denied-resource',
  `(() => { try { host('resource', 'https://example.invalid/escape'); return false; } catch { return true; } })()`,
);
run(
  'ambient-native-globals-absent',
  `typeof window === 'undefined' && typeof document === 'undefined' && typeof fetch === 'undefined' && typeof Worker === 'undefined'`,
);
run(
  'guest-function-constructor-stays-guest',
  `Function('return typeof window')() === 'undefined'`,
);

// Native-origin dispatch starts from an idle persistent engine, then nests.
listenerErrors = [];
const externalEvent = new Event('outer', { cancelable: true });
events.push(externalEvent);
const externalReturned = node.dispatchEvent(externalEvent);
events.pop();
record(
  'idle-native-event-nested-reentry',
  !externalReturned && externalEvent.defaultPrevented && listenerErrors.length === 0,
  { externalReturned, canceled: externalEvent.defaultPrevented, listenerErrors },
);

run(
  'private-field-stamping',
  `
  (() => {
    class ReturnObject { constructor(object) { return object; } }
    class Stamp extends ReturnObject {
      #value;
      constructor(object) { super(object); this.#value = 3; }
      static read(object) { return #value in object ? object.#value : null; }
    }
    const target = {};
    new Stamp(target);
    return Stamp.read(target) === 3 && Stamp.read({}) === null;
  })()
`,
);
run(
  'private-brand-with-optional-chain-and-getter',
  `
  (() => {
    const descriptor = {
      get list() { Object.defineProperty(this, 'list', {value: [this]}); return this.list; },
      get depth() { return this.list.length - 1; }
    };
    class ReturnObject { constructor(object) { return object; } }
    class Stamp extends ReturnObject {
      #descriptor;
      constructor(object) { super(object); this.#descriptor = descriptor; }
      static check(object, expected) {
        return object.#descriptor?.list[expected.depth] === expected;
      }
    }
    const object = new Stamp({});
    return Stamp.check(object, descriptor);
  })()
`,
);

// Reuse the generated webidl2js fixture without rewriting its source.
runtime.initialize();
run(
  'install-generated-fixture-adapters',
  `
  globalThis.nativeRead = (id, property) => host('binding-read', JSON.stringify([id, property]));
  globalThis.nativeWrite = (id, property, value) => host('binding-write', JSON.stringify([id, property, value]));
  globalThis.nativeParent = id => Number(host('binding-parent', String(id)));
  globalThis.nativeAppend = (parent, child) => host('binding-append', JSON.stringify([parent, child]));
  true
`,
);
const generatedSource = await (await fetch('/generated-guest.js')).text();
try {
  runtime.evaluate(generatedSource);
  const generated = JSON.parse(
    JSON.parse(runtime.evaluate('JSON.stringify(bindingResults)')),
  );
  record(
    'generated-webidl-fixture',
    generated.identity &&
      generated.appendIdentity &&
      generated.instance &&
      generated.forgedReceiverRejected &&
      generated.wrongArgumentRejected &&
      generated.illegalConstructorRejected &&
      generated.guestConstructor === 'undefined' &&
      generated.conversion === 'converted guest text',
    generated,
  );
  bindingChild.textContent = 'native mutation';
  run('generated-live-native-read', "node(2).textContent === 'native mutation'");
} catch (error) {
  record('generated-webidl-fixture', false, String(error));
}

const appSource = await (await fetch('/pitch-main.js')).text();
const appHash = Array.from(
  new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(appSource)),
  ),
  (v) => v.toString(16).padStart(2, '0'),
).join('');
runtime.initialize();
let application: { sha256: string; bytes: number; firstError: string; elapsedMs: number };
const intl = {
  available: runtime.evaluate('typeof Intl'),
  dateStyleResult: '',
};
try {
  intl.dateStyleResult = runtime.evaluate(
    "new Intl.DateTimeFormat('en-US', {dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC'}).format(new Date(0))",
  );
} catch (error) {
  intl.dateStyleResult = String(error);
}
const appStarted = performance.now();
try {
  runtime.evaluate(appSource);
  application = {
    sha256: appHash,
    bytes: new TextEncoder().encode(appSource).length,
    firstError: '',
    elapsedMs: performance.now() - appStarted,
  };
} catch (error) {
  application = {
    sha256: appHash,
    bytes: new TextEncoder().encode(appSource).length,
    firstError: String(error),
    elapsedMs: performance.now() - appStarted,
  };
}

const probeResult = {
  receipts,
  application,
  intl,
  nativeDispatchCount,
  allowedResources,
  deniedResources,
  timingMs: {
    fetchCompileInstantiate: loaded - started,
    contextInitialize: initialized - loaded,
  },
  features: {
    sharedArrayBuffer: runtime.evaluate('typeof SharedArrayBuffer'),
    atomics: runtime.evaluate('typeof Atomics'),
  },
};

declare global {
  var probeReceipt: typeof probeResult;
}
globalThis.probeReceipt = probeResult;
