# Worker control through private parent brokers

Dedicated workers now use a private parent broker for execution-authority checks
and child closure. Each bootstrap receives two separate ports: the startup port
closes after script loading, while the broker remains available for later nested
worker operations. The broker does not require a worker service-worker container.

A window sends control requests through its captured native controller client.
Each parent relay prepends its own host-generated child identifier. The controller
starts from the actual browser sender and checks each hop against its stored
native client binding, parent, application, installation generation and current
policy version. An identifier or a packet's claimed parent cannot establish this
relationship. Every selected actor is revalidated after the asynchronous lookups.

Verification revalidates context authority; local guard preparation remains the
execution barrier. The guard performs verification before loading application
code. Parent messages are released when the application registers its listener,
preserving workers whose module initialization awaits a first message. Persistent
phase labels do not establish preparation or listener readiness.

Closure uses the selected native parent's existing atomic storage operation.
Cancellation before binding remains durable. Termination and startup failure close
the local broker, denying pending replies, and request durable child closure once.
Native termination and the database commit are separate events. An already-started
controller operation may finish after its local reply channel has closed.

## Remaining HTTP boundary

Shared-worker and publisher roots currently use an explicit HTTP adapter for the
same control protocol. Its endpoint requires an actual bound worker client;
window callers are refused. Dedicated descendants relay through that root's
adapter. The former per-context HTTP readiness and closure routes are removed.
There is no retry through those routes when a private broker fails.

Native script bootstraps, module loading, resources and other shared/publisher
operations still need local delivery. These paths retain the demonstrated
maintenance-channel obligation. This change does not establish C4.

The two-port bootstrap uses context policy version 4. Old bindings are refused
rather than admitted under the new protocol. The actual authority-predicate check
has been updated to that version; its field-comparison contracts retain their
existing ownership and caller assumptions.

## Evidence

Run:

```sh
npm run build
node test/worker-contexts.ts
node test/shared-worker-contexts.ts
node test/publisher-contexts.ts
node formal/runtime-verification/worker-closure-browser.ts
```

The [native control receipt](worker-closure-browser.json) covers Chromium,
Firefox and Firefox with an explicit forced-stale update preference. The fixture
uses the built controller, actual browser actors and the real context database.
The owning window can verify its worker; a sibling cannot. Termination commits
closure, and later verification is refused. After a measured quiet interval, the
server observes no HTTP during closure and one subsequent second.

Two temporary controller builds independently change closure parent selection
and remove the delegation-parent check. The same fixture detects wrong-owner
closure and unrelated-worker verification. Source and bundle hashes identify
these test-only builds. No production build input is modified. Failed runs retain
partial observations. The fixture also starts a worker during the application's
top-level module initialization and awaits its reply before declaring readiness.

The [unit contracts](../../test/worker-control.test.ts) cover multi-hop paths,
sibling shortcuts, repeated identifiers, missing and forged clients, stale
ancestors, installation replacement, delegated cancellation and malformed input.
The worker suite exercises nested execution, modules, Blob sources, transfers,
listener readiness and offline operation. Shared and publisher suites check the
remaining adapter's integration separately.

The [version-4 compatibility receipt](worker-broker-compatibility.json) records
all eight unchanged applications passing their selected standalone and confined
tasks in both browsers, including offline reloads. Its source and artifact hashes
match the native control and upgrade checks.

The [validation record](worker-broker-validation.json) retains an initial SVG
publication assertion: initial and load-time widths were zero, while a later read
returned forty. The standalone repetition and resumed document suite passed
without renderer changes. The cause remains unresolved; those successful runs do
not erase the earlier observation.

## Proof obligations

Caller and channel ownership, controller restart, transaction callbacks and
asynchronous grant points still require implementation proofs and lifecycle
correspondence. Each ancestor is revalidated separately. The proof must define when verification
grants execution authority and account for revocation between those checks.
