# Dedicated workers with local bootstrap

The policy-7 candidate creates dedicated workers from a host-owned Blob instead
of the former HTTP bootstrap route. Application entry scripts and imported modules
still use admitted HTTP resource routes. This change addresses bootstrap delivery;
complete confinement remains unestablished.

## Startup and authority

The build compiles the trusted worker guard as a string. Window, shared-worker and
publisher guards embed that string through the existing trusted-source loader.
Each dedicated worker receives it in a private enclosing function so it can create
descendants without downloading another guard. Application source and metadata
are never interpolated into this bootstrap string.

The factory captures Blob construction, object-URL operations, native Worker
construction and private URL minting before application execution. Its Blob parts
use the private array prototype. Native Worker receives the branded URL directly;
neither the brand nor the URL-minting function is published on the returned handle.
The factory's lifecycle map uses captured WeakMap methods.

The Blob wrapper explicitly establishes strict mode before declaring its source
binding. The compiled guard's leading directive appears after that declaration
inside the enclosing function and cannot establish the wrapper's strict mode.
The [caller comparison](worker-caller-browser.ts) calibrates sloppy callbacks
with direct calls, then exercises nested Worker URL coercion and option getters.
Neither browser exposes trusted callers in the normal build. Removing the actual
wrapper directive exposes both callers in Firefox; Chromium still hides them
at the native conversion boundary. The
[receipt](worker-caller-browser.json) records that difference. This is a scoped
caller non-exposure result, not a demonstrated network escape or a complete
ownership proof.

The first native message transfers two private ports before the caller receives
the worker handle. The guard accepts that message and acknowledges bootstrap
readiness. It has not yet loaded application code. The factory then requests a
binding through its private parent broker, carrying a context UUID, Blob URL and
module mode. Each relay fixes the first ancestry hop from its own child record.

The controller authenticates the browser sender and verifies the delegated
parent chain. It enumerates native worker clients, requires exactly one match
for the same-origin Blob URL, and resolves that client's native ID again before
binding it. Packet fields cannot supply the native client ID, application or parent.
The controller rechecks native liveness, context authority and installation
generation before returning metadata. A failed post-binding check closes the
new record. An unsuccessful duplicate insertion does not close the existing one.

Native enumeration establishes a worker's identity, not its creator. The ownership
argument relies on the private factory creating the guarded source, retaining
the native handle and keeping its birth channel private. The controller cannot
independently inspect Blob bytes or infer parentage from a matching URL. Proving
this factory/channel ownership and closure over every reachable native constructor
remains a C2/C3/C6 obligation.

The factory sends the returned metadata and application start packet on the private
startup port. The guard validates the metadata, reserves its own native policies,
prepares the realm and verifies the parent chain before loading the application.
Application messages wait until an application listener is installed. Module mode
comes from controller metadata rather than a bootstrap filename. Resource aliases
use the canonical application/context directory rather than the opaque Blob URL.

Termination records the existing owner-scoped closure even when native binding
has not completed. The durable store rejects a later insertion for that child.
Local closure suppresses a late startup reply, closes the broker and terminates
the native worker. Startup success, failure and termination release the bootstrap
object URL. These steps still require the broader lifecycle refinement argument.

## Source policy and removed paths

Prepared responses now admit Blob worker sources alongside the existing shared
and publisher bootstrap directory and controller script. Frame sources retain
their previous restrictions. The private TrustedScriptURL gate must reject raw
native constructor calls; admitting Blob URLs in CSP is not sufficient by itself.
The existing fresh-realm counterexample remains relevant to preparation coverage.

The dedicated HTTP bootstrap handler and separately published `worker-guard.js`
asset are removed. Shared and publisher roots retain their HTTP adapters. Their
names include policy version 7 so earlier prepared globals are not reused.

## Validation and remaining work

`test/worker-birth.test.ts` checks actual binding logic with injected native-client
snapshots: successful admission, ambiguous or missing clients, generation changes,
pre-binding cancellation, duplicate insertion and malformed packets. These are
protocol unit tests, not native browser identity observations.

`test/worker-contexts.ts` exercises the built host in Chromium and Firefox. It
records native Blob bootstrap URLs, classic/module and nested execution, offline
loads, message transfers, source failures, closure and unrestricted receiver
controls. The closure fixture now obtains the context ID from the durable record
matching the browser-observed Blob URL. Its privileged inspection code is absent
from production.

The resource-fetch fault comparison changes the worker realm while compiling
the embedded guard. Altering a removed HTTP asset would no longer exercise this
boundary. It also waits for the application's warmup function, since observing
the button does not establish completion of script evaluation.

Classic imports, native module graphs, documents, worklets, publisher executors
and DOM/CSS resources still need local-delivery or registration-lifetime arguments.
The [startup regression](service-worker-maintenance.md) now records 32 samples
against this candidate. Confined classic/module startup with dependencies emits
no HTTP in either browser; every native control group demonstrates updates.
Aged registrations and the remaining HTTP paths remain open C4 obligations.

The [validation record](local-worker-startup-validation.json) binds the current
worker, resource, closure, caller and maintenance receipts to one frozen source
and build. It also records all eight unchanged applications passing their selected
tasks and offline reloads in both browsers. Earlier batches are not used to
certify the corrected strict-mode wrapper.
