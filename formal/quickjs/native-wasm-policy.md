# Native WebAssembly policy

The native Wasm domain now uses NativePolicy and the shared NativeHost codec for
property reads/writes, descriptors, reflection, call and construction. It registers
an explicit member list. Discovering another property on a browser's native Wasm
prototype does not authorize that property's getter or function.

| Family                                  | Reviewed members                                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Namespace                               | compile, validate, instantiate; Response-branded compileStreaming and instantiateStreaming; the listed constructors; optional JSTag |
| Module                                  | constructor; imports, exports, customSections; constructor/prototype metadata                                                       |
| Instance                                | constructor, exports                                                                                                                |
| Memory                                  | constructor, buffer, grow; captured optional toFixedLengthBuffer and toResizableBuffer                                              |
| Table                                   | constructor, length, get, set, grow                                                                                                 |
| Global                                  | constructor, value get/set, valueOf                                                                                                 |
| Tag / Exception                         | optional constructors; Exception is/getArg and optional stack                                                                       |
| CompileError / LinkError / RuntimeError | construction and explicit ordinary calls; constructor/prototype metadata, prototype name/message                                    |

Error instances retain the existing error owner; this domain does not claim
arbitrary Error objects or Error.prototype. Actual Node, Chromium and Firefox
controls confirm that the three Wasm error constructors work without `new`, convert
their message once and preserve cause. JSPI promising/Suspending/SuspendError and
WebAssembly.Function remain unavailable, matching the previous namespace. Browser
presence of those APIs does not enroll them.

## Native identity and producers

Native exported functions remain the original native funcrefs. A trusted private
producer facade registers a call token, then the codec privately binds that token
to the original function. Calls have no raw forwarding fallback. Stable native
identity allows that function to pass unchanged through anyfunc tables and funcref
globals. The codec also preserves constructor aliases and supports a constructor
call only when a registered call token accompanies its construct token.

Instance.exports comes from the captured native getter. Its own native data
descriptors define a per-record facade; no application-chosen getter is discovered
or invoked. Its branded functions, memories, tables and globals enter the
corresponding domains. The original created-instance/local-function/local-table
tracking and monotonic foreign-code state control ordinary-buffer copy deferral.
A trusted traceStack probe captures optional Exception stack declarations before
registration. An own stack accessor is admitted only when its descriptor matches
that native producer sample; its exact per-instance facade precedes the already
reviewed anchored lineage. Exception is/getArg remain available after composition.
A foreign own stack accessor that does not match the sample remains refused.
Native memory buffers retain their identity and pass to the existing buffer/memory
retention callbacks and NativeBinary owner.

The delegated result contract returns a value unchanged without minting a callable
or constructor token. Table.get, Global.value, Exception.getArg and native exports
can return externrefs. The Wasm producer classifier registers only genuine Wasm
funcrefs; other functions retain their original guest/host owner. Tests show that a
foreign constructor returned from an externref table cannot be called or
constructed through the Wasm host. Guest callback round trips preserve identity.

The interpreter's import-argument decoder keys on the exposed callable identity.
The codec publication hook associates instantiate/instantiateStreaming wrappers
with import argument index one. Import capture still validates Module brand first,
then reads only declared imports through the guest property policy in declaration
order. Existing tests cover inherited getters, unused fields, reentrant imports,
exceptions, late-discovered foreign tables/memories and callback byte coherence.

## Cross-realm values

A native Wasm object can have a foreign or modified physical prototype. Trusted
admission may anchor it to a locally registered schema only if that schema has a
brand guard and the guard accepts it. Member resolution then uses captured local
descriptors and rejects own-property shadows; prototype reflection returns the
reviewed local anchor. It does not walk or enroll the foreign prototype chain.

Property presence is a snapshot of trusted local declarations. This permits
ordinary missing-property probes, including the `then` lookup used by Promise
resolution, without touching foreign getters or Proxy has traps. A present but
unreviewed local getter reaches registry rejection; a key absent from the local
projection returns undefined. Neither path invokes a foreign declaration. The
initial strict projection rejected Module.then and broke asynchronous compile/
instantiate; the complete existing Wasm browser regression caught that mistake.

## Evidence and remaining contracts

Focused Node tests cover the codec, semantic-anchor guard, delegated results,
constructor/static metadata, native funcref identity and unowned constructor denial.
The browser fixture uses genuine iframe Memory/Module/Table/function objects in
Chromium and Firefox, including a poisoned foreign prototype and Proxy has traps.
A native control executes the foreign getter. Production leaves the getter/trap
counters at zero; restoring raw Reflect.get in a temporary bundle executes that
getter and makes the fixture fail. Both browsers also exercise optional native
memory buffer methods, callable errors, async instantiation and externref callbacks.

The existing guest-wasm suite separately compares native and confined behavior for
all eleven scenarios per browser, plus foreign-code coherence and import/constructor
controls. Buffer-copy counters are preserved in those receipts. These are
functional and mediation tests; they do not establish native execution performance
or a complete confinement theorem.

A Wasm function's unforgeable native brand does not prove that its hidden imports
are confined. Production functions must originate from reviewed import capture or
another confined GuestEngine. Trusted embedding must not inject a raw funcref that
has unmediated native I/O imports. Foreign-function/table recognition preserves
existing memory-coherence behavior; its brand alone cannot discharge this producer
provenance obligation. The native engine, buffer bridge, browser internal-slot
checks and shared policy/codec implementations remain separate trusted contracts.
