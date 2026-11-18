import { prepareGuestWorkerBootstraps } from '../src/guest/contexts/worker-registry.ts';
import { GuestEngine } from '../src/guest/engine.ts';
import type { GuestHost } from '../src/guest/protocol.ts';
import { createGuestWorkers } from '../src/guest/contexts/worker-factory.ts';
import { createGuestAudioWorklets } from '../src/guest/contexts/audio-worklet.ts';
import { createGuestDocuments } from '../src/guest/contexts/documents.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';

declare global {
  var guestSharedProbe: (() => Promise<unknown>) | undefined;
  var guestContextResults:
    { result?: Record<string, unknown>; error?: string } | undefined;
}

const workerSource = `importScripts('./dependency.js');
let count = 0;
onmessage = async event => {
 const value = event.data;
 if (value.kind === 'nested') {
   const worker = new Worker('./nested.js');
   worker.onmessage = e => { postMessage(e.data); worker.terminate(); };
   worker.postMessage(8); return;
 }
 const buffer = value.buffer;
 const bytes = new Uint8Array(buffer);
 bytes[1] += dependency;
 let denied=false;try{await fetch('https://remote.invalid/not-admitted')}catch{denied=true}
 postMessage({ count: ++count, same: value.alias === buffer && value.view.buffer === buffer,
   bytes: Array.from(bytes), denied, buffer }, [buffer]);
};`;
const sharedSource = `let count=0;
onconnect = event => { const port=event.ports[0];
 port.onmessage=()=>port.postMessage(++count); port.start(); };`;
const workletSource = `import {gain} from './worklet-math.js';
registerProcessor('guest-gain', class extends AudioWorkletProcessor {
 constructor(options){super();this.port.onmessage=e=>{
   const buffer=e.data.buffer, view=new Uint8Array(buffer);view[0]+=1;
   this.port.postMessage({buffer},[buffer]);
   this.port.postMessage({detached:buffer.byteLength===0&&view.byteLength===0,wasm:typeof WebAssembly});
 };}
 static get parameterDescriptors(){return [{name:'gain',defaultValue:gain,minValue:0,maxValue:1}];}
 process(inputs,outputs,parameters) {
   outputs[0][0].fill(parameters.gain[0]); return false;
 }
});`;

async function run() {
  const wasm = await (await fetch('/quickjs.wasm')).arrayBuffer();
  const sources = new Map([
    ['https://fixture.invalid/worker.js', workerSource],
    ['https://fixture.invalid/dependency.js', 'globalThis.dependency=5;'],
    ['https://fixture.invalid/nested.js', 'onmessage=e=>postMessage(e.data+1);'],
    ['https://fixture.invalid/shared.js', sharedSource],
    [
      'https://fixture.invalid/module.js',
      "import { value } from './math.js'; await Promise.resolve(); onmessage=e=>postMessage(value+e.data);",
    ],
    ['https://fixture.invalid/math.js', 'export const value=7;'],
    ['https://fixture.invalid/worklet.js', workletSource],
    ['https://fixture.invalid/worklet-math.js', 'export const gain=0.25;'],
  ]);
  const workerBootstrap = await (await fetch('/worker.js')).arrayBuffer();
  const catalog: GuestContextCatalog = await prepareGuestWorkerBootstraps({
    application: 'fixture',
    generation: 'fixture-generation',
    applicationURL: new URL('/app/', location.href).href,
    runtimeURL: new URL('/', location.href).href,
    sourceURL: 'https://fixture.invalid/index.html',
    documentBase: 'https://fixture.invalid/',
    engineWasm: wasm,
    workerBootstrap: { dedicated: workerBootstrap, shared: workerBootstrap },
    resources: [...sources].map(([url, source], index) => ({
      url,
      path: `${index}.js`,
      contentType: 'text/javascript',
      bytes: new TextEncoder().encode(source).buffer,
    })),
  });
  const host: GuestHost = {
    get: (target, key) => Reflect.get(target, key),
    set: (target, key, value) => Reflect.set(target, key, value),
    call: (target, receiver, args) => Reflect.apply(target, receiver, args),
    construct: (target, args) => Reflect.construct(target, args),
    ownKeys: (target) => Reflect.ownKeys(target),
    descriptor: (target, key) => Reflect.getOwnPropertyDescriptor(target, key),
    prototype: (target) => Reflect.getPrototypeOf(target),
  };
  const engine = await GuestEngine.create({
    host,
    modules: sources,
    wasmModule: await WebAssembly.compile(wasm),
  });
  const workers = createGuestWorkers({
    catalog,
    prepare(entryURL, scriptType) {
      if (!sources.has(entryURL)) throw new TypeError('Worker source is not admitted');
      return { kind: 'privacy-frames:guest-worker', catalog, entryURL, scriptType };
    },
    commitTransfers: (transfer) => engine.detachTransferred(transfer),
  });
  engine.set('Worker', workers.Worker);
  const worker = await engine.evaluate(`new Promise(resolve=>{
    const worker=new Worker('https://fixture.invalid/worker.js');
    const buffer=new ArrayBuffer(4), view=new Uint8Array(buffer); view.set([1,2,3,4]);
    let first;
    worker.onmessage=e=>{const value=e.data;
      if(!first){
        first=value;first.detached=buffer.byteLength===0&&view.byteLength===0;
        const next=new ArrayBuffer(4), nextView=new Uint8Array(next);
        worker.postMessage({buffer:next,alias:next,view:nextView},[next]);
      }else{first.persistentCount=value.count;resolve(first);worker.terminate();}
    };
    worker.postMessage({buffer,alias:buffer,view},[buffer]);
  })`);
  const nested = await engine.evaluate(`new Promise(resolve=>{
    const worker=new Worker('https://fixture.invalid/worker.js');
    worker.onmessage=e=>{resolve(e.data);worker.terminate()};worker.postMessage({kind:'nested'});
  })`);
  const moduleWorker = await engine.evaluate(`new Promise(resolve=>{
    const worker=new Worker('https://fixture.invalid/module.js',{type:'module'});
    worker.onmessage=e=>{resolve(e.data);worker.terminate()};worker.postMessage(4);
  })`);
  const failedTransfer = engine.evaluate(`(()=>{
    const worker=new Worker('https://fixture.invalid/worker.js');
    const buffer=new ArrayBuffer(4);let rejected=false;
    try{worker.postMessage({buffer,callback:()=>{}},[buffer])}catch(error){rejected=true}
    worker.terminate();return {rejected,retained:buffer.byteLength===4};
  })()`);
  let denied = false;
  const WorkerConstructor = workers.Worker;
  if (!WorkerConstructor) throw new Error('Native dedicated workers are unavailable');
  try {
    new WorkerConstructor('https://remote.invalid/not-installed.js');
  } catch {
    denied = true;
  }

  let shared: unknown = 'unavailable';
  if (workers.SharedWorker) {
    const first = new workers.SharedWorker('https://fixture.invalid/shared.js', {
      name: 'fixture',
    });
    const second = new workers.SharedWorker('https://fixture.invalid/shared.js', {
      name: 'fixture',
    });
    const next = (port: MessagePort) =>
      new Promise((resolve) => {
        port.onmessage = (e) => resolve(e.data);
        port.postMessage('next');
      });
    shared = [await next(first.port), await next(second.port)];
    globalThis.guestSharedProbe = async () => {
      const worker = new workers.SharedWorker!('https://fixture.invalid/shared.js', {
        name: 'fixture',
      });
      return next(worker.port);
    };
  }

  const audio = new OfflineAudioContext(1, 256, 48000);
  const worklets = createGuestAudioWorklets({
    catalog,
    prepare(input) {
      const url = new URL(input, catalog.documentBase).href;
      if (!sources.has(url)) throw new TypeError('Audio source is not admitted');
      return { url, modules: sources };
    },
  });
  await worklets.addModule(audio, 'worklet.js');
  await worklets.addModule(audio, 'worklet.js');
  const node = new AudioWorkletNode(audio, 'guest-gain');
  const messages: unknown[] = [];
  const portReady = new Promise<void>(
    (resolve) =>
      (node.port.onmessage = (e) => {
        messages.push(
          e.data.buffer instanceof ArrayBuffer
            ? { bytes: Array.from(new Uint8Array(e.data.buffer)) }
            : e.data,
        );
        if (messages.length === 2) resolve();
      }),
  );
  const portBuffer = new Uint8Array([3, 4]).buffer;
  node.port.postMessage({ buffer: portBuffer }, [portBuffer]);
  await portReady;
  node.connect(audio.destination);
  const rendered = await audio.startRendering();
  const sample = rendered.getChannelData(0)[0];
  worklets.dispose();

  let prepared = 0;
  let closed = 0;
  const frame = document.createElement('iframe');
  frame.srcdoc = '<p>guest source must wait for preparation</p>';
  let documents: ReturnType<typeof createGuestDocuments>;
  documents = createGuestDocuments({
    baseURL: catalog.documentBase,
    async prepare(target) {
      await documents.navigate(target, new URL('/blank.html', location.href).href);
      prepared++;
      target.contentDocument!.body.textContent = 'prepared child';
      return {
        close() {
          closed++;
        },
      };
    },
    report(error) {
      throw error;
    },
  });
  documents.track(frame);
  const stripped = !frame.hasAttribute('srcdoc') && !frame.hasAttribute('src');
  document.body.append(frame);
  await documents.connected(frame);
  const childText = frame.contentDocument!.body.textContent;
  documents.disconnected(frame);
  frame.remove();
  documents.dispose();
  window.addEventListener('pagehide', (event) => {
    if (event.isTrusted && !event.persisted) workers.dispose();
  });
  engine.dispose();
  return {
    worker,
    nested,
    moduleWorker,
    failedTransfer,
    denied,
    shared,
    sample,
    workletMessages: messages,
    nativePortDetached: portBuffer.byteLength === 0,
    prepared,
    closed,
    stripped,
    childText,
  };
}
run()
  .then((result) => (globalThis.guestContextResults = { result }))
  .catch((error) => {
    globalThis.guestContextResults = { error: String(error) };
    console.error(error);
  });
