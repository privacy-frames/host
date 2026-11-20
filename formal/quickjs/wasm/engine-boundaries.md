# Engine entry barriers and terminal lifetime

`GuestEngine` owns the SDK roots, indexed controls and accessor table entries for
one guest. Logical close sets `closed` immediately. Physical disposal waits until
its guest-entry depth, pending-job pump and native Wasm depth are all idle. New
entries and native bound-property operations reject after logical close.

Run the actual-source fixtures and their controls:

```sh
node --import tsx formal/quickjs/wasm/check-engine-lifetime.ts
```

The runner bundles production source with esbuild and runs it against the SDK and
compiled engine. Its seven cases cover close during evaluation, decoded callbacks,
array encoding, jobs, Wasm-import reentry, jobs with Wasm reentry, and failed-job
error conversion. The last case supplies a real SDK error handle through the
runtime's failure-result interface and deliberately throws during conversion.
An independent observer around SDK `setProp` detects cleanup during array encoding,
even if the engine's entry counter is missing.

Four temporary bundles remove the idle gate, bound-property terminal guards,
`set` entry wrapper or failed-job root release. Each fails its intended lifetime
assertion. They leave production files unchanged. The receipt records actual
loaded source hashes, bundles, observations and failure output.

## Entry inventory

| Entry                                                   | Actual route                                                                                      | Buffer and lifetime boundary                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application source and modules                          | `evaluate` → `enter` → SDK `evalCode`                                                             | Flush/revoke before entry and after return; result handle is released before entry depth unwinds.                                                                 |
| Host calls into decoded guest functions/constructors    | Decoded wrapper → `invoke` → `enter` → helper `apply`/`construct`                                 | Guest receiver/arguments and result roots remain inside the entry scope. Wasm-import deferral changes copying, not indexed invalidation or depth.                 |
| Host reads/writes guest objects                         | `property`, `readGuestProperty`, `writeGuestProperty`, binary constructor/species reads → `enter` | Guest accessors and Proxy traps execute under entry depth.                                                                                                        |
| Host installs a value, including a foreign-window write | `set` → `enter` → `encode` and `defineGlobal`                                                     | Encoding native arrays can invoke an inherited guest numeric setter through SDK `setProp`; it therefore needs the same entry barrier.                             |
| Guest invokes a native proxy operation                  | SDK host dispatch → `dispatch`                                                                    | Reject closed contexts; flush before delegation and invalidate in `finally`. Effectful operations synchronize ordinary mirrors before and after native execution. |
| Guest reads/writes a bound native global property       | SDK property callback created by `bind`                                                           | Reject closed contexts before calling the host. The owning guest/job stack protects roots through the callback.                                                   |
| Pending guest jobs and module continuations             | Scheduled callback → `drainJobs` → SDK `executePendingJobs`                                       | Closed/reentrant pumps return; flush/revoke around the pump; error roots release even if conversion throws. Cleanup waits until `pumping` is cleared.             |
| Native promise fulfillment/rejection                    | `encode` settlement callbacks → closed check → `enter`                                            | A late settlement performs no guest work. SDK deferred disposal is idempotent in the pinned dependency.                                                           |
| Guest promise observed by the host                      | SDK `resolve`/`reject` callbacks installed by `decode`                                            | Callbacks check `closed`; pending native promises reject at terminal cleanup. These callbacks execute within the owning guest/job scope.                          |
| Native Wasm instance creation and exports               | `createNativeWasm` → `runWasm`; imported guest callbacks → `invoke`                               | Flush/revoke on required entry, retain nested Wasm depth, invalidate on exit. Closing skips cache re-enable and waits for the outer Wasm/guest/job stacks.        |

The low-level SDK execution sites are `evalCode` during trusted initialization and
`evaluate`, `callFunction` during trusted binary installation and `helper`, and
`executePendingJobs` in `drainJobs`. SDK property operations can also execute guest
accessors. This inventory therefore follows encoding/decoding and object access,
rather than treating only the three execution APIs as entry points.

## Growth, transfer and disposal

Native Wasm memory getters establish buffer identity. Growth wrappers retain the
replacement buffer. `runWasm`, ordinary dispatch and guest reentry invalidate old
indexed epochs before guest execution can resume; the indexed owner disables
direct views whose previous nonshared buffer has detached. A shared or resizable
backing follows its separate native/binary path.

Worker transfer calls the native operation before `detachTransferred` updates
its guest mirror. Ordinary dispatch then invalidates indexed state. Replacing a
private index shadow calls `releaseShadow` before detaching and disposing its old
backing. The C borrowed view retains its own duplicated root through enabled use.

`finishDisposalIfIdle` releases indexed records before borrowed/native roots and
context/runtime disposal. The indexed owner releases function-table slots after
unlinking all records. The idle gate also covers nested Wasm imports and jobs;
checking guest-entry depth alone would miss those stacks.

## Caller contracts still requiring composition

Trusted initialization runs the runtime/binary installers before application code.
`bind` defines an own global property without running an inherited setter. Current
`alias` callers supply decoded guest constructors/prototypes with existing rooted
identities; they do not encode arbitrary arrays. Public `call` and `construct`
forward decoded guest wrappers, whose `invoke` performs the entry checks.

The public `context` and `runtime` properties expose raw SDK APIs to trusted code.
Calling them directly to run application code bypasses the engine counters and is
outside the lifetime contract. New platform callers must use the engine entries
above. The fixtures check actual selected histories and calibrated omissions;
an inductive proof of every helper/caller composition remains open. Native object
brand checks, captured typed-array semantics, SDK root correctness and C-to-Wasm
compilation remain premises.
