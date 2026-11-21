# Geometry boundary — unqualified draft

Paused at the user's request. This branch starts at `4d229a3`; it has not been integrated or deployed. No geometry jobs remain running. The current source has not been typechecked or executed after the final edits.

`src/guest/geometry-policy.ts` drafts explicit modern geometry and legacy SVG member contracts using the existing NativePolicy/NativeHost. Private produced-object records retain captured native declarations rather than an engine, application or lifetime. A receiving engine imports those declarations after checking descriptor identity. Native brands select unknown geometry references for refusal; they do not admit private host instances. Direct native geometry arguments require existing producer enrollment, without restricting native dictionary conversion to the same class.

`src/guest/geometry-producers.ts` drafts selective acquisition from Element/Range, canvas transforms, SVG geometry/list chains and Resize/IntersectionObserver callbacks. These objects remain outside geometry ownership. Acquisition checks the prepared receiver or callback owner; existing numeric geometry is intended to remain usable after its originating child engine closes. Cross-realm producer selection uses exact captured native functions.

BrowserEnvironment wiring adds producer reads, post-call enrollment, observer callback preparation and a private guest Array.values capture during attach. RectList iteration calls that receiving engine's captured guest intrinsic. It must preserve guest length/index shadows and must not reread mutable guest Array.prototype at iteration time.

Native-only calibration in `native-probe.mjs` established that both installed browsers use distinct SVGPoint/SVGRect/SVGMatrix classes, rather than modern DOM geometry aliases. DOMRectList's iterator was exactly the native Array.values function. Its observations and executable hashes are in `results/quickjs-confinement/geometry/native-probe.json`; these observations do not qualify the implementation.

The exploratory SDK fixture first failed on a fixture typo, then reached SVG code and failed because its SVG innerHTML children had HTML namespaces. It now constructs SVG children with createElementNS. The subsequent schema-import refactor, guest iterator, producer chains and parent/child checks have not run. `exploratory-run.mjs` only prints observations: it does not enforce qualification assertions or record source hashes. The development logs must not be treated as passing tests.

Before review or integration:

- Typecheck and format the final draft; inspect schema capture/import and native readonly behavior.
- Run native/production comparisons, actual guest cases and independent omission controls. Add an enforcing driver with source, bundle, engine and browser provenance.
- Check private unproduced references and copying operations, unknown getters, aliases/reflection, readonly/live SVG values, RectList shadows and callback revocation.
- Verify prepared child function returns, parent calls on child DOM producers, and data/iteration after child close. New child code must remain unavailable after disposal.
- Complete the producer inventory before claiming family closure. Performance rectangles, CSS Typed OM matrix sources and other optional producers remain unimplemented; their geometry results can currently be refused. Preserve the current applications through integration qualification.

No shared NativePolicy, NativeHost or Engine API changed. No package command, formal proof or final component receipt was added.
