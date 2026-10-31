# Window-owned worker closure through messages

A window now closes its dedicated-worker binding through the captured controller
message client. `createWorkerFactory` receives a private `closeChild` callback
and retains the host-generated context identifier. Termination and startup
failure call that callback once; they no longer construct an HTTP closure request
inside the factory.

The controller obtains the sender from the browser's message event and resolves
its current context binding and installation generation. The packet supplies
only the child identifier. Parent and application claims in a packet grant no
authority. The existing atomic storage operation checks the actual owning parent
and application before committing closure. Cancellation of an unbound child
remains durable, preventing its later binding under that owner.

The old HTTP closure route now accepts only bound worker parents. Nested workers
still use that route through their captured native operation. Worker readiness,
script bootstraps and native module loading also retain their existing transport.
Moving window-owned closure to messages does not repair those remaining paths.

## Native evidence

Run:

```sh
npm run build
node test/worker-contexts.ts
node formal/runtime-verification/worker-closure-browser.ts
```

The worker suite exercises classic, module, Blob, nested and offline execution,
transfers, storage and startup failures. Its closure fixture reads the actual
controller database through test-only native handles captured before application
preparation. A sibling window cannot close the worker, malformed identifiers are
rejected, and factory termination commits the owning worker's closed state.
Following a measured quiet interval, the server observes no HTTP during closure
and one subsequent second. This is a bounded observation of this operation.

The separate [native control receipt](worker-closure-browser.json) records the
same checks in Chromium and Firefox against the built controller. A temporary
in-memory controller build changes parent selection to use the child's recorded
parent instead of the actual sender. The same fixture then detects the sibling's
successful closure. The faulty build is served only by the local test server;
production artifacts remain unchanged.

The six recorded samples include Firefox with its explicit forced-stale update
preference, for both normal closure and the parent-selection control. This tests
that profile's behavior; it does not establish natural aging or arbitrary timing.

The receipt pins source and built artifacts, browser versions, the helper and
runner, and faulty source and bundle hashes. Failure preserves partial rows.
The [unit contracts](../../test/context-model.test.ts) also cover unbound and
forged clients, changed URLs, stale installation generations and cancellation
before binding. These checks do not prove all asynchronous schedules.

The [compatibility receipt](worker-closure-compatibility.json) records all eight
unchanged applications passing their selected standalone and confined tasks in
both browsers, including offline reloads. Its source and artifact hashes match
the candidate used by the context, host and independent network-receiver suites.

## Remaining proof and transport work

Binding authentication, controller restart, caller ownership and transaction
callbacks still need their implementation proofs and lifecycle correspondence.
A closed record does not establish native termination; the factory separately
invokes the captured native termination operation. The message is best effort:
a missing controller or failed reply does not introduce an HTTP retry.

The native HTTP and maintenance findings remain applicable to other operations.
A private parent broker must support readiness and nested-context operations
without assuming Chromium exposes a service-worker container inside a worker.
Bootstrap, module and resource delivery remain part of the C4 repair.
