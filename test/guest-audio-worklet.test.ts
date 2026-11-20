import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { allocateIdentity } from '../src/guest/identity.ts';

const source = await readFile(
  new URL('../src/guest/contexts/audio-worklet.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  reportDiagnostics: true,
});
assert.deepEqual(compiled.diagnostics, []);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
class Port {
  onmessage?: (event: { data: unknown }) => void;
  messages: unknown[] = [];
  closed = false;
  private posted: ReturnType<typeof deferred<unknown>> | undefined;
  private consumed = 0;
  postMessage(value: unknown) {
    this.messages.push(value);
    if (this.posted) {
      this.consumed++;
      this.posted.resolve(value);
      this.posted = undefined;
    }
  }
  close() {
    this.closed = true;
  }
  receive(data: unknown) {
    this.onmessage?.({ data });
  }
  nextMessage() {
    if (this.consumed < this.messages.length)
      return Promise.resolve(this.messages[this.consumed++]);
    assert.equal(this.posted, undefined);
    this.posted = deferred<unknown>();
    return this.posted.promise;
  }
}
interface ModulePacket {
  type: 'module';
  id: number;
  url: string;
}
function modulePacket(value: unknown): ModulePacket {
  assert(
    value && typeof value === 'object' && 'type' in value && value.type === 'module',
  );
  assert('id' in value && typeof value.id === 'number');
  assert('url' in value && typeof value.url === 'string');
  return { type: 'module', id: value.id, url: value.url };
}
class Node {
  port = new Port();
  disconnected = false;
  addEventListener() {}
  disconnect() {
    this.disconnected = true;
  }
}
function fixture() {
  const bootstrap = deferred<void>();
  const created = deferred<Node>();
  const nodes: Node[] = [];
  const context = createContext({
    exports: {},
    URL,
    Blob,
    WebAssembly,
    DOMException,
    require(name: string) {
      assert.equal(name, '../identity.ts');
      return { allocateIdentity };
    },
    audio: { audioWorklet: { addModule: () => bootstrap.promise } },
    catalog: {
      application: 'fixture',
      generation: 'one',
      workerBootstrap: { worklet: new ArrayBuffer(0) },
      engineWasm: new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]).buffer,
    },
    AudioWorkletNode: class extends Node {
      constructor() {
        super();
        nodes.push(this);
        created.resolve(this);
      }
    },
  });
  runInContext(compiled.outputText, context);
  function evaluate(code: string) {
    return runInContext(code, context);
  }
  function manager(name: string) {
    evaluate(`globalThis.${name} = exports.createGuestAudioWorklets({
      catalog, prepare(url) { return {url, modules: new Map([[url, 'source']])}; },
    });`);
    return {
      add(url: string): Promise<unknown> {
        return Promise.resolve(
          evaluate(`${name}.addModule(audio, ${JSON.stringify(url)})`),
        );
      },
      dispose() {
        evaluate(`${name}.dispose()`);
      },
    };
  }
  return { bootstrap, created, nodes, manager };
}

test('disposing the last pending owner prevents creating a native controller', async () => {
  const setup = fixture();
  const manager = setup.manager('manager');
  const loading = assert.rejects(manager.add('first'), /closed/);
  manager.dispose();
  setup.bootstrap.resolve();
  await loading;
  assert.deepEqual(setup.nodes, []);
});

test('pending ownership survives disposal of the controller creator and IDs share one domain', async () => {
  const setup = fixture();
  const first = setup.manager('first');
  const second = setup.manager('second');
  const failed = assert.rejects(first.add('first'), /closed/);
  const loading = second.add('second');
  first.dispose();
  setup.bootstrap.resolve();
  const node = await setup.created.promise;
  const message = node.port.nextMessage();
  node.port.receive({ type: 'ready', ok: true });
  const packet = modulePacket(await message);
  assert.equal(packet.id, 1);
  node.port.receive({ type: 'module', id: packet.id, ok: true });
  await loading;
  await failed;
  assert.equal(node.disconnected, false);
  const third = setup.manager('third');
  const nextMessage = node.port.nextMessage();
  const next = third.add('third');
  const nextPacket = modulePacket(await nextMessage);
  assert.equal(nextPacket.id, 2);
  node.port.receive({ type: 'module', id: nextPacket.id, ok: true });
  await next;
  assert.equal(setup.nodes.length, 1);
  second.dispose();
  assert.equal(node.disconnected, false);
  third.dispose();
  assert.equal(node.disconnected, true);
  assert.equal(node.port.closed, true);
});

test('closing before readiness rejects pending work and ignores late ready messages', async () => {
  const setup = fixture();
  const manager = setup.manager('manager');
  const loading = assert.rejects(manager.add('first'), /closed/);
  setup.bootstrap.resolve();
  const node = await setup.created.promise;
  manager.dispose();
  await loading;
  node.port.receive({ type: 'ready', ok: true });
  assert.equal(JSON.stringify(node.port.messages), JSON.stringify([{ type: 'close' }]));
  assert.equal(node.port.closed, true);
  assert.equal(node.disconnected, true);
});
