# Bounded management receiver schedules

`check.ts` bundles the actual `src/runtime/worker.ts` and
`src/bridge/connect.ts` receivers with their production authority predicates. It
controls their browser and asynchronous dependency boundaries, then checks the
receiver's decisions under bounded schedules. This adds caller evidence to the
[16 predicate contracts](../management-authority.md); it is not a proof of the
browser protocols or all receiver executions.

Run from the repository root:

```sh
node --import tsx formal/quickjs/management-composition/check.ts
```

The driver writes
`results/quickjs-confinement/management-composition/result.json`. It records checked source and bundle hashes,
the harness hash, schedule outcomes, omission controls and a publication-freshness
counterexample. Inputs must remain unchanged during the run. Hashes identify the
checked inputs; they do not prove the mocked dependencies implement their contracts.

## Checked obligations

| Obligation                                         | Production receiver                                                                              | Check                                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reserve a binding before storage readiness         | `connect.ts`, message listener assigns `port` before `await ready`                               | A second authenticated-parent fixture message cannot replace the pending endpoint.                                                                                        |
| Recheck endpoint ownership after suspension        | Same listener; `forwardRequest` request/reply callbacks                                          | Closing before any modeled readiness boundary prevents `pf-ready`; saved request/reply callbacks cannot send after terminal closure.                                      |
| Preserve captured sender identity through queueing | `worker.ts`, message listener captures `sourceID`, then appends `operation` to `managementQueue` | Two queued requests with different source IDs retain separate roles.                                                                                                      |
| Reauthorize after preparation, before mutation     | `worker.ts`, install/remove branches call `requireManagementClient` before `putApp`/`deleteApp`  | Each mutation uses an accepted native client snapshot obtained after admission/client enumeration.                                                                        |
| Recheck before management success                  | Same receiver, final `requireManagementClient`                                                   | Successful replies require a later accepted client lookup than result preparation. Even `events`, which has no asynchronous result preparation, requires a second lookup. |
| Recheck catalog recipient                          | Bootstrap branch, final `Clients.get` and alias/type/ID checks                                   | Successful transfer requires the captured application's window identity after catalog and generation preparation.                                                         |

The mutation contract permits already admitted local work to finish. Changing a
client after its accepted pre-mutation snapshot does not retroactively invalidate
that operation. The fixture captures that snapshot when the storage operation is
invoked, before suspending the mocked transaction. It does not assert that the
client remains live when the transaction completes.

## Exploration bounds and controls

For install, remove, list, events and bootstrap, a positive run discovers the
receiver's dependency-boundary count. At every such boundary, four runs replace
the resolved source with a missing client, mismatched ID, wrong type or unrelated
URL. Each run makes one permanent identity change; it does not enumerate arbitrary
sequences of disappear/reappear transitions. The current run records 136 such
worker schedules. Four bridge runs close at each readiness boundary, and three
close before request delivery, between request and reply, or after the first
reply: 143 recorded schedules in total.

Separate scenarios check two queued source identities and independent controllers.
Four temporary bundles omit the install reauthorization, management success
reauthorization, catalog recipient guard or post-readiness endpoint guard. Each
violates the corresponding assertion. Production files are unchanged. The port
fixture records attempted sends even after close, so native closure cannot hide a
missing application-level continuation check.

Storage, admission and catalog construction are replaced by explicit controlled
functions. Cache responses and client lookups are also controlled. The test does
not execute IndexedDB, create real browser clients, load an interpreter or send
network traffic. Its scope is the real receiver control flow and predicates.

## Current generation at transfer is not established

The bootstrap receiver checks installation generation before awaiting the final
client lookup. A separate controller has its own management queue. The driver
preserves this schedule using two real receiver instances and shared controlled
installation/client state:

1. The removal controller authenticates its manager and enumerates no application
   windows. It pauses at pre-mutation reauthorization.
2. An application window appears. The bootstrap controller captures its installed
   resources, confirms generation `g0`, and pauses at its final client lookup.
3. The removal controller reauthorizes, removes the installation and replies.
4. The bootstrap controller resolves the still-valid application recipient and
   transfers its captured `g0` catalog.

Both management authorization checks hold. The stronger property “the transferred
catalog generation remains installed at transfer” fails in this controlled
schedule. This is a publication-freshness counterexample, not an unauthorized
management mutation or a demonstrated application communication route. The
already captured resources and interpreter remain subject to their confinement
contracts. Deciding whether this publication must be revoked requires an explicit
C7/C8 linearization contract and cross-controller coordination; adding another
non-atomic generation lookup would not establish that stronger property.

## Platform and composition premises

The browser supplies authentic event sources, trusted-event flags, send-time
origins, client identities and transferred endpoints. The bridge's exact URL must
denote trusted bytes; application history/navigation capabilities must not let an
application acquire that physical URL role. The parent configuration is trusted.
Endpoint holders do not gain each other's private JavaScript references through
navigation, and run-to-completion prevents another event from interrupting a
synchronous check/use segment.

The scheduler supplies ordinary snapshot records and structured-clone-like message
data; it does not prove these native premises. Native promises, bfcache, controller
replacement, transfer errors, rejected dependency promises, persistence and
transaction atomicity are not exhaustively explored here. Catalog and resource
provenance require their own production contracts. Normal browser built-in
services are trusted under the current threat model; explicit application
communication APIs still require mediation.
