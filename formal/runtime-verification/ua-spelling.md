# Browser spelling service

Enhanced spell checking can transmit text entered in ordinary HTML fields.
Google [documents the service](https://support.google.com/chrome/a/answer/13616585?hl=en).
This is a browser-owned effect: intercepting application fetches does not establish
that it is confined.

## Reproduction and candidate

The [earlier receiver observation](ua-spelling-policy8-before.json) records one
request containing a synthetic private marker from each of the unrestricted,
strict-CSP and installed-runtime cases. The attribute-disabled and incognito
cases transmit no marker. That receipt predates the runtime provenance capture
added to the current fixture; it identifies its runner and browser, but cannot
certify an exact runtime source/build pair.

The policy-9 candidate prepares HTML with explicit `spellcheck="false"` before
publication. Its existing native-attribute boundary also covers the IDL setter,
attribute methods, attached Attr writes, parser insertion, templates and imported
HTML. Ordinary removal retains the disabled physical control. Removing an Attr
atomically replaces it with a disabled control and returns the detached original;
callbacks observe the disabled replacement. Declarative animation of the control
is refused. Native
viewless parsing prepares and serializes HTML before live insertion, including
when document-context support is disabled. XML elements outside the HTML namespace
do not acquire spelling attributes.

The [current fixture](ua-spelling-browser.ts) uses a temporary normal Chromium
profile with remote spelling enabled. A local proxy directs spelling-service
connections to an owned TLS receiver and refuses other proxy destinations. It
never forwards service traffic upstream. The receipt saves request paths, byte
counts and whether the synthetic marker occurred; it saves no raw body or API key.
The test-only certificate exception is not runtime configuration.

The receiver records requests and arriving body bytes before completion, so an
aborted request retains any marker already received. An owned partial-request
control checks that behavior. A separate TCP reset control verifies recording of
peer resets before proxy relay setup. Expected `ECONNRESET` and `EPIPE` errors are
retained as diagnostics; other transport errors fail the fixture. Browser controls
still require an observed marker, and restricted cases still require its absence.

Run after `npm run build`:

```sh
node formal/runtime-verification/ua-spelling-browser.ts
```

The [receipt](ua-spelling-browser.json) records six cases. Unrestricted and
strict-CSP controls transmit the marker. The actual installed candidate stays
quiet after twenty checks through its exposed DOM APIs.
A temporary guard build restores only the native IDL setter, then application
code sets `spellcheck=true`; the receiver observes the marker again. The fault
guard is served from an in-memory test override and never replaces release
artifacts. Attribute-disabled and incognito comparisons remain quiet.

The receipt records source and artifact provenance, browser version, runner
stability and the altered guard's hash. The negative observations have a six-second
bound. Other DOM mutation routes, descendant contexts and browser configurations
require their own coverage argument.

The [DOM comparison](spelling-dom-browser.json) separately runs the twenty checks
in Chromium and Firefox without the document-context adapter. It also compares
single conversion of names, namespaces and animation values, and native custom
element callbacks during Attr replacement. These are component observations;
Firefox DOM reflection is not a remote-service control.

Two intermediate failures changed the implementation. The
[first corpus result](spelling-removal-corpus-initial.json) shows CyberChef's
unchanged editor failing in both browsers because removing the spelling attribute
threw. Retaining the disabled control while completing the operation removes that
unnecessary exception. The
[coercion regression](spelling-coercion-initial.json) then shows an attribute-name
object converted twice: the guard checked one name and the native removal received
another. The current boundary converts inputs once and passes those primitives
to the native operation. The regression demonstrates removal of a protected
attribute, without demonstrating a network disclosure from that removal.

An [initial callback control](spelling-callback-control-initial.json) incorrectly
required an unrestricted custom element's spelling getter to become true after
attribute removal. Firefox reported false even though the callback observed the
attribute's removal. The corrected control requires the observable removal;
guarded callbacks must observe the explicit disabled replacement in both engines.

## Remaining browser obligation

The [HTML standard](https://html.spec.whatwg.org/multipage/interaction.html#spelling-and-grammar-checking)
permits user preferences to override an element's spelling control. The selected
browser honors it in this experiment. That observation does not establish
suppression under every preference or provide a host-readable way to detect an
override. Complete C4 therefore remains open even after the candidate passes.

Most existing Playwright contexts are incognito-like. A service disabled off the
record cannot be calibrated with those contexts. The pinned
[source assessment](ua-spelling-assessment.json) identifies that restriction and
the browser-process uploader. Correspondence between the reviewed Chromium source
and the tested binary remains unproved. Other browser services and unrelated
background connections observed by the proxy are not classified as private-data
channels without a separate causal control.
