# QuickJS confinement verification

This directory contains verification work for the guest-engine architecture.
The execution plan is
[confinement-verification-plan.md](../../docs/implementation/confinement-verification-plan.md).
The current checkpoint and remaining order are in the
[resumption plan](../../docs/implementation/confinement-verification-resumption.md).
The native-runtime models elsewhere under `formal/` remain historical evidence.

The target is no application-caused remote request or connection during confined
execution, including requests with a fixed destination or no private payload.
Authorized exports retain their separate release policy. Applications may share
storage and browser permissions; host enforcement records and management authority
must remain protected.

## Current work

The implementation is being reviewed against eight obligations. The
[ownership inventory](ownership.md) locates current enforcement and the contracts
that still require implementation correspondence. This is an inventory, not an
assertion that those obligations are proved.

Current component contracts and executable checks are documented separately:

- [Context publication](context-publication.md): preparation tokens and actual
  child-session cancellation before guest execution.
- [Management authority](management-authority.md): actual sender/client/endpoint
  predicates and their asynchronous receiver obligations.
- [Native Wasm](wasm/README.md): accessor-module authority and indexed bounds.
- [Audio worklets](worklets/README.md): bootstrap ownership and lifecycle.
- [Native operation registry](../../docs/implementation/native-policy.md):
  pre-operation authorization and the integrated standalone URL family.

The [handoff](handoff.md) records active implementation and current gaps. Component
receipts identify their checked inputs; they do not qualify a combined release.

Run the existing pinned Gillian verifier against a stateful fixture and a failed
state-update control:

```sh
node --import tsx formal/quickjs/calibrate.ts
```

The runner checks the upstream fixture digest, requires each named procedure
contract and rejects failures that do not reach postcondition checking. It writes
fresh results under `results/quickjs-confinement/`. The driver in
`formal/runtime-verification/gillian.ts` is reused as a tool adapter; this does not
reuse any historical runtime verification result.

A successful calibration establishes that this verifier invocation checks the
selected fixture and catches the selected fault. The JavaScript semantics,
verifier, solver and pinned container remain trusted. Production-code proof
results will identify their own source, extraction, contracts and caller premises.
