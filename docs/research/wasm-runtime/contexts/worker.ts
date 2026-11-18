import { createContext, evaluate } from './engine';
const ready = createContext();
const connect = (port: MessagePort | DedicatedWorkerGlobalScope) => {
  port.onmessage = async (event) => {
    try {
      const context = await ready;
      const count = evaluate(context, 'globalThis.count = (globalThis.count || 0) + 1');
      if (event.data.buffer) {
        const value = context.newArrayBuffer(event.data.buffer);
        context.setProp(context.global, 'buffer', value);
        if (event.data.graph) {
          const graph = evaluate(
            context,
            `globalThis.root = { buffer, full: new Uint8Array(buffer), subarray: new Uint8Array(buffer, 1, 2), data: new DataView(buffer, 1, 2), alias: buffer };
            ({ sameBuffer: root.buffer === root.alias && root.full.buffer === root.buffer && root.subarray.buffer === root.buffer && root.data.buffer === root.buffer,
              bytes: Array.from(root.full), subarray: Array.from(root.subarray), dataByte: root.data.getUint8(0), subarrayOffset: root.subarray.byteOffset, dataOffset: root.data.byteOffset })`,
          );
          value.dispose();
          port.postMessage({ count, graph });
          return;
        }
        evaluate(context, 'new Float32Array(buffer)[0] += 1');
        const view = context.getArrayBuffer(value);
        const buffer = view.value.slice().buffer;
        view.dispose();
        value.dispose();
        port.postMessage(
          {
            count,
            buffer,
            native: {
              fetch: typeof fetch,
              Worker: typeof Worker,
              TextDecoder: typeof TextDecoder,
            },
          },
          [buffer],
        );
      } else port.postMessage({ count });
    } catch (error) {
      port.postMessage({ error: String(error) });
    }
  };
  if ('start' in port) port.start();
};
if ('SharedWorkerGlobalScope' in globalThis)
  globalThis.onconnect = (event) => connect(event.ports[0]);
else connect(globalThis);
