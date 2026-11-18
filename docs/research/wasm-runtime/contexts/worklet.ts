import { createContext, evaluate } from './engine';
registerProcessor(
  'engine-probe',
  class extends AudioWorkletProcessor {
    context;
    render;
    messages = 0;
    constructor(options) {
      super();
      const started = Date.now();
      this.port.onmessage = (event) => {
        this.messages++;
        if (event.data.buffer) {
          const value = this.context.newArrayBuffer(event.data.buffer);
          this.context.setProp(this.context.global, 'messageBuffer', value);
          evaluate(this.context, 'new Float32Array(messageBuffer)[0] += 2');
          const view = this.context.getArrayBuffer(value);
          const buffer = view.value.slice().buffer;
          view.dispose();
          value.dispose();
          this.port.postMessage({ echo: buffer }, [buffer]);
        }
      };
      createContext(options.processorOptions.module)
        .then((context) => {
          this.context = context;
          evaluate(
            context,
            `class AudioWorkletProcessor {}; function registerProcessor(name, Constructor) { globalThis.processor = new Constructor(); }
        registerProcessor('guest', class extends AudioWorkletProcessor { process(inputs, outputs) { outputs[0][0].fill(0.25); return true; } });
        globalThis.render = buffer => processor.process([], [[new Float32Array(buffer)]], {});`,
          );
          this.render = context.getProp(context.global, 'render');
          this.port.postMessage({
            ready: true,
            startupMs: Date.now() - started,
            native: {
              TextDecoder: typeof TextDecoder,
              fetch: typeof fetch,
              WebAssembly: typeof WebAssembly,
            },
          });
        })
        .catch((error) =>
          this.port.postMessage({
            error: String(error),
            nativeDecoder: typeof TextDecoder,
          }),
        );
    }
    process(inputs, outputs) {
      if (!this.context) return true;
      try {
        const buffer = this.context.newArrayBuffer(outputs[0][0].buffer);
        this.context
          .callFunction(this.render, this.context.undefined, buffer)
          .unwrap()
          .dispose();
        const copy = this.context.getArrayBuffer(buffer);
        outputs[0][0].set(
          new Float32Array(
            copy.value.buffer,
            copy.value.byteOffset,
            outputs[0][0].length,
          ),
        );
        copy.dispose();
        buffer.dispose();
      } catch (error) {
        this.port.postMessage({ processError: String(error) });
        return false;
      }
      return true;
    }
  },
);
