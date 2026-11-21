# Reviewed native operation registry

`src/guest/native-policy.ts` supplies an operation registry for the QuickJS host.
A schema admits selected members of a native prototype or a trusted host facade.
It records their effect, result and callback contracts and captures the exact
accessor or function that implements each operation. Members absent from the schema
are refused before a native getter, setter or method runs.

The registry is integrated with the standalone URL and text families, native Wasm,
the [native buffer policy](../../formal/quickjs/binary-policy.md), and the
worklet/MessagePort host. The composed [browser event policy](browser-policy.md)
adds selected local EventTarget and event instances. BrowserEnvironment routes
claimed objects to their reviewed owners. Other browser forwarding and cross-family
producer/callback composition remain open obligations. The [security argument](../../formal/quickjs/README.md#security-argument)
locates the remaining implementation and browser obligations.

## Registration and ownership

Register base prototypes before derived prototypes. A prototype schema captures
only explicitly named own descriptors. Call `admitObject` only on values produced
by a reviewed native operation. Ordinary admission requires a registered immediate
prototype, records its registered ancestry and checks any supplied brand guards. A producer may instead
supply a reviewed semantic anchor with a registered native brand guard. Anchored
admission uses that reviewed lineage and checks own shadows; it neither walks nor
enrolls foreign physical ancestors. Prototype traversal returns the reviewed
anchor. This supports cross-realm Wasm brands without trusting foreign methods or
getters. In both forms, the producer's contract must establish that the value is a
legitimate result with the required authority provenance.

`registerFacade` admits one exact host-created instance. Its explicit members may
be inherited from the facade's private implementation prototype. The same schema
does not admit lookalike objects or another facade instance. Navigator, local XHR,
logical history and scoped storage can therefore use contracts independent of
native Web IDL prototypes. The registry assumes no Window or DOM environment and
can also serve worker and worklet adapters.

The registry and its tokens remain private to trusted host code. A token contains
contract metadata, not its native function. Calls accept only tokens minted by that
registry. The shared host codec normally wraps tokens for guest use. It may also
bind an explicit call token to an original native Wasm funcref, preserving its native
identity for tables, globals and imports. Publication of that reference still
requires mediated call dispatch; the native reference alone grants no registry
permission. Registry methods remain private.

## Reading, calling and construction

`read` returns a tagged `NativeResult`: a value with its result contract, a mediated
callable token, or a constructor token. Registered methods become callable tokens
without executing their bodies. Accessors run their reviewed read adapter after
receiver and descriptor checks. A returned function receives no implicit authority:
it must already have an explicit callable or constructor registration. A
`delegated` result passes the value unchanged without minting either token. Its
existing owner remains responsible for any subsequent use; the producer must not
use delegation to bypass ownership classification.

`call` checks token ownership, the registered receiver family, current brand guards
and the captured descriptor before invoking its adapter. Standard borrowed methods
can accept admitted derived receivers. A free-function contract can explicitly set
`receiver: 'ignored'`; its adapter receives `undefined` rather than a guest-selected
receiver and may use a native global captured in its own closure when required.

`registerConstructor` captures an exact constructor function and its prototype
descriptor. `construct` requires its token and rejects changed prototype identity
before running the constructor adapter. A function can have both a call token and
a construct token; the callable result includes both permissions when registered.
The shared codec preserves both permissions and stable constructor identity;
construction alone never authorizes an ordinary call. This matters for Wasm error
constructors, which support both forms. The constructor adapter must implement any
required argument conversion, resource rewriting or guest execution policy before
using native construction.

A callable's canonical contract includes its ID, effect, result and callback rules,
adapter function identity and receiver mode. Equivalent aliases share a token and
may add explicitly registered receiver families. Conflicting contracts are rejected
before any callable from that schema is registered. An unreviewed alias remains
unavailable even when its function is registered under another name.

## Reflection and native data

Descriptor results contain mediated getter/setter tokens tied to their original
declaring member. Borrowing such a token does not select a new contract from the
receiver's property name. Native data members may change value through their
reviewed write operation without invalidating descriptor ownership. Changes to
accessor identity, callable identity or descriptor flags cause refusal.

Keys contain only reviewed own members. Prototype traversal returns a registered
native prototype or stops at the boundary. An unreviewed descriptor shadowing a
reviewed inherited member is refused before its getter can run. Guest-defined
properties and prototype changes remain guest operations rather than being copied
into this native registry.

Named or indexed native families require an explicit matcher and read/write
adapters. They have no generic reflective fallback. For example, a reviewed data
family can inspect own data descriptors and reject accessor descriptors without
running them. A broad matcher followed by unrestricted `Reflect.get` would require
an independent proof that its native exotic-property behavior is safe.

## Adapter obligations

The adapters, matchers, brand guards and producer registrations are trusted code
whose behavior requires separate verification. They must use reviewed native
operations, perform required conversion once, preserve the selected operation
through reentry and enforce the declared effect. Brand discovery must not invoke
unknown getters. The registry's descriptor checks operate on native objects or
facades whose reflection behavior has already been admitted by those contracts.

Result and callback metadata identifies the obligations for encoding results,
registering returned objects and routing callbacks into QuickJS. The metadata alone
does not prove that a DOM operation is local, that a callback is confined or that
markup cannot initiate communication. The integrating host must connect each
contract to its production adapter and reject unclassified native operations.

Run the independent registry checks with:

```sh
node --import tsx --test test/guest-native-policy.test.ts
```

They cover unknown getters added before and after setup, borrowed accessors,
foreign receivers, aliases and failed registration, descriptor changes, inherited
shadowing, exact facade ownership, writable data, explicit named families,
returned-function and token refusal, free functions and constructor identity.

## Native member identities

`scripts/guest-bindings.ts` now writes `generated-native-members.ts` in the same pass
as the full reference and existing global provisioning projection. The native
manifest carries the same Webref version, parser version and source corpus hash.
It retains interface ancestry, declaration/mixin owner, member placement, readonly
and unforgeable shape, special operations and collection-generated members. It
omits argument conversion schemas and return type strings.

`NativeMemberIndex.resolve` returns the most-derived declaration installed on a
native interface. A mixin owner remains distinguishable from the native interface
on which its member appears. Overloads with identical member identity collapse;
conflicting declarations at the same level produce an ambiguity error. Missing
interfaces, names and unrelated symbols produce no member resolution.

Anonymous indexed/named getter, setter and deleter declarations have a null name.
They are available through `resolveSpecial`, never as an ordinary property named
an empty string. The projection identifies unsigned-long keys as indexed and
DOMString keys as named. Other first-argument types remain explicitly unclassified
for review. A named operation such as `item` retains both its method identity and
its indexed-getter origin.

Collection declarations contribute their standard implicit methods and actual
iterator symbol identities. A string named `@@iterator` cannot stand in for
`Symbol.iterator`. Stringifier attributes retain their source attribute and add the
implicit `toString` identity, including its declaring mixin and unforgeable shape.

The native catalogue is imported only by the native-member resolver. Importing the
existing global provisioning module does not include this additional table in its
bundle. The catalogue describes which declarations exist; the separate reviewed
operation registry still decides which operations may run.

## Standalone URL family

`createGuestURLPolicy` in `src/guest/url-policy.ts` supplies a `GuestHost` domain for
one provided realm's native URL and URLSearchParams constructors. It classifies
standalone URL data operations separately from browser navigation. Parsing or
changing a URL can represent any scheme without granting authority to load it.
The consuming DOM, resource or context adapter retains that decision.

The family explicitly registers URL attributes, stringification, JSON serialization,
parameter mutation, native iteration and forEach callbacks. Available canParse and
parse static methods use captured native functions. Unknown members, changed
accessors and unreviewed shadows are refused before invocation. A native URL brand
with an unregistered prototype is claimed by the domain and refused, so it cannot
silently fall through to another host's generic forwarding path.

Object-URL creation and revocation call the resource owner's supplied adapters.
Creation passes the original value unchanged; that adapter validates the accepted
Blob and records its local resource authority. Revocation performs one DOMString
conversion and passes the resulting string to its adapter. These operations do not
call the unrestricted native object-URL functions merely because the functions
appear in metadata.

URLSearchParams iterators retain native state, methods and result records. The
shared native Iterator prototype is projected through a private boundary object;
the URL domain does not claim it for iterators belonging to unrelated families.
Object and Function intrinsic prototypes are returned only at the boundary where
GuestEngine maps them to the corresponding guest intrinsics. That mapping is an
integration premise, not authority to expose native Function to an application.

Native call and accessor tokens become private host wrappers. Wrapper identity is
stable, including the entries/Symbol.iterator alias, and the domain accepts only
registered wrappers and constructors. Callback invocation still depends on
GuestEngine's conversion of the supplied guest callback into its owning engine.
The URL family does not classify unrelated browser interfaces.

Run its independent native controls and denial checks with:

```sh
node --import tsx --test test/guest-url-policy.test.ts
```

## Integrated families

The [text family](../../formal/quickjs/text-policy.md) classifies native encoders
and decoders. Its buffer results return to NativeBinary; text ownership does not
establish buffer ownership or lifetime.

The [native Wasm family](../../formal/quickjs/native-wasm-policy.md) records its
explicit members, semantic anchors, delegated externrefs and exact native funcref
publication. Wasm function branding does not prove that hidden imports are confined;
that requires the reviewed instantiation/import producer contract.

The [worklet/MessagePort family](worklet-policy.md) classifies its native operations,
message delivery and transfer conversion. Native callback ordering and engine
ownership remain caller and browser obligations. The linked fixtures exercise
production routes and include controls that remove selected enforcement steps.
