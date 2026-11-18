# Legacy RegExp captures

QuickJS omits the static capture properties used by browser JavaScript such as
`RegExp.$1`. Rough.js uses these properties when parsing SVG paths. Excalidraw
could therefore save a rectangle while failing to paint it.

`src/guest/legacy-regexp.ts` installs the capture properties inside each guest
before application code runs. A wrapper around the guest's original
`RegExp.prototype.exec` records successful matches. The original engine still
performs matching, conversion and `lastIndex` updates. Failed matches preserve
the last successful capture state. String matching methods use the same wrapper.
The installer captures its intrinsics and keeps the state in a closure; it adds
no browser or host capability.

The supplied properties are `$1` through `$9`, `input`, `lastMatch`, `lastParen`,
`leftContext`, `rightContext`, and their browser aliases. Capture properties are
configurable, nonenumerable accessors, following Chrome and the
[TC39 legacy RegExp draft](https://github.com/tc39/proposal-regexp-legacy-features).
Firefox 155 exposes a different property shape, which the test receipt records.
Both tested browsers update captures for subclass matches and permit borrowed
getters. The shim follows that observed behavior, rather than the draft's proposed
subclass and cross-realm invalidation. It adds no `RegExp.prototype.compile`
implementation.

`test/guest-regexp.ts` runs the same input program in raw QuickJS and native
Chromium and Firefox. It compares capture state after `exec`, `test`, `match`,
`replace`, `search`, `split` and lazy `matchAll` steps, including failures, empty
matches, aliases, setters and public prototype changes. The raw QuickJS negative
control confirms the missing capture property. The application acceptance test
checks actual painted pixels on Excalidraw's static canvas as well as saved data.
