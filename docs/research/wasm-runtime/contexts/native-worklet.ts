registerProcessor(
  'native-control',
  class extends AudioWorkletProcessor {
    process(inputs, outputs) {
      outputs[0][0].fill(0.25);
      return true;
    }
  },
);
