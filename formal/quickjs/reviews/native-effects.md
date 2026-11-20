# Native effect boundary review

Reviewed the unchanged QuickJS source at `4d06014` for stages 0 and 2. This is a
source review and implementation proposal; no browser exploit or complete
confinement proof was established by this review. Runtime source was left unchanged.

## Current forwarding paths

| Entry                                            | Current behavior                                                                                                                                              | Required connection                                                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GuestEngine.bind`, engine.ts:510                | Dynamic globals call `host.get` and `host.set` directly, outside `dispatch`.                                                                                  | Apply the same read/write policy as ordinary proxy operations.                                                                                                                     |
| `GuestEngine.owner`, engine.ts:430               | Chooses browser, native-binary or native-Wasm host. Browser host is the default owner of unclassified values.                                                 | Establish a disjoint provenance rule; unknown native references must not acquire browser authority by default.                                                                     |
| `GuestEngine.dispatch`, engine.ts:641            | Delegates get/set/delete/define/has/keys/prototype/descriptor/call/construct to the selected host.                                                            | Dispatch is the common authority boundary, including its three binary index operations.                                                                                            |
| Browser host, browser.ts:435                     | `get` and `set` use browser policy; `call` directly applies any supplied native function. `prototype`, `delete` and ordinary `ownKeys` use native reflection. | A callable must have a registered operation contract before `host.call`; reflection requires the same member dispositions.                                                         |
| `BrowserEnvironment.get`, browser.ts:752         | Special cases precede unrestricted `Reflect.get` at 873. Native methods are wrapped afterward.                                                                | Resolve and authorize the native getter or data property before any getter runs.                                                                                                   |
| Method wrapping, browser.ts:910                  | Caches wrappers by native Function only; the closure remembers the first property key.                                                                        | Canonicalize equivalent alias contracts, or retain contract identity in wrapper-cache keys. A string key must not choose a different policy for the same captured native function. |
| `BrowserEnvironment.set`, browser.ts:922         | Special cases precede unrestricted `Reflect.set` at 1067.                                                                                                     | Authorize the concrete setter/member before mutation or argument conversion.                                                                                                       |
| `descriptor`, browser.ts:1080                    | Every own native descriptor is returned; getters/setters call the browser environment again with the supplied receiver.                                       | Resolve the declared member and capture its identity. Revalidate a borrowed receiver against the same contract.                                                                    |
| `scopeProperty`, browser.ts:1142                 | Restricts global-prototype members; ordinary returned objects pass automatically.                                                                             | Returned objects and their prototypes require classification too.                                                                                                                  |
| `construct`, browser.ts:1119                     | Checks the constructor WeakSet/name denylist, then uses `Reflect.construct`.                                                                                  | Attach reviewed constructor contracts to exact captured functions, including their return authority and conversion rules.                                                          |
| `invoke`, browser.ts:1153                        | Handles selected operations by property name, then unrestricted `Reflect.apply` at 1531.                                                                      | Select an adapter from a registered operation contract. There must be no unclassified native-call fallback.                                                                        |
| `GuestEngine.encode`, engine.ts:822              | Copies primitives, promises, arrays and plain data; registers most other objects as native handles at 965.                                                    | A returned object/function must receive provenance before later native operations become possible. Promise results and rejection objects reenter this path.                        |
| Native/guest callback conversion, engine.ts:1474 | Native callbacks encode receiver/arguments and decode the guest result.                                                                                       | Callback arguments, receiver and returned capabilities obey the same transfer invariant, including disposal/reentry.                                                               |

These locations are anchors for a source-connected call graph, not a claim that
unchanged line numbers are security evidence. An AST check should enumerate native
operations and their enclosing production function, then require an implementation
contract for every reachable operation. Hashes bind the reviewed snapshot; they do
not establish that the functions route through policy correctly.

The guest runtime already implements `call`, `apply`, `bind` and function
`constructor` through captured guest `Function.prototype` (guest-runtime.ts:365).
Preserve that behavior. A new browser policy must not accidentally expose native
Function intrinsics while adding method identity checks.

## Main obligations

### Authorization before access

The strongest immediate improvement is replacing the native `get`, `set` and call
fallbacks. For example, a getter can perform its effect before the bridge examines
its return value. Filtering returned constructors after a generic getter cannot
prove that the read was harmless.

Resolve native members from captured data descriptors and prototype identities.
Capture this registry during trusted setup, before publishing the guest. Descriptor
lookup may inspect a known native object or prototype without invoking its getter;
that inspection itself needs a contract for exotic objects. Do not probe arbitrary
native getters to guess an object's interface. The existing captured native brand
getters in `contexts/brands.ts` are individually reviewable examples.

### Callable identity and borrowed receivers

An operation contract must identify the exact captured native function or accessor,
its declaration, and the accepted receiver family. `Function.name` and the property
name used to retrieve it are diagnostic information rather than authority.

Capture a native method only after its member contract was selected. Register the
wrapper in a private WeakMap. The wrapper invokes its specific adapter with a
receiver checked against that contract. An inherited operation may accept a derived
receiver; borrowing a getter or setter must retain the declaring contract. Reaching
a function through an unreviewed alias must not authorize that alias.

Standard aliases can share a canonical contract and wrapper when their behavior is
identical, preserving normal identities such as iterable methods where browsers
share them. If two declarations require different adapters, the wrapper cache must
include the contract identity rather than retaining the first observed key.

### Returned objects and prototype traversal

Register each admitted native object's family when it crosses the boundary. Its
native prototype chain may be used to resolve a reviewed inherited member, but
prototype traversal must not expose an unreviewed prototype's operations.

Do not use public `constructor`, `name` or a freely forgeable `toStringTag` as the
sole authorization brand. Captured native prototype identity and individually
reviewed internal-slot checks are suitable inputs. Cross-window objects require the
corresponding trusted realm registry; application-defined guest prototypes remain
entirely in QuickJS.

Methods returning collection entries, iterators, attributes, CSS rules, audio nodes,
permission statuses, media streams, storage records and promises all need return
rules. The rule can be "copy a data record" or "admit this native family". Reading a
new attribute from an otherwise admitted DOM object cannot bypass that rule.

### Host-defined facades need their own provenance

Several legitimate objects do not match native Web IDL prototypes: the navigator
facade, local XHR, scoped storage proxies, logical history/location, context factories
and JavaScript wrappers around permitted browser operations. Explicitly register
these objects and their callable members against a host-facade schema during trusted
creation. Recognizing arbitrary host JavaScript functions as safe would reopen the
call boundary.

Keep native-browser, trusted-facade, native-binary and native-Wasm ownership distinct.
A native method and a host adapter can implement the same guest interface while
retaining different execution contracts. Decode/encode identity preservation must
return original guest objects without promoting them into a native owner.

## A compact implementation shape

Keep `GuestHost` as the engine-facing interface. Put native-browser authorization in
one policy module with a private registry. The core data can be:

```ts
interface NativeMemberContract {
  id: string;
  owner: string;
  key: PropertyKey;
  adapter: AdapterId;
  result: ResultRule;
  callbacks: CallbackRule;
}

interface NativeCallable {
  contract: NativeMemberContract;
  target: Function;
  acceptsReceiver(receiver: unknown): boolean;
}

type NativeAccess =
  | { kind: 'get'; target: object; key: PropertyKey }
  | { kind: 'set'; target: object; key: PropertyKey }
  | { kind: 'call'; target: Function; receiver: unknown }
  | { kind: 'construct'; target: Function };
```

Use a discriminated result for attribute reads/writes, method/constructor permits,
data constants and refusal. A successful decision contains a captured operation and
a specific adapter; native execution consumes that decision. All registry insertion
occurs in trusted bootstrap or in the return handling of an already admitted
operation. Refusal includes the operation, resolved interface/member, context kind
and the missing or incompatible contract.

A public method named `authorize` followed by a generic reflection call is not enough
if callers can supply a different target, key, receiver or arguments. Keep permit
creation and consumption in the same module, or prove the association explicitly.
Required coercions must happen once, with the resulting primitives used by both the
adapter's validation/rewriting and the native call. Reentry during Web IDL conversion
must not alter the selected operation or private policy records.

The minimal runtime projection currently retains only global-interface members
(`scripts/guest-bindings.ts:309`, `interface-definitions.ts:92`). Add compact instance
member identities and special collection declarations if the runtime needs them for
resolution. The full pinned Web IDL is a build-time reference. Including a member in
this projection must never create its effect authorization automatically.

## Operation families that can preserve application support

Review families around mechanisms, not around application traces:

| Family                      | Contract and adapter                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scalar/geometry/data reads  | Reviewed getters and data descriptors with no communication, code execution or context creation; encode the result according to its declared return rule.                                   |
| Pure/local data objects     | URL, URLSearchParams, Blob/File, headers, streams, codecs, crypto and similar objects get explicit member contracts, with URL-backed native loads separated from local transformations.     |
| DOM topology and inspection | Controlled node creation, traversal and tree mutation. Prepare every inserted subtree before native consumption and route resulting reactions through the DOM contracts.                    |
| DOM attributes and markup   | One attribute mapper and one inert-markup pipeline serve property setters, attribute methods, attribute-node mutation, parser output, ranges and document-write variants.                   |
| CSS declarations/rules      | Convert strings once, rewrite native resource references, then call native setters/methods. Capture metadata for named CSS properties, indexed rules and custom-property access separately. |
| Native rendering/audio      | Local canvas, graphics, media and audio operations. URL inputs, worklet creation, remote playback and device access are separate adapters/contracts.                                        |
| Catalog resource APIs       | Fetch, XHR and Cache add operations obtain admitted bytes or fail locally. They never delegate to native network fetch.                                                                     |
| Execution and contexts      | Script handlers, eval, timers and dynamic modules execute in QuickJS. Worker/window/worklet creation uses prepared context factories.                                                       |
| Events/messages/storage     | Capture callbacks, admit returned references, authenticate destinations and preserve closure/disposal rules. Scoped storage compatibility does not grant access to host records.            |
| Native Wasm/binary          | Existing dedicated domains retain their explicit import/provenance/buffer contracts; they cannot be exempted merely because the browser bridge refuses a member.                            |
| Export and management       | Native exports require the host's existing approval; management remains bound to authenticated native clients/ports, never guest data.                                                      |

Each family needs concrete included members, exceptions and a browser-effect
argument. A rule such as "all HTML properties are local" is too broad. A pinned
member set plus a reviewed family contract permits future audit without maintaining
an enormous app-derived property list. Application traces help identify accidental
compatibility losses, but do not authorize previously unreviewed operations.

## Browser parsing paths outside member dispatch

Bridge closure alone leaves native markup consumption. `GuestDOM.create` builds
native elements from parsed tags, `attribute` returns true for unknown attribute
names at dom.ts:280, and `prepare` permits ordinary names except a short blocked
context set. The parser also handles namespaces and animation attributes. These
paths need their own reviewed tag/attribute/effect catalogue for supported browser
versions, including guest custom elements. A native unknown/new element should not
silently acquire new context/network behavior through initial HTML parsing.

`GuestResources.nativeURL` already maps missing HTTP resources to an inert data URL
and reads catalog bytes. However it passes `data:` and `blob:` inputs through at
resources.ts:57. Their use requires consumer-specific contracts: an image decoder,
a stylesheet and a browsing context do not have equivalent execution behavior.
Keep native HTML/script execution unavailable even when its source URL is local.

MutationObserver processing is not a pre-effect authorization boundary. Ensure
subtrees and attributes are prepared before the native operation can connect or
consume them. The observer can track later lifecycle activity but cannot repair an
already-started request.

## Specific conversion obligations

The CSS property setter rewrites only when `typeof value === 'string'`
(browser.ts:1059). FontFace/Audio construction and CSS methods use similar
string-only conditions. An object whose guest `toString` returns a resource-bearing
string can therefore reach native conversion without passing the mapper. Existing
CSP may still prevent a remote request; this source finding does not establish an
exfiltration. The general repair is conversion once to the required primitive,
followed by rewriting and consumption of that same value.

## Independent negative controls

1. Add an unlisted accessor to a native prototype from a trusted test harness before
   environment creation. Its getter increments a native counter. Guest reads,
   descriptors and borrowed getter calls must be refused without incrementing it;
   an unrestricted harness read must increment it. Repeat for an unlisted setter
   and method, and again with additions made after bootstrap. Snapshotting all
   properties found at startup must not count as authorization.
2. Put such an accessor on a returned object family such as a validity state or a
   canvas context. Verify that admitting the containing object does not admit the
   member, including `in`, own keys and descriptor traversal.
3. Borrow a real admitted URL/attribute setter or operation through its descriptor
   and call it on a compatible derived receiver. Its normal local operation must
   work, and its resource input must still pass through the same mapper. An
   incompatible receiver must fail before an effect.
4. Expose the same native function through one reviewed declaration and an
   unreviewed alias in the trusted fixture. Access through the alias must remain
   denied. Exercise both lookup orders to detect first-key wrapper-cache confusion.
5. Pass objects with effectful/coercing `toString` or `valueOf` to CSS setters,
   stylesheet methods, Audio and FontFace. Require a single conversion and the same
   mapped primitive at native consumption. Include reentry and throwing conversions.
6. Return an unclassified native object/function through a callback, rejected or
   resolved promise, iterable result and event property. No route may acquire a
   default browser-host capability. Controls use admitted data and known interfaces.
7. Exercise denied context creation through markup, parser results and node
   insertion, not just native constructors. Observe independent receivers where
   applicable, with a native positive control and a removed-defense fixture.

Counter-based fixtures establish that a denied getter/call never executed. Receiver
fixtures separately establish the actual communication behavior. Both are needed;
a network policy could block the request while an allegedly denied native operation
still ran.

## Implementation order

First centralize member/operation resolution and close callable provenance, while
retaining existing effect adapters. Next move each existing special case into its
reviewed family adapter and use the same resolver for reflection and borrowed
accessors. Then close named/indexed properties and returned-object families, followed
by the independent markup/CSS consumer review. Keep native Wasm and binary paths in
the crossing inventory throughout. Run unchanged-app acceptance after each coherent
family and remove old fallbacks only after its replacement passes its own controls.
