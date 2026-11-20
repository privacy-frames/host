# Native Wasm accessor authority and bounds

The production accessor emitter creates nine small modules for numeric typed-array
reads and writes. Each module imports one application memory and exports two
functions. The module receives neither the QuickJS interpreter memory nor the
interpreter's private function table.

## Checks against the actual emitter

Run:

```sh
node --import tsx formal/quickjs/wasm/check.ts
```

The runner erases the actual `src/guest/wasm-accessors.ts` TypeScript and records
the bytes it submits to `WebAssembly.Module`. It does not copy the emitter into a
second implementation. A strict decoder accepts only the reviewed five sections:
two function signatures, one unshared wasm32 memory import, two defined functions,
two function exports and their exact instruction bodies.

The read/write bodies contain local argument reads, one typed memory instruction,
necessary numeric conversions and return. There are no imported functions, tables,
globals, additional memories, call instructions or indirect calls. Under standard
Wasm validation and memory-import semantics, these accepted modules have only the
memory authority supplied by their caller.

The runner checks all nine emitted families and compares the standard native
import/export descriptors with its decoder. Local controls instantiate a cached
module against two different memories, verify independent read/write effects and
observe native traps outside the memory range. Adding a valid host-function import
or a valid extra instruction makes the strict decoder reject the changed module;
`WebAssembly.validate` first confirms that those controls are valid modules.

These results are recorded in
`results/quickjs-confinement/wasm-authority.json`, with production source, erased
source, runner and module hashes. The TypeScript erasure, verification-only VM
instrumentation, decoder and browser/Node Wasm implementation remain trusted.

## Kernel-checked address arithmetic

Run with Lean 4.35.0:

```sh
PF_LEAN=/path/to/lean python3 formal/quickjs/wasm/check-bounds.py
```

`Bounds.lean` proves five axiom-free statements. Given a valid view, an index below
its length, a positive element width and backing size at most 2^32, the element's
last byte remains within the backing. The uint32 multiplication/addition model
produces the same address as natural-number arithmetic and therefore cannot wrap
into another location. A deliberately wrong address formula fails the exact-address
proof. The checker requires the named theorem results and rejects unchecked proof
placeholders or an unexpected toolchain.

The C read and write paths compute `offset + (index << shift)`. The checker binds
its arithmetic review to the two actual expression spellings and the `kind & 3`
shift restriction. The C-to-arithmetic correspondence assumes standard wasm32 C
unsigned arithmetic and width `2^shift`; it is not a verified translation of C.
Native typed-array brands and getters must establish the view-bound premises.
The result is recorded in
`results/quickjs-confinement/wasm-authority-bounds.json`.

## Production ownership and lifetime obligations

The production paths supplying those premises are:

| Owner                            | Operation                                                 | Required contract                                                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `native-wasm.ts`                 | `kind`, `retainMemory`                                    | A captured native Memory getter validates the actual object; its buffer is associated with that same Memory.                                                                       |
| `engine.ts`                      | `retainMemory`, `encode`                                  | Existing views are attached only when their captured native backing is exactly the remembered buffer; shared, resizable and ordinary mirrored buffers retain their separate paths. |
| `indexed-access.ts`              | `attachMemory`                                            | Captured typed-array getters supply length, byte offset and family; the view is live and within the exact imported memory when the control becomes enabled.                        |
| `indexed-access.ts`              | `entry`, `attachShadow`                                   | The host roots the proxy and any borrowed QuickJS view handle before they can be used by an enabled C control record.                                                              |
| `quickjs.c`                      | `JS_SetIndexedProxyView`                                  | The borrowed value is an actual live typed-array view with sufficient element count; arbitrary objects are refused before enabling the record.                                     |
| `quickjs.c`                      | `js_proxy_get`, `js_proxy_set`                            | The proxy is not revoked, its registered record is enabled and the canonical numeric index is within the registered length before invoking an accessor.                            |
| `indexed-access.ts`, `engine.ts` | `invalidate`, native entry/exit barriers                  | No detached or stale nonshared backing remains enabled when guest execution resumes; reentrant calls encounter the necessary barriers.                                             |
| `indexed-access.ts`              | `dispose`, `releaseShadow`, `attachMemory`                | Unlink or disable C records before disposing borrowed handles, and unlink every record before removing its private function-table entries.                                         |
| `interface.c`                    | `QTS_NewIndexedProxyAccess`, `QTS_FreeIndexedProxyAccess` | Allocation failure grants no record; unlinking precedes releasing C storage.                                                                                                       |

The current source implements intended ownership through private maps, duplicated
handles, active-record sets and ordered disposal. Those source relationships
require implementation proofs and caller contracts. The module grammar and
arithmetic proofs do not establish C pointer lifetime, allocation-failure cleanup,
function-table lifetime or every reentrant invalidation path.

A C program verifier has not been calibrated for this work, and the entire
indexed-access C extension has not been proved. Existing indexed
buffer tests remain executable evidence for numeric conversion, aliasing, growth,
reflection, revocation and disposal; they are separate from the proofs above.
