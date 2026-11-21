# Reviewed abort operations

`src/guest/abort-policy.ts` registers AbortController and AbortSignal in the
existing browser NativePolicy registry. Application code continues to use native
abort algorithms. Registered instances use that policy for property access,
methods, construction and reflection; unknown present members fail before their
getters or functions execute.

The explicit members are Controller construction, `signal` and `abort`; Signal
`aborted`, `reason`, `throwIfAborted` and `onabort`; available static `abort`,
`timeout` and `any`; and constructor/prototype metadata. Calling the constructors
without `new` is refused. Native AbortSignal construction retains its native
failure. Captured method/accessor shapes preserve name and length; method wrappers
grant no construction permission.

## Producers and shared event lineage

Controller construction records a private producer identity. Its captured native
`signal` getter admits the returned signal with the full AbortSignal lineage.
Static abort methods likewise admit their results before publication. Captured
native internal-slot getters establish brands; application names or prototypes do
not establish ownership.

Only after selecting the full signal lineage does the family call the private
EventFamily `registerTarget` hook. That hook records the producer as a receiver
for inherited EventTarget operations without re-anchoring it to the base class.
The existing listener wrapper retains callback ownership, receiver checks, event
admission and cleanup. Borrowed abort operations can admit a genuine native
receiver for that operation without granting whole-object ownership.

Static methods retain their native receiver-independent behavior. `any` receives
the original arguments once, letting the native algorithm perform sequence
conversion; the adapter does not iterate to validate and then iterate again.
`timeout` returns its native signal synchronously and schedules its native timer.
The [DOM Standard](https://dom.spec.whatwg.org/#interface-abortsignal) specifies
these producers, dependent signals and abort reasons.

## Reasons, handlers and closure

Abort reasons can be arbitrary values. The `reason` result is delegated unchanged
to its existing owner, including a guest function or object. `throwIfAborted`
throws that same native reason; the engine remains responsible for preserving its
identity through exception conversion. Neither route registers a new callable.

The native `onabort` slot receives the existing EventFamily listener wrapper for a
recognized callable. A private record lets the getter return the original guest
handler. Nonfunction values undergo native setter conversion, and the adapter
records the resulting native slot: browsers normalize these values, while Node's
native implementation can retain them. The adapter does not replace native
conversion with its own cross-platform interpretation.

Cleanup clears a slot only if it still contains the recorded assignment. Delivery
rechecks callable ownership. GuestEngine invalidates recognition at logical close,
before BrowserEnvironment cleanup, so a native timeout completing later cannot
enter the closed guest. The timer itself remains a native browser operation.

## Producer boundary still outside this slice

The current generic Request owner can return `Request.signal`. This family does
not enroll that value merely because its native signal brand matches. Existing
generic Request/signal behavior remains; borrowed EventTarget operations on an
unregistered signal retain their existing compatibility boundary.

Completing that producer requires a reviewed Request.signal getter operation,
including direct and reflected getter routes. Reading an arbitrary getter first
and admitting its result afterward would not establish pre-effect authorization.
A full Request lineage must also avoid an earlier incompatible EventTarget anchor.
This slice establishes registered Abort producers, not complete Browser mediation.

## Qualification

```sh
node --import tsx --test test/guest-abort-policy.test.ts test/guest-browser-policy.test.ts
node --import tsx test/guest-abort-policy.ts
```

The focused unit checks cover producer identity, delegated reasons and thrown
values, synchronous event ordering, handler reads/writes, native static receivers,
sequence conversion counts, reflected accessors, callable metadata, unknown getter
refusal and closure. Existing event-family tests exercise the shared hooks.

The browser fixture uses actual BrowserEnvironment and QuickJS in Chromium and
Firefox. It covers the same native algorithms, inherited event operations,
signal-based listener removal and late timeout delivery. A native unknown-getter
control executes before the confined test. A temporary bundle omits the actual
BrowserEnvironment owner-get route and must fail the unknown-getter assertion.
Production source remains unchanged by that control.

`results/quickjs-confinement/abort-policy/browser.json` records source and bundle
hashes, exact selected executable paths/hashes, launch profile, browser versions
and production/control outcomes. These fixtures qualify the listed family routes;
receiver provenance and native platform contracts still apply to their callers.
