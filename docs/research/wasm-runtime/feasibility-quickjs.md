# QuickJS main-thread feasibility: executable browser evidence

Study date: 2026-11-18. Base: `2305989` (`wasm-runtime-wayfinding`).
This report answers the main-thread part of combined feasibility issue 17.
Application Wasm and service-worker execution are deferred. No application,
production runtime or deployment was changed.

A persistent QuickJS engine on the browser main thread can synchronously call
native DOM operations and reenter guest callbacks, including a second nested
native event dispatch. In Chromium and Firefox, guest `preventDefault()` changed
the actual native cancelable events before their native `dispatchEvent()` calls
returned. This removes one specific engine-integration uncertainty. It does not
supply the DOM bindings needed by unchanged applications.

## Artifact and controls

The reproducible TypeScript harness is [research/quickjs](../../../research/quickjs/).
It uses `quickjs-emscripten` **0.32.0**, its default upstream release synchronous
Wasm variant, esbuild **0.28.2**, Playwright **1.63.0**, Node **26.2.0**, Chromium
**153.0.8010.12** and Firefox **155.0**. The fixture executes guest source only in
QuickJS; trusted harness code runs natively and instantiates the engine Wasm.
The dependency lock preserves npm package integrity. The wrapper release is
[tag v0.32.0](https://github.com/justjake/quickjs-emscripten/tree/df4efb9ef2cb25c417ecb57986da462d11b244ed);
its [vendored upstream version](https://github.com/justjake/quickjs-emscripten/blob/df4efb9ef2cb25c417ecb57986da462d11b244ed/vendor/quickjs/VERSION)
is 2025-09-13. This is not a test of current upstream QuickJS head.

Machine-readable observations and assertions are retained in
[receipt-chromium.json](../../../research/quickjs/receipt-chromium.json) and
[receipt-firefox.json](../../../research/quickjs/receipt-firefox.json).
The runner serves only a loopback page, trusted bundle, pinned engine Wasm and
optional local application source. Every observed browser request stayed at that
loopback origin. This request observation is useful fixture evidence; it is not
a proof that a future DOM bridge cannot cause network effects.

## Executed observations

| Probe                                     | Both browser results                                                                                                                                                                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistent context                        | Guest state survives separate evaluations and callbacks; `persisted` changes from 41 to 42 and remains 42 after interruption.                                                                                                            |
| Nested synchronous native event dispatch  | Guest dispatches `outer`; native listener enters guest, which dispatches native `inner`; its listener enters guest again. Observed order: `outer-enter`, `inner`, `inner-result:false`, `outer-exit`.                                    |
| Native cancellation                       | Both native events have `defaultPrevented: true` and return `false` from native `dispatchEvent()`. Native control without a cancelling listener returns `true` with `defaultPrevented: false`.                                           |
| Host and guest errors                     | A thrown host operation becomes catchable guest error `host-operation-failure`. A throwing guest listener is collected by the host callback adapter; native dispatch still returns `true`.                                               |
| Repeated native-node identity             | Repeated query returns the same cached guest wrapper; guest expando survives.                                                                                                                                                            |
| Guest prototype mutation                  | Adding `label()` to guest `Element.prototype` changes wrapper behavior; native `HTMLElement.prototype` has no such property.                                                                                                             |
| Integrated native DOM/storage/canvas flow | Inner listener changes native input; outer listener writes scoped fixture storage, updates native output and paints `[12,34,56,255]` into an actual canvas pixel. Native readback confirms all values.                                   |
| Ordinary and typed arrays                 | Guest `Uint8ClampedArray` becomes an ordinary number array through JSON and then a native typed array for canvas; this is a copy, with no shared alias claimed.                                                                          |
| Buffer copy contract                      | Host `[1,2,3,4]` becomes guest ArrayBuffer. Later host mutation to `[99,2,3,4]` leaves guest byte 0 equal to 1. Guest byte 1 becomes 77; readback is `[1,77,3,4]`; host input remains unchanged.                                         |
| Promise scheduling                        | Guest `Promise.resolve().then(...)` is incomplete before `executePendingJobs()` and complete afterward.                                                                                                                                  |
| Modules                                   | Static and dynamic import of admitted `local:math` both produce 42; top-level await produces 43 after draining jobs. Unlisted HTTPS module is rejected by the synchronous loader.                                                        |
| Interrupt                                 | A loop is interrupted after a host deadline of approximately 30 ms, returns `InternalError: interrupted`, and the context remains usable. No claim about worst-case interrupt latency follows.                                           |
| Missing/denied capabilities               | Guest `fetch`, `XMLHttpRequest`, `Worker`, `WebAssembly` and `window` are undefined. Unknown host `fetch` operation throws `operation denied`. Guest `eval` and `Function` are engine intrinsics; native eval/Function is never exposed. |

The synchronous event sequence uses `vm.callFunction()` from native event
listeners while the original guest evaluation is still active. It uses neither
Asyncify nor a worker RPC round trip. The wrapper exposes synchronous
[host functions, calls and buffer APIs](https://github.com/justjake/quickjs-emscripten/blob/df4efb9ef2cb25c417ecb57986da462d11b244ed/packages/quickjs-emscripten-core/src/context.ts)
and explicit [runtime jobs, loader and interrupt APIs](https://github.com/justjake/quickjs-emscripten/blob/df4efb9ef2cb25c417ecb57986da462d11b244ed/packages/quickjs-emscripten-core/src/runtime.ts).
The native cancellation observation follows the
[DOM dispatch/cancellation contract](https://dom.spec.whatwg.org/#dom-eventtarget-dispatchevent),
which is why this test checks native return values rather than only a guest flag.

The fixture's listener-error adapter records guest errors instead of throwing
back through `dispatchEvent()`. It does not implement browser error-event
reporting, capture/bubble phases, listener options or the complete Event class.
The guest `Event` is a request record used to construct a native Event; it is not
a complete bidirectional Event wrapper. The pixel method is a fixture helper,
not a `CanvasRenderingContext2D` binding.

## Unchanged application probe

The existing Pitch main bundle was evaluated as supplied, without source
rewriting, after the fixture checks. It is **287,996 bytes**, SHA-256
`5bf9a6fd27798274c5a5c03473a66ee96ecc6bfe8bd4c04c78ac1c93d55ca5ff`.
Both browsers report `TypeError: not a function` at
`unchanged-pitch.js:1:825`. Inspection identifies the bundle's initial
`document.createElement('link').relList` modulepreload check: this fixture has no
`document.createElement`. Evaluation stops before application logic. This is
actual evidence of insufficient binding breadth, not evidence against the
engine's JavaScript parser or evidence that the application runs.

The source was the already acquired local file
`.scratch/app-sw-sources/pitch-main-current.js` in the application-service-worker
research checkout. It is intentionally not vendored into this probe. The source
hash identifies the exact optional input; reproducing that result requires the
same file. The core fixture can run without it.

## Missing Intl and a bounded host example

`typeof Intl` is **`undefined`** in the tested packaged engine in both browsers.
The broader study's application inventory therefore cannot assume native browser
Intl exists inside this QuickJS build. This is separate from the earlier
`document.createElement` blocker in the unchanged Pitch evaluation.

A separate guest `fixtureIntl.DateTimeFormat` class demonstrates a small native
Intl binding without passing a native object into the guest. Its constructor
accepts only the demonstrated `en-GB` locale with UTC, medium date style and short
time style; other options throw. Its `format(0)` synchronously calls a fixed
native formatter and returns `1 Jan 1970, 00:00`; `resolvedOptions()` returns a
JSON copy showing Gregorian calendar, Latin digits and UTC. Both browsers match.
It does not populate global `Intl`, accept the full option space, implement bound
format accessors or qualify the rest of ECMA-402. Native Intl binding or an
appropriately qualified guest implementation remains required for apps that use
those APIs.

## Measurements

These are single local headless runs without warmup or distribution analysis.
The uncompressed engine Wasm is **503,134 bytes**; the esbuild JavaScript bundle,
including fixture and trusted host code, is **97,458 bytes**. The bundle includes
the default package's variant plumbing, so it is not a minimal production size.

| Measurement                                                            | Chromium |                            Firefox |
| ---------------------------------------------------------------------- | -------: | ---------------------------------: |
| `getQuickJS()` elapsed, including loopback engine load                 |   8.8 ms |                              32 ms |
| Runtime/context creation                                               |   2.2 ms | 0 ms at available timer resolution |
| 10,000 guest→host calls with string/number arguments and JSON response |  45.3 ms |                              67 ms |
| 10,000 guest arithmetic iterations, including evaluation               |   0.5 ms |                               1 ms |

These measure this adapter and machine. They do not predict application frame
rates, startup over a network or DOM-heavy workloads. The explicit job queue
also leaves browser-equivalent microtask checkpoints to the host.

## Binding and lifetime work that remains

This is a small hand-built adapter: guest node classes, an operation switch,
native-object IDs, a guest wrapper cache and retained listener handles. It
implements identity by construction. It does not qualify browser brand checks,
DOM inheritance, full property descriptors, live collections, custom elements,
MutationObserver ordering, removal/reattachment or listeners retained across
navigation. All fixture objects are held strongly until teardown; listeners are
removed before disposing the retained delivery handle, context and runtime.
No collection, cycle-breaking or long-session memory claim follows from one
successful disposal.

The previous [browser-binding research](https://github.com/privacy-frames/host/blob/research/wasm-browser-bindings/docs/research/wasm-runtime/browser-binding-reuse.md)
identifies generic marshalling and generated Web IDL wrappers as reusable layers.
This probe deliberately uses the wrapper directly to expose reentry, ownership
and copying. `quickjs-emscripten-sync` was not adopted or benchmarked here: no
claim that generic proxy marshalling supplies a complete or confined DOM follows
from these observations. The companion generated-binding experiment can assess
boilerplate reduction separately.

The runtime is configured with a 32 MiB allocation limit and 512 KiB maximum
stack; only CPU interruption is exercised here. Storage prefixes and the small
operation allowlist are fixture controls, not complete app storage isolation or
a capability design. Guest numeric IDs and helper functions are accessible;
there is no host-origin separation or adversarial DOM object-graph audit.
Broader markup, script attributes, navigation and resource access remain outside
this adapter. Native worker/document/audio environments are covered separately
by the combined study. Application Wasm remains excluded.

## Reproduction and checks

From `research/quickjs`, run `npm ci`, install the matching Playwright Chromium
and Firefox builds if absent, then `npm run probe`. For the optional unchanged
application check, set `STUDY_APP_SOURCE` to the original Pitch bundle path before
running. The runner regenerates its ignored `output/` bundle, records requests
and overwrites both receipts. Source and dependency downloads occur during
preparation; guest module resolution accepts only its in-memory admitted module.

The study passed its browser assertions in both browsers, a standalone TypeScript
check for the three harness files, and Prettier checks. Production tests were not
run because production source and configuration were not changed.
