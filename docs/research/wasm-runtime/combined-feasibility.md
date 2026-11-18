# Feasibility of the guest-engine architecture

Study date: 2026-11-18. The proposed host runs application JavaScript in a Wasm
JavaScript engine and uses the browser's real DOM, rendering, workers and audio
facilities through host bindings. Application Wasm and application service-worker
execution remain deferred. This study changed no production runtime or deployment.

## Recommendation

Proceed toward a QuickJS-based host with generated guest Web IDL interfaces and
explicit native forwarding. Both QuickJS and Boa passed the main synchronous
callback requirement, including real native event cancellation. QuickJS has the
stronger tested integration path: its existing Wasm wrapper worked in workers,
child documents and an adapted AudioWorklet, and the generated interface fixture
ran successfully. Boa is viable for the callback mechanism, but the same generated
bundle failed and needs diagnosis before it can support the proposed binding layer.

The central implementation risk is providing enough browser behavior for unchanged
applications. Neither engine plus a handful of host functions supplies that layer.
The unchanged Pitch Training bundle stopped at missing DOM APIs in both fixtures,
before reaching application logic.

## Executed evidence

All browser results below came from Chromium 153.0.8010.12 and Firefox 155.0 on
local Linux. Both engines were compiled to Wasm and executed inside the browser.
The QuickJS package was quickjs-emscripten 0.32.0, with its vendored upstream
2025-09-13 engine. Boa was pinned to v0.22. The findings do not establish behavior
of other builds or mobile browsers.

| Requirement                                 | Observation                                                                                                                                                | Consequence                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Persistent guest state                      | Passed for both engines.                                                                                                                                   | The host can retain an application environment across callbacks.                                                                |
| Synchronous native events                   | Both ran guest → native dispatch → guest callback, nested dispatch and cancellation before native dispatch returned.                                       | Main-thread engine placement supports the required event mechanism.                                                             |
| Boa context borrowing                       | Ordinary persistent RefCell borrowing rejected callback reentry; scoped mutable-context lending passed the fixture without unsafe code in the embedding.   | Boa needs an explicit context-lending design and review of its supporting dependency.                                           |
| Native-object identity and guest prototypes | Both retained cached guest wrappers and allowed guest prototype extension. QuickJS's generated fixture also passed interface checks and live native reads. | Guest prototype modification need not modify native browser prototypes. Full DOM identity and lifetime remain integration work. |
| Modules and promises                        | Both ran admitted static/dynamic modules and explicitly drained guest jobs.                                                                                | Scheduling checkpoints and module resolution belong in the host.                                                                |
| Storage and canvas                          | Both performed bounded native storage/canvas operations through fixtures.                                                                                  | The bridge works; complete Storage, IndexedDB and Canvas interfaces were not implemented.                                       |
| Dedicated/shared workers                    | QuickJS persisted state inside real browser workers and across two SharedWorker ports.                                                                     | The selected native-context architecture has an executable path. Equivalent Boa worker fixtures were not run.                   |
| Child documents                             | A real iframe's QuickJS guest called its parent and was synchronously reentered.                                                                           | Synchronous cross-context calls are possible. WindowProxy, native DOM traversal and navigation semantics remain unqualified.    |
| Buffer transport                            | Native/guest copying, guest buffer/view detachment through a captured intrinsic, and fixed-shape reconstruction in a worker all passed.                    | General structured-clone graphs, transfer-list validation and failure semantics still need implementation.                      |
| Ordinary audio                              | Guest samples reached a native offline audio graph; analyser data returned to the guest.                                                                   | Buffer-copy operations work. Live microphone, user activation and playback remain application acceptance tests.                 |
| AudioWorklet                                | Raw QuickJS loader failed on missing TextDecoder. A trusted loader adapter enabled guest processing and messages in both browsers.                         | A worklet-specific engine build or qualified loader adapter is needed. No live DSP timing claim follows from offline samples.   |
| Intl                                        | Both default tested builds lacked Intl. Boa's bundled-Intl build formatted dates successfully; a narrow QuickJS native formatter binding also worked.      | Intl must be explicitly supplied for applications such as Pitch Training.                                                       |

The uncompressed Wasm binaries were 503,134 bytes for the tested QuickJS build,
5,971,064 bytes for Boa, and 20,836,055 bytes for Boa with bundled Intl. These
build configurations are not a production size comparison. QuickJS's host-call measurements are single local
samples. They do not predict browser application frame rates or establish a
performance ranking between the engines.

## Where the code becomes simpler

Guest Object, Function and DOM interface prototypes belong to the guest engine.
The host no longer needs application JavaScript to share its native intrinsic
objects. The fixtures demonstrated guest prototype extension without changing
the corresponding native prototype. This removes the original reason for much
of the shared-realm prototype hardening, provided the new bridge never exposes
native execution or an unrestricted native object graph.

Guest eval, Function and module evaluation can remain guest operations. Script
elements, event-handler attributes and worker entry scripts still need routing
into the guest. The old native script execution and URL-rewriting mechanisms are
not the default implementation to carry forward. Installation capture, admitted
resource storage, manifest handling, manager UI and the host service worker are
useful reuse candidates, subject to their existing evidence and the new format.

Generated Web IDL wrappers can supply argument conversion, brands and prototype
boilerplate. A small generated native-backed interface passed those checks in
QuickJS. Its forwarding implementation still belongs to the host; generation
does not decide whether a browser operation is allowed. The complete interface
inventory, special HTML behavior and cross-heap object ownership will account
for much of the new runtime.

## Confinement still crosses the native DOM boundary

The generated-binding experiment included a deliberately permissive diagnostic
that inserted a benign native script through a host function. Its marker executed
outside QuickJS in the unrestricted control. A script CSP blocked that insertion
while allowing the trusted bootstrap and Wasm engine. This is direct evidence
that interpreter isolation alone does not prevent a permissive DOM binding from
returning execution to the native browser environment.

The new host therefore still needs these properties:

- Guest source executes only in a guest engine, including dynamically supplied
  scripts, handler strings and child-context code.
- Native contexts start from trusted bootstraps and receive their policy before
  executing guest code.
- Browser resource requests receive admitted local bytes or fail. A missing
  resource never triggers a network fallback.
- Native effects such as navigation, markup-triggered loading and browser-owned
  services are mediated even when they originate outside guest JavaScript calls.
- Returned objects and callbacks preserve the boundary instead of exposing native
  globals or unrestricted execution. Host functions validate guest-controlled data.

The experiments do not prove that inventory complete. They also do not establish
cross-application storage isolation, which is outside the agreed confinement
claim. The existing browser-effects investigation remains relevant to the native
DOM and host policy, even after replacing shared-realm JavaScript execution.

## Route to the full implementation

Build the guest browser layer around a common operation and ownership model,
using generated interfaces where they reduce maintained code. Keep sensitive
operation policy explicit rather than treating generic object marshalling as
authorization. Use the tested main-thread, worker and child-document mechanisms
as implementation evidence, with one scheduler/resource policy across them.

The first complete vertical integration should run unchanged Pitch Training:
initial markup, DOM/events, modules, dates, storage, workers, audio and offline
resource delivery through the real manager. Use its first missing interface to
expand general bindings, with independent fixtures for each semantic rule.
Then qualify the remaining in-scope applications and host diagnostics. PhotoCraft
and Squoosh remain later requirements because application Wasm is deferred;
Excalidraw's Wasm-dependent features need explicit qualification.

Before a release, qualify general guest transfer semantics, listener and node lifetime,
browser error delivery, microtask checkpoints, child-document behavior and the
applicable audio operations. Reuse the existing confinement tests as inputs,
adding tests for new native execution paths and controls showing that the tested
operations work when unrestricted. Preserve the existing demonstration until the
fork passes its own application and policy acceptance tests.

## Evidence artifacts

- [QuickJS main-thread study][quickjs]: harness, locks, browser receipts and the unchanged Pitch input hash.
- [Browser contexts and audio][contexts]: worker, iframe, native transfer and AudioWorklet fixtures with controls.
- [Generated native-backed interfaces][bindings]: generator inputs, native forwarding, browser receipts and script CSP control.
- [Boa browser study][boa]: pinned Rust embedding, default-borrow negative control, scoped callback path, generated-bundle failure and Intl build results.

[quickjs]: https://github.com/privacy-frames/host/blob/8036da0dbdf14239002a269f3d41d939849da55a/docs/research/wasm-runtime/feasibility-quickjs.md
[contexts]: https://github.com/privacy-frames/host/blob/42614dc41dfc1212009b1b6a564dbb48f28102c2/docs/research/wasm-runtime/feasibility-contexts.md
[bindings]: https://github.com/privacy-frames/host/blob/9c0719cf75fbf1283da8bef8cdaa6039272c201a/docs/research/wasm-runtime/feasibility-bindings.md
[boa]: https://github.com/privacy-frames/host/blob/ddc0a102aefde49304efb20ab3fb8db335e07333/docs/research/wasm-runtime/feasibility-boa.md
