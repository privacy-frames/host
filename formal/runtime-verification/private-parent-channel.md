# Private requests through the owning parent

Host code in an owning parent can hold the native controller handle while a child
uses a private message port. The shared RPC client now serves production
controller requests and the parent-channel primitive. Production document and
popup guards now obtain configuration and content through their owning parent.
Native HTTP shells and guard scripts remain in use; the local-document experiment
is a separate transport comparison rather than the production bootstrap.

## Endpoint ownership

The parent matches a handshake against the actual child Window, its serialized
origin and the key assigned to that pending context. A key alone grants no role.
A consumed registration cannot accept another connection. The caller supplies
an authority check tied to its context lifetime; the parent checks it before
handling each request and after awaiting the handler. The acknowledgement
establishes the transport, not preparation or publication of the child.

The receiver is installed during module initialization, before application
listeners. It consumes private handshake messages before those listeners can
observe transferred ports. Per-context registration adds a private record to that
receiver rather than installing another Window listener. Unknown private
handshakes are discarded and their incoming ports closed.

`test/parent-channel.ts` runs in Chromium and Firefox. It rejects a sibling Window
with the correct key, a wrong-origin Window, a wrong key, a synthetic event,
replay, and a key from an earlier generation. It exercises changes to captured
MessagePort, MessageEvent, MessageChannel, EventTarget, iframe and iterator
operations. Deliberately uncaptured getter controls fail while the captured
transport still returns the expected data.

An application listener is registered before a pending child is configured. In
the normal build it observes no bootstrap endpoint. A test-only source mutation
moves dispatcher installation into the per-child registration function. The same
application then obtains the port and forges a reply: the caller receives `99`
instead of the handler's `42`. Both browsers reproduce the fault. The mutation
changes receiver timing; it leaves the application's source unchanged. This
establishes a channel-integrity failure, not a network-disclosure demonstration.

## Requests and closure

Each request transfers a fresh reply port. There is no sequence-number lookup or
HTTP fallback. Captured operations and private records protect the local request
state from the tested prototype changes. Replies are normalized and validated
before their value is returned. Handler exceptions and uncloneable replies reject
the request; a missing reply expires locally.

Closing a client rejects its pending waits and denies later dispatch. Closing a
server refuses pending replies and notifies its peer. A handler already running
may finish, but its closed reply record cannot deliver that result. A generation
change while the parent awaits its handler also refuses the result. Previously
resolved values are not revoked, and closing a channel does not cancel arbitrary
remote computation.

The implementation relies on native port-message task queues. The
[HTML channel-messaging algorithms](https://html.spec.whatwg.org/multipage/web-messaging.html#channel-messaging)
queue delivery and enable it through `start()`; starting a port does not itself
run an application callback synchronously. The ownership and lifecycle argument
must also account for queued events, document activity and context destruction.

`test/private-channel.test.ts` checks concurrent correlation, transferred request
ports, local and server closure, reentrant closure while transfer entries are
read, late handler completion, hostile thrown values, uncloneable results and
timeouts. Node's MessageChannel exposes ports as own properties, so that unit
fixture adapts the constructor to browser-style getters while retaining native
Node ports. The browser tests use actual browser constructors.

## Local document comparison

Run `PF_DOCUMENT_PARENT_RELAY=1 node formal/runtime-verification/local-document-controller.ts`.
The parent-mediated variant uses the same browser, registration and resource
fixtures as the direct-controller experiment. The child's private channel ends
at host code in the owning parent, which forwards the fixed-resource request
through its own controller client. The fixture permits only identity and fixed
resource reads. The returned identity is the parent's native
client identity, not proof of a native child-client binding.

The eighteen-case matrix covers `srcdoc` and Blob children with no later
registration, a sibling registration, or a covering registration, in Chromium
and fresh/forced-stale Firefox. Successful local reads do not suppress the
Firefox covering-scope update. Registration lifetime remains a separate C4
obligation.

## Production document integration

`document-parent.ts` installs a handler shared by the document and popup
factories. It permits only configuration and content, closes unexpected
transferred ports, and supplies the factory's stored child identifier and parent
token. Packet-supplied identities and payloads cannot select another grant.

Each factory registers the expected native Window before starting its trusted
document bootstrap. The document factory ties the registration to its private
generation identity and closes it on cancellation. The popup factory ties it to
its uncanceled record and closes it on retirement. Static imports install the
global receiver before publisher listeners, including when the first child is
requested after application startup.

The controller requires the actual owning parent, matching installation and
generation, parent token and a bound native child. The child read/consume path
remains shared. After it returns, the controller rechecks the intent, child and
parent authority. The child closes its bootstrap client after content delivery
or a startup failure. Factory cancellation closes the parent's server; client
closure itself does not cancel remote computation.

Actual installed HTML/SVG and nested-document tests exercise this path. The
separate built-controller fixture challenges native client authorization and
single consumption; the bounded real-IndexedDB race fixture challenges authority
changes during consumption. Neither establishes the full factory ownership proof.

## Remaining obligations

The context factory must establish the expected Window, install the receiver
before application execution, assign a fresh key for each lifetime and close or
invalidate the registration on cancellation. The native protocol fixture does
not prove those caller obligations or complete private-state ownership.

Verify the production handler's admission and revalidation contracts through
its callers. The separate fixed-resource relay experiment does not implement
that admission protocol.
DOM/CSS resources, module graphs, context bootstraps and later registrations
still need delivery mechanisms that preserve the no-request policy. The complete
runtime confinement claim remains open.
