# Local worklet module graphs

The compile/link candidate separates source preparation from the application
realm. Rollup runs in a private native service worker. The build plugin embeds its
WASM parser bytes, replacing the dependency's initialization URL. The selected
browser comparison completes with native HTTP-denying script/connect policy and
no compiler fetch attempts. Application source is parsed as data in that worker.

The compiler snapshots admitted source reads, then generates a facade for each
discovered module using its cached graph. A later entry refers to existing Blob
facades instead of evaluating another copy of shared dependencies. The intended
cache invariant is closure under static dependencies: a previously prepared
module cannot acquire an edge to a newly discovered module while its source
remains immutable. Production ownership, generation checks and correspondence to
that invariant remain obligations.

The Window helper validates unknown graph records through captured own-property
descriptors. It rejects sparse lists, accessors, duplicate names, missing targets,
overlapping import ranges and external HTTP dependencies before allocating the
entry. It replaces only compiler-reported import ranges and creates Blob chunks.
It performs no JavaScript parsing or compilation in the application realm.

The host guard stays outside the application compiler graph. A separate native
module imports the authenticated host guard first and the application facade
second. If preparation throws, module dependency evaluation must stop before
application code. Cached application facades do not select that first dependency.
The caller must obtain guard bytes from the trusted host, authenticate the actual
owning browser actor and retain the wrapper privately.

The [comparison](local-worklet-graph.ts) completes six groups in Chromium and
Firefox: native HTTP modules, local compiled modules, and local modules linked
while selected Map, Array and String prototype methods are replaced. Processor
messages and rendered samples agree. Shared state initializes once, cyclic live
bindings retain their values, repeated entries do not rerun, and a throwing
entry's partial state survives later loads. A cyclic lexical initialization error
does not register its processor. The native HTTP receiver control works; local
groups reject that request and observe no HTTP during the operations and the
following 300 ms.

An independent native control imports an HTTP dependency behind a guard that
rejects preparation. Both browsers fetch that dependency under the permissive
policy before evaluation fails. Native HTTP denial blocks the same dependency
under the restricted policy. Guard ordering therefore cannot substitute for the
native fetch restriction.

Eight additional preparation controls use the actual built worklet guard. Correct
AudioWorklet metadata permits processor registration and rendering. PaintWorklet
metadata in a fresh AudioWorklet rejects preparation and prevents registration,
including another entry after the first failure. Both browsers still resolve the
tested `addModule` promises. Their resolution is not evidence that preparation
or application evaluation succeeded.

The [control runner](local-worklet-graph-control.ts) deletes historical receipts
and runs a fresh baseline, then omits the actual host-preparation import in a
temporary helper build. Each browser detects processor registration despite
rejected preparation metadata. The comparison fails at the intended assertion;
the control runner checks that result, matching source/build inputs, unchanged
compiler bytes and changed bootstrap bytes. Production sources and artifacts
remain unchanged by the omission.

The [normal receipt](local-worklet-graph.json), per-browser omission receipts and
logs record these component observations. Fixture metadata and source reads are
fixed trusted inputs. The [production migration](production-worklets.md) now uses
the existing runtime service worker for compilation and native-actor-bound private
requests. Root and child Windows prepare local worklet graphs; the rejection
helper is separate from the mandatory guard. Production native HTTP denial,
complete lifecycle correspondence and C1–C8 remain open. The component fixture's
separate service-worker registration is controlled setup, not an additional
production service.

Run after building:

```sh
node formal/runtime-verification/local-worklet-graph-control.ts
```
