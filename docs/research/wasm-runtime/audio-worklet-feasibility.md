# AudioWorklet feasibility for Wasm guest JavaScript

Research date: 2026-11-17. Starting host: `11c95a1` on
`wasm-runtime-wayfinding`. This report investigates a greenfield host preserving
the existing demo, with native DOM/audio and guest JavaScript in QuickJS or Boa.
It does not choose an engine or authorize implementation. Application service
workers and IFC are outside scope.

## Finding

Neither candidate has established support for running unchanged application
AudioWorklet code. Native AudioWorklet can run Wasm, including a module compiled
outside the worklet, but the guest engine still needs a processor-class adapter,
audio-buffer bindings and message/job scheduling. A small native Wasm control
passed in Chromium and Firefox. A packaged QuickJS loader failed in both because
`TextDecoder` is unavailable in AudioWorklet. Boa remains source-qualified for
browser Wasm only; no Boa worklet execution was tested.

The existing corpus contains an actual AudioWorklet registration diagnostic and
separate audio-rendering fixtures. No custom worklet DSP dependency was found in
the inspected application bundles. That narrows the known workload; it does not
justify dropping AudioWorklet from the compatibility target.

Prior investigations were read at their exact commits:

- [QuickJS](https://github.com/privacy-frames/host/blob/fb922b0c5617f8250ce6a3ec8b617fc6ba8ccfae/docs/research/wasm-runtime/quickjs-capabilities.md).
- [Boa](https://github.com/privacy-frames/host/blob/4f2988fbfc116fa8d51953f532dede0bb715052d/docs/research/wasm-runtime/boa-capabilities.md).
- [Demo contract](https://github.com/privacy-frames/host/blob/3a6876a02bc3bc49b88b6de08f8ca9f291b413ff/docs/research/wasm-runtime/current-demo-contract.md).

Their source pins are retained below. Historical native receipts do not qualify
an engine bridge.

## Native loading and initialization

**Source evidence.** Worklets load module scripts through `addModule()` into a
specialized global environment. They do not inherit a window or worker's full
API surface. Audio and paint are separate specializations; the generic worklet
model does not promise a thread per worklet. [HTML worklets][html-worklets]

Emscripten documents two materially different integrations:

- Its Wasm Audio Worklets API supplies C/C++ audio callbacks using Wasm Workers.
  This is established infrastructure for compiled DSP, not a guest JavaScript
  environment. Its claim about avoiding temporary JavaScript garbage applies to
  that runtime, not to allocations or collection inside QuickJS/Boa.
- A separately built module can target an existing native AudioContext using
  `ENVIRONMENT=worklet`, without Wasm Workers/shared memory. Because worklets
  have no fetch API, the embedder must supply the Wasm using `SINGLE_FILE` or
  `instantiateWasm`. [Emscripten Audio Worklets][emscripten]

Chrome's first-party example describes synchronous compilation in the worklet,
or compiling outside and passing a `WebAssembly.Module` through constructor
options. `addModule()` completion does not wait for arbitrary initialization
promises inside the worklet. Compiling during active rendering can glitch audio.
Its old compiler flags are example provenance, not a verified current build
recipe. [Chrome design patterns][chrome]

**Integration inference.** Compile admitted engine bytes before starting the
audio graph, instantiate a separate engine in the native AudioWorklet global,
and evaluate admitted guest worklet modules there. Keep the main app's engine
on its chosen main thread and worker engines in native workers. Do not attempt
to call one live guest heap concurrently across those contexts. A per-audio-context
engine is a candidate, not a selected allocation policy.

The host must make guest `addModule()` resolve only when guest registration and
required initialization are ready. It must handle rejected initialization and
multiple loads. Simply awaiting native `addModule()` around an asynchronous
engine factory leaves a race. A bootstrap registration plus a private readiness
handshake might solve staging, but guest processor construction and static
parameter descriptors must still be ready when the native node is created.
The disposable loader probe below does not implement that adapter.

## Registration, callbacks and messaging

**Source evidence.** Native registration validates a constructor, its prototype
and callable `process`, and obtains static `parameterDescriptors`. Node options
are serialized into processor construction. The processor has an entangled
MessagePort; `process(inputs, outputs, parameters)` returns synchronously and its
boolean affects lifetime. Exceptions produce `processorerror` and silence.
Inputs/outputs contain channel Float32Arrays; disconnected inputs can have zero
channels, and parameter arrays can contain one value or a value per frame.
[Web Audio 1.0 registration and processing][audio10]

**Integration inference.** A guest class is not a native Web IDL constructor. The
host must register a native `AudioWorkletProcessor` subclass which delegates to
the guest constructor and retained guest `process` method with the right
receiver. Guest `super()`, ports, property getters, exceptions, descriptor reads,
and duplicate-name errors need deliberate bindings. Returned guest Promises
cannot postpone native rendering. A normal worker's async response cannot supply
the current block synchronously; a ring-buffer worker design changes latency and
failure behavior and would require a separate compatibility decision.

Each callback enters the local guest engine synchronously. This is simpler than
main-thread guest → DOM → guest nesting, but it does not prove arbitrary reentry:
a guest host call can itself trigger a callback. Boa's mutable Context ownership
and any wrapper borrow must be released or structured safely for that nesting;
QuickJS handle roots must survive it. Port handlers must enter the same engine
serially, marshal structured-clone values and transfer lists, and preserve
message order, exceptions and port lifetime. JSON-only messaging would lose
required types. Native messaging exists; guest objects are not directly
structured-cloneable browser objects. [QuickJS wrapper context][qcontext],
[Boa object calls][boa-calls], [HTML structured clone][clone]

The newer Web Audio draft specifies microtask checkpoints after rendering a
quantum and after queued tasks. Guest job queues need matching integration;
draining jobs after every node independently could change cross-node order.
Default quantum size is 128; the 1.1 draft adds render-size hints. Code should
inspect supplied lengths rather than promise every browser uses a fixed size.
[Web Audio 1.1 rendering][audio11]

## Buffers and deadlines

QuickJS's C API accepts storage pointers for ArrayBuffers and exposes typed-array
buffer offsets/lengths. In Wasm these pointers refer to linear memory; they do
not let C dereference arbitrary browser-owned audio channel memory. The inspected
wrapper copies input bytes into its heap, and its `QTS_GetArrayBuffer` allocates
and copies output bytes. [QuickJS API][qapi], [wrapper buffer conversion][qbuffer],
[wrapper C interface][qc]

Boa's `JsArrayBuffer::from_byte_block` takes an owned Rust `AlignedVec` without
cloning that vector. `data()`/`data_mut()` borrow engine-owned storage. This is
not a zero-copy import of a browser Float32Array. [Boa buffer API][boa-buffer]

**Integration inference.** The initial design to qualify is bulk copy of
native inputs/parameters into guest typed arrays and bulk copy of guest outputs
back before returning. It should preserve ordinary typed-array behavior within
the callback. Probe retained views, buffer identity/reuse, offsets, multiple
channels, disconnected inputs, constant parameters and untouched zero outputs.
A native-object Proxy with per-sample host calls is not evidence of equivalent
typed-array semantics or acceptable cost. SharedArrayBuffer messaging can avoid
some transport copies, but does not make browser audio channel buffers aliases
of the guest heap. Any alias proposal must specify ownership and lifetime.

For scale, stereo input plus stereo output at 128 frames is 2,048 bytes of
minimum sample copying per quantum, before parameters and wrapper intermediates.
At 48 kHz this is 375 quanta/s, or 768,000 bytes/s. These are arithmetic, not
measurements. Boundary calls, interpreter instructions, allocations, collection
and worst-case pauses may dominate the byte bandwidth.

The nominal block duration is 128/48,000 = 2.667 ms (2.902 ms at 44.1 kHz), shared
with the rest of the graph. It is not an exclusive per-processor allowance or a
guaranteed wall-clock callback interval. Offline rendering verifies samples,
not live deadlines. The platform's rendering model relates underruns to total
system audio-callback load. [Web Audio rendering][audio11]

QuickJS offers memory limits and an interrupt handler; Boa exposes VM/loop limits
and cooperative async evaluation. None establishes a hard real-time bound across
engine GC, parsing, native calls or allocation. Async yielding cannot satisfy a
synchronous audio callback. Compile guest source outside active rendering where
possible, reuse buffers where semantics permit, and measure pause tails before
claiming usable live DSP. [QuickJS limits][qapi], [Boa limits][boa-limits],
[Boa evaluation][boa-script]

## Application/source census

The publisher checkout at `b8637f0dc5b5e56ae0b6397fdae8501598b7d39e`
contains [Hostile app's worklet][adversary-worklet] and an explicit
[`audioWorklet.addModule()` diagnostic][adversary-app]. Its processor simply
returns true; the diagnostic loads/registers it without constructing a node.
Generated Notebook and Excalidraw bundles contain `audioworklet`/`paintworklet`
strings in React resource-preload handling; those are not processor execution.

The source search covered publisher `examples`, `dist-examples`, `mirrors` and
the downloaded corpus retained by the application-service-worker investigation:
596 JS/HTML/CSS files, approximately 112.6 MB, across its Excalidraw, draw.io,
Squoosh, StackEdit, CyberChef and current Pitch assets. The latter search's only
worklet matches were Excalidraw's preload cases. Current Pitch's main bundle
(SHA-256 `5bf9a6fd27798274c5a5c03473a66ee96ecc6bfe8bd4c04c78ac1c93d55ca5ff`)
contains `createAnalyser`/`getFloatTimeDomainData`, with no worklet token. Its
live source is supplementary to historical release pins, not proof about every
previous deployment. Publisher asset provenance is documented in
[publisher packaging](../../../evaluation/publisher-packaging.md) and
[the publisher source][publishers]. PhotoCraft's unavailable bundle, uncaptured
optional assets, computed property names and runtime-generated modules remain
census gaps. Wikipedia is an article fixture, not an audio application.

Host [worklet platform](../../../test/worklet-platform.ts),
[worklet context](../../../test/worklet-contexts.ts) and
[guard](../../../test/worklet-guard.ts) fixtures do exercise native processor
construction, ports, OfflineAudioContext samples and module graphs. Their
[historical receipts](../../../results/contexts/worklets.json) belong to the old
native-JavaScript runtime. Audio buffers, sample playback, microphone permission
and analyser/worker behavior in Pitch remain required independently of worklets.

## Executed observations and remaining probes

These disposable probes ran on localhost, headless, on 2026-11-17, using
Playwright from the existing host dependency installation. No production files
or existing receipts were changed.

| Probe                                                                                                                                                                 | Chromium 153.0.8010.12                                                                                           | Firefox 155.0 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------- |
| Native processor: synchronous tiny Wasm compilation inside worklet; separately main-thread-compiled module passed via `processorOptions`, instantiated inside worklet | Both exports returned 42; 256-frame mono OfflineAudioContext at 48 kHz rendered first sample 0.41999998688697815 | Same          |
| Native global capabilities observed by that processor                                                                                                                 | `fetch` and `Worker` undefined                                                                                   | Same          |
| quickjs-emscripten 0.32.0 release-sync, browser bundle, precompiled module supplied through `newVariant(..., { wasmModule })`                                         | Initialization rejected: `ReferenceError: TextDecoder is not defined`                                            | Same          |

The QuickJS bundle used esbuild 0.28.2 (`platform=browser`, ESM). Engine Wasm
SHA-256: `105c3bed22d457e43e3d1c3c1c6959fda62a8fe06f0fc8a985303c3a2be72232`.
The browser glue constructs `new TextDecoder` during factory initialization.
The failure occurred before guest evaluation or process-buffer copying. Supplying
a precompiled module therefore does not suffice for this package. A loader/build
change is needed before a further smoke test; no application polyfill or source
rewrite was attempted. This says nothing decisive about upstream QuickJS or NG
custom worklet builds. [Wrapper variant customization][variant],
[tagged wrapper build][qbuild]

No Boa build or engine execution was attempted: no ready Wasm artifact or
`wasm-pack` executable was available in the inspected environment. Boa's existing
Wasm evaluator creates a new Context per call and returns a string, so it cannot
serve as the persistent processor adapter unchanged. Its browser-Wasm CI is not
worklet evidence. [Boa evaluator][boa-wasm], [Boa Wasm manifest][boa-manifest]

The bounded next probes, not executed in this investigation, are:

1. **QuickJS startup:** build/pin one synchronous upstream or NG variant for the
   reduced worklet global, or adapt the wrapper loader, explicitly inventorying
   every assumed host global. Pass a precompiled module; initialize before node
   construction. Verify guest registration and constant output for two nodes and
   two audio contexts. Do not treat Asyncify suspension as process completion.
2. **Boa startup:** build one persistent `wasm32-unknown-unknown` embedding at the
   prior report's pin; export initialize/register/construct/process/dispose
   operations and retain guest constructors/functions. Supply bytes/module to
   synchronous wasm-bindgen initialization without fetch. Check worklet entropy,
   clock, console and text-codec imports; window smoke tests cannot settle them.
3. **Both, callback contract:** one unchanged guest gain processor with static
   parameters, constructor options, ports, a-rate/k-rate automation, two channels,
   disconnected inputs, return false, throwing constructor/process and duplicate
   registration. Compare native and guest OfflineAudioContext samples and events.
   Include guest → host → guest nested callback and job-order controls.
4. **Both, buffer/message contract:** exercise Float32Array methods, offsets and
   retained views across blocks; exchange typed arrays, transferred ArrayBuffers
   and MessagePorts, checking detachment, order and errors. Qualify shared memory
   separately if applications require it.
5. **Both, live cost:** after correctness, run fixed-duration 48/44.1 kHz live
   AudioContexts with several processors, allocation pressure and native graph
   work. Record hardware/OS/browser/toolchain/build pins, initialization time,
   binary size, memory growth, latency, callback distributions and independent
   underrun/glitch evidence. Compare native JS, native Wasm and guest engines.
   Keep offline results separate from live/device qualification.

PaintWorklet would need `registerPaint`, paint context/property bindings and its
own lifecycle/browser probes. Other worklet families require their owning
specifications and feature availability to be investigated separately. Neither
these AudioWorklet observations nor the old conditional paint fixture promises
support for those environments. [HTML specialization model][html-worklets]

## Reproducing the small controls

These are reduced reproductions of the exercised operations, not a host adapter.
Serve the page and processor as JavaScript/HTML from localhost. The native control
uses these complete Wasm bytes (one `f()` export returning 42):

```js
const bytes = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 127, 3, 2, 1, 0, 7, 5, 1, 1, 102, 0, 0,
  10, 6, 1, 4, 0, 65, 42, 11,
]);
```

In the worklet module, include that declaration and register:

```js
const local = new WebAssembly.Instance(new WebAssembly.Module(bytes));
registerProcessor(
  'probe',
  class extends AudioWorkletProcessor {
    constructor(options) {
      super();
      this.instance = new WebAssembly.Instance(options.processorOptions.module);
      this.port.postMessage({
        local: local.exports.f(),
        cloned: this.instance.exports.f(),
        fetch: typeof fetch,
        worker: typeof Worker,
      });
    }
    process(inputs, outputs) {
      outputs[0][0].fill(this.instance.exports.f() / 100);
      return false;
    }
  },
);
```

In the page, compile `bytes`, create `OfflineAudioContext(1, 256, 48000)`, await
`context.audioWorklet.addModule('/processor.js')`, construct
`new AudioWorkletNode(context, 'probe', { processorOptions: { module } })`, connect
to the destination, and await `startRendering()` plus the port message. Inspect
`buffer.getChannelData(0)[0]`.

For the QuickJS initialization failure, install `quickjs-emscripten@0.32.0` and
`esbuild@0.28.2` in a disposable directory. Bundle a worklet entry importing
`newQuickJSWASMModuleFromVariant` and `newVariant` from `quickjs-emscripten-core`,
and the default variant from `@jitl/quickjs-wasmfile-release-sync`, with
`esbuild entry.mjs --bundle --format=esm --platform=browser --outfile=processor.js`.
Its native processor constructor calls:

```js
newQuickJSWASMModuleFromVariant(
  newVariant(variant, { wasmModule: options.processorOptions.module }),
)
  .then(() => this.port.postMessage({ ready: true }))
  .catch((error) => this.port.postMessage({ error: String(error) }));
```

Compile the package's `dist/emscripten-module.wasm` in the page and pass that
module in the node options. Await the port response before attempting offline
rendering. The executed probe also prepared guest registration and a copied-buffer
render callback after initialization, but neither was reached. These results
therefore establish the loader failure only.

[html-worklets]: https://html.spec.whatwg.org/multipage/worklets.html
[emscripten]: https://emscripten.org/docs/api_reference/wasm_audio_worklets.html
[chrome]: https://developer.chrome.com/blog/audio-worklet-design-pattern/
[audio10]: https://www.w3.org/TR/2021/REC-webaudio-20210617/#AudioWorklet
[audio11]: https://www.w3.org/TR/2026/WD-webaudio-1.1-20260922/#rendering-loop
[clone]: https://html.spec.whatwg.org/multipage/structured-data.html#safe-passing-of-structured-data
[qapi]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs.h
[qcontext]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/packages/quickjs-emscripten-core/src/context.ts
[qbuffer]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/packages/quickjs-emscripten-core/src/context.ts#L447-L452
[qc]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/c/interface.c#L704-L737
[variant]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/packages/quickjs-emscripten-core/src/from-variant.ts
[qbuild]: https://github.com/justjake/quickjs-emscripten/blob/df4efb9ef2cb25c417ecb57986da462d11b244ed/packages/variant-quickjs-wasmfile-release-sync/Makefile
[boa-calls]: https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/object/operations.rs
[boa-buffer]: https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/object/builtins/jsarraybuffer.rs
[boa-limits]: https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/vm/runtime_limits.rs
[boa-script]: https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/script.rs
[boa-wasm]: https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/ffi/wasm/src/lib.rs
[boa-manifest]: https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/ffi/wasm/Cargo.toml
[adversary-worklet]: https://github.com/privacy-frames/apps/blob/b8637f0dc5b5e56ae0b6397fdae8501598b7d39e/examples/adversary/worklet.ts
[adversary-app]: https://github.com/privacy-frames/apps/blob/b8637f0dc5b5e56ae0b6397fdae8501598b7d39e/examples/adversary/app.ts
[publishers]: https://github.com/privacy-frames/apps/tree/b8637f0dc5b5e56ae0b6397fdae8501598b7d39e
