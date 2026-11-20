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

The record-control checks below discharge selected C obligations under explicit
ABI projections. The full indexed-access C extension and its callers remain
partially verified.

## C control records and exception-safe ownership

Run the actual-source record checks with Docker:

```sh
python3 formal/quickjs/wasm/check-records.py
node --import tsx --test test/quickjs-indexed-lifetime.test.ts test/quickjs-indexed.test.ts
```

The record runner extracts eight control functions and seven interface wrappers
from `quickjs.c` and `interface.c`, together with their actual record definitions
and class enumeration. CBMC 6.11.0 is pinned by container digest. With wasm32-width
integers and pointers, it checks allocation failure, pointer validity, bounds,
cleanup and the harness assertions. The receipt contains every checked property
and the hashes of the extracted translation unit and its inputs.

The checked contracts cover rejected and successful record creation, borrowed-view
brand and length admission, exact memory-accessor configuration, disable/dirty
operations, and paired unlink/free. A four-operation harness also checks arbitrary
choices of view mode, native-memory mode, disable and proxy revocation before
terminal free. The harness keeps the proxy and borrowed handle live throughout.
Removing the production unlink operation in a temporary translation unit fails
the two expected ownership assertions. Calling the unchanged free wrapper with a
different live proxy also fails terminal unlink, demonstrating why correct proxy
pairing is a caller obligation.

`record-model.h` supplies reviewed projections of QuickJS's tagged value/object
ABI, `JS_GetOpaque` and `typed_array_is_oob`. These projections are assumptions,
not verified QuickJS implementations. CBMC does not check the numeric proxy fast
paths, the Emscripten function-table representation, C-to-Wasm compilation, or
arbitrary TypeScript caller histories. Its pointer results apply to the extracted
functions with these projections and live-handle premises.

The TypeScript owner now acquires a proxy root before attaching a C allocation,
rolls back the first native function slot if the second allocation fails, and
roots a replacement shadow before releasing its predecessor. Focused tests use
actual SDK handles and the compiled engine, with injected acquisition failures.
They check retry, continued use of the previous view, cleanup, rejected native
view admission and unlink-before-root-release. The existing indexed tests exercise
numeric conversions, memory growth, revocation and Proxy invariants.

The remaining implementation proof is the caller composition: every enabled
borrowed pointer must retain its root, every table entry must outlive its records,
and every guest entry or reentry after detachment/growth must encounter the
necessary invalidation barrier. The C results and failure tests narrow these
obligations; they do not discharge that composition.
