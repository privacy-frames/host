import { captureMessageTransfer } from '../src/guest/message-transfer.ts';
import { createGuestWindow } from '../src/guest/session.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';
const check = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
const workerCode = `onmessage = e => { if(e.data.kind==='privacy-frames:guest-worker')return; postMessage(e.data,[e.data.buffer]); };`;
async function legacyDictionary(tracked: boolean) {
  const channel = new MessageChannel();
  const all = Reflect.get(document, 'all');
  const iterator = Object.getOwnPropertyDescriptor(all, Symbol.iterator);
  const dictionary = Object.getOwnPropertyDescriptor(all, 'transfer');
  const buffer = new ArrayBuffer(4);
  let getters = 0;
  Object.defineProperty(all, Symbol.iterator, { configurable: true, value: undefined });
  Object.defineProperty(all, 'transfer', {
    configurable: true,
    get() {
      getters++;
      return [buffer];
    },
  });
  try {
    const reply = new Promise<void>((resolve) => {
      channel.port2.onmessage = () => resolve();
    });
    const options = tracked ? captureMessageTransfer(all) : all;
    Reflect.apply(MessagePort.prototype.postMessage, channel.port1, [
      { buffer },
      options,
    ]);
    await reply;
    return { getters, detached: buffer.byteLength === 0 };
  } finally {
    channel.port1.close();
    channel.port2.close();
    if (iterator) Object.defineProperty(all, Symbol.iterator, iterator);
    else Reflect.deleteProperty(all, Symbol.iterator);
    if (dictionary) Object.defineProperty(all, 'transfer', dictionary);
    else Reflect.deleteProperty(all, 'transfer');
  }
}
async function run() {
  const legacy = {
    native: await legacyDictionary(false),
    captured: await legacyDictionary(true),
  };
  Reflect.set(window, '__transferLegacyObserved', legacy);
  check(
    legacy.native.getters === 1 &&
      legacy.native.detached &&
      legacy.captured.getters === 1 &&
      legacy.captured.detached,
    'Legacy dictionary transfer must match native MessagePort conversion',
  );
  const bootstrap = URL.createObjectURL(
    new Blob([workerCode], { type: 'text/javascript' }),
  );
  // Native positive control uses the same options/iterator shape as guest sends.
  const native = new Worker(bootstrap);
  const buffer = new ArrayBuffer(8);
  let getters = 0,
    iterators = 0;
  const sequence = {
    get [Symbol.iterator]() {
      iterators++;
      return function* () {
        yield buffer;
      };
    },
  };
  const positive = new Promise<void>((resolve, reject) => {
    native.onmessage = () => resolve();
    native.onerror = reject;
  });
  Reflect.apply(Worker.prototype.postMessage, native, [
    { buffer },
    {
      get transfer() {
        getters++;
        return sequence;
      },
    },
  ]);
  await positive;
  native.terminate();
  check(
    getters === 1 && iterators === 1 && buffer.byteLength === 0,
    'Native transfer positive control',
  );
  const catalog: GuestContextCatalog = {
    application: 'transfer-fixture',
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
    workerBootstrapURLs: { dedicated: bootstrap, shared: bootstrap },
    resources: [
      {
        url: 'https://fixture.invalid/echo.js',
        path: 'echo.js',
        contentType: 'text/javascript',
        bytes: new TextEncoder().encode(workerCode).buffer,
      },
    ],
  };
  const session = await createGuestWindow(catalog, window);
  let commits = 0;
  const detach = session.engine.detachTransferred.bind(session.engine);
  session.engine.detachTransferred = (values) => {
    commits++;
    detach(values);
  };
  try {
    const NativeGuestWorker = session.environment.globals.Worker as typeof Worker;
    const direct = new NativeGuestWorker('./echo.js');
    const directBuffer = new ArrayBuffer(8);
    let directGetters = 0,
      directIterators = 0;
    const directReply = new Promise<void>((resolve, reject) => {
      direct.onmessage = () => resolve();
      direct.onerror = reject;
    });
    const send = session.environment.host.get(direct, 'postMessage') as Function;
    session.environment.host.call(send, direct, [
      { buffer: directBuffer },
      {
        get transfer() {
          directGetters++;
          return {
            get [Symbol.iterator]() {
              directIterators++;
              return function* () {
                yield directBuffer;
              };
            },
          };
        },
      },
    ]);
    await directReply;
    direct.terminate();
    Reflect.set(window, '__transferDirectObserved', {
      directGetters,
      directIterators,
      commits,
    });
    check(
      directGetters === 1 && directIterators === 1 && commits === 1,
      'Native adapter transfer conversion must run once',
    );
    commits = 0;
    const result = await session.engine.evaluate(
      `(async () => {
      function check(value, message) { if(!value)throw new Error(message); }
      const worker = new Worker('./echo.js');
      const bytes = new Uint8Array([1,2,3,4]);
      let getters = 0, iterators = 0;
      const sequence = { get [Symbol.iterator]() { iterators++; return function* () { yield bytes.buffer; }; } };
      const reply = new Promise((resolve,reject)=>{worker.onmessage=e=>resolve(e.data);worker.onerror=reject;});
      worker.postMessage({buffer:bytes.buffer}, { get transfer() { getters++; return sequence; } });
      const value = await reply;
      check(getters===1&&iterators===1, 'Guest worker transfer conversion must run once');
      check(bytes.byteLength===0&&new Uint8Array(value.buffer)[3]===4, 'Worker native transfer and guest detachment');
      const channel = new MessageChannel();
      const portBytes = new Uint8Array([9,8]);
      let portGetters=0, portIterators=0;
      const portReply=new Promise(resolve=>{channel.port2.onmessage=e=>resolve(e.data);});
      channel.port1.postMessage({buffer:portBytes.buffer}, {get transfer(){portGetters++;return {get [Symbol.iterator](){portIterators++;return function*(){yield portBytes.buffer;};}};}});
      const portValue=await portReply;
      check(portGetters===1&&portIterators===1, 'Guest port transfer conversion must run once');
      check(portBytes.byteLength===0&&new Uint8Array(portValue.buffer)[0]===9, 'Port native transfer and guest detachment');
      channel.port1.close();channel.port2.close();
      worker.terminate();
      return JSON.stringify({ workerGetters:getters,workerIterators:iterators,portGetters,portIterators });
    })()`,
      'transfer:guest-success',
    );
    const observed = { result: JSON.parse(String(result)) as unknown, commits };
    Reflect.set(window, '__transferObserved', observed);
    check(
      commits === 2,
      'Each successful native send must account detachment exactly once',
    );
    const before = commits;
    const failed = session.engine.evaluate(
      `(() => {
      const worker=new Worker('./echo.js'), buffer=new ArrayBuffer(8);
      let rejected=false;try{worker.postMessage({buffer,callback:()=>{}},[buffer]);}catch(e){rejected=true;}
      let missing=false;try{worker.postMessage();}catch(e){missing=true;}
      worker.terminate();return rejected&&missing&&buffer.byteLength===8;
    })()`,
      'transfer:guest-failure',
    );
    check(
      failed === true && commits === before,
      'Failed native send must preserve buffer and skip detachment accounting',
    );
    return {
      ...observed,
      failedSendPreserved: true,
      nativePositive: true,
      legacyDictionary: true,
    };
  } finally {
    session.close();
    URL.revokeObjectURL(bootstrap);
  }
}
run()
  .then((result) => Reflect.set(window, '__transferResult', result))
  .catch((error) =>
    Reflect.set(
      window,
      '__transferFailure',
      String(error) + (error instanceof Error && error.stack ? '\n' + error.stack : ''),
    ),
  );
