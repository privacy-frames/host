# Runtime confinement verification

This work implements the eight-stage plan for a compositional confinement
argument. The baseline is host revision
`6a2ce294d3d8717e7a6b207d064891c45fea4e11`. Development uses the
`runtime-confinement-proof` branch in a separate worktree. The baseline's models,
source checks and browser receipts retain their documented scopes.

The target is the contract in [the threat model](../threat-model.md). Applications
remain ordinary JavaScript, including asynchronous execution and prototype
modification. The host remains a static web application. Publisher-specific
patches, new publisher packaging requirements, extensions and native hosts are
outside this implementation plan. Application storage namespaces remain a
compatibility feature rather than a confidentiality boundary.

## Stages and acceptance criteria

1. **Security contract.** Define the confinement boundary, initial browser state,
   trusted components, external observations and shared invariants. Identify
   proof obligations for each assumption. Acceptance requires an explicit policy
   for application-influenced browser maintenance and retained state.
2. **Implementation mapping.** Map context creation, publication, native authority,
   callbacks, asynchronous suspensions, deferred effects and revocation to actual
   implementation entry points. Every identified authority-producing operation
   needs an owner and a contract. Unknown operations remain obligations.
3. **Context publication.** Connect the executable root, child-document, popup,
   dedicated-worker, shared-worker, worklet and publisher protocols to unbounded
   lifecycle arguments. Cover authentication, usable returned authority, queues,
   exceptions, cancellation, replacement and closure. The proof must account for
   actual persistence and native lifetime behavior.
4. **Implementation-verification method.** Compare deductive JavaScript verification
   with generation from a verified executable specification on a stateful
   publication component. Choose one production method using measured results.
   Record language, heap, callback, compiler and annotation requirements. The
   chosen method must establish more than source-shape matching.
5. **Admission and effect adapters.** Verify immutable admitted resources, canonical
   identities, executable content, delivery, messages and generation changes.
   Specify each native adapter's input authority, returned references, callbacks
   and immediate or deferred effects. Remove unnecessary authority or duplicated
   policy when the proof and compatibility evidence justify the change.
6. **Browser coverage.** Review effect-producing specification algorithms as well
   as interfaces: markup, CSS, headers, navigation, stored policies, background
   agents, permissions and contexts. Assess WebSpec on concrete obligations.
   Each relevant mechanism must be mediated, unavailable in the declared
   environment, or unable to produce a forbidden effect for an established reason.
   Omitted mechanisms cannot discharge coverage.
7. **Browser validation.** Challenge each relied-on contract with applicable native
   controls, confined executions, independent receivers and isolated removal of
   actual enforcement. Include retained state and lifecycle schedules. Record
   source, build, browser configuration and observation bounds. Missing positive
   controls remain missing evidence.
8. **Composition and publication.** Prove initialization and preservation of the
   shared invariant and its implication for external effects. Connect executable
   components to the modeled transitions. Publish the statements, correspondence,
   assumptions, unresolved obligations and reproducible checks. Validate relevant
   security tests and application compatibility before deployment; verify public
   bytes and a fresh installation afterward.

Full conditional confinement requires both implementation correspondence and
browser coverage. A proved component, bounded model, passing test or completed
inventory does not establish the other stages. If a web-platform limitation
prevents a required boundary, record a reproducible counterexample and the
missing primitive. Do not substitute a different host architecture or weaken the
contract to close the item.

## Initial findings

The former CacheStorage context store admitted duplicate bindings across
independent controller queues. The current store uses a single IndexedDB
transaction, a browser-client primary key and a unique context index. Binding
and owner-scoped closure commit atomically; the generic identity writer is gone.
Native Window/worker fixtures exercise conflicting inserts, rollback, closure
and missing-constraint controls in both browsers. The
[implementation mapping](../implementation-mapping.md#atomic-context-bindings-across-controllers)
records the storage contract and its remaining correspondence obligations.

Persistent `preparing`, `ready` and `running` labels do not establish local guard
readiness. Dedicated-worker message delivery opens after the prepared worker has
registered an application listener. Child documents use an authenticated parent
channel before rendering. Their implementation correspondence needs separate
arguments even where the abstract publication contract is shared.

## Progress

- Stage 1: contract being specified and reviewed against current behavior.
- Stage 2: entry-point review started; complete authority mapping remains open.
- Stage 3: document generation invalidation now uses private object identities;
  factory and installed-document integration tests pass in both browsers. The
  context store now enforces binding uniqueness and owner-scoped cancellation
  across native database connections. Complete publication, transaction-callback
  verification and lifecycle correspondence remain open.
- Stage 4: deductive-mode calibration and verification of the production document
  begin/cancel state functions pass. The generated-specification comparison also
  passes; direct JavaScript verification is selected for this component. Applying
  the method to complete protocols and their callers remains open. The
  [production authority predicate](authority-predicate.md) now has twenty-seven
  checked heap contracts, eight actual comparison-removal controls and a
  zero-contract rejection. Caller filtering and asynchronous freshness are still
  separate obligations.
- Stage 6: a worker-creation experiment reproduces application-dependent update
  requests in both browsers. See the [maintenance finding](service-worker-maintenance.md).
  The [backend comparison](maintenance-backends.md) also finds limitations of
  Blob bootstraps and unregistration. Browser coverage and a repair remain open.
  A [pinned WebSpec source assessment](webspec-assessment.md) identifies the
  missing registration/update lifecycle for this obligation.
  A [message resource prototype](message-resource-broker.md) passes selected worker
  reads and confirmed Chromium restarts without HTTP, with working receiver
  controls. Production integration for worker reads and document behavior remain
  open.
  The [registration overlap experiment and model](registration-overlap.md)
  identify scope reuse and covering registrations during private execution as
  launch obligations. Its prefix/queue model checks arbitrary finite traces and
  separates authorization from later transmission; actual launch and browser
  correspondence remain open.
  The [same-scope registration fence](registration-fence.md) adds native queue
  observations and an unbounded queue model. It distinguishes a serialized
  update/unregister boundary from the earlier model's unconstrained scheduling;
  neither result establishes the production launch barrier.
  The [local document transport experiment](local-document-controller.md) shows
  that the existing controller client does not work uniformly in unregistered
  local children. The [private parent-channel primitive](private-parent-channel.md)
  now has native sender, closure, prototype-mutation and actual late-receiver
  fault controls. Document and popup configuration/content now use the owning
  parent channel with native-client and generation admission checks. Local
  context bootstraps and the complete ownership/lifecycle proof remain open.
- Stage 5: root content now uses an authenticated private controller request; the
  publisher client shares its captured transport. See the
  [root content integration](root-content-broker.md). Window fetch/cache downloads
  now use the [shared local resource reader](resource-fetch.md), with actual
  adapter-bypass and forced-stale browser controls. Document and popup
  [control operations](document-control.md) now use authenticated messages, with
  actual-browser client and concurrent-consumption checks. Resource and adapter proofs
  and the remaining context delivery paths are open.
- Stage 7: browser validation is in progress for the root content integration;
  broader coverage and lifecycle obligations remain open.
- Stage 8: pending. Earlier component evidence remains available, with
  its original assumptions and source hashes.

The complete runtime claim remains unestablished.

## Execution order for the remaining work

The [completion plan](completion-plan.md) expands this sequence into reviewable
implementation, proof, browser-coverage and release gates from revision `087ca7e`.

The eight stages above describe the argument we need. The sequence below orders
the remaining implementation and verification work. Passing one gate does not
discharge the later gates. Keep development on the separate research worktree;
retain the current remote baseline until a candidate passes release validation.

### 1. Close the observed maintenance channel

Replace the root document's HTTP content read with a private message request to
the controller. Authenticate the actual browser client, derive its installation
from trusted bindings, and recheck the generation after asynchronous reads. Reuse
the existing private controller transport where possible and remove the replaced
HTTP route. Missing content must fail locally.

Then extend local delivery to the context and resource paths that still provoke
HTTP or registration updates. Evaluate Blob bootstraps, message delivery and
registration lifetime together. The existing experiments rule out treating Blob
URLs or unregistration alone as the repair. Preserve ordinary application
execution and prototype extension; do not add publisher-specific branches.

Gate: the original installed-worker counterexample must stop producing requests
in both browsers. Exercise concurrent launches, stale registrations, retained
controllers, queued work and controller restarts. Test documents, modules,
dedicated and shared workers, worklets and publisher executors separately. A
context that cannot meet the contract must fail before application execution.
If the platform prevents the repair, retain the reproducible counterexample and
identify the missing browser primitive.

### 2. Establish implementation authority and ownership

Trace actual authority from entry points through dependencies, aliases, returned
references, callbacks and asynchronous continuations. The syntax inventory is a
locator for this review, not its completion criterion. For each boundary, record
its inputs, owned state, captured native operations, publication point, effects
and revocation rule.

Move decisions away from application-accessible state where that removes a proof
obligation. Keep the application-facing adapters small. Remove duplicated checks
only after establishing which remaining boundary enforces the same property.

Gate: each authority-producing path has a contract and a concrete implementation
owner. Unresolved aliases, dependencies or native behavior remain explicit gaps.

### 3. Verify the executable protocols

Extend the selected direct JavaScript verification method from the two document
state functions to their callers and the resource and publication protocols.
Prove ownership and preservation of private enforcement state under permitted
prototype mutation. Cover validation, exceptions, reentrancy, asynchronous
generation changes, authenticated grants and resource failure.

Use the unbounded lifecycle models for queues, replacement, concurrent registry
access and registration lifetime. For each modeled transition, identify the
executable operation and establish its correspondence. Connect the native transactional binding and closure contract to these
transitions; its browser constraints and callback implementation require explicit
premises rather than assumed atomic CacheStorage updates.

Gate: each component has checked preconditions and postconditions, callers
establish those preconditions, and executable transitions preserve the shared
invariant. Record compiler, verifier, solver and browser assumptions separately.

### 4. Establish browser coverage

Build an effect catalogue from specification algorithms as well as exposed
interfaces. Include HTML and CSS loads, navigation, connections, permissions,
stored policies, identity mechanisms, background agents, browser maintenance and
handoffs to other actors. Cover initial retained state and every supported
context kind.

For each mechanism, record the relevant specification steps, implementation
adapter or browser restriction, prerequisites, deferred work and supporting
evidence. Use WebSpec only for obligations represented by its actual model;
registration and update behavior require additional modeling and correspondence.
Do not count an absent test or interface name as a coverage argument.

Gate: every mechanism in the declared browser environment has a justified
disposition. Uninspectable state and unmodeled behavior remain named assumptions
or blockers. Pin browser versions and review coverage when those versions change.

### 5. Challenge the contracts with browser tests

For each relied-on mitigation, pair a confined attempt with an unrestricted
positive control and, where applicable, removal of that actual mitigation in an
isolated test build. Observe independent receivers, including requests carrying
no payload. Include lifecycle schedules, pending effects, retained state,
malformed messages, resource loss and failures during preparation.

Gate: controls demonstrate that the observation can detect the effect, and the
confined case preserves the stated contract. Record source and artifact hashes,
browser versions, settings and observation bounds. A passing bounded experiment
supports a browser contract; it does not prove arbitrary traces.

### 6. Compose the argument and validate the release

Connect initialization, component preservation, context creation and the browser
effect catalogue to C1–C8. State why those invariants imply no forbidden external
effect. Keep tested observations, proved implementation properties and assumed
platform behavior distinct in the final claim.

Run the relevant security checks and the unchanged third-party application
corpus. Update evidence for the exact candidate, publish the proof statements
and remaining gaps, then deploy only after the candidate passes release checks.
Verify public bytes and a fresh installation after deployment.

The outcome is either a conditional confinement theorem with its implementation
and browser premises discharged for the declared environment, or a narrower set
of established properties accompanied by the precise obstruction to the complete
claim. An unresolved platform premise cannot be closed by adding more tests.

## Implementation review inventory

Run `node formal/runtime-verification/inventory.ts` to generate
`implementation-inventory.json`, then rerun with `--check` to detect drift. The
typed definitions in `boundaries.ts` connect each selected review boundary to
C1–C8. The snapshot records the exact source set.

The tracked snapshot records source and site-report hashes. The command writes
the full locations to `.tools/runtime-verification/implementation-sites.json`,
also uploaded by CI. This report locates calls, constructors, asynchronous
suspensions, returns and selected reference bindings, with enclosing function
scopes. It does not resolve aliases, follow dependencies or establish authority
closure. Display snippets are truncated; review the hashed source at the recorded
location. Recorded syntax sites are review inputs rather than a security-coverage
measure.

## Deductive-mode calibration

Run `node formal/runtime-verification/method-calibration.ts` with Docker available.
The runner retrieves the upstream stateful ID-generator example at a fixed source
revision and checks its digest. The three procedure contracts describe the
returned closure, identifier generation and reset. Gillian's `verify` mode accepts
all three. Removing the state increment produces a failed postcondition in the
identifier procedure. A compilation error or tool crash does not satisfy that
negative control.

The receipt records the input, runner, image digest and output hashes. Analysis
runs with container networking disabled. This calibration establishes that the
pinned tool performs deductive checking on that stateful fixture. It does not
verify our publication code. The JavaScript compiler, verifier and solver remain
trusted; the container image does not identify its source revision. The next
comparison must exercise actual publication state and its adapter contracts.

## Production document state

`src/runtime/contexts/document-publication.ts` contains the state updates called
by the actual document factory's begin and cancel paths. A generation is a fresh
private object identity, compared by strict equality. The former numeric counter
could stop changing once integer increments ceased to be representable. That
breaks an unbounded freshness argument; no network escape was demonstrated from
that counter. Object identity avoids a numeric lifetime bound while an old
asynchronous callback retains its token.

Run `node formal/runtime-verification/document-publication-check.ts`. The runner
extracts and erases the actual two TypeScript functions and verifies their
JavaScript bodies with separation-logic contracts. Cancellation installs a new
identity and clears all four flags. Beginning installs and returns a new identity,
sets `started`, clears `loaded`, and preserves `ready` and `published`. Both
contracts preserve the state's prototype and the retained old identity. Other
owned heap resources remain framed.

The record must own writable data properties for these fields, its flags must be
Booleans, and its old generation must be an ordinary object distinct from the
record. The record prototype is arbitrary, matching the factory's private record
prototype. Establishing caller ownership and continued secrecy of that record
is a separate obligation. Beginning is not itself proof of authenticated or
prepared execution.

Five state-update faults fail postcondition checking. A sixth control displaces
the annotations so the tool checks zero procedure contracts. The runner rejects
that otherwise-successful invocation and requires the exact named contracts in
every run. The receipt records source, factory, compiler, runner and driver hashes.
The TypeScript erasure, extraction, JavaScript semantics, verifier and solver
remain trusted. This result covers these state functions rather than the complete
factory or the browser's publication behavior.

The [document-state compatibility receipt](document-publication-compatibility.json)
records all eight applications passing their selected native and confined tasks
in Chromium and Firefox after the state change. Source and artifact hashes bind
the run to its uncommitted inputs, and build artifacts stayed stable throughout.
The network receiver groups and prototype-confinement regression fixtures also
pass. Those tests do not discharge the remaining ownership or publication proof.

## Verification-method comparison

After the document-state check, run
`node formal/runtime-verification/generation-comparison.ts` with the pinned Lean 4.35.0
release and Docker available. `PublicationModel.lean` defines begin and cancel as
instruction sequences and emits JavaScript implementations. Eight axiom-free
theorems establish their state updates, returned generation, and generation
advancement over arbitrary finite begin/cancel sequences. Natural numbers name
generations in the model; the emitted JavaScript allocates object identities.

The generated functions pass the same heap contracts as the production functions.
A wrong state update fails the Lean proof. A wrong emitted assignment fails the
JavaScript postcondition even when the abstract model remains correct. The receipt
records both controls, input sizes, tool versions and hashes. The emitter is not a
verified JavaScript compiler; independent JavaScript verification checks its
output for these contracts.

Direct verification remains the production method for this component. Generation
retains the JavaScript verifier and adds the model, instruction semantics and
emitter. It removes no trusted boundary in this experiment. The generated
candidate stays a comparison artifact rather than a second runtime path. Caller
ownership, native context behavior and browser coverage remain separate work.
