# Dedicated workers with local bootstrap

The policy-7 candidate creates dedicated workers from a host-owned Blob instead
of the former HTTP bootstrap route. Application entry scripts and imported modules
still use admitted HTTP resource routes. This change addresses bootstrap delivery;
complete confinement remains unestablished.

The policy-8 candidate extends this path with local classic-script delivery as
described below. The policy-7 validation receipts retain their original scope.

## Local classic scripts in policy 8

Controller metadata includes an index of admitted JavaScript resources, selected
by MIME type. Before a classic worker executes application code, it reads those
resources through its authenticated resource broker and retains their bytes
locally. A missing response, invalid MIME type, oversized set or closure aborts
preparation without network fallback.

Entry loading and later `importScripts` calls resolve admitted resources to local
Blob URLs. Relocation and Blob construction happen only when a script is requested;
the worker retains that URL for repeated synchronous imports. Other admitted
script bytes remain available without parsing every script at startup. Closing
the set revokes its created URLs and prevents late publication. Native worker
termination also ends that worker's lifetime; the complete lifecycle argument
remains open.

URL fragments select the same admitted script bytes while remaining on the local
Blob URL. Unknown queries retain their separate identity and fail locally. The
[fragment regression](classic-script-fragments.json) records the initial lookup
failure, the unit checks and native entry/importScripts cases in both browsers.

The existing literal-import relocation preserves the original base for supported
import forms. Computed relative dynamic imports still need a module-delivery
solution: moving a classic script to a Blob URL does not preserve their native
base automatically. Module workers retain their HTTP module path. The
[forced-age regression](service-worker-maintenance.md#forced-aged-registration-comparison)
records an update request from that path. Neither the classic change nor the
[loader assessment](module-loader-assessment.md) establishes complete C4 coverage.

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

The policy-7 [archived startup receipt](service-worker-maintenance-policy7.json)
records 32 fresh-registration samples. Confined classic/module startup with
dependencies emits no HTTP in either browser; every native control group
demonstrates updates. The later forced-age counterexamples show why that result
cannot close C4.

The [policy-7 validation record](https://github.com/privacy-frames/host/blob/56a6405f094ef76e5c0ef15ac799c3ff35d5bbbe/formal/runtime-verification/local-worker-startup-validation.json)
binds that revision's worker, resource, closure, caller and maintenance receipts
to one frozen source and build. It also records all eight unchanged applications
passing their selected tasks and offline reloads in both browsers. Read its
referenced artifacts at the pinned revision; it does not certify policy 8.
