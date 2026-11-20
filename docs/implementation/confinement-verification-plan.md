# QuickJS confinement verification plan

Establish a confinement argument for the deployed QuickJS host, connected to its
implementation and the browser operations it permits. Use verification to simplify
the enforcement code while preserving the existing applications and native rendering.

This is a plan for autonomous execution. It does not start implementation or change
the deployed runtime. The current source and evidence baseline is `10bc6cc`; the
qualified runtime source is `5f62e61`, preserved by
`native-wasm-indexed-2026-11-19`. Resolve those references to full commits before
starting. The earlier native-runtime verification remains historical evidence under
[`formal/`](../../formal/README.md).

## Security contract and scope

The adversary controls the application and its dependencies, including JavaScript,
Wasm, HTML, CSS, asynchronous work and supported child contexts. Private data may
already exist in browser storage when an application starts.

After confinement starts, application execution must cause no remote request or
connection, including to the runtime origin. The occurrence of a fixed-URL request
counts: selecting whether to contact a server can disclose information. Trusted
installation and startup may use the network before application execution. The
transition must also protect private state retained from previous executions.
Explicitly authorized file exports retain their existing separate policy.

Keep the current threat model: trust the browser, operating system, QuickJS,
host origins and declared dependencies. Record exactly which engine and native
contracts the argument assumes. Verify our enforcement code and local engine
extensions against those contracts. A proof of all QuickJS C code, the browser or
the compiler is outside this work.

Preserve static GitHub Pages deployment, separate manager/installer/runtime
origins, normal browser rendering, guest prototype extension, synchronous event
cancellation, supported workers and worklets, native application Wasm, shared
memory, scoped storage functionality and the current manager interface. Application
sources stay unchanged. Application service-worker execution and IFC remain deferred.
Cross-application storage and permission isolation remain outside the guarantee;
host admission records and management authority still require integrity.

Carry forward the eight obligations in the
[earlier threat model](../../formal/threat-model.md#shared-invariants): preparation
before execution; mediation of authority; preservation across returned values and
callbacks; coverage of browser effects; protection of enforcement state;
authenticated management; safe revocation and replacement; and local resource
responses or local failure.

## 0. Establish the execution baseline

Create `quickjs-confinement-proof` in a separate worktree from the reviewed current
main. Preserve a remote recovery tag and leave production on its qualified revision
while developing. Read repository instructions and the latest release receipt before
reusing commands or evidence.

Inventory current entry points and dependencies across the engine, browser bridge,
DOM/parser/CSS adapters, resource catalog, native Wasm/binary adapters, context
factories, controller and management channels. Record native operations, object
ownership, callbacks, pending work and the first point at which application code
can execute. Treat the earlier claim ledger as a source of obligations, not as
verification of these replacement implementations.

Reproduce the current tests and application tasks, including Pitch Training,
Wikipedia, Excalidraw, diagrams.net, StackEdit, CyberChef, PhotoCraft and Squoosh.
Capture paired native/confined Squoosh timings, exports, worker behavior and
existing-installation persistence.
Establish a repeatable performance check with three measured runs per selected
workload and a native control. Investigate median regressions above 25% against
this baseline; repeat a noisy comparison once under comparable load rather than
changing its threshold after seeing the result.

**Exit:** exact source/build/browser provenance, a passing baseline or a reproduced
pre-existing failure, and a current map of implementation owners for all eight
obligations. New work must distinguish baseline failures from introduced failures.

## 1. Specify and prove the guest boundary

State the invariant over guest values, native reference handles and private host
records. A guest value may contain ordinary guest data or an opaque reference whose
operations are mediated. Native functions, prototypes, descriptors, receivers and
management objects must not become unrestricted guest authority.

Cover property reads and writes, calls, construction, prototype traversal,
descriptors, symbols, iterators, exceptions, promises, callbacks and message
transfers. Include synchronous reentry, failed conversions and disposal. Locate
all native execution facilities and establish which are trusted bootstrap code,
guest evaluation or admitted native Wasm execution.

Build the authority and preservation statement in Lean. Connect it to actual
encoding, decoding and dispatch functions through implementation contracts and
caller obligations. Reuse the earlier reachability theorem where its premises
match. Model any necessary change explicitly rather than merely renaming its nodes.

Calibrate the existing pinned Gillian toolchain on current extracted code, including
a known failing control and an assertion that the intended contracts were actually
checked. Prefer direct verification of small production functions. Where supported
language or heap semantics prevent a proof, refactor the trusted component into a
simpler implementation and verify its callers. Keep TypeScript erasure, extraction,
compiler and solver assumptions explicit. Source fingerprints establish provenance;
they do not establish execution semantics.

**Exit:** checked ownership and preservation contracts for the reference/dispatch
core, matched to its actual callers, plus a list of native contracts required by
the proof. Unknown reference-producing paths remain unresolved obligations.

## 2. Make native operation policy explicit

Replace broad native forwarding with a reviewed policy for the native operations
reachable through the guest boundary. Start with `GuestHost` and the paths in
`browser.ts` that eventually call native getters, setters, methods or constructors.
Authorization must precede the native operation: a getter can have effects before
its return value is inspected.

For each operation or justified family, specify receiver authority, arguments,
returned references, callbacks, immediate effects, deferred effects and failure
behavior. Distinguish local computation, local rendering, admitted resource
consumption, guest code evaluation, context creation, authorized export and
management. Explicitly deny remote effects and unreviewed native operations.
Application-defined properties and prototypes remain guest operations.

Use generated Web IDL identities and inheritance to resolve operations consistently,
including aliases and borrowed accessors. Metadata describes interface shape; its
presence does not authorize an effect. Keep the semantic policy small through
reviewed families and dedicated adapters rather than generating a second DOM
implementation or duplicating native argument conversion.

Generate an inventory linking reachable operations to their contracts and owners.
Make unclassified native access fail locally before execution. Require review of
new exposure or changed metadata; a browser upgrade must not silently widen native
authority through generic object traversal.

Introduce the policy by coherent operation families. Verify each replacement before
removing its old checks, then remove superseded forwarding paths and temporary
switches. If an unchanged app needs a denied operation, establish a general safe
contract or record the incompatibility as a blocker. Never add publisher branches
or a network fallback.

**Exit:** every native bridge path has an enforced disposition, reflective aliases
receive equivalent policy, and the existing application tasks still pass. An empty
unclassified inventory is meaningful only after its construction and traversal
coverage have been justified.

## 3. Verify resource and rendering effects

Prove that resource resolution selects immutable admitted bytes or fails locally.
Connect URL normalization, canonical paths, generation checks and catalog admission
to the current implementation. Preserve transaction boundaries across asynchronous
reads and replacement. No missing resource may trigger a native network fetch.

Trace every route that can submit markup, CSS, a URL or source code to the browser:
initial rendering, DOM insertion, parser results, templates, SVG, attributes,
stylesheet mutation, native constructors, ranges and document replacement. Establish
that scripts and handlers execute only in QuickJS, and native rendering consumes
approved local URLs. Include callbacks and implicit browser reactions after a
native method returns.

Specify browser premises for CSP, sandboxing, local Blob/data resources, navigation
cancellation and browser services. Investigate retained policies, identity state,
reporting, spelling services, speculative connections and permission-mediated
communication using the earlier findings. A same-origin destination or a fixed URL
does not make a request local.

**Exit:** implementation-connected resource/markup contracts, evidence for each
relied-on browser restriction, and exact remaining browser-effect obligations.
An unmodeled native reaction cannot be discharged by calling the adapter local.

## 4. Verify native Wasm and buffer authority

Specify ownership of native modules, instances, imports, tables, globals, externrefs,
memories and exported functions. Prove that imported capabilities pass through the
same policy as guest JavaScript. Returned references and imported callbacks must
preserve it through reentry, exceptions and asynchronous completion.

Review the vendored QuickJS indexed-access extension as a security component.
Establish trusted-only record creation, valid backing/view bounds, rooted handle
lifetimes, safe numeric conversion, private function-table ownership and invalidation
before detached memory can be accessed. The accessor modules must import only
application memory; their functions and the interpreter heap remain private.

Check ordinary buffer mirrors and write-back caches across aliasing, native calls,
callbacks, growth, detachment, transfer and disposal. Shared/resizable memory must
retain real native identity and synchronization. Cache eviction and allocation
failure must preserve the authority boundary. Distinguish buffer coherence
properties from the narrower requirement that they cannot grant native authority.

Use checked arithmetic/lifetime arguments and executable controls for the C extension.
Calibrate any additional C verifier against the actual source and a failing mutation
before relying on it. If an implementation obligation cannot be discharged, retain
it explicitly or simplify the extension while measuring the compatibility and
performance cost. Do not label its unit tests a C correctness proof.

**Exit:** Wasm imports and buffer operations preserve the authority invariant, with
engine assumptions and any unproved local C obligations stated individually.
Native execution and current image-app behavior remain functional.

## 5. Verify context and management protocols

Apply the invariant to root windows, child documents, popups, dedicated workers,
shared workers and audio worklets. Identify when each returned handle first permits
execution or effects. Prove preparation precedes that point, including messages
queued before readiness, cancellation, exceptions and startup failure.

Use TLA+ to explore interacting protocol actions and fault cases. Use Lean for
unbounded preservation and lifecycle statements where appropriate. Establish
correspondence with current factories, registries and message handlers rather than
assuming atomic publication or revocation. Verify actual sender authentication,
private-port ownership, bootstrap identity, generation changes and closure behavior.

Retain a context's confinement while pending work completes, even if termination is
not immediate. Check shared-worker reuse, controller replacement, stale callbacks,
concurrent tabs and installation replacement. Protect host records without adding
a claim of isolation between installed applications' storage.

Reproduce application-dependent service-worker maintenance across native context
creation, local resource consumption and forced-age registrations. Explain the
browser behavior supporting the absence of those requests, as well as measuring it.
A bootstrap supplied locally is insufficient if creating its context provokes a
separate update request.

**Exit:** executable protocols preserve preparation, authority, resource and lifecycle
invariants; current native/confined maintenance controls pass; residual browser
lifetime premises have concrete statements and evidence.

## 6. Establish browser coverage and test the contracts

Maintain a current effect catalogue joining reviewed specification algorithms,
pinned Web IDL, native browser enumeration and applicable Web Platform Tests.
Include effects originating in markup/CSS, native getters and methods, browser-owned
state, deferred jobs, background agents and handoffs to other actors. Cover all
supported context kinds and initial retained-state prerequisites.

For each route, record its enforcing boundary or the established reason it cannot
produce a prohibited effect. Review dependencies of permitted local operations,
not just APIs named after transports. Browser/version changes produce a review diff;
passing a feature-name comparison alone does not authorize new native behavior.

For important contracts, run an unrestricted positive control, the confined case
and an isolated test build omitting the actual defense. Use independent HTTP,
WebSocket, HTTP/3, DNS and UDP receivers where the route requires them. Observe
payload-free effects as well as marker delivery. Exercise preparation failures,
retained state and asynchronous schedules. Missing native controls remain visible
in the evidence rather than being counted as successful coverage.

**Exit:** each effect family in the declared browser environment has a reviewed
argument and evidence appropriate to its mechanism. Unclassified browser behavior
remains an open coverage obligation even when the implementation inventory is closed.

## 7. Compose the theorem and connect it to release artifacts

Prove initialization and preservation of the shared invariant over arbitrary finite
application executions, including callbacks, native Wasm and supported child
contexts. Derive the absence of prohibited remote effects under named engine and
browser contracts. Discharge each implementation premise through the corresponding
production-code proof and caller contracts.

Separate proof results, model results, browser premises, measured observations and
unresolved obligations in the claim ledger. A premise that simply assumes complete
mediation cannot substitute for the effect-coverage argument. If an essential
browser premise is false or cannot be established, publish the exact obstruction
and the established component results instead of asserting complete confinement.

Tie verification inputs to source, dependency, toolchain and generated-artifact
hashes. CI must run proofs, failing controls, policy completeness checks and relevant
browser fixtures, and invalidate claims when their dependencies change. Keep the
new proof/evidence tree separate from historical native-runtime receipts.

**Exit:** a reproducible, implementation-connected confinement statement whose
remaining trusted premises and unresolved obligations are individually inspectable.

## 8. Validate and publish

Freeze source and build artifacts before the final browser suites. Run type checking,
formatting, unit tests, the full guest suite, Pitch Training, the compatibility
matrix and native/confined image-app checks. Preserve useful interactions, offline
reopening, exports, shared workers/memory and synchronous callbacks. Compare the
recorded performance baseline without changing third-party applications.

Publish only candidates that preserve current security and application acceptance
checks. Update manager, runtime and installer using the qualified source revision;
retain GitHub Pages hosting and recovery tags. Verify live file hashes, fresh
installation and an existing installation without reinstalling or losing its data.
Commit release evidence separately from the qualified executable source.

The deliverables are the simplified runtime, executable specifications and proofs,
the reviewed native/browser effect catalogue, controlled browser experiments, CI
checks, a concise revised report and exact release receipts.

## Autonomous execution rules

Proceed through the stages without routine confirmation. Track completed work,
proof premises, failures and the next dependency in a handoff file after each
coherent checkpoint. Checkpoint source separately from evidence so receipts identify
the code they actually tested. Parallel work is appropriate for independent browser
families and proof components after their shared contracts have been fixed; keep
integration and release qualification under one owner.

Use the existing pinned verification tools first. Test a replacement tool on a real
component and a failing control before adopting it. Keep verifier experiments out
of the production runtime. Resolve local implementation choices within the agreed
scope; ask for input only when progress requires a new product decision, authority
or a change to the security contract.

Treat a failing receiver or proof as a counterexample to investigate. Determine
whether it is a source defect, a false platform premise, a test defect or an
unsupported contract, then repair the responsible component and rerun its dependent
checks. Do not weaken the network property, hide unsupported applications or replace
missing evidence with a passing aggregate count. Preserve production on its last
qualified release while a required acceptance check is failing.
