# Completing the runtime confinement argument

This execution plan follows the eight stages in [the verification programme](README.md).
Implementation stays on the separate `runtime-confinement-proof` worktree and
branch. Policy 7 added local dedicated-worker bootstrap on top of private native
script URL admission. The policy-8 candidate also delivers classic worker scripts
locally. Policy 9 additionally restricts native spelling controls. Complete
confinement and deployment remain pending.

The policy-10 candidate adds local worker module graphs and a shared adapter for
classic and module dynamic imports. Its expanded worker checks pass in both
browsers, and the prepared-worker native-policy fixture passes 24 cases with
stable source and build inputs. Production policy still permits runtime-origin
HTTP; the compatibility loader cannot close that admission gap.

The expanded forced-age comparison collects all 32 samples with working native
controls. Its confined classic, classic-dynamic and ordinary module groups are
quiet. Generated native imports still cause two private-bit-dependent requests
for the fixed runtime service-worker script. The command fails, retaining the
counterexample that the independent native policy must address.

The Window module-policy prerequisite now passes eighteen native component cases
under intrinsic and Trusted Types preparation. Local graphs preserve the selected
semantics; the added native policy rejects HTTP imports and registry bypasses.
The next production change must prepare local initial and dynamic scripts before
publication, apply that policy, and preserve it in every supported child context.
The fixture does not establish full Window preparation or resource authority.

Policy 11 now supplies a validated installed-script inventory to root and child
Windows, sharing the worker MIME classifier. The unknown-input parser rejects
missing or sparse lists, duplicate entries and addresses outside the admitted
resource map. Its 202 unit checks, full regression suite and unchanged eight-app
comparison pass with sixteen offline reloads and stable source/build inputs.
This is the protocol input for local Window delivery; that delivery and the
independent native policy still need implementation before publication.

Policy 12 now prepares root and child Window scripts through the private resource
reader before publication. Native import maps link local Blob modules; the worker
shim remains limited to workers. The installed-runtime graph comparison preserves
cycles, live bindings, top-level await and alias identity in both browsers. The
[initial-policy fixture](native-window-policy.md) passes sixteen HTML/SVG cases,
including native HTTP controls and denials. Its SVG bootstrap uses a self-contained
data URL after Firefox rejected inline SVG under Trusted Types. Production native
HTTP denial and the complete registration-lifetime argument remain pending.

The [policy-12 candidate index](policy12-validation.json) now binds 208 unit checks,
the full regression suite, 32 unchanged native/confined application tasks and
sixteen offline reloads to stable source and build inputs. An asynchronous
readiness calibration also replaces two test waits that accepted promises before
their Boolean conditions held. The aged-registration comparison collects all
32 samples with working native controls and retains two generated-import requests
for the runtime service-worker script. Production native HTTP denial remains the
next security change; complete C1–C8 and deployment remain pending.

The target remains [C1–C8](../threat-model.md): confined application activity cannot
cause a remote request or connection, including to the runtime origin. Whether
and when a request occurs count as observations. Private state may already exist
at launch. Ordinary asynchronous JavaScript, permitted prototype modification,
unchanged applications and static hosting remain requirements. Storage namespaces
are a compatibility feature; enforcement-state integrity remains necessary.

The next candidate delivers the trusted root and child Window kernels through
data URLs from cached host bytes, removing the child HTTP kernel route. The
expanded native-policy fixture passes 24 HTML-inline, HTML-data and SVG-data
cases at production bootstrap size. Installed dynamic-script and document-context
checks pass in both browsers. Production HTTP denial remains pending.

The [native worklet comparison](native-worklet-policy.md) passes twelve cases
with working HTTP controls. Blob dependency graphs run under HTTP-denying script
policy, but neither engine applies a Window import map to a worklet graph.
Worklets therefore require separate local graph preparation before that policy
can be integrated across all supported contexts.

The compiler calibration rejects esbuild's handling of cyclic lexical
initialization: native Worklets reject the source, while its bundled output
runs. The pinned Rollup browser distribution retains the selected native
rejection. The [local graph candidate](local-worklet-graph.md) now passes six
native/private-service-worker comparisons for shared cycles, live bindings,
repeated and throwing entries, and selected prototype mutation. Eight real-guard
controls retain preparation before application registration. Per-browser
omission builds demonstrate that the test detects a missing preparation
dependency without changing production source or artifacts. The production
factory and its native HTTP policy still need integration; these component
results do not close the maintenance counterexample.

The next candidate's complete eight-app command fails after 32 successful tasks:
Firefox StackEdit's screenshot times out waiting for fallback fonts, preventing
its offline check. A focused unchanged run reproduces the screenshot failure.
An [owned diagnostic](local-kernel-font-diagnostic.json) continues after that
failure and passes offline persistence;
it is not a passing result for the original command. Standalone native font
probes settle for valid bytes, 404 and service-worker network errors. An additional
[diagnostic](local-kernel-font-offline-diagnostic.json) switches offline before
the screenshot and still encounters the font wait. The font cause remains open;
neither diagnostic changes the original test or application. Their archived
runner texts preserve the exact environment-specific scripts used.

The [policy-12 CI record](ci-policy12.json) retains the remote validation failures.
Its WebAssembly failure reproduces locally: Window preparation resolves captured
relative imports against the publisher base rather than the installed resource
path. The next candidate fixes that base and passes the unchanged WebAssembly
fixture, including offline reload and module-worker execution, in both browsers.
The CI diagnostic resolver call now supplies its parent URL, and the positive
readiness calibration uses a separate startup deadline from its negative controls.

## Starting position

The [spelling-service comparison](ua-spelling.md) reproduces a browser-owned
private-text transmission that ordinary private-mode tests missed. In its
selected normal Chromium profile, the policy-9 candidate suppresses transmission
and retains disabled spelling through twenty DOM checks. Restoring
the actual native IDL setter in a temporary guard restores transmission. This
closes the selected reproduction, while user-preference overrides, other browser
services and complete C4 coverage remain open.

The [policy-9 validation](policy9-validation.json) binds 199 unit checks, the full
browser suite, 32 selected unchanged application tasks and 16 offline reloads to
one stable source/build. Its 48 fresh maintenance samples pass with native
controls, while its 24 forced-age samples retain four violations. The separate
[shared-issuer comparison](local-shared-issuer.md) finds a private bootstrap-port
transport that works in both tested engines; authentication, lifetime and
production integration remain open.

Atomic context binding and owner-scoped closure now use IndexedDB. Private parent
channels and selected executable state functions have native tests or deductive
checks. Complete protocol correspondence and browser coverage remain open.

CI at policy-9 revision `0e6c9f6` independently reproduces the four aged-registration
violations with working native controls. Its fresh comparison observes no confined
HTTP but lacks Chromium classic and module positive controls. The archived
[fresh](service-worker-maintenance-ci-policy9.json) and
[forced-age](service-worker-startup-stale-ci-policy9.json) receipts retain both
outcomes; the fresh comparison is inconclusive.

Application-triggered HTTP worker startup was a demonstrated policy-6 violation.
The policy-7 local startup candidate passes 32 fresh-registration classic/module
samples with working native update controls. A subsequent Firefox experiment
forcing the aged-registration update branch reproduces a classic startup request.
Local classic entry and importScripts delivery removes that request in the
selected policy-8 samples. Module startup still produces an update request in
that experiment; complete C4 coverage remains open. The
[maintenance notes](service-worker-maintenance.md) preserve both counterexamples.

Policy-8 validation now records 48 fresh-registration samples without HTTP and
24 forced-age samples with four violations across classic dynamic import and
module workers. The full test suite and all eight unchanged applications pass
against one stable source/build candidate. These results do not close C4.

The [module-policy candidate](module-loader-assessment.md) independently combines
Blob roots, local module delivery and native CSP. Its 24 native fixture cases
include working HTTP controls and zero HTTP in all 12 restricted cases. Integrate
local script delivery and that policy across the runtime's contexts, then
revalidate module semantics and confinement. Keep the loader outside the security
argument for HTTP admission; its custom fetch hook alone is insufficient.

The later CI startup comparison lacks a Chromium classic-dynamic positive
control; a local retained-worker comparison also lacks its first native control.
Those runs remain inconclusive comparisons. The current runner collects all
groups and both worker lifetimes before checking missing controls and forbidden
effects. The independent module-policy candidate also has 21 passing CI cases
at revision `23ca1b1`, before its module-graph comparison was added.

The local registration-fence experiment adds nine native observations:
same-scope unregistration waited for a held update, and a later update failed
without a second request. It covers an unchanged script and selected schedules;
it establishes neither a production launch barrier nor a whole-browser drain.

An earlier model workflow lacked a Chromium maintenance positive control. The
policy-7 local validation and later model workflow `41267918060` pass the fresh
regression with working controls. Those results do not cover the aged-registration
counterexample or certify policy-8 source changes.

## Immediate execution order

The stages below describe the complete argument. Execute the remaining work in
the following order, retaining a checkpoint after each accepted change. Planning
does not authorize treating any outstanding obligation as satisfied.

1. **Reconcile the evidence.** Preserve remote revision `416cde6` and the next
   candidate separately. Record which source, build, browser settings
   and runner produced each receipt. Keep failed and inconclusive comparisons.
   Update the claim ledger only after reviewing the evidence it references.
   Acceptance requires a reproducible baseline with no historical result presented
   as verification of changed code.

2. **Resolve the reproduced browser-service channel.** The owned spelling fixture
   records synthetic private text reaching a local substitute for the remote
   spelling service from the installed runtime. The unrestricted and strict-CSP
   cases also transmit; the attribute-disabled and incognito cases do not. The
   fixture deliberately expects this reproduction, so its completion is not a
   confinement pass. Evaluate enforcement before initial markup, subsequent DOM
   insertion and attribute/property changes can enable checking. Test ordinary
   persistent profiles with the service enabled, including attempts to restore it
   and removal of the actual mitigation in a temporary build. Establish the limits
   of the browser's treatment of `spellcheck=false`: the
   [HTML standard](https://html.spec.whatwg.org/multipage/interaction.html#spelling-and-grammar-checking)
   permits user preferences to override that attribute. If the host cannot enforce
   a necessary browser condition, record a platform obstruction. Do not infer a
   universal guarantee from the attribute-disabled observation.

3. **Close the reproduced script-loading channel.** Integrate the local module
   delivery and native-policy candidate incrementally. Its independent fixture
   passes 24 cases in each of two profile modes; runtime integration remains open.
   Cover root documents, dedicated and shared workers, publisher executors and
   other admitted contexts. Recheck cycles, live bindings, dynamic imports,
   logical URLs, asynchronous execution and offline relaunch. Require working
   update controls and zero forbidden effects with fresh and aged registrations,
   retained controllers and restarts. Delete superseded delivery paths once the
   replacement meets these checks. A compatibility loader's mutable state must
   not be the authority deciding whether an HTTP request is allowed.

4. **Reduce and verify the trusted boundary.** Follow stages 2–4 below: trace
   authority, move decisions into private components where useful, and verify the
   executable callers as well as their state helpers. Cover management identity,
   resource admission, context publication and closure. Connect concrete state
   changes to the lifecycle model. Keep ordinary application prototypes mutable;
   prove the ownership and captured-operation requirements used by trusted code.
   Prefer removing an authority-producing path to adding another overlapping
   wrapper when unchanged application tests support the simplification.

5. **Review browser coverage and challenge each mitigation.** Follow stages 5–6
   below, including browser-owned services and retained profile state. Use normal
   profiles as well as isolated test contexts. For each effect mechanism, record
   the initiating algorithm, prerequisites, pending work, mitigation and evidence.
   Pair attempts with working controls and independent receivers. Require selected
   tests to detect removal of the actual mitigation. An unknown mechanism stays
   unresolved; an inventory count is not a completeness proof.

6. **Compose the proof and evaluate the release.** Follow stages 7–8 below. Bind
   the implementation contracts, lifecycle correspondence and browser premises to
   one frozen candidate. Re-run the unchanged application corpus and relevant
   proofs and native tests. Publish either the conditional confinement argument
   with its premises established for the declared environment, or the component
   results and concrete obstruction that prevent it. Keep production deployment
   separate from research checkpoints; a known violation prevents describing a
   candidate as satisfying the complete confinement contract.

The deliverables are a concise security claim, an authority map, executable
contracts and lifecycle correspondence, a browser-effect catalogue, reproducible
tests and an evidence ledger. Each open item must identify the missing evidence
or platform control and the experiment or proof that would resolve it. New work
should discharge an identified obligation; it should not add a second architecture
or a publisher-specific exception merely to increase the passing test count.

## 1. State the theorem and its premises

Define the external observations, confinement start, trusted host actions and
application-influenced actions. Include retained registrations, permissions,
policies and pending operations in the initial state.

For each C1–C8 obligation, record its executable owner, assumptions, proof,
browser contract and unresolved dependencies. Assign each premise a status:
proved, reviewed browser contract, tested observation, assumption, counterexample
or unresolved. An assumption that every application effect is mediated would
assume the desired conclusion.

**Acceptance:** one theorem statement and obligation table whose premises can be
reviewed independently.

## 2. Map authority and simplify the implementation

Trace actual entry points, dependencies, aliases, native references, getters,
callbacks and asynchronous continuations. Start with resource delivery, context
creation, management messages and durable enforcement records. The syntax
inventory locates work; it does not establish ownership or coverage.

For each boundary, specify private state, captured operations, accepted inputs,
returned authority and immediate or deferred effects. Move decisions into private
trusted components where that removes application-accessible enforcement state.
Delete duplicated paths only when the remaining boundary has an explicit contract
and compatibility evidence.

**Acceptance:** a reviewed authority map with an owner and contract for every
identified authority-producing path. Unresolved references remain obligations.

## 3. Resolve context and registration lifetimes

The registration-fence fixture, controls and scope-specific queue model now run
in CI. Establish their correspondence to the
[Service Workers job algorithms](https://w3c.github.io/ServiceWorker/#schedule-job).
Review changed scripts, install/activate work, overlapping registrations,
controller retention, restart and work already queued at launch. Native
shared/publisher names include the host policy version. The
[namespace experiment](worker-policy-overlap.md) checks fresh globals across
policy versions, sharing within one version, and policy-omission faults in both
browsers. Complete admission and mixed-policy lifetime correspondence remain open.
Unregistration must not be treated as cancellation of an already
transmitted request.

Dedicated-worker verification and nested closure now use a private parent broker
with native ancestry checks. Dedicated-worker GET/cache reads also relay through that broker and reuse the
existing context-resource resolver. Shared and publisher roots retain an
authenticated HTTP adapter. The former per-context readiness and closure routes are removed.

The [local bootstrap prerequisites](local-worker-bootstrap.md) now establish
native Blob-worker discovery in twelve browser cases. Fourteen source-policy cases
identify a private TrustedScriptURL gate while exposing the fresh-realm and
inherited-policy obligations. The [private script URL gate](script-url-gate.md)
now connects named policies to native runtime sinks and refuses missing
enforcement. The [local startup candidate](local-worker-startup.md) now creates
dedicated Blob guards, binds native clients through the private parent broker and
removes the dedicated HTTP bootstrap route. Factory/channel ownership, complete
preparation coverage and registration lifetime remain open.

Then evaluate production bootstrap and delivery. Private root-content and selected
parent-channel reads already exist. HTTP shells, workers, modules, worklets,
publisher executors and DOM/CSS resources still need an account of browser
maintenance. Evaluate local delivery and registration lifetime together; earlier
experiments rule out treating Blob URLs or unregistration alone as the repair.

For each supported context, identify the event that grants usable execution
authority. Establish preparation before that event and confinement of pending work
after closure or replacement. Preserve offline relaunch and unchanged applications.

**Acceptance:** prevent the original maintenance counterexample through an
explained mechanism, with working controls in both browsers. If no candidate meets
the contract, retain the reproduction, identify the missing platform primitive
and leave the full claim open.

## 4. Verify executable protocols and model correspondence

Extend direct JavaScript verification from the checked state helpers and authority
predicate to their callers. Establish heap ownership, validated inputs and captured
operations under prototype mutation. Include exceptions, reentrancy, malformed
messages and suspension across changes of authority.

Define a linearization point for each grant, delivery and revocation. Verify the
context-store transaction callbacks and connect commits to registry transitions.
A browser atomicity contract does not prove its callback implementation.

Define a relation from concrete state to lifecycle-model state. Show that each
executable step corresponds to a permitted transition or preserves the abstraction
without changing modeled state. Prove initialization and preservation for arbitrary
finite executions. Retain bounded trace comparisons as tests of this relation.

**Acceptance:** checked contracts, caller obligations and refinement lemmas.
Record trusted semantics, extraction, compiler, verifier and solver assumptions.
Verifier output is not an independently checked proof certificate unless a
separate checker actually checks it.

## 5. Justify coverage of browser communication

Derive an effect catalogue from specification algorithms, browser source where
needed, exposed interfaces, markup, CSS and retained state. Include direct network
APIs, navigation, identity and permissions, background agents, maintenance and
handoffs to other actors. Review every supported context kind.

Record prerequisites, reachable authority, queued effects and enforcement for
each path. Classify it as mediated, unavailable under an established prerequisite,
or harmless for a stated reason. Unknown paths stay open.

Use WebSpec only for behavior represented in its pinned semantics. The current
assessment found that its worker abstraction omits the registration/update
lifecycle needed here. Extend a model only for a concrete obligation, with browser
correspondence reviewed separately.

**Acceptance:** no unresolved communication path in the declared, reviewed browser
environment. Explain how the catalogue was derived and where its coverage ends;
an API-name inventory alone cannot establish exhaustiveness. Browser changes
reopen affected premises.

## 6. Challenge the boundaries and test the tests

Pair each applicable confined attempt with a working unrestricted control and an
independent receiver. Include HTTP, connections, DNS and non-HTTP transports;
fixed-URL requests count. Exercise retained state, nested contexts, asynchronous
overlap, resource loss and interrupted preparation.

Where feasible, remove the actual mitigation in an isolated temporary build and
require the test to detect the forbidden effect. Keep faulty builds out of
release artifacts. Translate model counterexamples into executable regressions.
Preserve partial observations from failing runs.

**Acceptance:** reproducible receipts tied to source, artifacts, browser versions,
configuration, controls and observation bounds. Missing controls and unexplained
flakiness remain missing evidence.

## 7. Compose and check the argument

Prove initialization of C1–C8, preservation by every admitted transition, and their
implication for the external-observation policy. Supply implementation-refinement
and browser-coverage premises from the preceding stages. Include deferred effects
at the composition boundary.

Extend the claim checker to reject missing obligations, stale evidence, absent
proof results and unsupported dependencies. Challenge it with removed evidence,
changed source and incomplete proof reports. Distinguish structural checking from
proof checking and manual review.

**Acceptance:** every theorem premise traces to its evidence or explicit assumption.
A remaining counterexample prevents the complete claim regardless of the number
of passing checks.

## 8. Validate and publish the exact candidate

Freeze source and build inputs. Run the required proofs, models, native security
tests and unchanged application corpus. Recheck offline reload, nested contexts
and permitted prototype modification. Record lost compatibility rather than
removing failing applications from the evaluation.

Keep the report concise: established property, assumptions, evidence and remaining
gaps. Preserve the recoverable remote baseline. Deploy only after applicable
release checks pass, then verify public artifacts and a fresh installation.
Report desktop PWA and real-device mobile results separately when performed.

The final package contains implementation, proof statements, correspondence and
coverage records, reproducible checks and the report. Full confinement remains
unestablished until every required obligation is discharged. If the platform
prevents that result, publish the precise obstruction alongside the component
properties that were established.
