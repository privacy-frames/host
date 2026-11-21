# Browser event policy

`browser-policy.ts` composes reviewed browser families into one `NativePolicy` and
host codec. This first family covers native EventTarget construction and the
selected Event, CustomEvent and MessageEvent declarations. Other browser families
still contain generic forwarding. These changes establish no complete confinement
proof and demonstrate no new communication violation.

## Owned values and borrowed receivers

EventTarget has no harmless native getter that establishes its internal brand.
The family records targets created by its captured constructor. It admits selected
events produced by the captured constructors or delivered to a reviewed listener,
checking the exact selected prototype and captured native event getter. Other
event subclasses remain unclaimed.

Borrowing an EventTarget operation does not transfer ownership of the whole
receiver. BrowserEnvironment supplies a private predicate for its actual global,
nodes belonging to its document, and prepared windows/documents for the same
application. Unprepared windows and their nodes fail this predicate. The registry
may admit these receivers under the EventTarget operation anchor, but they are
never added to the policy's owned-object set. Ordinary Node properties therefore
continue through their existing browser owner.

This partial anchor must not later be promoted to another family within the same
registry. Full DOM integration must choose each receiver's complete reviewed
lineage at first admission in a new context.

## Calls, references and cleanup

Explicit schemas capture native descriptors before application execution. Reads,
calls, construction and reflection on owned values go through the shared registry.
Unknown getters and changed descriptors are refused before invocation. Native
method values encountered on prepared DOM receivers are replaced with canonical
registry wrappers, so their policy does not depend on the first property name used
to obtain them.

Listener conversion uses `captureEventListenerArguments`, and cleanup stores the
actual wrapper and converted primitive arguments supplied to the native call.
Delivery rechecks prepared receiver provenance. A detached local node remains
eligible because its document still belongs to the prepared application.

Function listeners may be decoded guest callbacks or already-published native
callables. `GuestEngine.recognizesCallable` recognizes only existing guest/native
handle identities, and returns false after closure. `GuestEngine.call` retains the
decoded guest wrapper's entry behavior and routes published native functions through
their existing QuickJS handles. It refuses unknown functions without encoding them.
Object listeners remain guest-owned; their `handleEvent` property is read through
the engine and its recognized callable uses the same invocation route.

Dispatch remains synchronous. BrowserEnvironment's existing dispatch adapter
handles native DOM default actions and logical anchor navigation.

Event payloads, targets, sources, ports and composed paths are delegated to their
existing owners. Reading them creates no new callable or endpoint authority in
this registry. The application-facing window-message `isTrusted` projection is
preserved; native host authentication still observes the actual synthetic event.

`readString` compares the decoded value against its primitive `length` property.
The pinned SDK's `getLength` returns no length for primitive strings, which had
forced every string through JSON recovery. Recovery remains in place for embedded
NUL, replacement characters and lone surrogates. Error conversion releases its
temporary information handle even when formatting fails.

## Remaining families and qualification

Native target families such as FileReader, IDB requests, XHR and AbortSignal retain
their existing handling. Their private producers have not been enrolled here.
Explicitly borrowing the claimed EventTarget wrapper onto one of these unregistered
receivers is therefore a compatibility concern for application qualification.
Detached parser documents also need a private producer record for this borrowed
operation route.
A rejected claimed operation never falls back to generic forwarding.

`test/guest-browser-policy.test.ts` supplies focused native controls for conversion,
cancellation, cleanup, descriptor changes, unknown getters, aliases and receiver
ownership. `test/guest-browser-policy.browser.ts` exercises the actual QuickJS and
BrowserEnvironment route, including a borrowed Node listener followed by ordinary
Node access and rejection of an unprepared window/document. Its runner is
`node --import tsx test/guest-browser-policy.ts`.

All 232 Node tests, type checking and formatting passed. The browser fixture passed
Chromium and Firefox, including a temporary build without string recovery and a
control restoring the unsupported length check. Ordinary primitive strings use the
fast path; NUL and lone surrogates require recovery. Existing guest-engine and text
bridge checks passed in both browsers, preserving their opaque-string cases.
The final source receipt is `results/quickjs-confinement/browser-policy/browser.json`;
earlier receipts are preserved separately. Full application qualification remains
with the integrating branch.

An exploratory direct-Node GuestEngine smoke terminated with a QuickJS runtime
release assertion before producing an application result. Direct TSX imports inject
an external `__name` reference into a trusted factory's serialized body. An actual
SDK probe exposes the resulting ReferenceError, and the same body succeeds with
that helper supplied in a diagnostic context. Both unchanged baseline and current
minimal controls succeed when bundled with the production esbuild convention.
The initializer regression now reports the original ReferenceError and releases
the runtime cleanly. Direct TSX factory serialization remains unsupported; the
application bootstrap continues to use its existing esbuild convention. Sources,
hashes and complete retry output are under the same result directory, with original
source reconstructed from the git base and a small patch. Full diagnostic snapshots
and generated dependency bundles stay in the ignored local tools directory.
