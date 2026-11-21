import { createGuestWindow } from '../src/guest/session.ts';
import {
  captureNativeIntrinsics,
  ordinaryIntrinsicNames,
} from '../src/guest/native-intrinsics.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function nativeConstructor(global: object, name: string): Function {
  const property = Object.getOwnPropertyDescriptor(global, name);
  check(
    property && 'value' in property && typeof property.value === 'function',
    'Native constructor data: ' + name,
  );
  return property.value;
}
async function run() {
  const catalog: GuestContextCatalog = {
    application: 'realm-intrinsics-fixture',
    generation: 'fixture',
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
    resources: [],
  };
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const childWindow = frame.contentWindow;
  check(childWindow, 'Native child exists');
  const earlyFrame = document.createElement('iframe');
  document.body.append(earlyFrame);
  const parent = await createGuestWindow(catalog, window);
  const child = await createGuestWindow(catalog, childWindow);
  try {
    const foreignObject = nativeConstructor(childWindow, 'Object');
    const foreignFunction = nativeConstructor(childWindow, 'Function');
    check(
      foreignObject !== Object && foreignFunction !== Function,
      'Native realms have different constructor identities',
    );
    check(
      Object.getPrototypeOf(foreignObject) !== Function.prototype,
      'Native foreign constructor has foreign Function.prototype',
    );
    await parent.engine.evaluate(`
      globalThis.savedIntrinsics = {};
      for (const name of ${JSON.stringify(ordinaryIntrinsicNames)}) {
        const ctor = globalThis[name];
        if (typeof ctor === 'function') savedIntrinsics[name] = {ctor, prototype:ctor.prototype};
      }
      Object.prototype.realmExtension = 31;
      Function.prototype.realmFunctionExtension = 47;
      globalThis.Object = function ChangedObject() {};
      globalThis.Function = function ChangedFunction() {};
      globalThis.Uint8Array = function ChangedUint8Array() {};
    `);
    const captured: string[] = [];
    for (const name of ordinaryIntrinsicNames) {
      const property = Object.getOwnPropertyDescriptor(childWindow, name);
      if (!property || !('value' in property) || typeof property.value !== 'function')
        continue;
      const prototype = Object.getOwnPropertyDescriptor(property.value, 'prototype');
      parent.engine.set('foreignConstructor', property.value);
      parent.engine.set('foreignPrototype', prototype?.value);
      parent.engine.set('intrinsicName', name);
      await parent.engine.evaluate(`(() => {
        const expected = savedIntrinsics[intrinsicName];
        if (!expected || foreignConstructor !== expected.ctor || foreignPrototype !== expected.prototype)
          throw new Error('Foreign intrinsic identity: ' + intrinsicName);
        if (savedIntrinsics.Object.ctor.getOwnPropertyDescriptor(foreignPrototype, 'constructor').value !== expected.ctor)
          throw new Error('Foreign intrinsic descriptor value: ' + intrinsicName);
      })()`);
      captured.push(name);
    }
    parent.engine.set('foreignObject', foreignObject);
    parent.engine.set('foreignFunction', foreignFunction);
    const button = childWindow.document.createElement('button');
    childWindow.document.body.append(button);
    parent.engine.set('foreignNode', button);
    parent.engine.set('foreignDOMConstructor', button.constructor);
    await parent.engine.evaluate(`
      (() => {
        const O=savedIntrinsics.Object.ctor,F=savedIntrinsics.Function.ctor;
        if(foreignObject.prototype.realmExtension!==31 || foreignFunction.prototype.realmFunctionExtension!==47)
          throw new Error('Canonical aliases lost guest prototype extensions');
        let parent = foreignDOMConstructor;
        const visited = new Set();
        while(parent && parent !== F.prototype && !visited.has(parent)) {
          visited.add(parent);
          parent = O.getPrototypeOf(parent);
        }
        if(parent !== F.prototype)
          throw new Error('DOM constructor intrinsic boundary');
        if(foreignDOMConstructor===F || foreignNode.constructor!==foreignDOMConstructor ||
            O.getPrototypeOf(foreignNode)!==foreignDOMConstructor.prototype)
          throw new Error('Foreign DOM constructor identity lost');
        foreignNode.textContent='Local foreign DOM';
        foreignNode.setAttribute('data-local','yes');
        let calls=0;
        const callback=event=>{calls++;event.preventDefault();};
        foreignNode.addEventListener('local-dom',callback);
        if(foreignNode.dispatchEvent(new Event('local-dom',{cancelable:true}))!==false || calls!==1)
          throw new Error('Foreign DOM callback/cancellation');
        foreignNode.removeEventListener('local-dom',callback);
      })()
    `);
    check(
      button.textContent === 'Local foreign DOM' &&
        button.getAttribute('data-local') === 'yes',
      'Normal foreign DOM writes stay local',
    );
    let nativeShared: ArrayBuffer | undefined;
    try {
      nativeShared = new WebAssembly.Memory({ initial: 0, maximum: 0, shared: true })
        .buffer;
    } catch {
      /* Native shared-memory availability is a separate platform premise. */
    }
    let sharedAlias = 'unavailable';
    if (nativeShared) {
      const prototype = Object.getPrototypeOf(nativeShared);
      const constructor = Object.getOwnPropertyDescriptor(
        prototype,
        'constructor',
      )?.value;
      check(
        typeof constructor === 'function',
        'Native shared buffer constructor identity',
      );
      parent.engine.set('nativeSharedPrototype', prototype);
      parent.engine.set('nativeSharedConstructor', constructor);
      check(
        await parent.engine.evaluate(`
        nativeSharedPrototype === nativeSharedConstructor.prototype &&
        savedIntrinsics.Object.ctor.getOwnPropertyDescriptor(nativeSharedPrototype, 'constructor').value === nativeSharedConstructor
      `),
        'Private installed shared-buffer aliases are canonical',
      );
      if (crossOriginIsolated) {
        parent.engine.set('nativeSharedBuffer', nativeShared);
        check(
          await parent.engine.evaluate(`
          savedIntrinsics.Object.ctor.getPrototypeOf(nativeSharedBuffer) === nativeSharedPrototype &&
          nativeSharedBuffer.constructor === nativeSharedConstructor && nativeSharedBuffer.byteLength === 0
        `),
          'Isolated native shared buffer preserves installed alias identity',
        );
      }
      sharedAlias = typeof SharedArrayBuffer === 'function' ? 'public' : 'hidden';
    }
    const earlyWindow = earlyFrame.contentWindow;
    check(earlyWindow, 'Early identity control realm exists');
    const earlyConstructor = nativeConstructor(earlyWindow, 'Object');
    parent.engine.set('prematureReference', earlyConstructor);
    captureNativeIntrinsics(earlyWindow, { owner: {}, document: earlyWindow.document });
    let refused = false;
    let refusal: string | undefined;
    try {
      parent.engine.set('afterCapture', earlyConstructor);
    } catch (error) {
      refusal = String(error);
      refused = refusal.includes('exposed before realm capture');
    }
    check(
      refused,
      'An existing generic proxy cannot silently become a canonical intrinsic: ' +
        refusal,
    );
    check(
      await parent.engine.evaluate(`(() => {
      try { savedIntrinsics.Object.ctor.getPrototypeOf(prematureReference); }
      catch(error) { return String(error).includes('exposed before realm capture'); }
      return false;
    })()`),
      'Previously exposed generic proxy is refused on metadata dispatch after capture',
    );
    child.close();
    parent.engine.set('afterChildClose', foreignObject);
    check(
      await parent.engine.evaluate('afterChildClose === savedIntrinsics.Object.ctor'),
      'Retained intrinsic stays guest-owned after native producer closure',
    );
    const nativeAlias = {};
    const guestAlias = await parent.engine.evaluate('({customAlias:true})');
    parent.engine.alias(nativeAlias, guestAlias);
    parent.engine.set('customAlias', nativeAlias);
    check(
      await parent.engine.evaluate('customAlias.customAlias === true'),
      'Explicit trusted aliases retain their existing route',
    );
    parent.close();
    check(
      !parent.engine.context.alive && !child.engine.context.alive,
      'Guest contexts release all canonical handles',
    );
    check(
      !parent.engine.recognizesCallable(foreignObject),
      'Closed engine recognizes no intrinsic alias',
    );
    return {
      nativeDifferent: true,
      sharedAlias,
      sharedBuffer: crossOriginIsolated
        ? nativeShared
          ? 'passed'
          : 'unavailable'
        : 'requires-coi',
      canonical: captured,
      descriptorValues: true,
      guestGlobalMutation: true,
      prototypeExtensions: true,
      foreignDOM: true,
      foreignCallbacks: true,
      lateCaptureRefused: true,
      explicitAlias: true,
      disposal: true,
    };
  } finally {
    parent.close();
    child.close();
    frame.remove();
    earlyFrame.remove();
  }
}
run()
  .then((result) => Reflect.set(window, '__realmIntrinsicResult', result))
  .catch((error) =>
    Reflect.set(
      window,
      '__realmIntrinsicFailure',
      String(error) + (error.stack ? '\n' + error.stack : ''),
    ),
  );
