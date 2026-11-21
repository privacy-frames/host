# Window preparation and reference production

BrowserEnvironment now withholds a native Window's prototype until the private
environment record is live and has an attached guest engine. It throws before
returning the prototype. Returning null temporarily would be incorrect: the guest
proxy caches its first successful prototype result, so an early null could remain
after preparation finished.

The environment may inspect its own native global prototype during trusted engine
initialization, before attachment. That exception requires the exact native global
belonging to this live environment with no engine yet. Another environment cannot
use it, and disposal ends it. The caller must continue to ensure that application
code does not execute during that trusted initialization phase.

Window property reads also require that predicate before consulting environment
globals or native getters. Only `closed` remains readable through its captured
native getter. Pending and disposed windows expose neither document nor constructor
and API references. Actual engine startup succeeds without a pre-attachment read
exception; the own-bootstrap exception is limited to prototype inspection.

The same private `preparedWindow` predicate guards Window writes and native
deletions. A denied deletion returns false; this is a native mutation restriction,
not a claim that deletion alone previously enabled an escape. Harmless own-key
inspection remains available. Reflected accessor wrappers continue through the
normal mediated get/set routes.

## The iframe document producer

The `contentDocument` route invokes the captured native iframe getter, then the
captured native Document.defaultView getter. It returns that document only when
its actual Window has a live attached environment; otherwise it returns null.
Native producer getters and the private environment map establish this relation.
Application URLs, strings and claimed roles supply no provenance.

This prevents the document producer from bypassing the pending-Window boundary.
The normal native document identity is preserved after readiness. Other document
and prototype producers still require their own coverage arguments; this change
does not establish complete native-reference mediation.

## Native qualification

```sh
node --import tsx test/guest-window-reflection.ts
node --import tsx test/guest-window-writes.ts
```

The reflection fixture starts with native blank-frame prototype, document and
delete positive controls. It pauses actual child preparation at the native module
compilation dependency, retains the same guest Window handle across the pause,
and verifies that prototype inspection throws both before and during preparation.
After readiness, that handle obtains a stable non-null prototype and the original
document through direct and reflected getter routes. Own bootstrap access works;
other environments cannot borrow that exception.

Closure prevents fresh native prototype production, hides contentDocument and
denies native deletion. A prototype captured after readiness may remain cached in
the guest after closure; the test does not assert retroactive removal of that
reference. No null prototype is cached during the pending phase.

Four temporary bundles independently omit the prototype, iframe document, Window
read or deletion gate. Both browser engines must fail the corresponding assertion, while production
passes. The old write fixture's omission anchor identifies its set method alone,
so shared-predicate use cannot accidentally remove a different gate. The first
reflection run passed production but expected a later failure message from the
prototype omission; it instead caught the earlier own-bootstrap isolation check.
`initial-control-expectation.json` records that driver calibration failure. Removing
the superseded read fallback also moved the read-omission failure from the pending
case to the earlier unknown-Window case; `read-control-calibration.json` retains
that expectation mismatch.

Receipts under `results/quickjs-confinement/window-reflection/` identify source and
bundle hashes, exact selected browser executable paths/hashes, launch profile and
browser versions. The fixtures do not call browser eval or Function constructors; mutations use a
benign local marker. Native Window/Document semantics,
private map ownership and trusted startup ordering remain platform/caller premises.
