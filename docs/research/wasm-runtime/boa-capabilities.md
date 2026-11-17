# Boa capabilities for a browser-hosted Privacy Frames runtime

Research date: 2026-11-17. This assesses a complete greenfield host preserving
application JavaScript and browser behavior. It does not select an engine or
implement a runtime. IFC and the JSFlow implementation are outside scope.

## Version and evidence

The latest GitHub release is **v0.22**, published 2026-08-28. Its source commit is
`337a3668a0dc86dd401ea20906e782249a64a228`; source links below pin that revision.
The checkout's `main` was `bea404d173bf74a64b7c7ae39b1bc2da639abeee` during
research, but development-head changes are not counted as released capabilities.
The homepage's latest-blog list still stops at v0.21. Prefer the release and
pinned source over that list. [Release](https://github.com/boa-dev/boa/releases/tag/v0.22),
[homepage](https://boajs.dev/),
[development revision](https://github.com/boa-dev/boa/commit/bea404d173bf74a64b7c7ae39b1bc2da639abeee).

This is source and upstream-evidence research. No local engine build, browser
execution, application compatibility test, benchmark or confinement test was run.
“Implemented” below means present in this release's source; it does not mean all
related conformance tests pass. “Host-supplied” identifies work outside Boa's
provided implementation; “unknown” identifies a claim these sources do not settle.

## Engine, runtime and Wasm bindings are different products

| Component                        | What the release supplies                                                                                 | What it does not establish                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `boa_engine`                     | ECMAScript parser/compiler, interpreter, builtins, realms, native objects/functions and module/job hooks. | A browser document or browser APIs.                                 |
| `boa_runtime`                    | An example runtime and optional Web API implementations, with explicit registration and host extensions.  | A complete Window, Worker or ServiceWorker environment.             |
| `boa_wintertc`                   | A new home for common runtime APIs; some implementations are migrated, others are placeholders.           | Complete TC55 compliance merely by calling `register`.              |
| `boa_wasm` / `@boa-dev/boa_wasm` | `wasm-bindgen` evaluator usable from browser JavaScript.                                                  | A persistent application session or an object-level browser bridge. |

Sources: [engine exports](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/lib.rs),
[runtime registration](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/runtime/src/lib.rs),
[WinterTC registration](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/wintertc/src/lib.rs),
[Wasm evaluator](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/ffi/wasm/src/lib.rs).

The evaluator creates `Context::default()` on every call, evaluates a script and
returns a display string, including stringified errors. It does not register
runtime APIs, expose retained guest objects, accept host functions, run module
entry points or drain promise jobs. A full host would need a custom embedding
using the Rust APIs; installing the npm package is insufficient. Its broad README
claims, including “Full Intl API support,” must be read against actual feature
configuration and conformance gaps. [Evaluator source](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/ffi/wasm/src/lib.rs),
[package README](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/ffi/wasm/README.md).

## Actual Wasm/browser embedding evidence

Upstream explicitly documents `wasm32-unknown-unknown`: enable the engine's `js`
feature and select getrandom's `wasm_js` backend. That feature provides bindings
for system utilities, including randomness/time; it does not forward arbitrary
browser objects into the guest. The Wasm crate uses `wasm-bindgen`, enables Annex B,
experimental, bundled Intl, Temporal, Float16 and sumPrecise features, and configures
wasm-opt for bulk memory and nontrapping float-to-int. Rust 1.91.0 is the workspace
minimum. [Build instructions](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/README.md#-web-assembly),
[engine features](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/Cargo.toml),
[Wasm manifest](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/ffi/wasm/Cargo.toml),
[workspace](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/Cargo.toml).

The release includes CI that builds with wasm-pack and runs headless Chrome and
Firefox tests. Its browser test evaluates one greeting function. These are useful
embedding evidence and a reproducible upstream path, but neither the workflow
file nor this test proves complete web compatibility, Safari/mobile support,
threaded Wasm, or the custom host's eventual browser support. [Workflow](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/.github/workflows/webassembly.yml),
[browser test](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/ffi/wasm/tests/web.rs).

## Language compatibility

Upstream reports 95.60% Test262 conformance for v0.22. The stored report identifies
both the engine revision above and Test262 revision
`d86b2294eb0a17eaa281ff12c73c473ec864c72f`: 53,578 total, 51,225 passed,
1,781 ignored and zero recorded panics, leaving 572 non-passing, non-ignored tests.
The published percentage includes ignored tests in the denominator. The report
was produced by a native cargo runner, not a full browser-Wasm compatibility run.
It must not be interpreted as a percentage of websites supported.
[Release](https://github.com/boa-dev/boa/releases/tag/v0.22),
[pinned report](https://github.com/boa-dev/data/blob/2f0a5c2fdb4eb6e4020965e26f939bd7e4cf2005/test262/refs/tags/v0.22/latest.json),
[report calculation](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/tests/tester/src/results.rs),
[release runner](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/.github/workflows/test262_release.yml).

The release implements modern language machinery including classes, promises,
generators, async generators, modules, typed arrays, proxies and weak references;
Temporal is now enabled by default, and v0.22 adds FinalizationRegistry and iterator
helpers. This is a basis for running original JavaScript without a mandatory
transpilation step, not a guarantee that an application's syntax and semantics
all work. [Builtins and registration](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/builtins/mod.rs),
[release changes](https://github.com/boa-dev/boa/releases/tag/v0.22).

Concrete declared gaps include symbols as weak-map keys, duplicate named RegExp
groups, explicit resource management, joint iteration, and Intl DisplayNames,
RelativeTimeFormat, enumeration and DurationFormat. The test configuration also
excludes selected Intl canonicalization/hour-cycle tests, a RegExp named-group
case, staging panic/OOM cases and source-phase import cases. Proposal exclusions
are mixed with completed-standard feature gaps: inspect the required application's
actual features rather than treating every ignored proposal as a browser baseline.
Annex B and Intl are opt-in engine features; the supplied Wasm crate enables them.
[Exact exclusions](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/test262_config.toml),
[feature flags](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/Cargo.toml).

No source transformation or polyfill is required by the engine API itself.
Whether the current apps need either remains unknown until their real bundles
are exercised. A polyfill cannot by itself give a guest access to native DOM,
worker scheduling or browser-owned Wasm memory.

## Modules, promises and scheduling

**Implemented:** source modules, asynchronous module evaluation/top-level-await
machinery, dynamic import and `import.meta` hooks. **Host-supplied:** URL resolution,
resource admission, fetch/load behavior, module caching identity and the browser's
script-element loading rules. `ModuleLoader::load_imported_module` is asynchronous
and requires repeated successful loads for a referrer/specifier pair to return
the same module. The filesystem `SimpleModuleLoader` expressly refuses Wasm
targets; an embedded/map/custom loader is needed. [Loader](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/module/loader/mod.rs),
[module implementation](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/module/mod.rs),
[asynchronous module evaluation](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/module/source.rs).

Promises/async functions do not imply an automatically running browser event loop.
The host must drive jobs. `JobExecutor` supports promise, native async, timeout,
interval and generic jobs; `SimpleJobExecutor` is the default, described upstream
as limited for a custom event loop. Runtime timers enqueue Boa jobs rather than
registering native browser timers. Integration must establish browser task and
microtask checkpoints, event delivery and rejection reporting. Rust
`NativeFunction::from_async_fn` returns a guest Promise; converting native browser
Promises into that path remains bridge work. [Jobs](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/job.rs),
[timers](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/wintertc/src/timers/mod.rs),
[native async functions](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/native_function/mod.rs).

## Web APIs and execution environments

| Area                     | Released implementation                                                                                                                                | Host responsibility / remaining uncertainty                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Common runtime utilities | Console, timers, queueMicrotask, base64 and structured clone have implementations in WinterTC and runtime reexports.                                   | Register them; establish scheduling, logging and resource policy; validate required clone/transfer behavior.                                                         |
| Fetch                    | `boa_runtime::fetch` has Request/Response/Headers and an async `Fetcher` backend contract.                                                             | Supply an admitted local-resource backend and browser-compatible response behavior. A blocking reqwest feature is optional and not a browser backend.                |
| URL/text/abort           | Implementations remain in runtime modules, with feature/extension registration.                                                                        | Check required options and semantics against applications.                                                                                                           |
| Events                   | WinterTC EventTarget/Event/CustomEvent/ErrorEvent/MessageEvent are TODOs; registration returns success without defining them.                          | Native event wrappers, dispatch, listener identity, cancellation and browser integration.                                                                            |
| DOM/rendering            | No Window/document/Element, layout, canvas or WebGL implementation appears in engine builtin or runtime registration.                                  | Supply bindings and native browser behavior, or another implementation.                                                                                              |
| Storage                  | No localStorage, sessionStorage, IndexedDB or CacheStorage registered by these crates. WinterTC `store` is serialization support for structured clone. | Implement application-scoped storage APIs and their async/event/lifetime semantics.                                                                                  |
| Dedicated/shared workers | Runtime `message` registers postMessage through a host `MessageSender`; no Worker/SharedWorker constructor or execution environment is supplied.       | Create guest contexts, load worker entry points, deliver messages, transfer values and terminate execution.                                                          |
| Service workers          | No ServiceWorker registration, lifecycle, controlled-client model or FetchEvent implementation supplied.                                               | A browser service worker may host/interact with an embedding, but that does not make guest SW APIs work. Guest lifecycle and authority need an explicit host design. |
| Worklets                 | No AudioWorklet/PaintWorklet execution environment supplied.                                                                                           | Thread/scheduling integration and synchronous callback contracts remain unproved.                                                                                    |

Sources: [runtime surface](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/runtime/src/lib.rs),
[extensions](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/runtime/src/extensions.rs),
[fetch contract](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/runtime/src/fetch/mod.rs),
[runtime features](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/runtime/Cargo.toml),
[event placeholders](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/wintertc/src/events/mod.rs),
[message adapter](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/runtime/src/message/mod.rs).

The WinterTC crate's introductory claim of automatic compliance is contradicted
by its actual placeholder registrations: encoding, URL, abort and fetch are
migration TODOs. Depending on it alone does not provide those APIs. Native runtime
implementations and similarly named WinterTC modules must be checked separately.
[Encoding](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/wintertc/src/encoding/mod.rs),
[URL](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/wintertc/src/url/mod.rs),
[abort](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/wintertc/src/abort/mod.rs),
[fetch](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/wintertc/src/fetch/mod.rs).

## Typed arrays, shared memory and guest WebAssembly

Boa implements ArrayBuffer, DataView, typed arrays, SharedArrayBuffer and Atomics,
including waitAsync. Blocking Atomics.wait consults the host's `can_block` setting;
the futex implementation uses Rust synchronization primitives. Its tests exercise
native Rust threads. This establishes ECMAScript machinery, not browser-Wasm
thread support, native SharedArrayBuffer aliasing or zero-copy transfer across
separate Wasm instances. Those remain unknown for a browser embedding; a shared
buffer inside Boa is not automatically the browser's SharedArrayBuffer object.
[Buffers](https://github.com/boa-dev/boa/tree/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/builtins/array_buffer),
[Atomics](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/builtins/atomics/mod.rs),
[futex](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/builtins/atomics/futex.rs),
[threaded tests](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/builtins/atomics/tests.rs).

**Running Boa as Wasm does not provide guest `WebAssembly`.** No WebAssembly
global is registered in this release. Upstream's guest-Wasm support tracker is
open; its proposed runtime bindings are distinct from compiling Boa to Wasm. A
binary-parser prototype was closed without merging. Consequently the existing
Squoosh/PhotoCraft Wasm use is a substantive missing integration, not something
settled by the playground. [Builtin registry](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/builtins/mod.rs),
[guest-Wasm tracker #4379](https://github.com/boa-dev/boa/issues/4379),
[unmerged parser #4771](https://github.com/boa-dev/boa/pull/4771).

A host could investigate wrapping the browser WebAssembly API or embedding a
separate interpreter. Neither route is provided here. Compatibility must include
synchronous exports/import callbacks, Memory.buffer identity and growth,
Table/Global objects, typed-array aliasing, instantiateStreaming, errors and
BigInt conversions, plus worker/shared-memory use where required. Copying each
buffer across the boundary is insufficient when guest JS must observe Wasm memory
changes directly. These are research obligations inferred from the required guest
API, not claims that a particular bridge is feasible. The linked JS interface
is the current editor’s draft. [WebAssembly JS interface](https://webassembly.github.io/spec/js-api/).

## Synchronous DOM bindings and object lifetime

Rust native functions synchronously receive `this`, argument values and a mutable
Context, returning a guest value or error. Native classes can expose prototypes,
methods and accessors; objects carry traced Rust data. Boa object identity is
pointer identity, so a host can retain and reuse guest wrappers. These are useful
building blocks for DOM bindings; none automatically converts a browser Node into
a Boa object. [Native functions](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/native_function/mod.rs),
[class example](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/examples/src/bin/classes.rs),
[object identity](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/object/jsobject.rs).

An embedding would need stable mappings in both directions so repeated node
lookups preserve `===`, expandos, prototypes and listener removal. It must root
callbacks correctly across Boa GC and browser GC, release detached objects, preserve
receivers/exceptions and implement Web IDL conversions. Main-thread Wasm imports
can form a synchronous bridge in principle; running Boa in a worker requires an
additional strategy for synchronous DOM reads and callback reentry. Whether Boa's
mutable-context borrowing permits every required synchronous browser callback
pattern safely is unresolved. This needs a targeted probe of guest → DOM → guest
reentry and nested event dispatch, not an assumption based on native function
registration. [Native closure tracing constraints](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/native_function/mod.rs),
[DOM object/event semantics](https://dom.spec.whatwg.org/),
[Web IDL bindings](https://webidl.spec.whatwg.org/).

## Limits, memory, threading and licensing

RuntimeLimits exposes loop-iteration, stack-size, recursion and backtrace limits.
Defaults are unlimited loop iterations, recursion 512, VM stack 10,240 and
backtrace 50. There is no heap quota in this interface. GC uses thread-local state
and a collection threshold that can grow; this is not an application memory cap.
HostHooks also offers a per-buffer allocation ceiling (default 1.5 GiB in
implementation bytes); it does not cap aggregate heap use. The Wasm allocator,
linear-memory configuration and host-held objects also need accounting. Recovery from allocation failure and an appropriate browser memory
budget remain unverified. [Limits](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/vm/runtime_limits.rs),
[GC](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/gc/src/lib.rs),
[allocation hook](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/context/hooks.rs).

Scripts offer cooperative async evaluation with a configurable instruction-cost
budget. This yields execution; it is not a wall-clock deadline or preemption
inside arbitrary native callbacks. The instruction counter API is gated by `fuzz`.
SimpleJobExecutor's cancellation token stops pending-job processing, rather than
interrupting an already executing infinite script. A robust termination strategy
for hostile code, including native calls, parse/compile work and allocations,
remains a host requirement. [Async evaluation](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/script.rs),
[counter feature gate](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/context/mod.rs),
[executor cancellation](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/job.rs).

The engine also offers a `jsvalue-enum` feature as a portability fallback for
platforms incompatible with its default NaN-boxed value representation; the
release Wasm wrapper does not enable that fallback.
[Value feature](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/Cargo.toml).

The embedding APIs use Rc/RefCell and explicitly describe themselves as
single-threaded. Do not infer that a Context can migrate between browser workers
or be accessed concurrently. The optional Test262 harness also spawns Rust
threads for its agents; it is not a web Worker API. Neither it nor native multi-context Atomics tests establishes
the browser-Wasm build's threading model. [Module API](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/module/loader/mod.rs),
[job API](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/job.rs),
[Test262 agents](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/runtime/src/test262.rs).

Boa is dual licensed `Unlicense OR MIT`, including the Wasm wrapper. This supports
redistribution under either choice, subject to the selected license's terms.
Dependencies and bundled ICU data require a separate distribution inventory.
No application-scale browser-Wasm performance or binary-size measurement was
established in this research. [Workspace license](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/Cargo.toml),
[MIT license](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/LICENSE-MIT),
[Wasm dependencies](https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/ffi/wasm/Cargo.toml).

## Questions still requiring evidence

1. Which exact language gaps occur in the existing application bundles, with the
   intended Boa features enabled? Run original bundles before proposing transforms.
2. Can a persistent Wasm embedding preserve DOM identity and safely reenter guest
   callbacks synchronously, including nested events and exceptions?
3. How will guest WebAssembly expose browser memory without breaking typed-array
   aliasing, callback semantics or confinement?
4. Which worker, service-worker and worklet behaviors are required by the apps,
   and can a host supply their execution/lifecycle contracts?
5. Can the host coordinate native browser tasks with Boa jobs while enforcing
   deadlines, cancellation and memory budgets across all guest contexts?
6. What browser/version/device combinations pass those probes? Existing upstream
   smoke tests and historical Privacy Frames receipts do not answer that question.
