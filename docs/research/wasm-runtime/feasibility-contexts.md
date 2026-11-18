# Browser contexts and audio: combined feasibility evidence

Research date: 2026-11-18. Base: `2305989` on `wasm-runtime-wayfinding`.
These are local browser experiments with a JavaScript interpreter compiled to
Wasm. Application WebAssembly and application service workers remain deferred.
No production runtime or deployment was changed.

A persistent QuickJS engine worked inside native dedicated workers, shared
workers and child documents in both installed browsers. A small guest processor
also rendered inside AudioWorklet after a trusted-loader change. The packaged
loader still fails unchanged: it assumes `TextDecoder`, which these worklet
globals lack. The successful adapter substitutes a decoder inside engine glue;
it is explicitly a shim, and does not satisfy a preference for avoiding polyfills
entirely. No guest application source was changed to compensate for that loader.

## Executed observations

The retained [receipts](contexts/receipts.json) were produced by
[the harness](contexts/run.mjs), with assertions on the principal results. Both
browsers were headless, on local Linux x64, using Node 26.2.0, Playwright 1.63.0,
esbuild 0.28.2 and `quickjs-emscripten@0.32.0`, with
`@jitl/quickjs-wasmfile-release-sync@0.32.0`. That package vendors QuickJS
2025-09-13; it is distinct from current upstream QuickJS. Engine Wasm size and
SHA-256, loader SHA-256 and browser versions are in the receipt. The
[dependency lock](contexts/dependencies-lock.json) records the disposable build
installation. These are new observations, separate from the previous report's
native Wasm controls.

| Probe                                                                | Chromium 153.0.8010.12                                          | Firefox 155.0  |
| -------------------------------------------------------------------- | --------------------------------------------------------------- | -------------- |
| Dedicated native worker, one persistent guest context                | Count 1 then 2                                                  | Count 1 then 2 |
| Buffer transferred into worker; guest changes first float            | Sender detached; `[3,4]` becomes `[4,4]`                        | Same           |
| Two SharedWorker connections, one guest context                      | Port counts 1 then 2                                            | Same           |
| Child guest → parent callback → nested child guest                   | Synchronous result 22                                           | Same           |
| Repeated cached guest Window token                                   | Same object; prototype extension visible                        | Same           |
| Exception from parent callback                                       | Guest catches `parent failure`                                  | Same           |
| Native structured clone control                                      | Typed array, distinct buffer, cycle retained; function rejected | Same           |
| Native offline buffer copy/source/analyser control                   | 256 frames at 0.125; 16 analyser bins                           | Same           |
| Guest samples copied to native audio graph, analyser copied to guest | Rendered 0.125; guest reads 16 bins                             | Same           |
| Native AudioWorklet output control                                   | 0.25 across 256 offline frames                                  | Same           |
| Unmodified engine loader inside AudioWorklet                         | `ReferenceError: TextDecoder is not defined`                    | Same           |
| Scoped loader adapter inside AudioWorklet                            | Guest outputs 0.25 for 256 frames                               | Same           |
| Worklet MessagePort → guest mutation → MessagePort                   | Sender detached; `[5]` becomes `[7]`                            | Same           |

SharedWorker was available in both tested desktop installations. The harness
records `unavailable: true` when its constructor is absent; that is a missing
platform capability, not successful fallback. Other browser versions, mobile
browsers and deployment-specific SharedWorker policy were not qualified.

## What the fixtures actually bind

[The worker entry](contexts/worker.ts) creates a context once, outside the message
handler, and keeps it across messages. The same entry registers a `connect`
handler in SharedWorker and attaches each native MessagePort to that context.
The browser supplies real thread scheduling, port delivery, transfer and worker
lifetime. The guest receives a count and copied buffer, not the HTML Worker API.
Nested workers, module resolution, errors, timers, termination races and guest
`postMessage`/`onmessage` interfaces remain integration work. Native worker
`fetch`, `Worker` and `TextDecoder` existed in both controls; the presence of a
native API does not expose it automatically inside QuickJS. The HTML standard
specifies the distinct dedicated/shared global scopes and shared-worker port
connection model. [HTML workers][workers]

[The child entry](contexts/child.ts) creates a persistent engine inside a real
same-origin iframe. Calling its host function synchronously enters the guest,
which calls a parent function that reenters the child's guest context. A thrown
parent error returns as a catchable guest error. The identity check deliberately
uses one cached guest token for `window`, `self` and `getWindow()`: this tests the
cache mechanism and guest prototype extension, not WindowProxy semantics or a
complete native-object binding. `document` remains undefined in this guest.
Cross-origin window access, navigation, detached frames, native document
identity, event routing and lifetime cycles were not tested here. The separate
QuickJS study covers richer main-document bindings. Native child rendering
remains browser rendering; no HTML/CSS renderer was introduced.

The buffer path uses `newArrayBuffer` to copy native bytes into the guest, runs
guest typed-array code, then copies its bytes into a fresh native buffer. That
native buffer can be transferred over an actual MessagePort. The sender native
buffer is detached immediately, and typed-array values arrive intact. **Guest
ArrayBuffer detachment is not implemented or demonstrated.** Guest aliases,
offsets, typed-array identity and retained views do not become native aliases
through these copies. A complete guest `structuredClone`/transfer bridge still
needs a graph serializer and guest-side detach/lifetime behavior, or an engine
API exposing those operations. QuickJS's wrapper byte APIs and the HTML transfer
algorithm are separate contracts. [Wrapper context API][context] ·
[HTML structured data][clone]

[The ordinary audio fixture](contexts/main.ts) writes floats in the guest,
copies them to `AudioBuffer.copyToChannel`, starts a native buffer source through
a native analyser, renders offline, and copies analyser bytes back to a guest
typed array. The independent native control also exercises `copyFromChannel`.
This establishes a copying mechanism for those operations, not direct
`getChannelData` aliasing, a complete AudioNode binding, audible playback,
autoplay permission, microphone input or device timing. Offline rendering avoids
relying on audio hardware. The specification owns the native buffer and graph
contracts. [Web Audio][audio]

## The AudioWorklet loader obstacle and adapter

The earlier [AudioWorklet report][prior-audio] stopped at a loader failure. This
study reproduces that failure before applying the adapter, then executes guest
processing. The shipped browser glue eagerly creates `new TextDecoder`. Both
worklet globals report `typeof TextDecoder === 'undefined'` and
`typeof fetch === 'undefined'`, while WebAssembly exists. The page fetches and
compiles the admitted engine module before constructing the processor; it passes
the compiled module through `processorOptions`, and `newVariant({ wasmModule })`
provides the engine's instantiation path. Emscripten documents supplying Wasm to
worklets without fetch. [Emscripten Audio Worklets][emscripten] ·
[Variant loader source][variant]

The retained build plugin replaces that one decoder construction **inside the
trusted engine loader** with a small object whose `decode` method converts UTF-8
bytes using percent encoding and `decodeURIComponent`. It does not install a
`TextDecoder` global or change guest application source. It is nevertheless a
text-decoding shim and a patch to distributed engine glue. It has only been
exercised on this fixture's valid engine strings; unlike a conforming
TextDecoder, it throws on malformed UTF-8. It is a feasibility adapter, not a
production decoder, general codec implementation or proposed dependency.

A cleaner build route may be to rebuild the engine's Emscripten glue for worklet
use with its generated UTF-8 fallback retained. Current Emscripten settings source
describes `TEXTDECODER=1` as conditional decoder use with a generated fallback,
and `TEXTDECODER=2` as assuming native support. It also excludes worklet builds
from its size-optimization default of 2. This is source evidence for a build
route; **no such engine rebuild was executed here**. The current source also
says `TEXTDECODER=0` is no longer supported, so prescribing that flag without
pinning the compiler would be incorrect. [Emscripten settings][settings]

[The worklet entry](contexts/worklet.ts) registers a real native processor. Once
its engine is ready, it evaluates guest source defining the minimal
`AudioWorkletProcessor` class, `registerProcessor`, and guest `process` method.
Each native render call copies the channel into the guest, calls that method
synchronously, and copies its floats back to the native output. A separate
MessagePort message is copied into the same guest engine, mutated there, copied
out and transferred back. The acknowledgement is awaited before rendering;
`addModule()` alone does not establish guest engine readiness.

This binds only a mono output, an empty input/parameter shape, a copied buffer
and a minimal constructor. It does not qualify parameter descriptors, automation,
multiple inputs/channels, return-false lifecycle, guest ports, module imports,
processor exceptions, promise scheduling or retained channel views. Per-block
allocation and copying are intentional shortcuts in this probe. Observed startup
milliseconds in the receipt are single samples after page-side compilation, not
benchmarks. The offline 256-frame result provides no evidence about live audio
deadlines, garbage collection pauses, device glitches or sustained throughput.

## Reuse, policy and remaining evidence

The browser's contexts, ports, native transfer algorithm, audio graph and rendering
can be reused. The engine wrapper supplies evaluation, host functions and buffer
copies. A complete guest-facing browser layer still needs generated or reusable
interface bindings, object caches, callback/job integration and resource policy.
The earlier [binding-reuse research][prior-binding] identifies candidates;
these small fixtures do not replace that work with a complete interface library.
Boa was not executed in these context/audio fixtures; the companion Boa study
owns its build evidence. Nothing here establishes a no-shim Boa worklet route.

All runtime requests in this experiment were served from a disposable loopback
HTTP server, including the engine bytes and bundled entries. This is a research
harness, **not an enforcement boundary**. The native worker control retains
`fetch` and nested Worker access. The child is same-origin and its parent can
call host functions freely. No admitted-resource checker, host authority audit,
network escape negative test or deployment restriction was implemented. A
production boundary must mediate guest bindings and startup before untrusted
application code, accept admitted local resources only, and fail on missing
controls. Successful samples here establish mechanisms; they do not qualify
confinement. Application Wasm remains deferred even though the interpreter
itself is a Wasm module.

## Reproduction

Install `quickjs-emscripten@0.32.0` and `esbuild@0.28.2` using the retained lock in
`/tmp/aw-engine-feasibility`, and use the existing Playwright 1.63.0 installation
with its Chromium/Firefox browsers. Run:

```sh
/home/damen/.nvm/versions/node/v26.2.0/bin/node docs/research/wasm-runtime/contexts/run.mjs
```

The harness bundles the retained TypeScript fixture entries into
`/tmp/context-engine-feasibility`, serves a temporary loopback origin, executes
both browsers, asserts expected results and rewrites `contexts/receipts.json`.
Its absolute dependency paths describe this environment; adjust those paths for
another installation. No generated bundle or Wasm binary is added to the host.
Repository `npm run format:check` and explicit Prettier checking of these research
artifacts passed. The fixture entries are browser build inputs, outside the production TypeScript
configuration; they were executed after esbuild bundling, not subjected to the
production project's static type check.

[workers]: https://html.spec.whatwg.org/multipage/workers.html#shared-workers-and-the-sharedworker-interface
[clone]: https://html.spec.whatwg.org/multipage/structured-data.html#structuredserializewithtransfer
[audio]: https://www.w3.org/TR/2021/REC-webaudio-20210617/
[emscripten]: https://emscripten.org/docs/api_reference/wasm_audio_worklets.html
[settings]: https://github.com/emscripten-core/emscripten/blob/main/src/settings.js
[context]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/packages/quickjs-emscripten-core/src/context.ts
[variant]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/packages/quickjs-emscripten-core/src/from-variant.ts
[prior-audio]: https://github.com/privacy-frames/host/blob/b23d81e0f33155d6787d3fe7396bf1966a59c465/docs/research/wasm-runtime/audio-worklet-feasibility.md
[prior-binding]: https://github.com/privacy-frames/host/blob/da55971a802cd0efe9ca8db62e6a2ecbf4fe4663/docs/research/wasm-runtime/browser-binding-reuse.md
