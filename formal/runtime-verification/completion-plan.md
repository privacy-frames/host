# Completing the runtime confinement argument

This plan orders the remaining work under the eight stages in
[the verification programme](README.md). Its starting point is revision
`f680d8efa24b2f483d738067534a522fc816fe54`. It does not replace the
[C1–C8 contract](../threat-model.md) or treat earlier component results as a
complete runtime proof.

The target remains a static web host running ordinary, unchanged JavaScript
applications. After confinement starts, application activity must not cause a
remote request, including a request to the runtime origin. Occurrence and timing
matter even when a request carries no private bytes. Storage namespaces are a
compatibility feature; enforcement-state integrity remains a security obligation.

## 1. Make each obligation independently reviewable

For each C1–C8 obligation, record the implementation owner, preconditions,
postconditions, browser premises, proof artifact, native test and unresolved
dependencies. Distinguish checked implementation properties, bounded observations,
browser assumptions and known counterexamples. An unknown entry remains open.

Pin the browser builds, configuration, toolchain and exact source used for each
result. State which retained registrations, permissions, pending operations and
stored policies setup can establish. Where setup cannot establish a prerequisite,
record that gap rather than assuming a fresh browser profile.

Acceptance: the final theorem's premises can be traced to these entries without
an assumption that already says all application effects are mediated.

## 2. Resolve the demonstrated browser-maintenance channel

Application-triggered service-worker updates currently contradict C4. Start with
the existing receiver-observed reproductions and preserve them as regression
tests. Root content and window resource reads already use private messages;
production context bootstraps and registration lifetime still need work.

First integrate the tested parent-channel primitive into child-document and
popup configuration and content delivery. Bind it to the actual owning Window,
installation, generation and context lifetime. Install its receiver before guest
listeners. Revalidate parent and child authority after asynchronous reads and
close pending channels on cancellation. Retain preparation-before-execution.
This step alone does not repair the maintenance channel.

Next evaluate local delivery for dedicated workers, shared workers, worklets,
publisher executors, module graphs and DOM/CSS resources. Specify controller
inheritance, covering registrations and queued updates alongside each proposed
bootstrap. Blob URLs, unregistration and a fresh scope identifier are candidates
with known limitations, not accepted repairs by themselves.

Acceptance: the existing maintenance counterexamples stop producing remote
requests in both supported browsers, with working positive controls. Exercise
stale and overlapping registrations, concurrent launches, restart and queued
work. Establish why the candidate prevents the underlying trigger beyond the
observed schedules. A supported context that cannot establish confinement must
fail before application execution.

If this cannot be achieved with the available web primitives, retain the exact
counterexample and identify the unmet platform contract. Tests alone cannot
establish impossibility, and suppressing the observation cannot close C4.

## 3. Reduce and account for implementation authority

Trace authority through the actual code, including aliases, dependencies, native
references, getters, callbacks, promise continuations and messages. Use the syntax
inventory to locate work; a complete list of call sites is not an ownership proof.
For each adapter, specify both the authority it accepts and the authority it
returns, including immediate and deferred effects.

Move admission and lifecycle decisions into private trusted components where that
removes application-accessible enforcement state. Keep the application-facing
adapter small. Require every removed restriction to have a named remaining
enforcement boundary and compatibility evidence. Do not spend this pass proving
cross-application storage confidentiality, which is outside the agreed contract.

Acceptance: every authority-producing path has an implementation owner and a
contract; unresolved native references and dependency behavior are explicit.

## 4. Extend proofs from state helpers to complete protocols

Use the selected direct JavaScript verification method on the executable
authorization, admission and publication components. Begin with callers of the
already-checked document begin/cancel functions. Prove that callers own the state
the helper contracts require and that permitted prototype mutation cannot change
that state or its captured enforcement operations.

Cover malformed inputs, exceptions, reentrancy, asynchronous suspension,
generation changes, cancellation and resource failure. Define a linearization
point for each grant, read and revocation. Resolve the demonstrated multi-instance
registry binding race by repairing it or proving why the conflicting execution
cannot occur or cannot violate C1–C8.

Use the lifecycle models for arbitrary execution lengths, queues, replacement
and persistence. Connect each model transition to an executable operation and
show how implementation steps preserve the abstraction, including steps that do
not change modeled state. Check the correspondence itself; trace acceptance only
covers the traces exercised.

Acceptance: component contracts are checked, callers establish their premises,
and composition covers each supported context protocol. Publish the trusted
semantics, extraction, compiler, verifier and solver assumptions.

## 5. Establish coverage of browser effects

Review specification algorithms and retained browser state as well as API names.
Include HTML/CSS loads, navigation, connections, permissions, identity mechanisms,
background agents, service-worker maintenance and handoffs to other actors.
Repeat the analysis for every supported context kind.

For each mechanism, record its prerequisites, specification path, reachable
authority, immediate or queued effect and disposition: mediated, unavailable
under an established prerequisite, or harmless for a stated reason. Record
unknown mechanisms and dependencies. Review browser implementation and test
material where the relied-on behavior is underspecified or differs in practice.

Use WebSpec only for behavior represented in its pinned model. A model omitting
registration updates cannot discharge the update obligation. State the universe
covered by any completeness claim and the browser contracts outside that model.

Acceptance: every identified effect path has a justified disposition and no
unresolved path is counted as covered. Browser upgrades invalidate the affected
coverage claims until reviewed.

## 6. Test the assumptions and test the tests

For each relied-on browser restriction, run a confined attempt and a working
unrestricted control against an independent receiver. Where applicable, remove
that actual enforcement step in a temporary test build and require the test to
detect the resulting failure. Keep faulty builds out of deployed artifacts.

Include HTTP, connection establishment, DNS and relevant non-HTTP transports;
fixed-URL effects count. Exercise retained state, pending operations, nested
contexts, prototype mutation, malformed messages, interrupted preparation and
resource loss. Translate model counterexamples into implementation regressions.

Acceptance: each receipt identifies source, artifacts, browser configuration,
receiver observations and observation bounds. Missing positive controls leave
missing evidence. Successful bounded tests support the stated browser contract;
they do not prove all future schedules.

## 7. Compose and independently check the argument

Establish initialization of C1–C8, preservation by every admitted transition and
their implication for the external observation policy. Attach implementation
correspondence and browser coverage to this argument. Have the checker reject
missing obligations, stale source hashes and absent proof results rather than
reporting success from the number of passing tests.

Separate mechanically checked results from manual browser arguments and explicit
assumptions in the final statement. Do not label the result complete while the
maintenance counterexample or another required premise remains unresolved.

Acceptance: a reader can follow each part of the confinement claim to checked
code, a reviewed browser contract or a clearly stated unresolved obligation.

## 8. Validate and publish the exact candidate

Keep implementation on the separate research worktree and retain the recoverable
remote baseline. Once the candidate is fixed, freeze source and build inputs and
run the required proofs, models, native security tests and unchanged application
corpus. Preserve offline reload and supported context behavior; record any lost
compatibility rather than silently dropping it from the corpus.

Update the report with the property actually established, its assumptions and
remaining gaps. Deploy only a candidate that passes the applicable release checks,
then verify the public artifacts and a fresh installation. Distinguish those
results from desktop PWA and real-device mobile validation.

The deliverables are the implementation, reproducible checks, proof and browser
contracts, coverage and correspondence records, and a concise report. If complete
confinement remains unestablished, the report must name the obstruction and retain
the strongest verified component results without promoting them to the full claim.
