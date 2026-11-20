# Event listener conversion and cleanup

The browser converts EventTarget arguments. The bridge observes that conversion so listener cleanup can retain the resulting event type and capture flag without reading application objects again.

`captureEventListenerArguments` supplies a private DOMString conversion wrapper for the type. When native conversion requests the string, the wrapper converts the original value once and records the primitive. Object options are wrapped in a private Proxy whose `get` forwards `Reflect.get(original, key, original)`. It records the boolean value of `capture` and returns each original property value unchanged. Primitive options pass through unchanged. Object identity also recognizes `document.all`, whose legacy JavaScript `typeof` result differs from its native object type. Native conversion therefore retains responsibility for dictionary order, union conversion, defaults, passive behavior, signal validation and exceptions.

A successful registration records cleanup with the captured string, listener identity and boolean. Cleanup cannot reenter the application through a type conversion or capture getter. Failed native conversion adds no cleanup record. Explicit removal uses the same argument observer without adding a registration record.

`BrowserEnvironment.dispose` marks the environment closed before cleanup starts. Each listener cleanup and owned subsystem is attempted even when an earlier one throws. The first thrown value is retained, collections and the environment mapping are cleared, and that value is rethrown after the remaining cleanup attempts. A separate failure flag preserves `undefined` and `null` exceptions.

The focused browser fixture compares native and observed conversions for fourteen type/options cases in Chromium and Firefox. It also exercises actual GuestEngine registration with a live capture getter, cleanup after the guest engine closes, and continuation after an injected cleanup failure. Temporary bundles restore the original registration bookkeeping or omit local cleanup error containment. These controls reproduce double capture reads, a skipped listener removal, and skipped owned subsystem cleanup respectively. The native conversion comparisons run before the fixture installs its listener-removal observation wrapper.

This repair covers the EventTarget registration bookkeeping and BrowserEnvironment cleanup sequence. The remaining native EventTarget operations still use the existing browser bridge and require review as part of the broader native capability catalog.
