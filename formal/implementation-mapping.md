# Model-to-implementation mapping

This mapping describes the verification worktree, including the live-phase
bookkeeping simplification documented below. Individual receipts pin the exact
source and artifact hashes they checked. Line links are navigation aids, not a
claim that the TLA+ actions are generated from TypeScript. A narrow Registry trace
comparison exists; there is no refinement relation for the combined runtime and
browser boundary.

## Meaning of the modeled states

`Lifecycle.Prepare` means that the local execution environment has installed
its restrictions. It does not mean that the controller's ContextIdentity has a
particular live phase label. Those serialized labels remain valid for normal
controller updates, but readiness and content delivery no longer advance them.
The controller now revalidates effective identity/capability after asynchronous
work without writing diagnostic phase transitions
([model.ts](../src/runtime/contexts/model.ts)). The local guard still prepares the
realm before application execution and publication.

`Publish` concerns access to execution authority, not every returned JavaScript
handle. The worker factory returns a native Worker handle before its ready
message, but intercepts message delivery and supports termination
([worker-factory.ts](../src/runtime/contexts/worker-factory.ts),
[worker-factory.ts](../src/runtime/contexts/worker-factory.ts)). Popups
initially return a facade
([popup-factory.ts](../src/runtime/contexts/popup-factory.ts)). Neither
case is equivalent to exposing an unrestricted Window or WorkerGlobalScope.

## Lifecycle correspondence

| Model action or invariant      | Concrete mechanism                                                                                                                                                                                                                                                                                                                                                                    | Correspondence limit                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateRoot`                   | A document navigation binds `event.resultingClientId` to a new root identity and serves a trusted shell, [worker.ts](../src/runtime/worker.ts).                                                                                                                                                                                                                                       | URL parsing identifies an installation, while the browser client binding supplies authority. These are separate steps.                                                                                                                   |
| `CreateChild(c,p)`             | Child document intents derive their owner from the authenticated browser message source, [document-controller.ts](../src/runtime/contexts/document-controller.ts), and bind the reserved navigation client, [document-controller.ts](../src/runtime/contexts/document-controller.ts). Dedicated workers bind the browser's resulting client at [worker.ts](../src/runtime/worker.ts). | The model has one generic child action. Documents, dedicated workers, shared workers and worklets have different startup protocols.                                                                                                      |
| `Prepare(c)` for windows       | `prepareWindowRealm` installs intrinsic, resource, script, context, navigation, DOM, effect and storage policies before sealing bindings, [window-realm.ts](../src/runtime/contexts/window-realm.ts). Root rendering follows preparation, [guard.ts](../src/runtime/guard.ts).                                                                                                        | A single action abstracts many calls that can fail and native effects that must remain unavailable during setup.                                                                                                                         |
| `Prepare(c)` for workers       | `prepareWorkerRealm` runs before the first bootstrap message can request publisher loading, [worker-guard.ts](../src/runtime/contexts/worker-guard.ts). It installs effects and storage restrictions, [worker-realm.ts](../src/runtime/contexts/worker-realm.ts).                                                                                                                     | The real worker exists before publisher code runs. Native bootstrap execution is distinct from application execution.                                                                                                                    |
| `PublishedIsPrepared`          | Child guard reports completion only after local preparation and private compilation, [document-main.ts](../src/runtime/contexts/document-main.ts). Parent checks source Window, origin, context ID and parent token, [document-factory.ts](../src/runtime/contexts/document-factory.ts).                                                                                              | The model assumes those checks establish the intended child. It does not model WindowProxy identity, event dispatch or token transport.                                                                                                  |
| Child publication              | `publish` uses state-preserving movement and checks that Window and Document identities survive, [document-factory.ts](../src/runtime/contexts/document-factory.ts). `reference` returns null until the prepared, connected identities match, [document-factory.ts](../src/runtime/contexts/document-factory.ts).                                                                     | Closed shadow roots and getter interception are concrete mechanisms, not consequences of a TLA+ phase label. Indexed/named access and alternate reference paths need browser tests.                                                      |
| `Run(c)` / `NoUnsafeExecution` | Child rendering waits for the parent publication acknowledgement, [document-guard.ts](../src/runtime/contexts/document-guard.ts), then runs at [document-guard.ts](../src/runtime/contexts/document-guard.ts). Worker loading validates source/base and only then imports or executes it, [worker-realm.ts](../src/runtime/contexts/worker-realm.ts).                                 | Worker `ready`, application listener installation and complete module evaluation are different events. Top-level await can separate them.                                                                                                |
| Parent/child startup ordering  | Child startup acknowledgements and load events pass through generation-checked deferred actions, [document-factory.ts](../src/runtime/contexts/document-factory.ts). Parent classics run before release, [document-renderer.ts](../src/runtime/contexts/document-renderer.ts).                                                                                                        | Lifecycle now permits child creation while its parent is published but has not run. The `NoChildBeforeParentRun` reachability control exercises that interleaving; actual parent-classic ordering remains a separate browser obligation. |
| `Replace` / `CurrentOwners`    | Installations get fresh generations, [storage.ts](../src/runtime/storage.ts). Resource reads check the expected generation, [storage.ts](../src/runtime/storage.ts), and controller identity resolution compares it with the installed generation, [worker.ts](../src/runtime/worker.ts).                                                                                             | Atomic model replacement is an abstraction. Real storage writes, pending requests and browser-context termination are not one atomic operation. `CurrentOwners` checks epoch freshness, not every parent-ownership decision.             |
| `NoStaleAcceptance`            | Document intents and content consumption compare installation generation, [document-controller.ts](../src/runtime/contexts/document-controller.ts); publisher executor lookup does the same, [publisher/controller.ts](../src/runtime/publisher/controller.ts).                                                                                                                       | There is no universal generation field on every real message. Management commands and context RPC have different validation. Model `Accept` must not be read as their shared implementation.                                             |

The original `Confinement` sketch also names `PreparedBeforeRun` and
`PreparedBeforePublication`. Its historical `ran` set and current phase coincide
only because that sketch has no close action. Adding closure must preserve the
fact that a past execution was prepared without requiring its context to remain
published forever. The newer Lifecycle model records unsafe execution separately.

## Admission and resource delivery

| Model action or invariant         | Concrete mechanism                                                                                                                                                                                                                                                                       | Correspondence limit                                                                                                                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Begin`, `Verify(r)`              | Installation downloads declared resources and parses source data through [import-website.ts](../src/installation/import-website.ts). Runtime admission independently validates format, identity, paths, bytes, hashes and capture metadata, [admission.ts](../src/runtime/admission.ts). | A model resource is an atom. Actual URLs, MIME types, fragments, canonical paths, rewritten bytes and hash computations are not modeled.                                                                            |
| `Commit`, `NoUnverifiedAdmission` | The authorized management handler calls `admitInstallation` before `putApp`, [worker.ts](../src/runtime/worker.ts). Metadata and resource bodies are written in the storage transaction, [storage.ts](../src/runtime/storage.ts).                                                        | Model Commit accepts any nonempty verified subset. It does not express completion of every required explicit-list URL or failure of a required download.                                                            |
| `NoUnauthorizedCommit`            | A management message must resolve its actual source client, match the management URL and have a controller-issued management role, [worker.ts](../src/runtime/worker.ts). Roles are granted on trusted management navigation, [worker.ts](../src/runtime/worker.ts).                     | `ForgedInstall = FALSE` assumes these mechanisms hold. A caller-supplied role or URL is not the implementation's authentication mechanism.                                                                          |
| `NoApplicationDuringInstall`      | The installer collects source and validates prepared documents; publisher worker lifecycle execution is deferred to runtime registration.                                                                                                                                                | Trusted installer and host bootstrap downloads are permitted setup traffic. The model's remote flag must concern forbidden application traffic, not all network activity in every phase.                            |
| `Request(r)`, `NoRemoteTraffic`   | The fetch handler resolves the owning installation, matches an admitted resource, and reads its stored bytes, [worker.ts](../src/runtime/worker.ts). Unmatched requests and handler failures return `Response.error()`, [worker.ts](../src/runtime/worker.ts).                           | This maps controlled fetch delivery. It does not enumerate WebSocket, WebRTC, navigation, browser services or every native default action.                                                                          |
| Worker resource reads             | `contextResourceResponse` checks request shape, context capability, generation, destination and exact resource path, [resources.ts](../src/runtime/contexts/resources.ts).                                                                                                               | An empty browser caller ID may use the context bearer for immutable graph reads, [model.ts](../src/runtime/contexts/model.ts). That limited capability does not establish browser identity or management authority. |
| `WritePrivate`                    | Application storage wrappers namespace data. Installation replacement writes the new metadata database without deleting app-private storage.                                                                                                                                             | `stored` is a reachability flag, not an information-flow label or a proof of storage isolation. The prototype does not promise separate browser permissions or origins per installation.                            |

`NoStoredPrivate`, `NoRunningChild`, `NoReplacement` and `NoChildBeforeParentRun` are deliberately violated
reachability checks in their corresponding configurations. They demonstrate that
useful actions can occur; they are not security requirements of the host.

## Worker and publisher authorization

Raw worker, shared-worker, worklet and service-worker startup destinations are
rejected unless their dedicated controller route handles them
([worker.ts](../src/runtime/worker.ts)). Dedicated-worker bootstrap requires
an authenticated parent and a reserved resulting client. Shared-worker bootstrap
has its own owner and browser-binding checks
([shared-controller.ts](../src/runtime/contexts/shared-controller.ts));
connection tickets are consumed against the actual application actor
([shared-connections.ts](../src/runtime/contexts/shared-connections.ts)).
Worklet requests retain the owning Window client and reject a newly resulting
client ([worklet-controller.ts](../src/runtime/contexts/worklet-controller.ts)).
These are different authorities, despite sharing an abstract context label.

The trusted host service worker is distinct from publisher service-worker
behavior. Publisher registration accepts only captured executable resources and
validated scope/type metadata
([publisher/controller.ts](../src/runtime/publisher/controller.ts)). Its
executor is a prepared shared worker, not a native service worker with controller
authority. Registration, executor bindings and expiring grants live in
transactional storage; ticket consumption checks the current binding
([publisher/store.ts](../src/runtime/publisher/store.ts)). Install/activate
completion is recorded only after executor startup
([publisher/guard.ts](../src/runtime/publisher/guard.ts),
[publisher/store.ts](../src/runtime/publisher/store.ts)).

Publisher interception can change an already-admitted non-executable response;
it does not expand the resource graph. Invalid, redirected or executable
representations are refused
([publisher/controller.ts](../src/runtime/publisher/controller.ts)). A
typed executor-lifecycle failure may return the original admitted response after
rechecking generation and ownership
([publisher/controller.ts](../src/runtime/publisher/controller.ts)). That
local fallback is not the modeled `NetworkFallback` fault.

`NoForgedAuthority` therefore covers several concrete boundaries: management
roles, parent ownership, context identity, tickets and executor bindings. The
current boolean leakage switch does not prove that no unrestricted browser
reference or control callable can cross application callbacks, errors or proxies.

## Revocation and durable-state gaps

Each registry retains its local mutation queue, while native IndexedDB
transactions enforce binding and closure across independent controllers.
`closeChild` delegates the parent/application/context check and durable update
to one storage transaction. There is no later general phase writer that can
replace the closed identity. Document cancellation also installs a fresh private
generation object and closes its protocol state
([document-factory.ts](../src/runtime/contexts/document-factory.ts)).

Lifecycle models installation replacement as atomic revocation. It does not
establish the transaction-callback implementation, controller restart, queued
callbacks or native termination. `closeChild` does not recursively traverse
descendants. Worker descendant termination and orphan Window behavior require
separate browser/context arguments.

The separate [generation read model](confinement/generation-reads.md) models an
IndexedDB snapshot and delivery after replacement, and links it to observed
browser overlap tests. It does not yet compose with Lifecycle's revocation rule.

## Browser obligations and evidence

The source relies on browser-assigned client IDs, request destinations and
resulting-client IDs; origin/source information on messages; service-worker
control of the relevant fetches; CSP and response sandbox enforcement; native
DOM identity; and state-preserving context movement. Child bootstrap checks its
actual controlling script
([document-main.ts](../src/runtime/contexts/document-main.ts)). Response
policy adds CSP restrictions
([response-policy.ts](../src/runtime/response-policy.ts)); its optional
Connection-Allowlist header is supplemental and cannot supply the same assurance
in browsers that do not implement it. Other browser transports need the local
effect policy and independent behavioral evidence.

Relevant existing fixtures include the registry race and restart cases in
[context-model.test.ts](../test/context-model.test.ts), admission checks in
[runtime-admission.test.ts](../test/runtime-admission.test.ts), publisher
response cases in
[publisher-events.test.ts](../test/publisher-events.test.ts), and the actual
browser document/worker/publisher suites. Their receipts retain the source and browser scope of each run. The Registry comparison below concerns a separate, narrowly defined trace
projection.

## Narrow Registry implementation conformance

[Registry.tla](confinement/Registry.tla) separates one context's effective binding
state from owner/other closure requests. `Bind` maps to `ContextRegistry.bind`;
`Revalidate` abstracts `isCurrent` and `isCapabilityCurrent`; owner/other close
actions map to `closeChild`. The current implementation no longer writes live
phase transitions. Persisted `preparing`, `ready` and `running` labels all project
to `bound`; they neither grant authority nor establish guard preparation. A
closed effective record is unavailable. `ReviveClosed` injects acceptance of a
closed binding, rather than an obsolete phase rewrite. The invariants exclude
binding after an owner close request, accepting closed authority and closing an
existing identity on behalf of another parent.

The [trace test](confinement/registry-trace-test.ts) enumerates all 10,000
length-four sequences over ten operations against actual ContextRegistry code.
Its [receipt](confinement/registry-implementation-traces.json) records 40,000
transitions checked against the TLC-generated eight-state graph or accepted as
stuttering. The receipt hashes the tested source and model inputs. This is a
finite sequential safety comparison; allowing stuttering does not require every
model-permitted operation to succeed in the implementation. Explicit result
assertions require current live authority to succeed and closed, absent or
mismatched authority to fail.

The enumerated operations include both revalidation forms, wrong browser-client
IDs, wrong URLs, stale context IDs and stale installation generations. After
each operation the test checks direct and empty-caller bearer capabilities,
including rejection of a different client. Supplemental seeded-record checks
exercise all four persisted phase labels and each authority-stamp field, and
reject a closed expected identity, and require revalidation to perform no storage
writes. These seeds are not additional
TLC transitions. The test does not establish bearer secrecy or browser identity.
A wrong-owner mutation is checked separately and must fail.

`CloseOwner` is an atomic abstract completion, not the point where the caller
enqueues a close request. This sequential comparison does not establish queue
ordering or cross-instance linearizability; deterministic implementation tests
exercise selected such schedules separately.

The test's `Replace` constructs another ContextRegistry over the same in-memory
store. It represents loss of the registry object's mutation queue, not the
installation-generation replacement modeled by Lifecycle. The test does not
execute native IndexedDB persistence, concurrent requests, actual browser client
authentication, guard preparation, publication or worker termination. Those
mechanisms remain outside its correspondence claim.

The main remaining correspondence work is to define observable events for actual
guard completion, publication, authenticated operation, response delivery and
revocation; collect browser/controller traces with generation and owner fields;
and check them against the model's allowed transitions. The current single
network flag is a safety abstraction, not a two-run noninterference property or
a complete account of browser communication.

The FedCM finding illustrates this gap. `LifecycleUnmediatedEffect.cfg` produces
a `NoRemoteTraffic` counterexample when the model permits a bypassing effect.
The [browser receiver test](fedcm-conditional-probe.ts) found a concrete
service-worker-bypassing request in the earlier implementation. The test then
checks a source fix; it does not show that all other browser effects are modeled.

## Atomic context bindings across controllers

`ContextRegistry` now delegates insertion and closure to dedicated storage
operations. The former CacheStorage implementation checked absence, wrote a
client record, and wrote its reverse index in separate operations. Two controller
instances could pass the checks and both report a successful bind. The new
IndexedDB store inserts one record keyed by browser client, with a unique native
index on context identity. There is no generic identity-write operation.

Binding checks pending owner-scoped cancellation and inserts the record in one
read/write transaction. Closure checks the indexed identity and its parent and
application, then writes cancellation and the closed identity in one transaction.
A cancellation before binding is retained for that parent/application/context;
it does not cancel a different parent's later binding. Closed records retain
their identifiers, so the API cannot rebind or reopen them.

The operation acknowledges success from the transaction's completion event,
not an individual request's success event. An aborted insert must leave neither
a client record nor a reverse index. The argument relies on IndexedDB's
[transaction scheduling](https://w3c.github.io/IndexedDB/#transaction-scheduling)
and [unique-index contract](https://w3c.github.io/IndexedDB/#index-unique-flag).
Those are browser premises; this implementation has not received a deductive
proof of all transaction callbacks. Successful binding and closure
linearize at their transaction commits. Native actor authentication and the
later publication or reply-delivery point remain separate obligations.

All reads and writes use transactions covering both context and cancellation
stores. Independent controllers open separate connections to the same
base-specific database. Controller replacement can retain compatible records;
installation replacement still changes the installation generation and requires
separate revocation checks. The former cache format is not imported. Existing
application data is outside this context database.

### Evidence

Run the native storage fixture with:

```sh
npm run build
node test/controller-context-storage.ts
```

It exercises the actual store and registry through independent native Windows
and workers in Chromium and Firefox. Browser-client identifiers are simulated;
this fixture does not authenticate native FetchEvent actors. Conflicting client
keys, context identifiers and exact duplicates admit one insertion; independent
bindings admit both. A terminated and recreated worker reads the same closed
record. Competing bind and close operations leave no live binding, and an abort
after insert-request success rolls back the record and index before a later
valid insertion succeeds.

Two test-only builds remove actual constraints independently. Replacing `add`
with `put` permits duplicate-client successes. Disabling the unique context index
permits duplicate-context successes. The unchanged fixture detects both faults.
The [receipt](../results/contexts/controller-storage.json) records normal and
mutated source/bundle hashes, browser versions and per-case outcomes.

The [registry concurrency tests](confinement/registry-concurrency-test.ts) cover
selected asynchronous suspensions around actual registry operations using an
atomic in-memory storage fixture. The
[trace comparison](confinement/registry-implementation-traces.json) checks 10,000
length-four operation sequences against the TLC graph or stuttering steps. Its
record includes the storage fixture hash. Neither fixture proves native storage
semantics or arbitrary browser interleavings.

The [document-consumption race](../test/document-consumption-race.ts) uses real
IndexedDB intents and simulated actors/context storage. It pauses after content
consumption and changes child or parent authority. Final checks refuse the
changed cases; separate source-removal controls show why those checks matter.
The native storage fixture and consumption fixture cover different boundaries.

### Native binding entry points

There are five production calls to `contexts.bind`:

- Root navigation and dedicated-worker bootstrap in
  [worker.ts](../src/runtime/worker.ts).
- Child documents and popups in
  [document-controller.ts](../src/runtime/contexts/document-controller.ts).
- Shared-worker bootstrap in
  [shared-controller.ts](../src/runtime/contexts/shared-controller.ts).
- Publisher executor bootstrap in
  [publisher/controller.ts](../src/runtime/publisher/controller.ts).

Each uses the browser-supplied `FetchEvent.resultingClientId` and awaits binding
before returning its trusted shell or script. Storage now rejects a conflicting
binding even if two dispatches supply the same identifier; uniqueness no longer
requires a proof that such dispatches are unreachable.

Binding success still does not establish prepared application execution or
management authority. Root content, child content and resource requests retain
their context and installation checks. Management requires its separately issued
browser-client role. Complete correspondence must connect transaction commit,
reply delivery, preparation, publication, cancellation and controller replacement
to the lifecycle model. Closure of a record does not prove native termination or
cancel an already-admitted effect.
