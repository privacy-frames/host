import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

async function compile(omitCleanup = false) {
  const result = await build({
    entryPoints: ['src/guest/contexts/worker-bootstrap.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'es2022',
    write: false,
    plugins: omitCleanup
      ? [
          {
            name: 'omit-shared-startup-cleanup',
            setup(builder) {
              builder.onLoad({ filter: /worker-bootstrap\.ts$/ }, async ({ path }) => {
                const source = await readFile(path, 'utf8');
                const anchor = '                session.close();';
                assert.equal(source.split(anchor).length, 2);
                return {
                  loader: 'ts',
                  contents: source.replace(
                    anchor,
                    '                // Omitted in this temporary control.',
                  ),
                };
              });
            },
          },
        ]
      : [],
  });
  return result.outputFiles[0].text;
}
const production = await compile();
const omitted = await compile(true);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
class NativeMessage {
  stopped = false;
  isTrusted = false;
  readonly data: unknown;
  readonly ports: Port[];
  readonly origin: string;
  readonly lastEventId: string;
  constructor(
    readonly type: string,
    init: { data?: unknown; ports?: Port[]; origin?: string; lastEventId?: string } = {},
  ) {
    this.data = init.data;
    this.ports = init.ports ?? [];
    this.origin = init.origin ?? '';
    this.lastEventId = init.lastEventId ?? '';
  }
  stopImmediatePropagation() {
    this.stopped = true;
  }
}
class NativeTarget {
  private listeners = new Map<string, Set<(event: NativeMessage) => void>>();
  addEventListener(type: string, callback: (event: NativeMessage) => void) {
    let listeners = this.listeners.get(type);
    if (!listeners) this.listeners.set(type, (listeners = new Set()));
    listeners.add(callback);
  }
  removeEventListener(type: string, callback: (event: NativeMessage) => void) {
    this.listeners.get(type)?.delete(callback);
  }
  dispatchEvent(event: NativeMessage) {
    for (const callback of [...(this.listeners.get(event.type) ?? [])]) {
      callback(event);
      if (event.stopped) break;
    }
    return true;
  }
}
class Port extends NativeTarget {
  messages: unknown[] = [];
  closes = 0;
  starts = 0;
  postMessage(value: unknown) {
    this.messages.push(value);
  }
  close() {
    this.closes++;
  }
  start() {
    this.starts++;
  }
  receive(data: unknown) {
    this.dispatchEvent(new NativeMessage('message', { data }));
  }
}
class Scope extends NativeTarget {
  location = { href: 'blob:https://runtime.invalid/shared' };
  connect(port: Port) {
    const event = new NativeMessage('connect', { ports: [port] });
    // This fixture supplies native delivery; it does not test browser isTrusted.
    event.isTrusted = true;
    this.dispatchEvent(event);
  }
}
const descriptor = () => ({
  kind: 'privacy-frames:guest-worker',
  entryURL: 'https://publisher.invalid/worker.js',
  scriptType: 'module',
  catalog: {
    application: 'fixture',
    generation: 'fixture-generation',
    sourceURL: 'https://publisher.invalid/',
    documentBase: 'https://publisher.invalid/',
    runtimeURL: 'https://runtime.invalid/',
    applicationURL: 'https://runtime.invalid/app/',
    engineWasm: new ArrayBuffer(0),
    workerBootstrap: {
      dedicated: new ArrayBuffer(0),
      shared: new ArrayBuffer(0),
      worklet: new ArrayBuffer(0),
    },
    workerBootstrapURLs: {
      dedicated: 'blob:https://runtime.invalid/dedicated',
      shared: 'blob:https://runtime.invalid/shared',
    },
    resources: [],
  },
});
async function settle() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}
async function scenario(
  bundle: string,
  outcome: 'success' | 'start-failure' | 'creation-failure',
  cleanupThrows = false,
) {
  const scope = new Scope();
  const startup = deferred<void>();
  const creation = deferred<{ start(): Promise<void>; close(): void }>();
  let creates = 0,
    starts = 0,
    closes = 0;
  const failure = new Error('primary startup failure');
  const session = {
    start() {
      starts++;
      return startup.promise;
    },
    close() {
      closes++;
      if (cleanupThrows) throw new Error('secondary cleanup failure');
    },
  };
  const module = { exports: {} };
  runInNewContext(bundle, {
    module,
    exports: module.exports,
    URL,
    ArrayBuffer,
    DOMException,
    MessageEvent: NativeMessage,
  });
  const start: unknown = Reflect.get(module.exports, 'startSharedWorker');
  assert.equal(typeof start, 'function');
  if (typeof start !== 'function') throw new Error('Shared bootstrap export missing');
  start(scope, () => {
    creates++;
    return creation.promise;
  });
  const connections: Port[] = [];
  const replay: unknown[] = [];
  scope.addEventListener('connect', (event) => {
    connections.push(event.ports[0]);
    event.ports[0].addEventListener('message', (message) => replay.push(message.data));
  });
  const ports = [new Port(), new Port()];
  for (const [index, port] of ports.entries()) {
    scope.connect(port);
    port.receive(descriptor());
    port.receive('queued-' + index);
  }
  assert.equal(creates, 1);
  assert.equal(starts, 0);
  assert.deepEqual(connections, []);
  assert.deepEqual(replay, []);
  if (outcome === 'creation-failure') creation.reject(failure);
  else {
    creation.resolve(session);
    await settle();
    assert.equal(starts, 1);
    assert.deepEqual(connections, []);
    assert.deepEqual(replay, []);
    if (outcome === 'start-failure') startup.reject(failure);
    else startup.resolve();
  }
  await settle();
  const late = new Port();
  ports.push(late);
  scope.connect(late);
  late.receive(descriptor());
  late.receive('queued-late');
  await settle();
  return { creates, starts, closes, ports, connections, replay, failure };
}
function checkFailure(result: Awaited<ReturnType<typeof scenario>>, expectedCloses = 1) {
  assert.equal(result.creates, 1);
  assert.equal(result.closes, expectedCloses, 'startup cleanup count');
  assert.deepEqual(result.connections, []);
  assert.deepEqual(result.replay, []);
  for (const port of result.ports) {
    assert.equal(port.closes, 1);
    assert.equal(port.messages.length, 1);
    const packet = port.messages[0];
    assert(packet && typeof packet === 'object');
    assert.deepEqual(Object.keys(packet), ['type', 'message']);
    assert.equal(Reflect.get(packet, 'type'), 'privacy-frames:worker-error');
    assert.equal(Reflect.get(packet, 'message'), String(result.failure));
  }
}
test('shared startup rejection closes its session once and rejects concurrent and late ports', async () => {
  const result = await scenario(production, 'start-failure');
  checkFailure(result);
  assert.equal(result.starts, 1);
});
test('shared startup keeps primary rejection when session cleanup throws', async () => {
  checkFailure(await scenario(production, 'start-failure', true));
});
test('shared creation rejection closes ports without inventing session cleanup', async () => {
  const result = await scenario(production, 'creation-failure');
  checkFailure(result, 0);
  assert.equal(result.starts, 0);
});
test('successful shared startup publishes every port only after readiness and retains session', async () => {
  const result = await scenario(production, 'success');
  assert.equal(result.creates, 1);
  assert.equal(result.starts, 1);
  assert.equal(result.closes, 0);
  assert.deepEqual(result.connections, result.ports);
  assert.deepEqual(result.replay, ['queued-0', 'queued-1', 'queued-late']);
  for (const port of result.ports) {
    assert.equal(port.closes, 0);
    assert.deepEqual(port.messages, []);
  }
  result.ports[0].close();
  assert.equal(result.closes, 0);
});
test('omitting actual shared startup cleanup is detected independently of port rejection', async () => {
  const result = await scenario(omitted, 'start-failure');
  checkFailure(result, 0);
  assert.throws(() => checkFailure(result), /startup cleanup count/);
});
