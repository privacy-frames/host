# QuickJS capabilities for a browser-hosted Privacy Frames runtime

Research date: 2026-11-17. This is factual engine and embedding research for a
complete greenfield host that preserves the existing applications and browser
behavior. It does not select an engine or implement a host. Information-flow
control and reuse of the JSFlow implementation are outside scope.

## What the engine supplies

QuickJS supplies a JavaScript parser, interpreter, ECMAScript objects, module
machinery and promise jobs. It does **not** supply a browser environment. Its
`os.Worker` is a native-library facility with a different interface from web
workers. DOM, browser storage, service workers, worklets and an application-facing
`WebAssembly` API would be host responsibilities. Compiling QuickJS itself to
Wasm does not add those APIs to its guest global object. These conclusions follow
from the engine's context initialization, the separate libc library and its
worker implementation. [Engine initialization][init] · [libc worker][libc-worker]

For this report, **implemented** means present in the inspected engine source;
**host-defined** means the embedder must provide the integration; **unknown**
means neither a source claim nor an application test settles the required
behavior. Engine implementation is not evidence that a particular Wasm build
includes a feature or that an unchanged application works.

| Required surface                                | Upstream engine contribution                                                                                     | Browser/Wasm embedding responsibility                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| JavaScript syntax and ordinary objects          | Broad modern ECMAScript, including async functions/generators, promises, Proxy, collections, BigInt and WeakRef. | Keep the parser and required intrinsics in the build; verify exact application bundles.                         |
| Static ESM, dynamic `import()`, top-level await | Module records/evaluation and promise-based import machinery are implemented.                                    | Supply URL resolution, admitted source loading, import attributes and `import.meta` values.                     |
| Promises and async continuation                 | Runtime job queue and execution APIs.                                                                            | Schedule jobs with events, timers and browser tasks; bridge host promises and errors.                           |
| ArrayBuffer, typed arrays, DataView             | Implemented; release includes resizable buffers and newer typed-array features.                                  | Convert or share bytes deliberately across the Wasm boundary.                                                   |
| SharedArrayBuffer and Atomics                   | Shared-buffer object exists; Atomics is conditional and disabled by the upstream Emscripten preprocessor path.   | Establish actual shared memory, worker transport, build flags and browser deployment requirements.              |
| Dedicated/shared web workers                    | No HTML worker environment; libc offers POSIX-thread `os.Worker`.                                                | Implement browser worker interfaces, globals, lifecycle, messages and transfer semantics.                       |
| Service workers/worklets                        | No implementation in the engine or libc.                                                                         | Supply the corresponding web platform behavior and execution environments.                                      |
| DOM/events/rendering                            | No DOM or renderer.                                                                                              | Bind browser objects or implement the required web interfaces, including object identity and synchronous calls. |
| Storage/network/media/crypto                    | No browser APIs. libc file/process helpers are different facilities.                                             | Provide scoped storage and admitted resource access; bind required graphics, media and cryptographic APIs.      |
| Application Wasm modules                        | No guest `WebAssembly` implementation found.                                                                     | Provide a separately designed Wasm execution/API bridge or interpreter.                                         |

The detailed evidence and qualifications for these rows follow below.

## Revisions: upstream, fork and wrapper are different artifacts

The latest release advertised on Bellard's download page is **2026-06-04**. The
inspected release archive has SHA-256
`b376e839b322978313d929fd20663b11ba58b75df5a46c126dd19ea2fa70ad2a`.
The upstream GitHub `master` observed during research was
**`e585640ffa2cf88ce7c2d587583c6fe15928ec2f`**, committed 2026-11-10.
Its `VERSION` file still says `2026-06-04`; that string therefore does not uniquely
identify release source. The GitHub tags and releases endpoints returned empty
lists; use the dated archive plus hash for the release and a full commit for
unreleased source. [Downloads][downloads] · [Archive][archive] · [Head commit][head]
· [VERSION][version] · [Tags API][tags] · [Releases API][releases]

**QuickJS-NG** is a separate fork with independent releases and C APIs. The
observed head was `a71d444be5f72cb6b3418aff4f05cffb8af3690f` (2026-11-16);
its latest published GitHub release was **v0.18.0**, published 2026-11-01,
tagged at `d7215b0ad3fc2c562e8317fd9bca058fd4863804`. Its own CMake source
has an Emscripten target. Those are NG facts, not upstream QuickJS capabilities.
[NG project][ng-readme] · [NG release][ng-release] · [NG Wasm target][ng-wasm]

**quickjs-emscripten** is a third-party TypeScript/C binding and Wasm build
project. Its observed head was
`7b7af98e4e69757c64c27aac46a74e1e07229545` (2026-07-23); its newest observed
tag was **v0.32.0**, at `df4efb9ef2cb25c417ecb57986da462d11b244ed`.
Both that tag and head vendor upstream `VERSION` **2025-09-13** and NG
**v0.12.1**. The upstream variant also carries a WebKit/Wasm patch. Do not
attribute 2026 upstream features to this wrapper's packaged engine without
updating and identifying its vendored source. The current README still discusses
removed BigFloat extensions, illustrating why source pins matter more than
unqualified comparisons in prose. [Wrapper version][wrapper-package] ·
[Wrapper upstream pin][wrapper-version] · [Wrapper NG pin][wrapper-ng-version] ·
[Tagged upstream pin][wrapper-tag-version] · [Tagged NG pin][wrapper-tag-ng] ·
[Patch][wrapper-patch] · [README][wrapper-readme]

## Language and conformance

The release documentation describes almost complete ES2025 support and nearly
100% Test262 passage **when selecting ES2025 features**. It lists proper tail
calls and `Atomics.waitAsync` as unsupported and ECMA-402 internationalization as
absent. Those are release claims, not a fresh test run or browser conformance
result. Test262 measures ECMAScript; it cannot establish DOM, worker, service
worker or storage compatibility. [Release manual][manual] ·
[Test262 scope][test262]

The release changelog records top-level await in 2024; WeakRef and
FinalizationRegistry in April 2025; JSON modules/import attributes,
`Float16Array`, RegExp `v`, modifiers and `RegExp.escape` in September 2025;
and resizable buffers, `ArrayBuffer.prototype.transfer`, Iterator helpers,
set operations, `Atomics.pause`, precise summation and Uint8Array base64/hex
methods in June 2026. This makes original modern JavaScript plausible without a
mandatory transpilation step; it does not prove compatibility with every bundle.
The old nonstandard bignum extensions were removed in April 2025. [Changelog][changes]

Unreleased head differs materially from the manual:

- `Atomics.waitAsync` is implemented and registered under `CONFIG_ATOMICS`.
  The embedding API has waiter polling and asynchronous wake hooks. The Emscripten
  exclusion discussed below still applies. [Atomics source][atomics] · [API][shared-api]
- Intl and Temporal have source implementations and explicit initialization APIs.
  The Makefile calls them **experimental**, requires compiler support for
  128-bit integers and excludes the default option under `CONFIG_M32`.
  `JS_NewContext()` does not install them; `qjs` adds them only when experimental
  support is built and `--experimental` is requested. Intl installation includes
  constructors such as NumberFormat, Collator and DateTimeFormat. This is evidence
  of implementations, not complete ECMA-402 conformance or verified Wasm32 builds.
  [Build condition][build-options] · [Opt-in initialization][custom-context] ·
  [Intl installation][intl] · [Header APIs][intrinsics]
- The current Test262 configuration includes Intl, Temporal and waitAsync while
  continuing to skip tail-call optimization. A feature entry is test selection,
  not a pass receipt. [Pinned Test262 configuration][test-config]

No current Wasm-build Test262 run was performed for this research. Exact failures,
locale/time-zone coverage and experimental Intl/Temporal feasibility in the
selected Wasm toolchain remain unknown.

## Modules, jobs and browser scheduling

The engine implements static ESM, top-level await and dynamic import. Its dynamic
import code creates a promise and enqueues a job. The runtime accepts custom
module normalization/loading callbacks, including an attribute-aware loader; the
loader returns a module definition synchronously. These hooks do not implement
browser URL fetching, import maps, MIME checks, an installed-resource store or
browser `import.meta` semantics. The libc loader handles files/native libraries
and explicitly sets import metadata. [Dynamic import][dynamic-import] ·
[Loader API][loader-api] · [libc loader][libc-loader]

A host with locally admitted source can satisfy a synchronous loader from its
resource store. If source acquisition must remain asynchronous, that is a design
question: quickjs-emscripten provides Asyncify variants for asynchronous module
loaders. Asyncify suspends the enclosing Wasm module and permits only one pending
suspension at a time; it changes size/performance and reentrancy constraints.
It is distinct from ordinary guest async functions and promises, which work in
synchronous variants. [Wrapper Asyncify explanation][wrapper-readme]

QuickJS exposes job enqueueing, a pending check, single-job execution and a host
promise-rejection tracker. The wrapper exposes `executePendingJobs()` and host ↔
guest promise conversion. Resolving a host operation does not automatically drain
the guest queue. Privacy Frames must decide where microtask checkpoints occur,
how event callbacks enter the guest and how errors/rejections surface. Await,
timers, animation callbacks, MutationObserver and service-worker `waitUntil()`
cannot be treated as one interchangeable async mechanism. The last sentence is
an integration requirement inferred from QuickJS's explicit job API and the
separate browser execution models. [Job/rejection API][job-api] ·
[Wrapper scheduling][wrapper-runtime] · [Worker event loops][web-workers] ·
[Service-worker events][service-workers]

## Typed arrays, shared memory and workers

`ArrayBuffer`, `SharedArrayBuffer`, DataView and numeric/BigInt typed arrays are
engine objects. The source registers the shared-buffer constructor separately
from its conditional Atomics object. **Both the release and inspected head avoid
defining `CONFIG_ATOMICS` under `__EMSCRIPTEN__`.** A build may therefore expose
`SharedArrayBuffer` while lacking `Atomics`; constructor presence does not prove
cross-worker sharing. Host-provided shared-buffer allocation/duplication/free
callbacks are available in C. [Conditional build][engine-options] ·
[Buffer/Atomics registration][typed-arrays] · [Shared-buffer API][shared-api]

One runtime is not a concurrently callable JS heap. Contexts within a runtime can
share guest objects; separate runtimes cannot exchange those objects directly.
The libc `os.Worker` uses POSIX threads and messages, is documented as only close
to Web Workers and lacks nested workers; its clone behavior is documented as
similar to HTML structured clone, with Map/Set limitations. It is not an
implementation of the HTML `Worker`/`SharedWorker` interfaces. The HTML platform
also defines worker globals, loading, lifetime and event loops. [Runtime API
model][wrapper-runtime] · [libc worker source][libc-worker] ·
[Worker documentation][worker-manual] · [HTML workers][web-workers]

Browser execution could place separate QuickJS instances in native workers, but
that alone does not supply guest `Worker`, `SharedWorker`, `MessagePort`,
`importScripts`, module-worker loading or transfer lists. Emscripten pthreads use
browser workers and SharedArrayBuffer and require the deployment's COOP/COEP
headers; enabling those is separate from implementing guest worker semantics.
A shared-memory design must settle which memory is shared and which runtimes can
access it. Browser support and policy remain to be tested. [Emscripten pthreads][pthreads]

Service-worker registration, install/activate, client control, fetch events,
`respondWith`, persistence/restart and update behavior belong to the browser host;
QuickJS has none of those facilities. Similarly, worklets require their own global
interfaces and registration/rendering behavior. Running guest source in a normal
worker cannot establish service-worker or worklet compatibility. [Service worker
specification][service-workers] · [Worklet processing model][worklets] ·
[Engine initialization][init]

## Guest WebAssembly is an additional execution boundary

No `WebAssembly` object or Wasm interpreter/compiler is installed by the inspected
upstream context initialization; no guest WebAssembly API implementation was
found in the inspected engine/header. The wrapper's Wasm loading options load
**the QuickJS engine**, not application `.wasm` modules. Consequently, unchanged
Wasm-using applications such as Squoosh require an additional host facility.
This finding is based on source inspection, not a failing Squoosh execution.
[Engine context][init] · [Engine header][intrinsics] · [Wrapper packaging][wrapper-build]

One possible approach is to bind the browser's native WebAssembly implementation.
That would require guest-facing Module/Instance/Memory/Table/Global objects,
compilation/instantiation promises, imports and exports, error classes, feature
probes and streaming APIs as required by the applications. Imported functions
must call into QuickJS with correct receivers, values and exception behavior.
The JS API defines memory buffers and growth behavior; preserving those semantics
across two runtimes is part of the bridge, not an incidental byte conversion.
These are requirements inferred from the WebAssembly JS API, not a claim that an
existing QuickJS binding implements them. [WebAssembly JS API][wasm-api] · [WebAssembly streaming API][wasm-web-api]

The inspected wrapper exposes copied byte conversion: `newArrayBuffer()` allocates
bytes in its heap, while its C `QTS_GetArrayBuffer()` allocates a new buffer and
`memcpy`s the bytes returned by QuickJS. Those APIs do not provide a live alias to
an arbitrary browser `WebAssembly.Memory.buffer`. Guest typed-array writes,
exported Wasm mutations, growth/detachment, shared memory and callback reentry need
an explicit solution and tests. Whether unchanged Squoosh codec glue can run with
such a bridge remains unknown. An alternative Wasm interpreter compiled alongside
QuickJS would introduce its own feature/embedding requirements; none was evaluated
here. [Wrapper conversion][wrapper-context] · [C copy operation][wrapper-buffer]

## Host objects, synchronous callbacks and lifetime

The C API supports native functions, accessors, opaque host data, custom classes,
prototypes, finalizers, GC marking and exotic property hooks. These mechanisms
can implement guest-visible browser objects, but do not generate Web IDL bindings
or preserve browser identity automatically. A DOM bridge must return the same
guest object within a realm for repeated exposure of the same native node; preserve callback
identity for listener removal; handle receiver checks, exceptions and reentry;
and retain objects for the correct lifetime. These are binding requirements
inferred from the API's explicit object/lifetime model. [Class and exotic API][class-api]
· [Function/property API][function-api] · [DOM event listeners][dom-events]

Values use reference counting plus cycle collection. Embedders must retain/free
handles correctly and expose host-held references to cycle marking; finalizers
cannot execute JS. The wrapper similarly requires explicit handle disposal and
provides `newFunction`, `callFunction`, property definitions and strict/same-value
comparison. Its `dump()` conversion is unsuitable as the identity-preserving
representation of a DOM or callback graph. [C lifetime model][value-api] ·
[Class hooks][class-api] · [Wrapper context implementation][wrapper-context]

Many browser APIs are synchronous from the application's perspective: DOM reads,
event dispatch and localStorage are examples. Moving execution to a worker makes
a message-only main-thread bridge insufficient for those synchronous calls unless
the architecture adds a mechanism preserving their behavior. This is an unresolved
host design constraint, not a QuickJS syntax limitation. IndexedDB, CacheStorage,
fetch/XHR, Blob/File/URL, text encoding, streams, canvas/WebGL, WebAudio and WebCrypto
also require actual bindings or implementations; the libc `std`/`os` modules are
not substitutes for these browser contracts. [DOM][dom-events] ·
[Web Storage][web-storage] · [Engine globals][globals] · [libc][libc-loader]

## Limits, artifact safety and licensing

QuickJS supplies a per-runtime allocation limit, custom allocators, stack-size
settings and a periodically called interrupt callback. These can bound guest
allocations and interpreted work. They do not inherently account for native DOM
resources, storage, transferred buffers or a separately executed application Wasm
instance. A synchronous host callback must return before the interpreter can
observe its next interrupt. Whole-application resource control therefore requires
host accounting and termination behavior as well. [Runtime limits API][limits]
· [Interrupt polling][interrupts]

The upstream Emscripten path also omits automatic `CONFIG_STACK_CHECK` definition.
The inspected wrapper explicitly defines it and sets a 5 MB Wasm stack; these
build settings matter when evaluating `setMaxStackSize`. The wrapper exposes
memory, stack and interrupt APIs. No timeout-latency, allocation-limit or stack
probe was run here. [Upstream options][engine-options] · [Wrapper build][wrapper-build]
· [Wrapper runtime][wrapper-runtime]

Upstream bytecode is version-specific and unvalidated before execution; the
manual says not to accept it from untrusted sources. Evaluate admitted application
**source** or trusted, exactly pinned build output rather than treating downloaded
QuickJS bytecode as a safe interchange format. [Bytecode warning][bytecode-manual]

Upstream QuickJS and quickjs-emscripten use MIT licenses; NG also publishes MIT.
Their notices must accompany copies/substantial portions. A final dependency
inventory must include the chosen wrapper, vendored engine, patches, toolchain
runtime and any extra guest-Wasm implementation. This report does not establish a
license inventory for a future host. [Upstream license][license] ·
[Wrapper license][wrapper-license] · [NG license][ng-license]

## Questions still requiring application or embedding evidence

1. Which exact application bundles use missing language/Intl features, and can the
   chosen upstream or wrapper build run them unchanged? No transpilation or
   polyfill has been assumed.
2. Can a browser-native guest-Wasm bridge preserve the memory aliasing, imports,
   exports and worker behavior expected by the installed Squoosh resources?
3. Can the chosen DOM binding preserve identity, synchronous results, callbacks,
   custom-element behavior and lifecycle without executing application JavaScript
   in the browser's native realm?
4. Which worker, service-worker and worklet contracts are required by the actual
   applications, and can the host supply them under its confinement rules?
5. What ordering and interruption model preserves browser task/microtask behavior
   while controlling guest CPU work and external resources?
6. If using development-head Intl/Temporal or Atomics changes, what exact Wasm
   build flags, toolchain, conformance results and browser deployment requirements
   apply? Published release claims cannot answer that question.

This research inspected primary documentation, pinned source and the release
archive. It did not run Test262, build a new Wasm engine, exercise the application
corpus or test a DOM/worker/Wasm bridge. Those results remain open rather than
being inferred from engine marketing or historical application receipts.

[downloads]: https://bellard.org/quickjs/
[archive]: https://bellard.org/quickjs/quickjs-2026-06-04.tar.xz
[head]: https://github.com/bellard/quickjs/commit/e585640ffa2cf88ce7c2d587583c6fe15928ec2f
[version]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/VERSION
[tags]: https://api.github.com/repos/bellard/quickjs/tags
[releases]: https://api.github.com/repos/bellard/quickjs/releases
[manual]: https://bellard.org/quickjs/quickjs.html#Language-support
[test262]: https://github.com/tc39/test262/blob/main/README.md
[changes]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/Changelog
[init]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs.c#L2687-L2718
[engine-options]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs.c#L68-L78
[intrinsics]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs.h#L416-L438
[build-options]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/Makefile#L44-L48
[custom-context]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/qjs.c#L110-L127
[intl]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/intl/intl.c#L1649-L1725
[test-config]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/test262.conf
[atomics]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs.c#L65092-L65396
[typed-arrays]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs.c#L65368-L65520
[shared-api]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs.h#L956-L967
[loader-api]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs.h#L1000-L1026
[dynamic-import]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs.c#L32110-L32240
[job-api]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs.h#L969-L1038
[libc-loader]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs-libc.c#L551-L764
[libc-worker]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs-libc.c#L3547-L3992
[worker-manual]: https://bellard.org/quickjs/quickjs.html#os-module
[bytecode-manual]: https://bellard.org/quickjs/quickjs.html#Script-evaluation
[globals]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs.c#L58824-L58845
[class-api]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs.h#L497-L584
[function-api]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs.h#L1106-L1195
[value-api]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs.h#L710-L751
[limits]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs.h#L378-L385
[interrupts]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs.c#L8000-L8045
[license]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/LICENSE
[ng-readme]: https://github.com/quickjs-ng/quickjs/blob/a71d444be5f72cb6b3418aff4f05cffb8af3690f/README.md
[ng-release]: https://github.com/quickjs-ng/quickjs/releases/tag/v0.18.0
[ng-wasm]: https://github.com/quickjs-ng/quickjs/blob/a71d444be5f72cb6b3418aff4f05cffb8af3690f/CMakeLists.txt#L345-L361
[ng-license]: https://github.com/quickjs-ng/quickjs/blob/a71d444be5f72cb6b3418aff4f05cffb8af3690f/LICENSE
[wrapper-readme]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/README.md
[wrapper-package]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/package.json
[wrapper-version]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/vendor/quickjs/VERSION
[wrapper-ng-version]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/vendor/quickjs-ng/VERSION
[wrapper-tag-version]: https://github.com/justjake/quickjs-emscripten/blob/df4efb9ef2cb25c417ecb57986da462d11b244ed/vendor/quickjs/VERSION
[wrapper-tag-ng]: https://github.com/justjake/quickjs-emscripten/blob/df4efb9ef2cb25c417ecb57986da462d11b244ed/vendor/quickjs-ng/VERSION
[wrapper-patch]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/vendor/quickjs-patches/0166-webkit-wasm.patch
[wrapper-context]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/packages/quickjs-emscripten-core/src/context.ts
[wrapper-runtime]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/packages/quickjs-emscripten-core/src/runtime.ts
[wrapper-buffer]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/c/interface.c#L704-L737
[wrapper-build]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/packages/variant-quickjs-wasmfile-release-sync/Makefile
[wrapper-license]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/LICENSE
[web-workers]: https://html.spec.whatwg.org/multipage/workers.html
[service-workers]: https://w3c.github.io/ServiceWorker/
[worklets]: https://html.spec.whatwg.org/multipage/worklets.html
[web-storage]: https://html.spec.whatwg.org/multipage/webstorage.html
[dom-events]: https://dom.spec.whatwg.org/#interface-eventtarget
[pthreads]: https://emscripten.org/docs/porting/pthreads.html
[wasm-api]: https://webassembly.github.io/spec/js-api/
[wasm-web-api]: https://webassembly.github.io/spec/web-api/
