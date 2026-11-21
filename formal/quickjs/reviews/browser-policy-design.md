# Browser operation policy: next implementation slice

`BrowserEnvironment` supplies native browser operations to the QuickJS application.
URL and text objects already have reviewed owners; other browser families still use
shared forwarding with selected restrictions. This source review identifies
incomplete mediation. It does not establish a new application communication
violation. Browser-initiated services are outside this implementation slice.

## Remaining forwarding

The relevant entry points are in [browser.ts](../../../src/guest/browser.ts):

| Entry point                                   | Current behavior to replace                                                                                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BrowserEnvironment.get`                      | Runs `Reflect.get` for an unclaimed target after selected special cases. An unknown getter has no required operation contract.                     |
| `BrowserEnvironment.host.call`                | Applies an unclaimed function directly.                                                                                                            |
| `BrowserEnvironment.get` and `methodWrappers` | Cache by function identity while retaining the first property key used to obtain it. Aliases can consequently select that first key's adapter.     |
| `BrowserEnvironment.descriptor`               | Wraps an accessor by calling `get` or `set` with the receiver and property key, rather than retaining the declaring accessor's operation identity. |
| `BrowserEnvironment.set` and `invoke`         | End in generic native writes or calls after selected adapters.                                                                                     |
| `BrowserEnvironment.construct`                | Uses a broad constructor set and selects some argument handling by constructor name.                                                               |

## One browser registry

Compose the browser families into one `NativePolicy` and `createNativeHost` owner.
Family modules register explicit schemas into that registry; BrowserEnvironment
retains responsibility for integration and initialization order. The existing
[registry and codec](../../../docs/implementation/native-policy.md) already capture
native descriptors, enforce receiver rules and publish stable callable tokens.

Register `EventTarget` once as a base declaration. A separate event host that
claims every EventTarget would also claim DOM nodes and their unrelated properties.
One registry lets later Node and Element schemas inherit the reviewed event
operations while using their own DOM adapters.

Keep receiver admission distinct from whole-object ownership. A borrowed event
operation on a DOM node must not make an incomplete event schema responsible for
all later node properties. Choose the receiver's reviewed lineage before its
first admission; the current registry rejects a later change to another anchor.

Use `NativeMemberIndex` to resolve declaration identity and inheritance, then
select an independently reviewed rule and capture its actual native descriptor.
IDL metadata supplies no effect authorization. Existing `GuestDOM`, resource and
context adapters remain the implementations for rendering and resource effects.

## Producers and asynchronous results

Each family needs explicit producers for its admitted references. The XHR factory's
private state maps can recognize request and upload instances. Navigator and
permission facades can register their exact instances. Native constructors and
reviewed methods admit successful results before those results enter QuickJS.
Constructor names, public prototypes and `Symbol.toStringTag` cannot establish
producer ownership.

Keep those registrations private. `createGuestWebServices` can supply narrow
recognition hooks backed by its private maps, or accept a registrar during setup;
its guest globals must not expose that registration interface.

A `Promise<Response>` requires admission when it resolves. A synchronous
`result: 'reference'` declaration does not establish ownership of the eventual
Response, its body reader or a returned Blob. Event delivery likewise needs
separate rules for `target`, `currentTarget`, `source`, `ports` and payload data.
Registering the event alone does not authorize every reference it contains.

## First local and event slice

1. Add `browser-policy.ts` as the composed owner, retaining the existing registry
   and codec interfaces. BrowserEnvironment owns integration; family modules own
   schemas, producer recognition and operation adapters.
2. Add `host-services-policy.ts` for resource-backed fetch, XHR, navigator and its
   permission/media facades. Add `local-data-policy.ts` for selected Blob/File,
   Headers/Request/Response and DOMException operations. Capture explicit members;
   retain native argument conversion and local resource handling.
3. Add `event-policy.ts` for the selected event families and local EventTarget
   instances. Put listener conversion, handler assignment and cleanup behind exact
   registered operations, reusing `captureEventListenerArguments`. Preserve
   synchronous dispatch and `preventDefault` behavior.

A claimed family must route reads, writes, calls, construction and reflection
through its policy. Unknown present members fail before execution; absent
properties may retain `undefined` semantics. Unclaimed DOM families remain an
explicit coverage gap until their schemas replace the forwarding paths.

## Acceptance evidence

Test the production BrowserEnvironment route as well as the registry. Add unknown
getters before setup, after setup and as own shadows: unrestricted controls must
execute them, while the claimed family must reject them without execution. Cover
borrowed accessors, alias access order, changed descriptors, unregistered reference
results and reflective access. A claimed object must never fall back to generic
forwarding after its policy refuses an operation.

Qualify XHR conversion, abort and progress events, local fetch responses, event
cancellation, listener cleanup and the unchanged application tasks for this slice.
Record which families remain unclaimed before extending the confinement argument.
