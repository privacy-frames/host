import assert from 'node:assert/strict';
import test from 'node:test';
// Node exposes channel ports as own data fields; browsers use IDL getters.
// Adapt only that constructor shape while retaining real native Node ports.
const NativeChannel = MessageChannel;
class BrowserChannel implements MessageChannel {
  private readonly channel = new NativeChannel();
  get port1() {
    return this.channel.port1;
  }
  get port2() {
    return this.channel.port2;
  }
}
globalThis.MessageChannel = BrowserChannel;
const { createPortClient, createRequestClient, servePrivatePort } =
  await import('../src/runtime/private-channel.ts');
globalThis.MessageChannel = NativeChannel;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('private ports correlate concurrent replies and carry transferred request ports', async () => {
  const channel = new MessageChannel();
  const first = deferred<void>();
  const server = servePrivatePort(channel.port2, async (message, ports) => {
    assert(message && typeof message === 'object' && 'value' in message);
    if (message.value === 1) await first.promise;
    if (ports.length) {
      ports[0].postMessage('transferred');
      ports[0].close();
    }
    return { value: message.value };
  });
  const client = createPortClient(channel.port1, 1000);
  try {
    const slow = client.request({ value: 1 });
    const transferred = new MessageChannel();
    const observed = new Promise((resolve) => {
      transferred.port1.onmessage = (event) => resolve(event.data);
    });
    assert.deepEqual(
      structuredClone(await client.request({ value: 2 }, [transferred.port2])),
      { value: 2 },
    );
    assert.equal(await observed, 'transferred');
    transferred.port1.close();
    first.resolve();
    assert.deepEqual(structuredClone(await slow), { value: 1 });
  } finally {
    client.close();
    server.close();
  }
});

test('server closure rejects pending work and suppresses its later successful result', async () => {
  const entered = deferred<void>(),
    release = deferred<string>();
  const channel = new MessageChannel();
  const server = servePrivatePort(channel.port2, async () => {
    entered.resolve();
    return await release.promise;
  });
  const client = createPortClient(channel.port1, 1000);
  try {
    const result = client.request({});
    const rejected = assert.rejects(result, /closed/);
    await entered.promise;
    server.close();
    release.resolve('must not be delivered');
    await rejected;
    await assert.rejects(client.request({}), /closed/);
  } finally {
    client.close();
    server.close();
  }
});

test('local closure rejects current and future requests without starting another send', async () => {
  let sent = 0;
  const client = createRequestClient(() => {
    sent++;
  }, 1000);
  const pending = client.request({});
  const rejected = assert.rejects(pending, /closed/);
  client.close();
  client.close();
  await rejected;
  await assert.rejects(client.request({}), /closed/);
  assert.equal(sent, 1);
});

test('closing reentrantly while reading transfers prevents dispatch', async () => {
  let sent = false;
  const client = createRequestClient(() => {
    sent = true;
  }, 1000);
  const ports: Transferable[] = [];
  Object.defineProperty(ports, '0', {
    get() {
      client.close();
      return new ArrayBuffer(0);
    },
  });
  await assert.rejects(client.request({}, ports), /closed/);
  assert.equal(sent, false);
});

test('handler failures, hostile thrown values and uncloneable replies fail locally', async () => {
  for (const fail of ['error', 'proxy', 'function']) {
    const channel = new MessageChannel();
    const server = servePrivatePort(channel.port2, () => {
      if (fail === 'error') throw new Error('handler denied');
      if (fail === 'proxy')
        throw new Proxy(
          {},
          {
            getOwnPropertyDescriptor() {
              throw new Error('trap');
            },
          },
        );
      return () => {};
    });
    const client = createPortClient(channel.port1, 1000);
    try {
      await assert.rejects(
        client.request({}),
        fail === 'error'
          ? /handler denied/
          : /Private request failed|Invalid private response/,
      );
    } finally {
      client.close();
      server.close();
    }
  }
});

test('a private peer that never replies times out', async () => {
  const channel = new MessageChannel();
  channel.port2.start();
  const client = createPortClient(channel.port1, 25);
  try {
    await assert.rejects(client.request({}), /timed out/);
  } finally {
    client.close();
    channel.port2.close();
  }
});
