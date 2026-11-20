import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkletHost } from '../src/guest/contexts/worklet-policy.ts';
import { NativePolicyError } from '../src/guest/native-policy.ts';

function fixture(create = createWorkletHost) {
  const control = new MessageChannel();
  const channel = new MessageChannel();
  const guest = new WeakSet<object>();
  const transfers: Transferable[][] = [];
  const registered: unknown[] = [];
  let currentPort = channel.port1;
  const global = { currentFrame: 1, currentTime: 0.25, sampleRate: 48000 };
  const policy = create({
    global,
    console,
    controlPort: control.port1,
    isGuestValue: (value) => guest.has(value),
    registerProcessor: (name) => registered.push(name),
    takePort: () => currentPort,
    detachTransferred: (values) => transfers.push([...values]),
  });
  const { host } = policy;
  const port = host.call(policy.takePort as Function, undefined, []) as MessagePort;
  const call = (target: object, key: PropertyKey, ...args: unknown[]) =>
    host.call(host.get(target, key) as Function, target, args);
  const callback = <T extends object>(value: T): T => {
    guest.add(value);
    return value;
  };
  return {
    policy,
    host,
    port,
    channel,
    control,
    callback,
    call,
    global,
    registered,
    transfers,
    useControl() {
      currentPort = control.port1;
    },
    revoke(value: object) {
      guest.delete(value);
    },
    close() {
      control.port1.close();
      control.port2.close();
      channel.port1.close();
      channel.port2.close();
    },
  };
}

function timeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Message delivery timed out')),
        3000,
      );
      timer.unref();
    }),
  ]);
}

test('worklet host exposes exact callbacks, numeric timing and reviewed console operations', () => {
  const f = fixture();
  try {
    f.host.call(f.policy.registerProcessor as Function, undefined, ['fixture', []]);
    assert.deepEqual(f.registered, ['fixture']);
    assert.equal(f.host.get(f.global, 'currentFrame'), 1);
    f.global.currentFrame = 128;
    assert.equal(f.host.get(f.global, 'currentFrame'), 128);
    assert.equal(f.host.prototype(f.global), Object.prototype);
    assert.throws(() => f.host.set(f.global, 'currentFrame', 2), NativePolicyError);
    assert.equal(typeof f.host.get(console, 'log'), 'function');
    assert.throws(() => f.host.call(console.log, console, []), NativePolicyError);
    assert.throws(
      () => f.host.construct(Function, ['return globalThis']),
      NativePolicyError,
    );
    assert.throws(() => f.host.get({}, 'constructor'), NativePolicyError);
    f.useControl();
    assert.throws(
      () => f.host.call(f.policy.takePort as Function, undefined, []),
      /management endpoint/,
    );
  } finally {
    f.close();
  }
});

test('unknown port getters and unadmitted same-brand endpoints are rejected before access', () => {
  const f = fixture();
  let reads = 0;
  const prototype = Object.getPrototypeOf(f.port);
  Object.defineProperty(prototype, 'unreviewedWorkletFixture', {
    configurable: true,
    get() {
      reads++;
      return 'native positive';
    },
  });
  try {
    assert.throws(
      () => f.host.get(f.port, 'unreviewedWorkletFixture'),
      NativePolicyError,
    );
    assert.equal(reads, 0);
    assert.equal(Reflect.get(f.port, 'unreviewedWorkletFixture'), 'native positive');
    assert.equal(reads, 1);
    const post = f.host.get(f.port, 'postMessage') as Function;
    assert.throws(
      () => f.host.call(post, f.control.port1, ['no']),
      /not owned|another family/,
    );
    assert.throws(
      () => f.host.call(post, f.channel.port2, ['no']),
      /not owned|another family/,
    );
    assert.throws(() => f.host.set(f.port, 'onmessage', () => {}), /belong to the guest/);
  } finally {
    Reflect.deleteProperty(prototype, 'unreviewedWorkletFixture');
    f.close();
  }
});

test('native port delivery admits events before guest callbacks and preserves callback identity', async () => {
  const f = fixture();
  try {
    let resolve!: (event: MessageEvent) => void;
    const received = new Promise<MessageEvent>((done) => {
      resolve = done;
    });
    const callback = f.callback(function (this: unknown, event: MessageEvent) {
      assert.equal(this, f.port);
      assert.equal(f.host.get(event, 'type'), 'message');
      assert.deepEqual(f.host.get(event, 'data'), { value: 17 });
      assert.equal(f.host.get(event, 'target'), f.port);
      resolve(event);
    });
    assert.equal(f.host.set(f.port, 'onmessage', callback), true);
    assert.equal(f.host.get(f.port, 'onmessage'), callback);
    f.channel.port2.postMessage({ value: 17 });
    const event = await timeout(received);
    assert.equal(f.host.get(event, 'unknown'), undefined);
    const nativeEventPrototype = Object.getPrototypeOf(event);
    const data = f.host.descriptor(nativeEventPrototype, 'data')?.get;
    assert(data);
    assert.deepEqual(f.host.call(data, event, []), { value: 17 });
    assert.throws(
      () => f.host.call(data, new MessageEvent('message'), []),
      NativePolicyError,
    );
    f.host.set(f.port, 'onmessage', null);
    assert.equal(f.host.get(f.port, 'onmessage'), null);
  } finally {
    f.close();
  }
});

test('listener adapters preserve removal and transferred endpoint producer ownership', async () => {
  const f = fixture();
  const transfer = new MessageChannel();
  try {
    let resolve!: (event: MessageEvent) => void;
    const received = new Promise<MessageEvent>((done) => {
      resolve = done;
    });
    const callback = f.callback({
      handleEvent(event: MessageEvent) {
        resolve(event);
      },
    });
    f.call(f.port, 'addEventListener', 'message', callback, { once: true });
    f.call(f.port, 'start');
    f.channel.port2.postMessage({ endpoint: transfer.port1 }, [transfer.port1]);
    const event = await timeout(received);
    const endpoints = f.host.get(event, 'ports') as MessagePort[];
    assert.equal(endpoints.length, 1);
    assert.equal(
      f.host.get(event, 'data') && typeof f.host.get(endpoints[0], 'postMessage'),
      'function',
    );
    f.call(f.port, 'removeEventListener', 'message', callback);
    f.call(endpoints[0], 'close');
  } finally {
    transfer.port1.close();
    transfer.port2.close();
    f.close();
  }
});

test('queued delivery after ownership revocation neither admits endpoints nor calls guest', async () => {
  const f = fixture();
  const transfer = new MessageChannel();
  try {
    let calls = 0;
    const callback = f.callback(() => {
      calls++;
    });
    f.host.set(f.port, 'onmessage', callback);
    let resolve!: (event: MessageEvent) => void;
    const received = new Promise<MessageEvent>((done) => {
      resolve = done;
    });
    f.port.addEventListener('message', resolve, { once: true });
    f.channel.port2.postMessage({ endpoint: transfer.port1 }, [transfer.port1]);
    f.revoke(callback);
    const event = await timeout(received);
    assert.equal(calls, 0);
    assert.equal(f.host.owns!(event), false);
    assert.equal(event.ports.length, 1);
    assert.equal(f.host.owns!(event.ports[0]), false);
    event.ports[0].close();
  } finally {
    transfer.port1.close();
    transfer.port2.close();
    f.close();
  }
});

test('transfer options are consumed once and detachment is committed after native success', async () => {
  const f = fixture();
  try {
    const bytes = new ArrayBuffer(4);
    let reads = 0;
    const options = {
      get transfer() {
        reads++;
        return [bytes];
      },
    };
    f.call(f.port, 'postMessage', { bytes }, options);
    assert.equal(reads, 1);
    assert.equal(bytes.byteLength, 0);
    assert.deepEqual(f.transfers, [[bytes]]);
    const next = new ArrayBuffer(1);
    let iteratorReads = 0;
    const sequence = {
      get [Symbol.iterator]() {
        iteratorReads++;
        return function* () {
          yield next;
        };
      },
    };
    f.call(f.port, 'postMessage', { next }, sequence);
    assert.equal(iteratorReads, 1);
    assert.equal(next.byteLength, 0);
    assert.deepEqual(f.transfers, [[bytes], [next]]);
    assert.throws(() => f.call(f.port, 'postMessage', { bad: () => {} }, []));
    assert.equal(f.transfers.length, 2);
  } finally {
    f.close();
  }
});

test('omitting actual token mediation for the fixture getter is detected by its counter', async () => {
  const { build } = await import('esbuild');
  const { readFile } = await import('node:fs/promises');
  const { runInNewContext } = await import('node:vm');
  const compiled = await build({
    entryPoints: [
      new URL('../src/guest/contexts/worklet-policy.ts', import.meta.url).pathname,
    ],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    target: 'es2022',
    plugins: [
      {
        name: 'omit-reviewed-getter-mediation',
        setup(builder) {
          builder.onLoad({ filter: /\/native-host\.ts$/ }, async ({ path }) => {
            const source = await readFile(path, 'utf8');
            const forward = 'return unwrap(registry.read(owner, key));';
            assert.equal(
              source.split(forward).length,
              2,
              'Native getter control anchor changed',
            );
            return {
              loader: 'ts',
              contents: source.replace(
                forward,
                "if (key === 'unreviewedWorkletFixture') return Reflect.get(owner, key); " +
                  forward,
              ),
            };
          });
        },
      },
    ],
  });
  const module = { exports: {} };
  runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports });
  const factory: unknown = Reflect.get(module.exports, 'createWorkletHost');
  assert.equal(typeof factory, 'function');
  const f = fixture(factory as typeof createWorkletHost);
  let reads = 0;
  const prototype = Object.getPrototypeOf(f.port);
  Object.defineProperty(prototype, 'unreviewedWorkletFixture', {
    configurable: true,
    get() {
      reads++;
      return 'native positive';
    },
  });
  try {
    const value = f.host.get(f.port, 'unreviewedWorkletFixture');
    assert.equal(value, 'native positive');
    assert.equal(reads, 1, 'Omitted mediation must execute the unknown native getter');
  } finally {
    Reflect.deleteProperty(prototype, 'unreviewedWorkletFixture');
    f.close();
  }
});
