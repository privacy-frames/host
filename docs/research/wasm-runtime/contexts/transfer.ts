import { createContext, evaluate } from './engine';

export const probeGuestTransfer = async () => {
  const context = await createContext();
  const features = evaluate(
    context,
    `({ transfer: typeof ArrayBuffer.prototype.transfer, transferToFixedLength: typeof ArrayBuffer.prototype.transferToFixedLength, structuredClone: typeof structuredClone })`,
  );
  const fixture = `globalThis.buffer = new Uint8Array([11, 22, 33, 44]).buffer;
    globalThis.full = new Uint8Array(buffer);
    globalThis.subarray = full.subarray(1, 3);
    globalThis.data = new DataView(buffer, 1, 2);`;
  const inspect = `({ bufferLength: buffer.byteLength, fullLength: full.length, subarrayLength: subarray.length,
    dataLength: (() => { try { return data.byteLength } catch(error) { return error.name } })() })`;
  evaluate(context, fixture);
  const source = context.getProp(context.global, 'buffer');
  const copied = context.getArrayBuffer(source);
  const copyOnly = copied.value.slice();
  copied.dispose();
  source.dispose();
  const copyControl = {
    sender: evaluate(context, inspect),
    copied: Array.from(copyOnly),
  };
  const intrinsic = context.evalCode('ArrayBuffer.prototype.transfer').unwrap();
  if (context.typeof(intrinsic) !== 'function') {
    intrinsic.dispose();
    context.dispose();
    return { features, copyControl, unavailable: true };
  }
  // Capture before simulated guest mutation; the adapter does not call a guest replacement.
  evaluate(
    context,
    'ArrayBuffer.prototype.transfer = () => { throw new Error("mutated method") }',
  );
  const buffer = context.getProp(context.global, 'buffer');
  const transferred = context.callFunction(intrinsic, buffer).unwrap();
  context.setProp(context.global, 'transferred', transferred);
  const sender = evaluate(context, inspect);
  const returned = evaluate(context, 'Array.from(new Uint8Array(transferred))');
  const bytes = context.getArrayBuffer(transferred);
  const nativeBuffer = bytes.value.slice().buffer;
  bytes.dispose();
  transferred.dispose();
  buffer.dispose();
  intrinsic.dispose();
  context.dispose();
  const worker = new Worker('/worker.js', { type: 'module' });
  try {
    const reply = new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('transfer worker timeout')),
        15000,
      );
      worker.onmessage = (event) => {
        clearTimeout(timeout);
        resolve(event.data);
      };
      worker.onerror = (event) => {
        clearTimeout(timeout);
        reject(new Error(event.message));
      };
    });
    worker.postMessage({ graph: true, buffer: nativeBuffer }, [nativeBuffer]);
    return {
      features,
      copyControl,
      capturedIntrinsic: true,
      sender,
      returned,
      nativeSenderDetached: nativeBuffer.byteLength === 0,
      target: await reply,
    };
  } finally {
    worker.terminate();
  }
};
