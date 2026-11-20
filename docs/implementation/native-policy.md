# Reviewed native operation registry

`src/guest/native-policy.ts` supplies an operation registry for the QuickJS host.
A schema admits selected members of a native prototype or a trusted host facade.
It records their effect, result and callback contracts and captures the exact
accessor or function that implements each operation. Members absent from the schema
are refused before a native getter, setter or method runs.

The registry is a component for the confinement implementation. Its tests establish
selected registry properties. The browser bridge, worklet host, native-binary and
native-Wasm domains still need their own integration and semantic contracts.

## Registration and ownership

Register base prototypes before derived prototypes. A prototype schema captures
only explicitly named own descriptors. Call `admitObject` only on values produced
by a reviewed native operation. Admission requires a registered immediate prototype,
records its registered ancestry and checks any supplied brand guards. Structural
prototype matching does not establish that an arbitrary object is a legitimate
native result; the producer's contract establishes that premise.

`registerFacade` admits one exact host-created instance. Its explicit members may
be inherited from the facade's private implementation prototype. The same schema
does not admit lookalike objects or another facade instance. Navigator, local XHR,
logical history and scoped storage can therefore use contracts independent of
native Web IDL prototypes. The registry assumes no Window or DOM environment and
can also serve worker and worklet adapters.

The registry and its tokens remain private to trusted host code. A token contains
contract metadata, not its native function. Calls accept only tokens minted by that
registry. The host must wrap tokens for guest use and must never expose registry
methods or native function references as guest authority.

## Reading, calling and construction

`read` returns a tagged `NativeResult`: a value with its result contract, a mediated
callable token, or a constructor token. Registered methods become callable tokens
without executing their bodies. Accessors run their reviewed read adapter after
receiver and descriptor checks. A returned function receives no implicit authority:
it must already have an explicit callable or constructor registration.

`call` checks token ownership, the registered receiver family, current brand guards
and the captured descriptor before invoking its adapter. Standard borrowed methods
can accept admitted derived receivers. A free-function contract can explicitly set
`receiver: 'ignored'`; its adapter receives `undefined` rather than a guest-selected
receiver and may use a native global captured in its own closure when required.

`registerConstructor` captures an exact constructor function and its prototype
descriptor. `construct` requires its token and rejects changed prototype identity
before running the constructor adapter. A function can have both a call token and
a construct token; the callable result includes both permissions when registered.
The constructor adapter must implement any required argument conversion, resource
rewriting or guest execution policy before using native construction.

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
