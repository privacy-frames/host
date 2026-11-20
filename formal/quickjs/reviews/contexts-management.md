# Context and management protocol review

This source review covers the QuickJS context implementation before the lifecycle
changes proposed below. The reviewed files match `4d0601437edab175e792165c4ffbe8aef2c13eae`;
the auxiliary worktree started at `03a03cf`, whose identity-allocation change does
not alter these protocols. No browser probe or complete protocol proof is claimed
by this review.

## First usable authority

| Context          | Native authority and preparation                                                                                                                                                                          | First guest execution or delivery                                                                                                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root window      | `window.ts:start` requires a top-level window without an opener, obtains a catalog through the private controller client, prepares stable worker bootstrap URLs, then creates the environment and engine. | `session.render` enters `GuestDOM.render`; classic scripts can execute synchronously during that call. The later `data-privacy-runtime=ready` marker is diagnostic, not the confinement boundary.                                                                |
| Dedicated worker | `worker-factory.ts` resolves an admitted guest entry, creates only a trusted Blob bootstrap and posts initialization before returning the Worker handle.                                                  | `worker-bootstrap.ts:99-100` creates the complete guest session and starts its entry. The native handle exists earlier, but the bootstrap queues ordinary messages while preparing.                                                                              |
| Shared worker    | The native name contains application, installation generation, entry URL and logical name. Every connection's first port message is initialization.                                                       | One shared readiness promise creates/starts the guest engine. A connection becomes guest-usable only after its descriptor matches and that promise resolves; then a synthetic connect event and queued messages are dispatched.                                  |
| Frame            | Logical src/srcdoc is withheld from native navigation. The host retains the initial about:blank document, prepares a guest environment there and renders admitted data.                                   | `session.ts` currently renders before returning the prepared session to `documents.ts`. The factory's generation test therefore occurs after guest execution may already have started.                                                                           |
| Popup            | `open` creates a native blank popup and returns a mediated Window handle while asynchronous preparation continues. The host waits for the initial blank document to complete.                             | The same create-and-render callback executes the guest before the popup factory can perform its final generation test. The returned native Window must remain mediated before and after readiness.                                                               |
| Audio worklet    | A trusted Blob module registers a reserved bootstrap processor. The host passes the compiled interpreter module through processorOptions and keeps its control port private.                              | The bootstrap creates the guest engine and installs helpers before reporting ready. Admitted module source then arrives through the private control port and is evaluated in QuickJS. Guest processor construction/process callbacks enter that prepared engine. |

The root's manifest/icon append occurs after guest render in `window.ts:97-109`.
The current CSP has no manifest-src override and default-src is none, so the
manifest append is expected to be blocked under the CSP contract. This is not an
established HTTP escape. Moving unnecessary startup work before guest execution,
or removing redundant blocked work, would simplify ordering; permitting new manifest
traffic during private execution would change the policy.

## Catalog and bootstrap provenance

The controller request path captures native service-worker getters and postMessage
before guest setup. Each request owns a fresh reply MessagePort. Its authority
comes from endpoint ownership, not a claimed origin inside the response data.
`window.ts:catalog` validates structure after that authenticated exchange; those
shape checks alone do not establish trustworthy bootstrap bytes.

`worker.ts:103-198` resolves the actual event source's browser client. A guest
bootstrap request must come from a window whose URL maps to a stored application.
It receives engine/bootstrap files from the fixed trusted cache and application
bytes from `createGuestCatalog`. Each resource transaction checks the expected
installation generation. The service worker rechecks metadata generation after
assembling the catalog, before transferring its buffers to the private reply port.
The proof needs browser contracts for genuine client identity and private-port
transfer, plus a linearization rule for replacement after the final generation read.

`prepareGuestWorkerBootstraps` runs at trusted root startup. Children inherit its
Blob URLs and do not reconnect to the HTTP registry. The registry's deduplication
key includes application/generation and digests of engine/bootstrap bytes. Digests
identify input contents; they do not authenticate a caller. The registry accepts
native connect events and structurally valid registrations, without a browser-client
role lookup. Its provenance therefore depends on guest code being unable to obtain
the registry's native constructor or private startup port. The bridge policy and
native context boundary must establish that premise.

The worker bootstrap's origin/Blob-URL checks bind its packet to one of the supplied
bootstrap URLs. Packet validation does not independently establish who supplied
those URLs. The producer contract is essential: only the trusted factory may send
the first initialization packet, and no guest may bypass it by creating the native
bootstrap directly.

## Authentication and management

The trusted connection document binds its management port only after a genuine
message from its actual parent Window, an allowed configured manager origin, the
expected message type and exactly one transferred endpoint. Later operations arrive
on that bound endpoint. The service worker separately requires the actual client's
URL to equal the trusted connection URL and its type to be window. Guest-provided
IDs or role strings cannot satisfy either check.

`admitInstallation` validates metadata, source-derived identity, resource counts,
paths, byte lengths, digests and resolved-path uniqueness. Metadata and body writes
occur together in one IndexedDB transaction. `getResource` reads metadata and bytes
in the same transaction and rejects a generation mismatch. These are current
production mechanisms; old registry or admission model results are not proofs of
their implementation.

The management promise queue serializes messages within one service-worker instance.
It is not a global lock across overlapping controller versions. The alias-collision
check and open-window check occur before a separate write transaction. A proof must
specify what overlapping controllers and intervening launches permit. This review
has not established an exploit through those schedules.

Install/remove checks enumerate window clients. Already-created workers or worklets
may retain an old immutable catalog. The present code does not check the current
stored generation on every guest operation or forcibly terminate every old context
at removal. Confinement may permit already-admitted computation to finish, but its
continued confinement and inability to obtain new privileged grants must be proved.
Uninstalling metadata is not a proof of native termination.

Storage namespacing is not a confidentiality boundary between applications here.
Host metadata, trusted bootstrap caches and management ports must nevertheless
remain unreachable through guest storage/native-object adapters.

## Queues, callbacks and closure

The dedicated-worker receive listener precedes guest listeners. It consumes the
first initialization message, copies later messages while preparation is pending,
then removes itself and dispatches the queue after successful start. Failure marks
the bootstrap closed, clears its pending array, closes any session and schedules a
native error and worker close. The production proof needs native task ordering and
Worker termination contracts; a returned Worker object is not itself unrestricted
execution authority.

Shared workers maintain one session promise and per-port preparation queues. Every
new port must validate the existing application/generation/entry/type tuple before
connect delivery. A failed initialization closes that port. The rejected shared
readiness promise remains rejected; the code does not silently create a replacement
unprepared engine. SharedWorker identity/lifetime and MessagePort FIFO ordering are
browser premises.

Frame native load events are stopped before application listeners. Only trusted
initial-about:blank completion resolves the preparation wait; logical load/error
notifications are host-generated afterward. A MutationObserver invalidates detached,
adopted or changed frame windows. Observer delivery is asynchronous, so current
connectedness and abort checks are needed at each preparation continuation as well.

Window postMessage authenticates an allowed target at send time, structured-clones
its data, commits transfers, then schedules a synthetic event. Its delivery callback
checks producer disposal, target closure and logical target origin. It does not
capture a target guest-session epoch or repeat target membership authorization at
delivery. Review whether its intended Window semantics permit replacement between
send and delivery; do not assume that the native postMessage algorithm proves this
custom synthetic dispatch. A disposed producer already drops its queued delivery.

The private request client settles local waits once, using per-request reply ports.
It rechecks closure after reading transfer entries because those reads can reenter.
`servePrivatePort.close` rejects pending replies and prevents new handlers; an
already-started handler can continue. Handler-owned effects need their own lifecycle
checks. Closing a port does not cancel remote work retroactively.

Audio module loading uses one private controller per audio context and installation
generation, shared by explicit owners. It serializes module requests through its
queue and tracks pending replies. Final-owner disposal sends close, closes the
control port and disconnects its bootstrap node. The worklet's async engine creation
and module completion can race that close; its native callback must preserve a
closed state rather than recreating engine authority after a close packet. The
worklet also has a separate broad Reflect-based GuestHost, so the browser-operation
policy review must include it, not just BrowserEnvironment.

At the reviewed revision, native AudioWorkletNode construction also accepts the
reserved bootstrap processor name. The bootstrap checks that processorOptions.module
is a native WebAssembly.Module, not that its bytes belong to the trusted interpreter.
Preventing guest registerProcessor from defining reserved names does not prevent
selecting an already registered bootstrap. The native constructor policy must deny
that selection; the name is not a secret. This is an engine-provenance obligation,
not a demonstrated network escape.

## Implementation changes to verify first

The frame and popup generations are JavaScript Numbers. Repeated increment eventually
stops producing a different value, invalidating an unbounded argument that every
cancel/replacement defeats older continuations. This is a lifecycle proof defect;
this review does not demonstrate a network disclosure from numeric saturation.
Use fresh private object identities for local preparation epochs.

A small production kernel should own exactly a token and a closed flag. Begin
allocates a new token and makes that preparation live. Invalidation allocates a new
token and closes it. Acceptance requires both a live flag and strict identity with
the captured token. Its record must own writable data properties and remain private
in the native host; other private fields are framed by the caller contract.

Integrate that kernel into both frame and popup continuations. Clear owned pending,
session and abort fields before invoking callbacks, so reentrant cleanup cannot
erase a newer preparation. Pass AbortSignal through the actual create-and-render
caller, check it after engine creation and before rendering, and close the created
session on cancellation. A stale postcheck by itself cannot prevent guest source
that already executed during the awaited callback.

The direct implementation contracts should establish freshness, flag updates,
identity-based acceptance, preservation of unrelated fields and the distinction
between cancelling a preparation and permanently disposing its factory. Lean can
prove preservation over arbitrary finite begin/invalidate histories under fresh
object identity. Current extracted production bodies and caller tests must connect
that model to the actual implementation; historical proofs remain references only.

Other small kernel candidates are the worker descriptor tuple comparison,
management source-role decision, one-shot private-reply completion, and worklet
controller/module lifecycle. `web-services.ts` XHR also uses numeric cancellation
generations. Audio module and guest processor IDs increment Numbers; whether their
reuse is safe depends on their sequential-reply and instance-lifetime contracts.
Inventory these separately rather than assuming all counters require the same fix.

Independent fixtures should exercise delayed preparation, replacement, close while
pending, preparation rejection, reentrant cleanup and queued Window messages after
producer disposal. Browser fixtures should additionally establish native blank
context ordering, abort delivery and actual guest execution suppression. Neither a
pure epoch proof nor a fake native fixture alone proves browser confinement.
