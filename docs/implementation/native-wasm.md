# Native application WebAssembly

Application JavaScript and imported JavaScript callbacks run in QuickJS. The
browser compiles and executes application Wasm. Wasm receives only the imports
read through the guest engine's property policy; passing a guest `window` alias
as an import namespace does not expose native browser methods. Function imports
call back into QuickJS before invoking host operations. Native memory, table and
global imports retain their actual object identity.

`native-wasm.ts` owns browser Module, Instance, Memory, Table, Global and exception
objects. Constructor and descriptor routes use the same adapter. Streaming
compilation consumes an admitted native Response, never a URL or a native fetch.
Browser feature availability still determines the Wasm instructions and proposal
APIs an application can use.

Wasm buffers and views retain their native identity. Indexed JavaScript access to
fixed, non-shared memory uses a private QuickJS cache so byte-copy loops do not
require a host call per element. Cached writes reach native memory before native
consumers run; native effects invalidate the cache. The cache is hidden from
application code, including `.buffer`, descriptors and returned views.

During synchronous Wasm execution, imported JavaScript callbacks use native views.
Ordinary guest buffers are synchronized at the outer call and at mediated browser
effects. A captured native `copyWithin` with primitive indices can operate directly
on its native heap without copying unrelated image buffers around each callback.
Other native calls retain conservative synchronization.

`native-binary.ts` retains native buffers and their views. `guest-binary.ts`
dispatches constructors and prototype methods according to the receiver's backing
store. Shared and resizable buffers always use native views. Shared memory and
native Atomics operate on the actual browser allocation.

The runtime service worker supplies COOP and COEP headers on controlled startup
responses. Prepared dedicated workers join that isolated environment and use
native structured clone for Module, Memory and SharedArrayBuffer. The browser
continues to enforce agent-cluster restrictions. SharedWorker support does not
imply shared memory can cross its different agent cluster.

Custom HTML elements retain native construction, upgrades and lifecycle reactions.
A host-defined native class calls the application's QuickJS constructor and
callbacks synchronously. The raw native custom-element registry is not exposed.
Scoped custom-element registries are unavailable. Logical child-document
navigation reuses its native Window, so native element definitions persist across
those navigations; repeated registration is a compatibility limitation.

Applications see their original document URL through `location` and `document.URL`.
Same-document history stores logical routes and application data in a host-owned
browser history record. The actual URL stays on the admitted runtime document;
only its fragment changes. Script preloads receive asynchronous load/error events
from the admitted catalog. A successful preload does not execute native JavaScript.

Focused native-control/guest comparisons cover synchronous reentry, exceptions,
indexed operations, species constructors, NaN payload copies, memory growth,
shared-memory workers and import getter ordering. Network-policy checks observe
an independent receiver when a module requests imported capabilities. These
checks do not establish complete browser confinement or ECMAScript conformance.

Chrome exposes non-extensible Wasm SharedArrayBuffer wrappers. Their default
`slice` works, but a custom guest species constructor is not observed on that
route. The bridge keeps the native operation and its same-data-block checks.

The existing `srcset` rewriting splits on commas, which misparses data URLs.
Squoosh's capability probe exposes this as a local `data:` decoding error. The
image receipts retain that diagnostic separately from JavaScript exceptions;
a standards-compliant URL-list parser remains future work.
