# Native Window script delivery

Policy 12 prepares the admitted JavaScript inventory before root or child Window
publication. The private resource reader supplies immutable installed bytes.
Classic and module variants receive local Blob URLs; a native import map links
the module graph. Windows no longer depend on the worker module shim. Workers
retain that shim because document import maps do not apply to their globals.

The installed-runtime dynamic-script comparison checks cyclic imports, live
bindings, top-level await and identity across publisher URLs, runtime aliases and
computed imports. Its unrestricted control produces the same result in Chromium
and Firefox. The renderer separately compares HTML and SVG script ordering and
modules that wait for document lifecycle events. An earlier shim-wrapper attempt
announced readiness before the application module began; it was removed.

The [native-policy fixture](native-window-policy.ts) uses the actual Window
script helper with a fixed trusted resource reader. All sixteen cases pass in
Chromium and Firefox, across HTML and SVG. Restricted cases begin with a response
policy permitting local Blob/data scripts, inline scripts and evaluation while
denying HTTP scripts and connections. Local graphs execute without observed HTTP
requests. A generated native import bypasses the adapter: the unrestricted
control reaches the receiver, while the restricted case rejects with a native
policy event and no HTTP request during the operation and subsequent 300 ms.
The [receipt](native-window-policy.json) binds source, build, runner and bootstrap
hashes. This fixture contains no service-worker lifecycle or actor-authentication
proof.

The HTML bootstrap is inline. Firefox rejects a parser-created inline SVG script
under the fixture's Trusted Types policy before setup can run. The
[initial receipt](native-window-policy-svg-initial.json) stops after twelve cases;
it is a failed bootstrap experiment. A self-contained data-URL SVG script avoids
that sink and passes the complete comparison. No remote bootstrap request is
needed by this fixture.

The initial corpus also exposed preparation cost and a task-readiness race.
Preparing every script variant through an AST delayed CyberChef and its embedded
SVG context. A lexical check now skips AST construction for sources without
module references; references and lexer failures retain the existing relocation
path. The unit comparison covers real imports, metadata, phases, literal text and
malformed input. Native HTTP admission remains a separate browser-policy duty.

The startup trace shows CyberChef restoring empty input after the test has already
written to its editor. The task now waits for the application's input and worker
readiness before entering the same synthetic text. Native and confined Base64
tasks and offline reloads pass in both browsers. The earlier failed corpus is
retained in [its receipt](policy12-corpus-initial.json). Its source can be
reconstructed from the verified [initial patch](policy12-initial-source.json).

StackEdit's preview also precedes its IndexedDB autosave. Its task now waits for
a committed content record before testing offline restoration. The first wait
used an asynchronous Playwright predicate, which returned before the Boolean
condition became true. The corrected full comparison passes all 32 application
tasks and sixteen offline reloads against one frozen candidate. The [readiness calibration](async-poll-calibration.json)
reproduces that behavior in owned blank pages in both browsers. The replacement
[Node polling helper](../../test/helpers/poll.ts) awaits each result and enforces
a deadline, including for a pending observation. Four unit controls cover false,
eventually true, pending and throwing observations. The publisher stylesheet
readiness check now uses the same helper.

The current aged-registration comparison retains two generated-import requests
for the fixed runtime service-worker URL, with working native controls for every
worker-loading group in the 32-sample comparison. Production responses still admit runtime-origin HTTP scripts. Applying the
independent native policy requires preparing every admitted context and resource
path, then rerunning the registration-maintenance counterexamples. Static module
fragments, non-JavaScript module types and complete `import.meta` semantics also
need compatibility checks. The local delivery mechanism supplies no proof that
all browser communication is mediated.

Run after building:

```sh
node formal/runtime-verification/native-window-policy.ts
```
