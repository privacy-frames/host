# QuickJS confinement verification

This directory contains verification work for the guest-engine architecture.
The execution plan is
[confinement-verification-plan.md](../../docs/implementation/confinement-verification-plan.md).
The [resumption plan](../../docs/implementation/confinement-verification-resumption.md)
orders the remaining implementation work.
The [handoff](handoff.md) records the current checkpoint and remaining work.
The native-runtime models elsewhere under `formal/` remain historical evidence.

The target is no application transport request or connection during confined
execution, including requests with a fixed destination or no private payload.
Authorized exports retain their separate release policy. Applications may share
storage and browser permissions; host enforcement records and management authority
must remain protected. Normal browser-integrated services remain trusted, as
defined by the [threat model](../threat-model.md).

## Security argument

This is the current entry point for the confinement argument. The obligations are
specified in the [threat model](../threat-model.md#shared-invariants). The table
connects them to production enforcement, required premises and component evidence.
None has a complete implementation-wide proof. Receipt hashes identify checked
inputs; they do not establish correctness or coverage.

| Invariant                                             | Production enforcement                                                                                                                                                                                                                                                            | Required premises                                                                                                                        | Evidence                                                                                                                                                                                           | Open obligations                                                                                                                                                   |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1: preparation before execution                      | [`createGuestWindow` and worker sessions](../../src/guest/session.ts), [document preparation](../../src/guest/contexts/documents.ts), [worklet bootstrap](../../src/guest/contexts/worklet-entry.ts)                                                                              | Trusted bootstrap/catalog; native context and abort behavior; no earlier guest evaluation through setup callbacks.                       | [Publication kernel contracts and caller controls](context-publication.md); [worklet lifecycle checks](worklets/README.md).                                                                        | Compose every context's first usable authority point with preparation and cancellation.                                                                            |
| C2: mediated authority                                | [`GuestEngine` dispatch](../../src/guest/engine.ts), [shared native codec](../../src/guest/native-host.ts), [operation registry](../../src/guest/native-policy.ts), [BrowserEnvironment](../../src/guest/browser.ts) and [NativeBinary](../../src/guest/native-binary.ts) domains | Native brands/descriptors; reviewed producer provenance; codec ownership and intrinsic-boundary mappings.                                | [Registry/URL contracts](../../docs/implementation/native-policy.md), [text](text-policy.md), [native Wasm](native-wasm-policy.md), [worklet policy](../../docs/implementation/worklet-policy.md). | Browser and NativeBinary still contain generic native forwarding. Reviewed families do not establish complete mediation of those domains.                          |
| C3: references and callbacks preserve authority       | Engine encode/decode/invoke/dispatch; native result contracts; [context adapters](../../src/guest/contexts/); [transfer normalization](../../src/guest/message-transfer.ts)                                                                                                       | Native callback/message ordering and brands; each producer preserves the original owner; reentrant argument conversion remains confined. | [One-time message transfer](message-transfer.md); family fixtures above; [listener cleanup](../../docs/implementation/eventtarget-cleanup.md).                                                     | Compose returned references, exceptions, promises, descriptors and callbacks across all owners. Callback-family coverage remains incomplete.                       |
| C4: application effects covered                       | [DOM](../../src/guest/dom.ts), [CSS](../../src/guest/css.ts), [resources](../../src/guest/resources.ts), [web services](../../src/guest/web-services.ts), [runtime responses](../../src/runtime/worker.ts)                                                                        | Concrete browser loading/navigation contracts; normal built-in services remain trusted under the declared scope.                         | [Surface inventory](../../SURFACE_INVENTORY.md); [browser-owned services review](reviews/browser-owned-services.md); controlled browser checks linked by component.                                | Complete the application-effect inventory and implementation correspondence. Trusted browser services are characterized separately, not required to be suppressed. |
| C5: private enforcement state survives guest mutation | Engine host maps; [guest helper closure](../../src/guest/guest-runtime.ts); captured operations; [indexed C controls](wasm/README.md)                                                                                                                                             | Runtime privacy, captured intrinsic semantics and ownership of mutable records; native/Wasm memory separation.                           | [Identity checks](Identity.lean); [indexed bounds/accessor and C projections](wasm/README.md); mutation controls in component fixtures.                                                            | Connect helper and native record ownership, all captured-operation use and lifecycle callers to the checked models.                                                |
| C6: authenticated management and admission            | [Connection bridge](../../src/bridge/connect.ts), [authority predicates](../../src/runtime/authority.ts), [worker receivers](../../src/runtime/worker.ts), [`admitInstallation`](../../src/runtime/admission.ts)                                                                  | Authentic native MessageEvent sources, client identities and private ports; native URL parsing; trusted installation/catalog provenance. | [Actual predicate contracts and async receiver tests](management-authority.md).                                                                                                                    | Async receiver composition, client rechecks, queued messages and publication/storage callers remain broader obligations than the predicate proofs.                 |
| C7: closure/revocation deny new grants                | [Publication kernel](../../src/guest/contexts/lifecycle-kernel.ts), context owners, engine close/entry/disposal paths                                                                                                                                                             | Native context lifetime; private tokens; callers invalidate before asynchronous publication; in-flight work remains confined.            | [Context publication](context-publication.md), [worklets](worklets/README.md), [engine entry/lifetime checks](wasm/engine-boundaries.md).                                                          | Whole-system cancellation and retained-reference composition; kernel state transitions alone do not prove native termination.                                      |
| C8: admitted local bytes or failure                   | [`GuestResources`](../../src/guest/resources.ts), [runtime fetch receiver](../../src/runtime/worker.ts), [`getResource`/`putApp`](../../src/runtime/storage.ts), admission/catalog validation                                                                                     | Service-worker control and response semantics; immutable validated bytes and correct installation generation.                            | Resource/admission checks linked by the [surface inventory](../../SURFACE_INVENTORY.md); [management/publication evidence](management-authority.md).                                               | Compose storage publication, every resource/context path, update and upgrade behavior; establish no networking fallback across browser mechanisms.                 |

The [baseline ownership inventory](ownership.md) describes the starting architecture.
The [handoff](handoff.md) records active work and qualification status. Component
receipts must be read with their source revision, browser, controls and stated
scope; they do not qualify a combined release.

## Verifier calibration

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
