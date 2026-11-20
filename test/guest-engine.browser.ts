import { GuestEngine } from '../src/guest/engine.ts';
import type { GuestHost } from '../src/guest/protocol.ts';

declare global {
  var guestEngineResults: Record<string, unknown> | undefined;
}

const host: GuestHost = {
  get: (target, key) => Reflect.get(target, key),
  set: (target, key, value) => Reflect.set(target, key, value),
  delete: (target, key) => Reflect.deleteProperty(target, key),
  settable: (target, key) =>
    typeof key === 'string' &&
    Object.prototype.toString.call(target) === '[object DOMStringMap]',
  call: (target, receiver, arguments_) => Reflect.apply(target, receiver, arguments_),
  construct: (target, arguments_) => Reflect.construct(target, arguments_),
  ownKeys: (target) => Reflect.ownKeys(target),
  descriptor: (target, key) => Object.getOwnPropertyDescriptor(target, key),
  prototype: (target) => Object.getPrototypeOf(target),
};

try {
  Reflect.set(globalThis, '__nativeEngineWitness', 42);
  const errors: string[] = [];
  const engine = await GuestEngine.create({
    host,
    wasmURL: '/quickjs.wasm',
    globalObject: window,
    modules: new Map([['https://example.test/value.js', 'export const value = 42;']]),
    onError: (error) => errors.push(error.message),
  });
  engine.set('window', window);
  engine.set('self', window);
  engine.set('document', document);
  engine.set('Element', Element);
  engine.set('HTMLElement', HTMLElement);
  engine.set('installedOwnGlobal', 1);
  engine.set('Window', Window);
  engine.set('Event', Event);
  engine.set('CustomEvent', CustomEvent);
  engine.set('DOMException', DOMException);
  engine.set('URL', URL);
  engine.set('console', console);
  engine.set('nativePromise', () => Promise.resolve({ answer: 42 }));
  engine.set('nativeAsync', async () => 1);
  engine.set('nativeGenerator', function* () {
    yield 1;
  });
  engine.set('fillBytes', (bytes: Uint8Array) => bytes.fill(9));
  engine.set('nativeFloats', () => new Float32Array([0.25, 0.5]));
  engine.set('nativeBinaryString', () => '\0\xff\ud800Z');
  engine.set('echoNativeString', (value: string) => value);
  engine.set('hasGuestOwner', (value: object) => engine.ownsGuestValue(value));
  engine.set('nativeLoneSurrogate', () => 'prefix\ud800suffix');
  engine.set('binaryRecord', { 'key\0suffix': '\0value\udfff' });
  engine.set('nativeSymbolForBinary', () => Symbol.for('registry\0suffix'));
  const opaqueStrings = Object.create({}) as Record<string, unknown>;
  opaqueStrings.field = 1;
  opaqueStrings['field\0suffix'] = 2;
  engine.set('opaqueStrings', opaqueStrings);
  engine.set('nativeBuffer', new Uint8Array([1, 2, 3, 4]));
  engine.set('nativeThrow', () => {
    throw new Error('native failure');
  });
  engine.set('nativeSecurityError', () => {
    throw new DOMException('native denied', 'SecurityError');
  });
  engine.set('invokeSync', (callback: () => unknown) => callback());
  engine.set('nestedBytes', (bytes: Uint8Array, callback: () => unknown) => {
    bytes[0] = 3;
    callback();
    const written = bytes[1];
    bytes[2] = 5;
    return written;
  });
  engine.set('throwAfterWrite', (bytes: Uint8Array) => {
    bytes[0] = 8;
    throw new Error('after write');
  });
  engine.set('cloneNative', (value: unknown) => structuredClone(value));
  engine.set('transferNative', (value: unknown, transfer: Transferable[]) => {
    const cloned = structuredClone(value, { transfer });
    engine.detachTransferred(transfer);
    return cloned;
  });
  const parent = document.createElement('div');
  parent.id = 'fixture';
  document.body.append(parent);
  const result = engine.evaluate(`
    globalThis.trace = [];
    const parent = document.getElementById('fixture');
    const button = document.createElement('button');
    parent.appendChild(button);
    Element.prototype.describe = function () { return this.nodeName; };
    Window.prototype.guestWindowExtension = 'window guest';
    button.customState = { value: 7 };
    button.addEventListener('inner', event => {
      trace.push('inner');
      event.preventDefault();
    });
    button.addEventListener('outer', event => {
      trace.push('outer');
      trace.push(button.dispatchEvent(new Event('inner', { cancelable: true })));
      event.preventDefault();
    });
    const cancellation = button.dispatchEvent(new Event('outer', { cancelable: true }));
    const bytes = new Uint8Array([1, 2, 3]);
    fillBytes(bytes);
    nativeBuffer[0] = 8;
    const flush = parent.nodeName;
    let error = '';
    try { nativeThrow(); } catch (caught) { error = caught.message; }
    ({
      globalIdentity: window === self && window === globalThis,
      ownGlobal: Object.hasOwn(globalThis, 'installedOwnGlobal') && ++installedOwnGlobal === 2,
      globalPrototype: window instanceof Window && window.guestWindowExtension === 'window guest',
      identity: parent.firstChild === button && button.parentNode === parent,
      cancellation, trace,
      prototype: button.describe(),
      prototypeIdentity: Object.getPrototypeOf(button) === HTMLElement.prototype || button instanceof HTMLElement,
      expando: parent.firstChild.customState.value,
      list: Array.from(parent.querySelectorAll('button')).map(node => node === button),
      bytes: Array.from(bytes),
      nativeBuffer: Array.from(nativeBuffer),
      constructor: button.describe.constructor('return typeof process')(),
      url: new URL('/hello', 'https://example.test/').href,
      error,
    });
  `);
  const advanced = engine.evaluate(`
    (() => {
    const OriginalFloat32Array = Float32Array;
    Float32Array = function() { throw new Error('changed guest constructor'); };
    const importedFloats = nativeFloats();
    Float32Array = OriginalFloat32Array;
    const capturedViewConstructor = importedFloats instanceof Float32Array && importedFloats[1] === 0.5;
    const binaryKey = opaqueStrings['field\0suffix'];
    opaqueStrings['field\0suffix'] = 3;
    const original = new Error('identity');
    const exception = new DOMException('denied', 'SecurityError');
    let nativeException;
    try { nativeSecurityError(); } catch(error) { nativeException=[error instanceof DOMException,error.name,error.code]; }
    let getterError = false;
    try { cloneNative({get invalid() { throw original; }}); } catch (error) { getterError = error === original; }
    let sameError = false;
    try { invokeSync(() => { throw original; }); } catch (error) { sameError = error === original; }
    const cyclic = { number: 4 }; cyclic.self = cyclic;
    const map = new Map([[cyclic, new Set([1,2])]]);
    const copiedMap = cloneNative(map);
    const copiedKey = Array.from(copiedMap.keys())[0];
    const unique = Symbol('private');
    const node = document.getElementById('fixture');
    node[unique] = 'symbol data';
    const beforeDataset = 'fresh' in node.dataset;
    node.dataset.fresh = 'value';
    const datasetAttribute = node.getAttribute('data-fresh');
    delete node.dataset.fresh;
    const afterDataset = 'fresh' in node.dataset;
    const detail = { local: 9 };
    const custom = new CustomEvent('custom', { detail });
    class Listener {
      #calls = 0;
      get unused() { throw new Error('Unused callback property must stay lazy'); }
      handleEvent(event) { detail.received = event.detail === detail && ++this.#calls === 1; }
    }
    node.addEventListener('custom', new Listener());
    node.dispatchEvent(custom);
    const disguised = new Uint8Array([4,5]);
    Object.defineProperty(disguised, Symbol.toStringTag, { value: 'Function' });
    fillBytes(disguised);
    const nested = new Uint8Array([1,2,0]);
    let callbackRead = 0;
    const nativeRead = nestedBytes(nested, () => { callbackRead = nested[0]; nested[1] = 4; });
    const throwing = new Uint8Array([1]);
    try { throwAfterWrite(throwing); } catch {}
    const buffer = new ArrayBuffer(4);
    const bytes = new Uint8Array(buffer); bytes.set([1,2,3,4]);
    const retained = new DataView(buffer,1,2);
    const transferred = transferNative({ buffer, view: bytes, retained }, [buffer]);
    let dataViewDetached = false;
    try { retained.byteLength; } catch (error) { dataViewDetached = error instanceof TypeError; }
    return ({
      sameError,
      getterError,
      binaryString: echoNativeString(nativeBinaryString()),
      binaryKey,
      binaryWrite: [opaqueStrings['field\0suffix'], opaqueStrings.field],
      loneSurrogate: echoNativeString(nativeLoneSurrogate()),
      binaryRecord: binaryRecord['key\0suffix'],
      binaryRegistry: Symbol.keyFor(nativeSymbolForBinary()),
      binaryKeys: Object.keys(opaqueStrings),
      capturedViewConstructor,
      guestOwnership: [hasGuestOwner(() => 1), hasGuestOwner({ value: 1 }), hasGuestOwner(document)],
      guestFunctionPrototype: Object.getPrototypeOf(fillBytes) === Function.prototype,
      domException: [exception instanceof DOMException, exception.name, exception.message, exception.code],
      nativeException,
      map: copiedMap instanceof Map && copiedKey === copiedKey.self && copiedMap.get(copiedKey) instanceof Set,
      symbol: node[unique],
      dataset: [beforeDataset, datasetAttribute, afterDataset],
      detailIdentity: detail.received,
      binaryBrand: Array.from(disguised),
      nestedBytes: [callbackRead, nativeRead, ...nested],
      throwingWrite: throwing[0],
      sender: buffer.byteLength === 0 && bytes.byteLength === 0 && dataViewDetached,
      receiver: transferred.buffer === transferred.view.buffer && transferred.buffer === transferred.retained.buffer,
      bytes: Array.from(transferred.view),
    });
    })();
  `);
  engine.evaluate(
    `nativePromise().then(value => { globalThis.promiseAnswer = value.answer; });`,
  );
  engine.evaluate(
    `Object.getPrototypeOf(nativeAsync).constructor('return typeof __nativeEngineWitness')().then(value => { globalThis.asyncCompilerRealm = value; });`,
  );
  engine.drainJobs();
  await new Promise((resolve) => setTimeout(resolve, 0));
  engine.drainJobs();
  const module = engine.evaluate(
    `import { value } from './value.js'; globalThis.moduleAnswer = value;`,
    'https://example.test/main.js',
    'module',
  );
  engine.drainJobs();
  await module;
  const additional = {
    promise: engine.get('promiseAnswer'),
    asyncCompilerRealm: engine.get('asyncCompilerRealm'),
    generatorCompilerRealm: engine.evaluate(
      `Object.getPrototypeOf(nativeGenerator).constructor('yield typeof __nativeEngineWitness')().next().value`,
    ),
    module: engine.get('moduleAnswer'),
    nativePrototype: Object.hasOwn(Element.prototype, 'describe'),
    errors,
  };
  engine.set('cacheInspect', (view: Uint32Array) => Array.from(view));
  engine.set('cacheReadArgument', (_record: object, view: Uint32Array | Uint8Array) =>
    Array.from(view),
  );
  engine.set('cacheTouch', (_view: Uint8Array) => undefined);
  engine.set('cacheNativeLength', (view: Uint32Array) =>
    Object.defineProperty(view, 'length', { value: 19, configurable: true }),
  );
  engine.set('cacheAsyncMutation', async (view: Uint8Array) => {
    await Promise.resolve();
    view[0] = 91;
  });
  engine.set('cacheAsyncObject', async (view: Uint8Array) => {
    await Promise.resolve();
    view[0] = 93;
    return opaqueStrings;
  });
  const cache = engine.evaluate(`(() => {
    const memory=new WebAssembly.Memory({initial:1,maximum:3});
    const words=new Uint32Array(memory.buffer,4,4);
    const bytes=new Uint8Array(memory.buffer,4,16);
    const data=new DataView(memory.buffer);
    words[0]=0x11223344;
    const alias=bytes[0]===0x44 && data.getUint32(4,true)===0x11223344;
    words[0]=11;const descriptor=Object.getOwnPropertyDescriptor(words,'0').value;
    words[0]=22;const descriptorThenWrite=cacheInspect(words)[0];
    Object.defineProperty(words,'1',{value:33});const defined=words[1];
    const sub=words.subarray(1,3);words[1]=44;const subRead=sub[0];sub[1]=55;const subWrite=words[2];
    Reflect.set(words,'2',{valueOf(){words[3]=77;return 88;}});
    const coercion=words[2]===88 && words[3]===77;
    const argument=cacheReadArgument({get token(){words[0]=43;return 0;}},words)[0];
    let threw=false;try{cacheReadArgument({get token(){words[0]=49;throw new Error('getter sentinel');}},words);}catch(error){threw=error.message==='getter sentinel';}
    const throwPreserved=threw && words[0]===49 && cacheInspect(words)[0]===49;
    Reflect.set(words,'-0',99);words['01']=27;
    const canonical=words['-0']===undefined && words[0]===49 && words['01']===27;
    const ownLength=Object.getOwnPropertyDescriptor(Uint32Array.prototype,'length');
    Object.defineProperty(Uint32Array.prototype,'length',{get(){return 123;},configurable:true});
    const prototypeLength=words.length;
    if(ownLength)Object.defineProperty(Uint32Array.prototype,'length',ownLength);else delete Uint32Array.prototype.length;
    cacheNativeLength(words);const nativeLength=words.length;
    const bufferIdentity=words.buffer===memory.buffer;
    const noPrivateKeys=Object.getOwnPropertyNames(words).every(key=>['0','1','2','3','01','length'].includes(key));
    const old=words;
    Reflect.set(words,'2',{valueOf(){memory.grow(1);new Uint32Array(memory.buffer,4,4)[0]=101;return 202;}});
    const grown=old.length===19 && old[0]===undefined && new Uint32Array(memory.buffer,4,4)[0]===101;
    return {alias,descriptor,descriptorThenWrite,defined,subRead,subWrite,coercion,argument,throwPreserved,canonical,prototypeLength,nativeLength,bufferIdentity,noPrivateKeys,grown};
  })()`);
  const asyncCache = await engine.evaluate(`(async () => {
    const ordinary=new Uint8Array(4);cacheTouch(ordinary);
    const argument=cacheReadArgument({get token(){ordinary[0]=43;return 0;}},ordinary)[0];
    try{cacheReadArgument({get token(){ordinary[0]=47;throw new Error('ordinary getter');}},ordinary);}catch{}
    const thrown=ordinary[0];
    await cacheAsyncMutation(ordinary);const resumed=ordinary[0];
    let observed=-1;
    Object.defineProperty(opaqueStrings,'then',{get(){observed=ordinary[0];return undefined;},configurable:true});
    await cacheAsyncObject(ordinary);
    delete opaqueStrings.then;
    return {argument,thrown,resumed,thenable:observed};
  })()`);
  const returnedSymbol = engine.evaluate('Symbol("returned")');
  if (typeof returnedSymbol !== 'symbol') throw new Error('Guest Symbol was not decoded');
  engine.dispose();
  const disposable = await GuestEngine.create({
    host,
    wasmURL: '/quickjs.wasm',
    onError() {},
  });
  const sdkBacking = disposable.context.newArrayBufferBacking(
    new Uint8Array([1, 2, 3, 4]).buffer,
  );
  disposable.context.setProp(disposable.context.global, 'sdkBacking', sdkBacking.handle);
  const zeroBacking = disposable.context.newArrayBufferBacking(new ArrayBuffer(0));
  disposable.context.setProp(
    disposable.context.global,
    'zeroBacking',
    zeroBacking.handle,
  );
  const originalMemoryGrow = WebAssembly.Memory.prototype.grow;
  let backingHeapGrowths = 0;
  WebAssembly.Memory.prototype.grow = function (delta) {
    backingHeapGrowths++;
    return Reflect.apply(originalMemoryGrow, this, [delta]);
  };
  const growthMirror = new Uint8Array(4);
  disposable.set('growthMirror', growthMirror);
  try {
    const growingJob = disposable.evaluate(
      `Promise.resolve().then(() => { globalThis.largeAllocation = new Uint8Array(32 * 1024 * 1024); return 42; })`,
    );
    disposable.drainJobs();
    await growingJob;
  } finally {
    WebAssembly.Memory.prototype.grow = originalMemoryGrow;
  }
  const namesAfterGrowth = disposable.context
    .getOwnPropertyNames(disposable.context.global)
    .unwrap();
  let reflectedAfterGrowth = false;
  try {
    reflectedAfterGrowth = namesAfterGrowth.some(
      (name) => disposable.context.getString(name) === 'largeAllocation',
    );
  } finally {
    namesAfterGrowth.dispose();
  }
  disposable.evaluate('globalThis.arrayAfterGrowth = [1, 2, 3]');
  const arrayAfterGrowth = disposable.context.getProp(
    disposable.context.global,
    'arrayAfterGrowth',
  );
  const lengthAfterGrowth = disposable.context.getLength(arrayAfterGrowth);
  arrayAfterGrowth.dispose();
  disposable.set('returnNativeSymbol', () => Symbol.iterator);
  const capturedNativeSymbol = disposable.evaluate(`(() => {
    const original = Symbol;
    Symbol.iterator = 'changed';
    Symbol = () => 'replaced';
    const result = returnNativeSymbol() === original.iterator;
    Symbol = original;
    return result;
  })()`);
  const backingError = (operation: () => void): string => {
    try {
      operation();
      return '';
    } catch (error) {
      return error instanceof Error ? error.name : String(error);
    }
  };
  const grewBackingHeap = backingHeapGrowths > 0;
  sdkBacking.writeFrom(new Uint8Array([9, 8, 7, 6]));
  const backingAfterGrowth = new Uint8Array(4);
  sdkBacking.readInto(backingAfterGrowth);
  growthMirror[0] = 31;
  const mirroredAfterGrowth = disposable.evaluate('Array.from(growthMirror)');
  disposable.evaluate('growthMirror[1] = 32');
  const mirrorNativeWrite = growthMirror[1];
  structuredClone(growthMirror.buffer, { transfer: [growthMirror.buffer] });
  const mirrorNativeDetached = disposable.evaluate('growthMirror.byteLength');
  disposable.evaluate(`
    globalThis.CapturedFixtureView = Uint8Array;
    Object.defineProperty(ArrayBuffer.prototype, 'byteLength', {get(){return 4;}, configurable:true});
    Uint8Array = () => ({});
    Reflect.apply = () => 4;
  `);
  sdkBacking.writeFrom(new Uint8Array([9, 8, 7, 6]));
  const backingAfterTamper = disposable.evaluate(
    'Array.from(new CapturedFixtureView(sdkBacking))',
  );
  const backingGuestShape = disposable.evaluate(
    '({length:new CapturedFixtureView(sdkBacking).length,keys:Object.getOwnPropertyNames(sdkBacking)})',
  );
  const backingWrongLength = backingError(() => sdkBacking.writeFrom(new Uint8Array(3)));
  zeroBacking.writeFrom(new Uint8Array(0));
  zeroBacking.readInto(new Uint8Array(0));
  disposable.evaluate(
    'globalThis.sdkMoved = sdkBacking.transfer(); zeroBacking.transfer();',
  );
  const backingDetachedRead = backingError(() => sdkBacking.readInto(new Uint8Array(4)));
  const backingDetachedWrite = backingError(() =>
    sdkBacking.writeFrom(new Uint8Array([3, 3, 3, 3])),
  );
  const zeroBackingDetached = backingError(() => zeroBacking.readInto(new Uint8Array(0)));
  const backingTransferDestination = disposable.evaluate(
    'Array.from(new CapturedFixtureView(sdkMoved))',
  );
  const backingDuplicate = sdkBacking.handle.dup();
  sdkBacking.handle.dispose();
  const backingDisposed = backingError(() => sdkBacking.readInto(new Uint8Array(4)));
  backingDuplicate.dispose();
  zeroBacking.handle.dispose();
  const backing = {
    grewBackingHeap,
    backingAfterGrowth: Array.from(backingAfterGrowth),
    mirroredAfterGrowth,
    mirrorNativeWrite,
    mirrorNativeDetached,
    backingAfterTamper,
    backingGuestShape,
    backingWrongLength,
    backingDetachedRead,
    backingDetachedWrite,
    zeroBackingDetached,
    backingTransferDestination,
    backingDisposed,
  };
  let rejectedMessage = '';
  const rejected = disposable.evaluate(`Promise.reject(new Error('expected rejection'))`);
  disposable.drainJobs();
  try {
    await rejected;
  } catch (error) {
    rejectedMessage = String(error);
  }
  disposable.evaluate('globalThis.repeatedError = new Error("repeated")');
  for (let i = 0; i < 3; i++) {
    try {
      disposable.evaluate('throw repeatedError');
    } catch {}
  }
  const queued = disposable.evaluate('Promise.resolve().then(() => 42)');
  if (queued instanceof Promise) void queued.catch(() => {});
  const pendingModule = disposable.evaluate(
    'await new Promise(() => {})',
    'https://example.test/pending-module.js',
    'module',
  );
  if (pendingModule instanceof Promise) void pendingModule.catch(() => {});
  const pending = disposable.evaluate('new Promise(() => {})');
  disposable.dispose();
  const backingContextDisposed = backingError(() =>
    sdkBacking.readInto(new Uint8Array(4)),
  );
  let closedMessage = '';
  try {
    await pending;
  } catch (error) {
    closedMessage = String(error);
  }
  const lateErrors: string[] = [];
  for (let i = 0; i < 3; i++) {
    const closing = await GuestEngine.create({
      host,
      wasmURL: '/quickjs.wasm',
      onError: (error) => lateErrors.push(String(error)),
    });
    let settle: (value: unknown) => void = () => {};
    let rejectLate: (error: Error) => void = () => {};
    closing.set(
      'lateResolution',
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    closing.set(
      'lateRejection',
      new Promise((_resolve, reject) => {
        rejectLate = reject;
      }),
    );
    const callback = closing.evaluate('() => 1');
    closing.dispose();
    closing.dispose();
    settle({ answer: 42 });
    rejectLate(new Error('rejected after close'));
    if (typeof callback !== 'function') throw new Error('Guest callback is not callable');
    try {
      callback();
    } catch (error) {
      if (!String(error).includes('Application context is closed')) throw error;
    }
    await Promise.resolve();
    await Promise.resolve();
  }
  globalThis.guestEngineResults = {
    result,
    additional,
    advanced,
    cache,
    asyncCache,
    disposal: {
      rejectedMessage,
      closedMessage,
      lateErrors,
      capturedNativeSymbol,
      reflectedAfterGrowth,
      lengthAfterGrowth,
      backing: { ...backing, backingContextDisposed },
    },
  };
} catch (error) {
  globalThis.guestEngineResults = {
    error: String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
}
