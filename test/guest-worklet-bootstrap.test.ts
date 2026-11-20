import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createContext, runInContext } from 'node:vm';

async function compile(omitLateCloseGuard = false) {
  const compiled = await build({
    entryPoints: [
      new URL('../src/guest/contexts/worklet-entry.ts', import.meta.url).pathname,
    ],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'es2022',
    write: false,
    plugins: [
      {
        name: 'controlled-engine-initialization',
        setup(build) {
          if (omitLateCloseGuard)
            build.onLoad({ filter: /worklet-entry\.ts$/ }, async ({ path }) => {
              const source = await readFile(path, 'utf8');
              const guard = `          if (!isCurrentContextPublication(state, token)) {
            created.dispose();
            return;
          }`;
              assert.equal(
                source.split(guard).length,
                2,
                'Late-close control anchor changed',
              );
              return {
                contents: source.replace(guard, ''),
                loader: 'ts',
                resolveDir: dirname(path),
              };
            });
          build.onResolve({ filter: /^\.\.\/engine\.ts$/ }, () => ({
            path: 'controlled-engine',
            namespace: 'worklet-fixture',
          }));
          build.onLoad({ filter: /.*/, namespace: 'worklet-fixture' }, () => ({
            contents:
              'export class GuestEngine { static create(options) { return globalThis.createEngine(options); } }',
            loader: 'js',
          }));
        },
      },
    ],
  });
  return compiled.outputFiles[0].text;
}
const bundle = await compile();
const lateCloseControl = await compile(true);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
class Port {
  onmessage?: (event: { data: unknown }) => void;
  closed = false;
  messages: unknown[] = [];
  postMessage(value: unknown) {
    this.messages.push(value);
  }
  close() {
    this.closed = true;
  }
  receive(data: unknown) {
    this.onmessage?.({ data });
  }
}
interface Worklet {
  port: Port;
  process(...args: unknown[]): boolean;
}
type Processor = new (options?: AudioWorkletNodeOptions) => Worklet;
class Engine {
  disposed = 0;
  sets = new Map<string, unknown>();
  binds: string[] = [];
  evaluations: { source: string; kind?: string }[] = [];
  drains = 0;
  pendingModule?: Promise<void>;
  set(name: string, value: unknown) {
    this.sets.set(name, value);
  }
  bind(name: string) {
    this.binds.push(name);
  }
  evaluate(source: string, _url?: string, kind?: string) {
    this.evaluations.push({ source, kind });
    return kind === 'module'
      ? this.pendingModule
      : {
          construct() {
            return 1;
          },
          process() {
            return { active: true, outputs: [] };
          },
          release() {},
        };
  }
  drainJobs() {
    this.drains++;
  }
  dispose() {
    this.disposed++;
  }
  call(target: Function, args: unknown[]) {
    return Reflect.apply(target, undefined, args);
  }
  detachTransferred() {}
}
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
function fixture(source = bundle) {
  const preparation = deferred<Engine>();
  const processors = new Map<string, Processor>();
  const context = createContext({
    exports: {},
    WebAssembly,
    DOMException,
    console,
    createEngine() {
      return preparation.promise;
    },
    registerProcessor(name: string, constructor: Processor) {
      assert(!processors.has(name));
      processors.set(name, constructor);
    },
    AudioWorkletProcessor: class {
      port = new Port();
    },
  });
  runInContext(source, context);
  const Constructor = processors.get('privacy-frames:bootstrap');
  assert(Constructor);
  const module = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
  return {
    preparation,
    processors,
    node: new Constructor({ processorOptions: { module } }),
  };
}

test('closing during engine initialization disposes its late result without guest setup', async () => {
  const setup = fixture();
  setup.node.port.receive({ type: 'close' });
  const engine = new Engine();
  setup.preparation.resolve(engine);
  await settle();
  assert.equal(engine.disposed, 1);
  assert.equal(engine.sets.size, 0);
  assert.deepEqual(engine.binds, []);
  assert.deepEqual(engine.evaluations, []);
  assert.deepEqual(setup.node.port.messages, []);
  assert.equal(setup.node.port.closed, true);
  assert.equal(setup.node.process(), false);
});

test('initialization rejection after closure does not publish a failure message', async () => {
  const setup = fixture();
  setup.node.port.receive({ type: 'close' });
  setup.preparation.reject(new Error('initialization failed'));
  await settle();
  assert.deepEqual(setup.node.port.messages, []);
  assert.equal(setup.node.process(), false);
});

test('closing during asynchronous module evaluation suppresses late publication', async () => {
  const setup = fixture();
  const engine = new Engine();
  setup.preparation.resolve(engine);
  await settle();
  assert.equal(setup.node.port.messages.length, 1);
  const module = deferred<void>();
  engine.pendingModule = module.promise;
  setup.node.port.receive({
    type: 'module',
    id: 1,
    url: 'module.js',
    modules: [['module.js', 'source']],
  });
  setup.node.port.receive({ type: 'close' });
  module.resolve();
  await settle();
  assert.equal(engine.disposed, 1);
  assert.equal(engine.drains, 0);
  assert.equal(setup.node.port.messages.length, 1);
  assert.equal(setup.node.process(), false);
});

test('native worklet registration independently refuses host-reserved processor names', async () => {
  const setup = fixture();
  const engine = new Engine();
  setup.preparation.resolve(engine);
  await settle();
  const register = engine.sets.get('__privacyRegisterProcessor');
  assert(typeof register === 'function');
  assert.throws(() => register('privacy-frames:other', []), { name: 'SecurityError' });
  assert.equal(setup.processors.size, 1);
  register('signal', []);
  assert.equal(setup.processors.size, 2);
  setup.node.port.receive({ type: 'close' });
  assert.throws(() => register('another', []), /closed/);
});

test('removing the actual late-close guard makes the controlled engine result remain live', async () => {
  const setup = fixture(lateCloseControl);
  setup.node.port.receive({ type: 'close' });
  const engine = new Engine();
  setup.preparation.resolve(engine);
  await settle();
  assert.equal(engine.disposed, 0);
  assert(engine.sets.size > 0);
  assert.equal(engine.evaluations.length, 1);
});
