# Application WebAssembly inside a Wasm JavaScript engine

Research date: 2026-11-17. This report addresses ticket 14 for the greenfield
Privacy Frames host. The main application engine runs on its browsing context's
main thread; application workers each run a guest JavaScript engine in a browser
Worker. Rendering uses the browser's DOM. Application JavaScript and Wasm binaries
are unchanged inputs. No engine is selected here. No runtime build, browser probe
or application qualification was performed; this is source research.

## Finding

There is an established implementation worth studying: **txiki.js embeds WAMR
alongside QuickJS-NG and implements a guest WebAssembly API**, including live
ArrayBuffer views, synchronous imported JavaScript functions and explicit memory
buffer invalidation. This provides substantially stronger evidence than a proposed
interpreter integration. It is a native runtime, however, and its current facade
has material limitations. Its source is reusable research evidence, not an
already qualified browser embedding. [Implementation][tjs-c] · [Facade][tjs-js] ·
[Build][tjs-build]

The browser's native WebAssembly implementation remains another credible execution
backend. Synchronous imports and exports are established platform behavior. The
missing part is joining its memory to the guest engine's actual ArrayBuffer and
typed-array machinery. The inspected QuickJS wrappers copy bytes; Boa's ordinary
buffer stores owned aligned vectors. Neither establishes a live alias to an
arbitrary native browser memory. A host-object wrapper alone cannot give ordinary
guest typed-array operations the required backing storage. [QuickJS API][qjs-h] ·
[QuickJS wrapper][qjs-wrapper] · [Boa backing store][boa-buffer]

For nonshared memories, an explicit copy-at-every-control-boundary design is also
an experiment worth bounding. It must establish equivalent observable behavior,
including callbacks, growth, exceptions and old views; copying once at instantiation
or only before/after exports is insufficient. Shared memory with concurrently
executing workers requires actual shared storage or a substantially different
execution design. These are integration deductions, not implemented support.

## Evidence baseline and inspected revisions

The prior research establishes that compiling QuickJS or Boa to Wasm does not
install application-facing `WebAssembly`. It records eight applications and eleven
visible examples, with Squoosh and PhotoCraft among the Wasm consumers. Historical
selected-task passes do not qualify all their workflows or threaded Wasm.
Read this report with the pinned [QuickJS research][prior-qjs], [Boa research][prior-boa],
[browser-binding research][prior-bindings] and [application contract][prior-apps].

| Source                    | Revision inspected                                                                                  | What that establishes                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| txiki.js                  | `c13adc667e3e7761ff4d0c12a6ea34efceb4e1ea`                                                          | Existing QuickJS-NG/WAMR WebAssembly binding and regression-test source.             |
| txiki.js vendored engines | QuickJS `7b5f588e0f9b643e2996f291bfc861abeaceddc2`; WAMR `8c18e3f68b16c4bcaf05996b2636f6ed2b4cf629` | Exact dependency pins of that implementation; separate from current upstreams below. |
| Upstream QuickJS          | `e585640ffa2cf88ce7c2d587583c6fe15928ec2f`                                                          | External-pointer buffer constructor and explicit detach API.                         |
| Boa v0.22                 | `337a3668a0dc86dd401ea20906e782249a64a228`                                                          | Owned buffer representation; existing engine baseline.                               |
| Wasmi                     | `d6188fb1835a8fbfcb2208e00ff7c2c5d5de1392`; published API 2.0.0                                     | Interpreter, host calls, data access and static backing support.                     |
| WAMR                      | `69372c5b29b14cb8dddf2990988876cc5db9bd05`                                                          | Current interpreter/build/API evidence, not the txiki.js vendored revision.          |
| Wasm3                     | `28ecb9af6d2040e474a70f7cb7f43666740141fb`                                                          | Browser compilation claim, feature matrix and maintenance status.                    |

The source links below include the relevant pins. The txiki dependency pins come
from its [repository tree][tjs-tree]. Standard links describe requirements rather
than browser support receipts; the current JS API publication is a Candidate
Recommendation Draft and the Web API link is an editor's draft.

## The application contract is broader than compiling a module

The bridge must expose guest Module/Instance/Memory/Table/Global objects, callable
exports, imports, appropriate conversion/errors and asynchronous compilation APIs.
Synchronous `new WebAssembly.Instance` can run a start function that immediately
calls an import. Numeric, BigInt and reference values require typed conversion;
throwing imports must preserve their observable exception behavior. A Module's
metadata is useful for inventorying dependencies, but a parser/validator alone is
not execution support. [JS API][js-api]

Compilation and `instantiateStreaming` also need admitted resource bytes, correct
Response/MIME behavior and guest promise settlement. The native implementation
must never acquire a network fallback when local bytes are unavailable. The
Web API defines streaming compilation and serialization separately from the core
JS embedding. [Web API][web-api] · [Repository instructions](../../../AGENTS.md)

### A concrete Squoosh example

Three production resources were fetched during this research and matched the
repository's recorded SHA-256 values exactly. This is source evidence, not a new
Squoosh execution receipt. [Recorded snapshot][squoosh-receipt]

| Resource                            | SHA-256                                                            | Observed contract                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AVIF decoder glue][sq-dec]         | `ccbdafcf4437c4b88a964f25f87ac38e24a038dbb9cfd80b5bf5a59f18e92870` | Constructs several typed views over the same memory buffer; grows memory and refreshes heap views; uses streaming instantiation with a byte fallback. |
| [Threaded AVIF encoder glue][sq-mt] | `3cfe7361e3cc498f8a71c25065c8376fd3654eae0660778b4299fe17cb33a19b` | Constructs shared WebAssembly.Memory, checks its buffer against SharedArrayBuffer, uses Atomics and heap views.                                       |
| [Thread worker glue][sq-worker]     | `f5ceeb2625c7f8335ef7ac7980edf9d79fda04102ee2ce98f6996a7f3b08d490` | Receives wasmModule/wasmMemory in a message, takes memory.buffer and synchronously instantiates the supplied Module.                                  |

The presence of the threaded resources does not prove that every deployment selects
them. Feature detection, isolation headers and exact workflow selection need a
probe. It does prove that advertising complete Squoosh support requires resolving
that path rather than silently replacing it with an app-specific fallback. The
PhotoCraft API inventory remains an explicit gap in the prior application report;
this investigation does not infer its codec/thread requirements from Squoosh.

## Native browser Wasm: execution is established, storage integration is open

### Live buffers and growth

For ordinary fixed-length unshared Wasm memory buffers, the same memory must be
observable through all its typed-array/DataView aliases. Successful growth,
including `grow(0)`, invalidates the previous fixed-length buffer and its views.
Shared-memory growth has different behavior: existing SharedArrayBuffer views
retain their old length and shared contents; a newly obtained buffer can cover the
larger range. A bridge must account for the exposed buffer mode and must not apply
unshared detachment rules indiscriminately. [Memory growth behavior][memory-grow]

QuickJS's `JS_NewArrayBuffer` can wrap an existing C pointer without copying and
`JS_DetachArrayBuffer` clears dependent views. In an ordinary wasm32 build, that
pointer addresses the engine module's linear memory. It does not name storage in
another browser WebAssembly.Memory. Boa similarly dereferences its own owned
buffer storage. Thus “external buffer” means external to the JS heap's allocation
ownership, not arbitrary browser ArrayBuffer access. This conclusion follows from
the inspected storage implementation and Wasm's memory-addressing model.
[QuickJS implementation][qjs-c] · [Boa store][boa-buffer] · [Core memories][core-memory]

Importing the engine's entire linear memory into an application module is not a
general solution: unchanged binaries may define their own memory, and unrestricted
application loads/stores would gain access to the interpreter's heap and metadata.
Multi-memory by itself does not retarget the existing engine's C/Rust buffer
accesses. A suballocation would require address translation or another execution
mechanism, not just an ArrayBuffer view. These are architectural deductions from
the same address model; no such integration was implemented or qualified here.

Three native-backend integrations remain distinct:

- **Engine-native external backing implementation:** change the guest engine's
  buffer and typed-array operations to operate on browser-managed storage through
  a deliberate backend. This could preserve original app source, but is engine
  implementation work. No inspected QuickJS/Boa wrapper supplies it.
- **Guest buffer/typed-array facade forwarding every access:** replace or extend
  guest binary intrinsics and all their consumers to work on native handles.
  A generic Proxy cannot acquire typed-array internal slots or pass every native
  brand check. The design must cover indexing, subarray, DataView, constructors,
  methods and native API BufferSource conversions. It is speculative integration,
  not a ready library. [Typed-array internal methods][ecma-typed]
- **Mirrors with synchronous synchronization:** keep real guest buffers, copy
  guest → native before each export, native → guest before every imported callback,
  guest → native after that callback, and native → guest on return or throw.
  Also handle construction/start functions, reentrant exports, imported/shared
  memories, globals/tables referencing functions, growth inside callbacks and
  transfer/detach restrictions. Nonshared execution may admit this approach because
  guest code observes memory at control boundaries. Completeness, copy cost and
  unchanged codec behavior remain unproved. Concurrent shared-memory mutation
  defeats a simple snapshot model.

The repository already has a deliberately bounded [mirrored-memory experiment][old-probe]
with numeric FFI and one memory. It relies on native guest WebAssembly.Memory and
is not a QuickJS/Boa implementation. Its own declaration excludes a full facade.
Its results cannot establish the new host's backing-store solution.

### Synchronous calls and callback reentry

Native exports and imports can nest synchronously. The proposed call sequence is
`guest JS → host bridge → native app Wasm → imported host trampoline → guest JS`,
possibly followed by another export call before the first returns. The platform
permits this execution structure; the embedding must preserve guest context access,
roots, pending exceptions and state through it. [Function conversion/calls][js-functions]

For QuickJS, synchronous C functions and `JS_Call` provide building blocks. For
Boa, an exported browser callback that tries to borrow an already borrowed mutable
Context can fail even though the Wasm engine permits reentry. The prior binding
report identifies RefCell-based mutable adapters that reject recursive calls.
Do not use Asyncify suspension, host Promises or a worker round trip to satisfy a
required synchronous imported function. [QuickJS API][qjs-h] · [Binding evidence][prior-bindings]

## Embedded execution: concrete candidates and missing integration

### txiki.js with QuickJS-NG and WAMR

The C implementation uses `wasm_runtime_call_wasm_a` for exports and an import
trampoline that invokes guest JavaScript. It retains guest references and tracks
pending imported exceptions. Its memory getter caches a true QuickJS ArrayBuffer
alias over WAMR's memory pointer. It checks base/size changes **before calling an
imported guest callback**, as well as after export calls, so a growth instruction
cannot leave the callback using a freed old allocation. JS-side bound memory growth
explicitly drops the old buffer, including the zero-growth case. [C binding][tjs-c]

Checked-in tests target growth detachment, stale-view writes, grow(0), growth
followed by an import callback, imported start functions and exported-function
lifetime. These are valuable cases to reuse in qualification; their presence is
not a test run here. [Detachment test][tjs-detach] · [Growth/import regression][tjs-uaf] ·
[Start callback test][tjs-start]

Limits are visible in the source:

- The facade explicitly excludes Table imports, imported reference-valued
  parameters/results and imported multivalue returns. A generated glue bundle may
  need an imported table even if simple numerical fixtures do not. [Facade][tjs-js]
- Standalone Memory uses an ordinary ArrayBuffer; `grow` copies to a new buffer
  without detaching the previous one. Binding an imported Memory replaces its
  backing with an instance handle, so preexisting views and repeated use across
  instances require qualification. This is weaker than proving shared imported
  memory identity/storage. [Memory implementation][tjs-js]
- The build chooses native OS platforms, enables interpreter/SIMD and disables
  the pthread library. It does not demonstrate compiling this combination to
  browser Wasm or transferring shared memory between independent engine instances.
  [Build][tjs-build]

Co-locating an interpreter's linear-memory allocation with QuickJS inside one
outer Wasm module would make its pointer addressable by the guest engine. That is
the key reason this implementation is relevant. The browser port, allocator
configuration, outer-memory growth, retained-buffer lifetime, buffer transfer
restrictions and worker sharing still need evidence. Reusing txiki.js's operating
system/network/WASI environment wholesale would introduce authority outside the
requested host; investigate its Wasm binding as a component.

### Wasmi, WAMR and Wasm3 separately

| Candidate | Established support                                                                                                                                                                                                                                                                                                    | Consequence for this host                                                                                                                                                                                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wasmi     | Rust interpreter with host functions, Store/Caller API, direct memory data access and `Memory::new_static` for caller-provided static storage. SIMD is optional; threads and exception handling remain listed as planned at the inspected revision. [README][wasmi-readme] · [API][wasmi-api] · [Memory][wasmi-memory] | Natural language fit with Boa, but no inspected Boa WebAssembly facade or common buffer owner is supplied. Static backing can prevent relocation within a reserved capacity; it does not implement guest detachment, shared browser workers or safe simultaneous mutable access. Browser build and codec support are probes. |
| WAMR      | C interpreter, host-call and memory APIs; existing txiki.js integration. Current build documentation supports SIMD in fast-interpreter mode via SIMDe, rather than only native JIT/AOT. [Build][wamr-build] · [API][wamr-api]                                                                                          | Stronger concrete QuickJS integration evidence. Do not infer browser threading from native pthread support or browser readiness from a CMake Emscripten-discovery helper. A browser-compatible platform/build configuration remains unproved here.                                                                           |
| Wasm3     | README explicitly says it can compile to WebAssembly and links a QuickJS integration. Current matrix excludes fixed-width SIMD and full threads, despite listing atomics-only support; project states minimal maintenance. [README][wasm3-readme]                                                                      | Concrete nested-Wasm portability evidence, but weak coverage for current SIMD/threaded codecs. The QuickJS link leads to txiki.js, whose inspected current implementation uses WAMR; it is not evidence of current Wasm3 binding parity.                                                                                     |

A core runtime's WASI support does not supply browser Emscripten imports, DOM APIs
or the JS WebAssembly facade. The host must register application imports and
resources deliberately. Native JIT/AOT execution is not an assumed browser option;
these candidate routes depend on interpretation inside browser Wasm.

## Worker cloning, transfer and shared storage

An ordinary ArrayBuffer transfer must detach the sender's buffer and all its views;
a structured clone without transfer preserves graph relationships while copying
contents. Views themselves are serialized with their backing buffer. SharedArrayBuffer
uses shared storage and is not an ordinary transferable. The host must reproduce
these behaviors between guest heaps, even if the browser only transports an
intermediate representation. [Structured data][html-clone]

WebAssembly.Module has a structured serialization contract. Shared
WebAssembly.Memory has serialization rules tied to shared memory and agent-cluster
constraints; ordinary unshared Memory is not thereby transferable, nor is an
Instance. Wasm memory buffers carry detachment restrictions: the host must preserve
which attempted transfers fail rather than treating every aliased buffer as a
freely transferable ArrayBuffer. [Module serialization][web-api] · [Shared-memory JS integration][threads-js]

With separate engine instances in workers, browser-cloned native Module/Memory
objects could be represented by new guest wrappers per receiving realm. That works
only if the binary intrinsics can access the underlying storage. A QuickJS internal
SharedArrayBuffer allocation is not automatically the same browser SharedArrayBuffer
used by native Wasm. An embedded interpreter must similarly arrange genuinely
shared inner memory and its atomic operations across outer instances. Cloning byte
snapshots or pointing independent engine-local buffers at similar offsets cannot
satisfy the threaded Squoosh worker path. [QuickJS shared hooks][qjs-h] · [Worker glue][sq-worker]

## Minimal probes before an architecture decision

Run the first four probes for each serious engine/backend combination. Stop a
candidate when a mandatory semantic gate fails; do not turn the probe into a host
implementation. Record exact engine/build pins, browser versions and observed
outputs. None of these probes was run in this research.

1. **Inventory unchanged codec dependencies.** Capture the actual Squoosh and
   PhotoCraft resource set and hashes. Record Module imports/exports, memory and
   table ownership, SIMD/threads/exception features and feature-detection outcomes.
   Exercise a decoder and encoder, then the threaded selection if exposed. This
   settles which runtime and facade features are mandatory without patching apps.
2. **Prove live memory at every observation.** Write through Uint8Array, another
   typed view, DataView and subarray; mutate the same bytes in Wasm and inside an
   imported callback. Check stable buffer identity, exported and imported memory,
   two instances sharing an imported memory and pre-instantiation views. A copied
   constructor result must fail this gate unless complete synchronization works.
3. **Prove growth and ownership.** Check JS grow(0), positive grow, failed grow,
   Wasm-instruction growth followed immediately by an import, stale views and
   cross-instance aliases. Test retained buffers after dropping module/instance
   wrappers and GC. If shared memory is supported, separately check old/new buffer
   lengths and concurrent aliasing. Grow the outer engine memory too. Verify
   disallowed buffer transfers and repeated disposal cannot expose stale storage.
4. **Prove synchronous reentry and errors.** Instantiate a module whose start
   function calls guest JS; export → import → nested export; callback writes then
   throws an identifiable guest error; repeated calls after traps. Verify ordering,
   exact exception identity where required, typed values/BigInt and context/handle
   lifetime. A borrow error or async substitution fails the synchronous contract.
5. **Qualify worker semantics.** Transfer an ordinary guest ArrayBuffer with
   multiple views, checking sender detachment and recipient aliasing; clone a
   Module. Run the unchanged shared-Memory/Module message-and-instantiate pattern
   from Squoosh in two workers, with atomics and growth. Confirm actual shared bytes
   and application isolation rather than merely successful message delivery.
6. **Run unchanged codec glue and measure.** Feed recorded input through one real
   image decode/encode, verify dimensions/pixels or decoded output, then a growth-
   inducing workload. Test streaming and admitted-byte fallback offline. Measure
   compile/start latency, copy volume, peak memory, callback overhead and worker
   cleanup. Cover other required formats before claiming application-wide support.

The first useful comparison is a txiki.js/WAMR browser build against a native-Wasm
mirror or external-buffer experiment, using the same aliasing and reentry fixtures.
Boa plus Wasmi also needs an explicit buffer ownership design before a codec run
can establish compatibility.

## Sources

[memory-grow]: https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory/grow
[threads-js]: https://github.com/WebAssembly/threads/blob/cc535ada1aa21cfaa3cabf3ac73b89acef78a0a0/proposals/threads/Overview.md
[prior-qjs]: https://github.com/privacy-frames/host/blob/fb922b0c5617f8250ce6a3ec8b617fc6ba8ccfae/docs/research/wasm-runtime/quickjs-capabilities.md
[prior-boa]: https://github.com/privacy-frames/host/blob/4f2988fbfc116fa8d51953f532dede0bb715052d/docs/research/wasm-runtime/boa-capabilities.md
[prior-bindings]: https://github.com/privacy-frames/host/blob/da55971/docs/research/wasm-runtime/browser-binding-reuse.md
[prior-apps]: https://github.com/privacy-frames/host/blob/3a6876a02bc3bc49b88b6de08f8ca9f291b413ff/docs/research/wasm-runtime/current-demo-contract.md
[tjs-tree]: https://api.github.com/repos/saghul/txiki.js/git/trees/c13adc667e3e7761ff4d0c12a6ea34efceb4e1ea?recursive=1
[tjs-c]: https://github.com/saghul/txiki.js/blob/c13adc667e3e7761ff4d0c12a6ea34efceb4e1ea/src/wasm.c
[tjs-js]: https://github.com/saghul/txiki.js/blob/c13adc667e3e7761ff4d0c12a6ea34efceb4e1ea/src/js/polyfills/wasm.js
[tjs-build]: https://github.com/saghul/txiki.js/blob/c13adc667e3e7761ff4d0c12a6ea34efceb4e1ea/CMakeLists.txt
[tjs-detach]: https://github.com/saghul/txiki.js/blob/c13adc667e3e7761ff4d0c12a6ea34efceb4e1ea/tests/test-wasm-memory-detach.js
[tjs-uaf]: https://github.com/saghul/txiki.js/blob/c13adc667e3e7761ff4d0c12a6ea34efceb4e1ea/tests/test-wasm-memory-grow-import-uaf.js
[tjs-start]: https://github.com/saghul/txiki.js/blob/c13adc667e3e7761ff4d0c12a6ea34efceb4e1ea/tests/test-wasm-import-start-function.js
[qjs-h]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs.h
[qjs-c]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/quickjs.c
[qjs-wrapper]: https://github.com/justjake/quickjs-emscripten/blob/7b7af98e4e69757c64c27aac46a74e1e07229545/c/interface.c
[boa-buffer]: https://github.com/boa-dev/boa/blob/337a3668a0dc86dd401ea20906e782249a64a228/core/engine/src/builtins/array_buffer/mod.rs
[js-api]: https://www.w3.org/TR/wasm-js-api-2/
[js-memory]: https://webassembly.github.io/spec/js-api/#memories
[js-functions]: https://webassembly.github.io/spec/js-api/#exported-functions
[web-api]: https://webassembly.github.io/spec/web-api/
[core-memory]: https://webassembly.github.io/spec/core/syntax/instructions.html#memory-instructions
[ecma-typed]: https://tc39.es/ecma262/multipage/ordinary-and-exotic-objects-behaviours.html#sec-integer-indexed-exotic-objects
[html-clone]: https://html.spec.whatwg.org/multipage/structured-data.html
[squoosh-receipt]: ../../../results/evaluation/publishers/squoosh-snapshot.json
[sq-dec]: https://squoosh.app/c/avif_dec-61445e6d.js
[sq-mt]: https://squoosh.app/c/avif_enc_mt-5e0d2ff0.js
[sq-worker]: https://squoosh.app/c/avif_enc_mt.worker-c129884d.js
[old-probe]: ../../../test/realm-research/capabilities/wasm-contract.ts
[wasmi-readme]: https://github.com/wasmi-labs/wasmi/blob/d6188fb1835a8fbfcb2208e00ff7c2c5d5de1392/README.md
[wasmi-api]: https://docs.rs/wasmi/2.0.0/wasmi/
[wasmi-memory]: https://github.com/wasmi-labs/wasmi/blob/d6188fb1835a8fbfcb2208e00ff7c2c5d5de1392/crates/wasmi/src/memory/mod.rs
[wamr-build]: https://github.com/wasm-micro-runtime/wasm-micro-runtime/blob/69372c5b29b14cb8dddf2990988876cc5db9bd05/doc/build_wamr.md
[wamr-api]: https://github.com/wasm-micro-runtime/wasm-micro-runtime/blob/69372c5b29b14cb8dddf2990988876cc5db9bd05/core/iwasm/include/wasm_export.h
[wasm3-readme]: https://github.com/wasm3/wasm3/blob/28ecb9af6d2040e474a70f7cb7f43666740141fb/README.md
