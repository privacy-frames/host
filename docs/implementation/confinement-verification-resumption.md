# Autonomous confinement implementation: resumption plan

Resume the [confinement verification plan](confinement-verification-plan.md) from
the current QuickJS implementation. This document fixes the order of the remaining
work and its acceptance criteria. It does not authorize a weaker security property
or treat the existing component proofs as a proof of the complete host.

## Contract

After confinement starts, application transports must cause no remote request or
connection, including to the runtime origin. The occurrence or timing of a request
can disclose data even without a private payload. Installation and trusted startup
may use the network before application execution; previously stored private data
must remain protected through that transition. Authorized file exports retain
their existing separate policy.

On 21 November, the project confirmed that normal browser-integrated services
remain trusted and the host stays web-only. Apply the
[current threat model](../../formal/threat-model.md): browser-owned autofill and
similar services are platform behavior, while application network calls, resource
loads and navigation remain within the enforcement property.

Applications and their dependencies are malicious. Trust the browser, OS, host
origins and declared engine/dependency contracts. Our bridge and local QuickJS
extensions require their own implementation arguments. A complete proof of the
browser, compiler or upstream QuickJS is outside this work.

Preserve the current applications unchanged, native HTML/CSS rendering, synchronous
event cancellation, asynchronous JavaScript, supported child contexts, native Wasm
and shared memory. Keep static GitHub Pages hosting and separate manager,
installer and runtime origins. IFC and application service-worker execution remain
deferred. Shared application storage and browser permissions are outside the
isolation guarantee; private host records and management authority remain protected.

## Checkpoint on 20 November 2026

The qualified executable baseline is `5f62e61`, with release evidence at `10bc6cc`.
The remote recovery tag is `pre-quickjs-confinement-proof-2026-11-20`. No candidate
from this verification work has been deployed.

The integration branch is `quickjs-confinement-proof`, currently at `4fb6e91`.
The auxiliary implementation branch is `quickjs-confinement-kernel`, last inspected
at `bea54db`, with additional uncommitted changes. Resolve full revisions and inspect
both working trees before continuing; do not reset either tree to these references.

Completed work includes a fresh baseline, bounded identity allocation, private
helper repairs, context cancellation before guest execution, worklet lifecycle
repairs, and component checks for identities, publication and Wasm accessor bounds.
A reviewed native-operation registry and standalone URL adapter exist. Neither
establishes complete mediation while production hosts retain generic forwarding.

The baseline application checks passed apart from an initial diagrams.net offline
locator timeout whose unchanged targeted retry passed. Preserve both observations.
Three-run Squoosh medians were 8985 ms confined in Chromium and 7848 ms in Firefox,
with native controls of 2064 ms and 2116 ms respectively. The existing 25% regression
investigation threshold remains in force.

## 1. Reconcile the branches and finish the reference boundary

Review each uncommitted change and its tests before merging the auxiliary branch.
In particular, finish the guest-reference ownership hook, exception conversion and
handle cleanup, and management authentication work. Preserve unrelated edits and
existing installation data. Commit executable source separately from its receipts,
then push the development branch as a recovery checkpoint.

Complete the contracts for encode/decode, native dispatch and trusted guest helpers.
Trace objects, functions, symbols, prototypes, descriptors, exceptions, promises and
callbacks through the actual callers. Cover reentry and engine disposal. Audit
private records and captured operations in the binary helpers as well as the main
guest helper. Guest prototype extension must remain supported.

Connect the existing identity and publication proofs to caller ownership,
initialization, range and lifetime premises. A proof of a small allocator does not
discharge those premises. Wire the new publication browser test into the normal
context suite and rerun the current exception fixtures in both browsers.

**Checkpoint:** a reviewed, committed integration source; passing boundary tests;
and a source-linked account of every reference-producing path and its remaining
proof obligations.

## 2. Replace native forwarding with reviewed operations

This is the main implementation milestone. Integrate the URL domain first through
every GuestHost operation: reads, writes, calls, construction, reflection, deletion
and prototype traversal. Test it through the production browser bridge, including
unknown getters, borrowed accessors, aliases and returned references.

Use that integration to establish one shared token/descriptor conversion boundary.
Keep effect-specific adapters separate. Avoid copying the URL adapter's general
plumbing into every family or building a second DOM implementation.

Migrate the remaining reachable families in dependency order: local data and binary
values; events and callbacks; existing host facades; DOM/rendering; context creation;
and native Wasm imports and exports. Apply the same policy to window, worker and
worklet hosts. Metadata identifies members and inheritance; reviewed semantic
contracts authorize their effects.

For each family, define receivers, conversion, immediate and deferred effects,
results, callbacks and failure behavior. Authorize before executing a native getter
or method. Convert an effect-bearing argument once and pass that same converted
value to the native operation. Bind policy to operation identity rather than the
first property name used to obtain a method.

After each replacement passes independent fixtures and relevant application tasks,
remove its superseded forwarding. Unknown operations fail locally before execution.
Finish by removing generic native fallback paths and temporary integration switches.
An application failure requires a general safe contract or remains a release
blocker; publisher-specific exceptions and network fallback are forbidden.

**Checkpoint:** every reachable native operation has an enforced disposition across
all hosts, including reflective routes. The inventory must account for how native
objects enter the bridge; an empty list of observed unknown calls is insufficient.

## 3. Close resource and rendering paths

Trace initial markup and subsequent DOM, SVG, template, parser, range, attribute and
stylesheet operations into native browser effects. Establish that application code
executes only in QuickJS and that resource consumers receive admitted local bytes
or fail locally. Include implicit browser reactions after a bridge call returns.

Verify URL resolution, catalog immutability, installation generation checks and
atomic resource reads against their actual implementation. Remove redundant
rewriting or validation only after identifying the earlier boundary that establishes
the same contract. Keep policy enforcement before the native effect; an observer
that notices a mutation afterward cannot supply that authorization.

Test startup with retained storage and browser state, missing resources, replacement,
and asynchronous reads. State the browser contracts required by CSP, navigation
controls, Blob/data URLs, service-worker behavior and browser services.

**Checkpoint:** every route that submits markup, CSS, code or a resource reference
has a source-linked contract and an identified enforcement boundary.

## 4. Finish native Wasm and context lifetime arguments

For native Wasm, verify imports, exports, tables, globals, externrefs, callbacks and
reentry through the shared authority boundary. Retain native application memory and
real shared-memory identity. Distinguish application memory from the interpreter's
private heap and function table.

Finish the local indexed-access extension's ownership, rooted-handle lifetime,
numeric conversion, growth, detachment, transfer and invalidation obligations.
Existing accessor-module and bounds checks are component results. Calibrate any
additional C verification tool on actual extension code and a failing control.
If it cannot discharge an obligation, state that obligation explicitly and evaluate
a simpler implementation against compatibility and measured performance.

For root windows, frames, popups, dedicated/shared workers and audio worklets,
connect preparation and closure proofs to the actual creation and message paths.
Check queued messages, late initialization, cancellation, shared ownership and
controller replacement. Finish actual-client/origin/private-port authentication and
transactional admission contracts. Old contexts may finish admitted local work only
while retaining confinement and receiving no unauthorized new authority.

Use TLA+ for interacting protocol schedules and Lean for appropriate unbounded
invariants. Keep their correspondence to production transitions explicit.

**Checkpoint:** each context and Wasm crossing preserves the authority invariant,
with local implementation gaps separated from trusted engine/browser contracts.

## 5. Establish browser coverage and compose the argument

Build the effect catalogue from pinned Web IDL, specification algorithms, browser
enumeration and relevant Web Platform Tests. Follow dependencies of permitted
operations, including retained state, background work and browser-owned services.
Generated member coverage alone cannot establish coverage of browser effects.

For each effect family, record the route, enforcing component, browser premise and
evidence. Important fixtures need an unrestricted working control, a confined case
and an isolated build omitting the actual defense. Use independent receivers for
the relevant protocols and count request occurrence as well as payload delivery.
Missing or nonworking controls remain gaps.

Compose initialization and preservation over arbitrary finite guest executions,
callbacks, native Wasm and child contexts. Discharge implementation premises using
the corresponding source-level contracts. Record browser assumptions individually;
do not hide complete mediation inside an assumed premise.

Add a reproducible verification entry point and CI checks for proofs, controls,
policy coverage and source correspondence. A changed dependency must invalidate
affected receipts. Distinguish proved implementation properties, model results,
trusted platform contracts, observations and unresolved obligations in the ledger.

**Checkpoint:** a confinement statement with inspectable premises and evidence tied
to the candidate source. An essential unresolved obligation prevents claiming
complete confinement even if every compatibility test passes.

## 6. Qualify and deploy

Freeze executable source and build artifacts, then run formatting, type checking,
unit and guest suites, Pitch Training, Wikipedia, Excalidraw, diagrams.net,
StackEdit, CyberChef, PhotoCraft and Squoosh, including paired native/confined image
tasks. Cover offline reopening, exports, shared memory,
workers and synchronous cancellation. Investigate median performance regressions
above 25% using the original comparison procedure.

Deploy the qualified manager, installer and runtime to their existing GitHub Pages
sites. Verify live artifact hashes, fresh installation and an existing installation
without reinstalling or losing its data. Commit release evidence separately from
executable source. Keep production on its last qualified release while required
security or compatibility checks fail.

Deliver the implementation, proofs and executable models, effect catalogue, CI,
release receipts and a concise report stating exactly what was established.

## Autonomous execution rules

Proceed without routine confirmation through implementation, verification and
qualified deployment. Update the handoff after each checkpoint with source
revisions, results, open obligations and the next dependency. Record failures before
repairing them; distinguish source defects, false platform premises and test defects.

Delegate independent component proofs and effect families only after shared
contracts and file ownership are fixed. One owner integrates changes and qualifies
the release. Do not run concurrent edits to shared bridge code or expensive paired
performance measurements under competing test loads.

Ask for input only when a product decision, additional authority or a change to the
security contract is required. If a platform premise prevents the promised guarantee,
produce the counterexample and established component results, retain the qualified
deployment, and report the obstruction without declaring the goal achieved.
