# Completing the runtime confinement argument

This execution plan follows the eight stages in [the verification programme](README.md).
It updates the remaining work against revision
`087ca7e64f6401ee678f0e89d38fcb5997c382ee`. Implementation stays on the separate
`runtime-confinement-proof` worktree and branch. This planning revision changes no
runtime code or deployed site.

The target remains [C1–C8](../threat-model.md): confined application activity cannot
cause a remote request or connection, including to the runtime origin. Whether
and when a request occurs count as observations. Private state may already exist
at launch. Ordinary asynchronous JavaScript, permitted prototype modification,
unchanged applications and static hosting remain requirements. Storage namespaces
are a compatibility feature; enforcement-state integrity remains necessary.

## Starting position

Atomic context binding and owner-scoped closure now use IndexedDB. Private parent
channels and selected executable state functions have native tests or deductive
checks. Complete protocol correspondence and browser coverage remain open.

Application-triggered service-worker updates remain a demonstrated violation.
The local registration-fence experiment adds nine native observations:
same-scope unregistration waited for a held update, and a later update failed
without a second request. It covers an unchanged script and selected schedules;
it establishes neither a production launch barrier nor a whole-browser drain.

The latest model workflow also lacks a Chromium maintenance positive control:
neither sample produced the expected update. Diagnose that missing observation
before using the workflow as evidence for a repair.

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

Finish the registration-fence experiment, preserve its controls and add it to CI.
Model the scope-specific update/unregister queue and relate it to the
[Service Workers job algorithms](https://w3c.github.io/ServiceWorker/#schedule-job).
Review changed scripts, install/activate work, overlapping registrations,
controller retention, restart and work already queued at launch. Unregistration
must not be treated as cancellation of an already transmitted request.

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
