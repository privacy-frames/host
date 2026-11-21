# Baseline ownership and effects in the QuickJS runtime

Baseline source: `4d0601437edab175e792165c4ffbe8aef2c13eae`.
This is a historical inventory of the starting architecture at that source
revision. It is retained to explain the original proof obligations, not to describe
the current integration. Use the [current security argument](README.md#security-argument)
for the C1–C8 enforcement, premises, evidence and remaining gaps.

| Obligation                        | Implementation owners                                                                                                     | Required contract                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preparation before execution      | `src/guest/window.ts`, `session.ts`, `contexts/worker-bootstrap.ts`, `contexts/worklet-entry.ts`, `src/runtime/worker.ts` | Trust the bootstrap and policy before guest evaluation or markup reaches a native context; queue or reject operations before readiness.            |
| Mediation of authority            | `src/guest/engine.ts`, `guest-runtime.ts`, `browser.ts`, `native-binary.ts`, `native-wasm.ts`                             | Every native reference remains private or receives a mediated guest representation; classify operations before native execution.                   |
| Returned references and callbacks | `engine.ts` encode/decode/invoke/dispatch, `browser.ts` descriptor/invoke, context message adapters                       | Preserve reference ownership through descriptors, prototypes, arguments, returned objects, exceptions, promises, callbacks, transfers and reentry. |
| Browser effect coverage           | `dom.ts`, `parser.ts`, `css.ts`, `resources.ts`, `web-services.ts`, `location.ts`, native forwarding and response headers | Local operations cannot indirectly submit remote work through rendering, navigation, browser services or retained state.                           |
| Private enforcement state         | GuestEngine host maps, guest-runtime closure records, captured intrinsics, indexed C controls                             | Guest mutations cannot observe or modify private state, recover dispatch, change operation identity or invalidate a captured primitive.            |
| Authenticated management          | `src/bridge/connect.ts`, `src/installation/`, `src/runtime/worker.ts`, `admission.ts`, `storage.ts`                       | Authority derives from the actual browser client, origin and private channel; validated records and resources publish atomically.                  |
| Lifecycle and revocation          | `src/guest/contexts/`, `session.ts`, `engine.ts`, controller storage and management handlers                              | Cancellation and closure reject new grants; pending work remains confined; generation changes do not authorize stale work.                         |
| Admitted bytes or local failure   | `resources.ts`, `catalog.ts`, `src/runtime/storage.ts`, `admission.ts`, worker resource paths                             | Reads use validated immutable local bytes for the correct generation; errors never fall back to networking.                                        |

## Guest and native state

GuestEngine stores native objects and their guest handles in host-side maps. Its
private dispatch function resolves a numeric identity and chooses a browser,
binary or Wasm owner. Encoding and decoding are therefore part of the authority
boundary, not only serialization utilities.

Trusted helper code also executes inside QuickJS. It shares guest intrinsics but
keeps private closure records for proxy identities, local properties, prototype
state and indexed buffers. Capturing a constructor is insufficient if a later
operation reads a mutable method from that constructor. Private records require
owned fields or a private prototype, and all operations on them require explicit
primordial and reentry contracts.

The indexed-buffer C extension borrows rooted QuickJS view handles or stores
trusted accessor function pointers. The engine controls record creation and
lifetime. The accessor modules receive application memory, not interpreter memory.
Verification must connect those intended owners to actual allocation, bounds,
invalidation and disposal paths.

## Native operation crossings

The browser host exposes get, set, call, construct, delete, ownKeys, descriptor and
prototype operations. At the baseline, get/set/invoke paths contained general native
reflection after specific adapters. Complete mediation must cover those fallbacks,
not merely constructor exposure. Getter execution itself requires authorization.

A reflected native method is wrapped with a remembered property key. Its contract
must be bound to the native operation's identity and receiver requirements rather
than whichever alias was encountered first. Native descriptors and prototype
traversal must preserve that same contract.

Initial rendering and native DOM preparation have separate crossings. Sanitizing
bridge methods cannot by itself establish the effect policy of native elements,
attributes, namespaces or CSS submitted by a parser. Argument conversion also
belongs to the adapter: the value validated or rewritten must be the value native
code consumes, including when conversion executes a guest callback.

## Verification status

This inventory predates the integrated native-family policies and later lifecycle
checks. Baseline receipts remain under `results/quickjs-confinement/baseline/`.
Current component evidence and qualification limits are linked from the
[security argument](README.md#security-argument).
