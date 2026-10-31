# Confinement verification: working results

The target is to prevent an application from causing a remote request or
connection while it handles private input. Installed applications may share
storage and browser permissions; storage namespaces are a compatibility feature,
not a confidentiality guarantee between applications. The detailed assumptions
are in [the threat model](threat-model.md).

## What this work found

A [worker-maintenance experiment](runtime-verification/service-worker-maintenance.md)
reproduces a violation of the current no-application-caused-network contract.
After confinement, an application creates a worker only when a private input bit
is `1`. The runtime supplies its bootstrap locally, but the browser requests the
trusted service-worker script separately. Chromium and Firefox reproduce this
behavior in both input orders, with quiet idle and bit-0 controls. No publisher
request occurs. This finding concerns the occurrence of a fixed-URL request;
preventing payload-bearing application requests does not prevent it. A repair
and its coverage argument remain open.

The [native backend comparison](runtime-verification/maintenance-backends.md)
tests possible repairs. Blob workers avoid their initial update request, but
Firefox also updates after creating local document contexts. A forced-stale
Firefox profile updates after a cached resource fetch. Unregistration preserves
the existing page's local delivery but loses interception for a new Blob worker
in Firefox. These results rule out either change as a complete repair on its own.

The [registration overlap experiment](runtime-verification/registration-overlap.md)
finds that reusing an unregistered scope reopens Firefox's local-document update
path while the original page retains its controller reference. Distinct sibling
scopes avoid that trigger in the 27 observed cases. An unbounded scope/queue model
checks the corresponding lifetime condition and records its implementation and
browser assumptions. A per-launch allocation and preparation protocol remains
to be implemented.

A synthetic test with a seeded FedCM connection exposed a conditional escape in
the earlier runtime: `IdentityCredential.disconnect` sent an application-selected
marker to the runtime-origin server outside the service worker. The test did not
establish how the required connection and identity-provider endpoints could be
created in the deployed host. A fix disables the identity permission and the
relevant static methods. It passed a calibrated
receiver test, the existing browser suite and the local application corpus. The
fix was first deployed from host revision `ebc6d0f784dd0943a8342879996e206eed86b271`;
the [finding and reproduction](browser-surface-inventory.md#conditional-fedcm-receiver-finding-and-fix)
describe the prerequisites and checks.

Two registry instances can both accept a binding for the same client in a
deterministic storage-level schedule. The later record wins, and the tested
stale resource capability is refused. Browser reachability and other possible
consequences remain open. The [implementation mapping](implementation-mapping.md#duplicate-binding-dispatcher-reachability-and-consequences)
describes the actual dispatcher checks.

A captured resource whose filename looked like a URL scheme could resolve
outside its application directory. Both tested browsers refused to start the
app before its code ran; no request to the receiver was observed. Resource
paths now resolve as relative paths, and admission checks their canonical
location and uniqueness. The [path audit](path-audit/README.md) records the
original reproduction and the tests for the correction. The [eight-app corpus](evidence/compatibility-after-canonical-paths.json)
passed in both browsers against the fixed build; its receipt records the build
hashes because the source change was uncommitted when the run started.
The runtime was deployed from host revision
`fdb2dae51f27a5ad378589cc1a523d0d3f2518e1`. Its live service worker and four
guard files matched the tested build, and a fresh installation passed the
identity and sampled reporting-header checks.

An [exploratory controller-update fixture](startup/README.md) observed a child
remaining unpublished while its guard response was held. One run recorded the
response timing out before the replacement controller activated; a later run did
not capture the expected activation trace. The fixture is not a passing check of
upgrade before publication and is not part of CI.
A separate [test-only guard pause](startup/LOCAL-GUARD.md) passed the intended
upgrade-before-publication schedule in Chromium and Firefox, with an early-release
ordering control. It covers those instrumented schedules, not every interleaving.
The [partial trace comparison](startup/LIFECYCLE-PROJECTION.md) maps these four
observed schedules to the TLC lifecycle graph, with root startup and child
publication explicitly inferred. It rejects 30 deliberately faulty projections.

The receiver tests now include a working HTTP/3 WebTransport endpoint and
native hyperlink-auditing and legacy CSP-reporting controls. In the tested
configurations, the prepared environment blocked WebTransport and hyperlink
auditing. Default prepared responses did not emit marker-bearing legacy CSP
reports. With an artificial trusted reporting endpoint, Firefox delivered such a
report outside the service worker. Full Chromium also sent a modern CSP report
under a test-injected trusted reporting configuration. A deliberately persisted
NEL policy produced no application-marker traffic in the tested prepared case,
with working before-and-after delivery controls. The [surface inventory](browser-surface-inventory.md)
records the configurations and remaining gaps.
The [background-agent probe](background-agents.md) also tests recovery of a
pre-existing native service-worker registration, with working Chromium sync and
background-fetch controls. Periodic sync remains uncalibrated.
The [worker-registration probe](worker-registration.md) tests two getter routes
in installed dedicated and shared workers with native Firefox acquisition controls.
The [navigation-preload probe](navigation-preload.md) calibrates native header
delivery and tests the installed app's two virtual preload interfaces.
Its [fault control](navigation-preload-fault.md) shows a marker reaching the
receiver when navigation cancellation is removed in a test bundle with preload enabled.
The [deferred-fetch probe](fetch-later.md) confirms a native page-close upload
and tests the prepared runtime against that route in Chromium. Removing its
denial in a test build permits the upload.
An [experimental Web Install probe](web-install.md) observes native manifest
requests bypassing the service worker and tests the prepared sandbox's denial.
Removing the sandbox in a test response permits the tested manifest requests.
The [WebSocket fault control](websocket-fault.md) similarly demonstrates a
same-origin connection when its denial is removed in an otherwise prepared window.
The [publisher cache probe](cache-publisher.md) tests a native service-worker
download and an installed virtual publisher's attempt to download an uninstalled
resource.
The [EventSource and beacon probe](eventsource-beacon.md) compares native
receiver controls, service-worker blocking and prepared-window denial. It also
tests a fetch invoked through a WebAssembly import.
The [static-route probe](publisher-routes.md) tests a native Chromium service
worker's network route and the virtual publisher's synthetic install event.
The [client-navigation probe](publisher-navigate.md) compares a native service
worker's ability to navigate a controlled client with the virtual client's facade.

## What has been checked

The [bounded models](confinement/README.md) cover selected lifecycle, admission,
registry and generation-read decisions. Their fault and reachability controls
produce expected counterexamples. The [generation model](confinement/generation-reads.md)
also distinguishes a transaction that reads an old generation before replacement
from a later request that tries to read it after replacement.

The registry comparison checks 10,000 sequential operation sequences against a
TLC-generated graph. Separate deterministic tests exercise two registry instances
sharing a storage stand-in. Chromium and Firefox tests exercise real IndexedDB
replacement overlaps and selected network effects with independent receivers.
The [admission comparison](admission/README.md) checks 32 selected input
combinations in both browsers against a TLC model, with test-only mutations.
The [generation comparison](confinement/generation-reads.md#partial-comparison-with-real-indexeddb-outcomes)
checks 24 observed read/replacement pairs against possible modeled completions;
it does not observe the transaction's internal timing.
The [context-state cleanup](simplification.md#context-liveness-bookkeeping)
removes live-phase bookkeeping writes while retaining queued authority checks
and closure markers; its race tests and compatibility results are documented there.
The [model-to-implementation mapping](implementation-mapping.md) identifies which
code paths correspond to model actions and where that correspondence is missing.
The [Web IDL report](idl-surface-report.md) joins selected standards to observed
browser interface names and highlights members that still need review.
The [worker-context inventory](context-inventory.md) adds native dedicated,
shared and service worker observations to that bounded report.
Its [review queue](route-review/README.md) tracks individual rows and selected
Web Platform Test leads without treating those leads as passing runtime tests.
The [claim ledger](claims/README.md) records enforcement, controls and open
obligations separately, with a check for changes to the cited artifacts.

The [message resource reader](runtime-verification/resource-fetch.md) replaces
window resource fetches with private controller requests and shares admission
logic with native HTTP loads. Its installed test includes a byte-matched guard,
native local-response controls and an actual adapter bypass. Forced-stale
Firefox emits a service-worker update in the native and bypass read cases but
not the normal message case. Worker and native context paths remain separate
maintenance obligations. The [scope overlap experiment](runtime-verification/registration-overlap.md)
also observes updates from local document creation when an ancestor registration
is present, despite the exact old scope remaining absent. The existing abstract
scope model does not establish that browser behavior.

The [Lean authority-graph proofs](lean/README.md) establish a conditional result
for arbitrary finite reference chains and checked edge additions. They do not
prove that the browser or runtime satisfies their premises.
The [implementation navigation experiment](implementation-navigation/README.md)
extracts the actual cancellation condition, checks source order and connects its
restricted semantics to genuine-event receiver tests. Navigation setup now
installs cancellation before private parser evaluation and context factories,
then finalizes the remaining hooks after native popup capture. This reduces the
pre-cancellation helper assumptions; it does not verify the entire JavaScript
runtime or browser.
The [canonical path loop proof](path-lean/README.md) checks an abstract
version of the admission rule for arbitrary finite inputs. Its correspondence
to TypeScript and browser URL behavior is not machine-verified.

These checks do not compose into a proof that the implementation confines every
browser effect. The abstract models assume that important browser and runtime
mechanisms work as specified; the browser tests cover particular routes, versions
and schedules. A new browser API or an untested use of browser-owned state can
expose an unmodeled channel. The [work plan](PLAN.md) tracks the remaining
correspondence, browser coverage and simplification work.
