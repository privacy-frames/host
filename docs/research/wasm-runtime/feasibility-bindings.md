# Generated guest interfaces backed by native DOM objects

Study date: 2026-11-18. This is one part of the combined guest-engine feasibility
study, based on `2305989`. Application Wasm and application service-worker
execution remain deferred. No production code or deployment changed.

## Result

`webidl2js@21.2.0` generated a small native-backed guest interface that executed
successfully inside `quickjs-emscripten@0.32.0` in Chromium 153.0.8010.12 and
Firefox 155.0. The fixture preserved object identity, mutable guest prototypes,
live native-property reads and generated argument/receiver checks. This supports
using a generator to reduce repetitive interface code. It does not establish a
complete DOM binding.

The retained [Web IDL](../../../research/feasibility-bindings/idl/StudyNode.webidl)
declares a deliberately small `StudyNode` interface: nodeName, textContent,
parentNode and appendChild. The browser supplies actual DIV and SPAN elements.
Generated guest classes delegate to
[a guest implementation class](../../../research/feasibility-bindings/impls/StudyNode-impl.cjs),
which forwards a node handle and operation through explicit host functions.
Native objects stay outside the guest heap. A guest cache gives repeated native
handles the same wrapper.

`webidl2js` generates conversion, branding, inheritance and interface boilerplate;
the embedder supplies each operation's implementation. Its wrapper-to-implementation
registry stays inside the guest. The package documents this division and its
unsupported features in its [README][generator]. The study's generated bundle
uses guest eval for intrinsic discovery, never native eval. The broader
[binding research][prior-bindings] explains the generator's special HTML hooks
and remaining coverage limits.

## Observations

The [browser harness](../../../research/feasibility-bindings/probe.ts) ran each
browser with and without a diagnostic script CSP, producing four observations
in [results.json](../../../research/feasibility-bindings/results.json).

All four passed these checks:

- Repeated wrapper lookup, parent traversal and appendChild preserve identity.
- The generated interface supplies instanceof and `[object StudyNode]` branding.
- A guest object assigned to textContent undergoes DOMString conversion and
  updates the native DOM.
- A later native text mutation is visible through the existing guest wrapper.
- An added guest prototype method can call the generated native-backed getters.
- Invalid receivers and arguments, and an illegal constructor call, throw
  TypeError through the generated checks.
- A function obtained through a guest method's constructor still executes in
  the guest, where document was not exposed.

The guest cache and native handle table retain their contents until disposal.
The experiment does not qualify browser/guest GC cycles, weak retention, DOM
collections, custom elements, cross-document identity or long-running sessions.
The companion Boa report records that engine's attempt with this same generated
bundle; this report claims execution results only for QuickJS.

## Native execution still needs a policy

A separate diagnostic deliberately forwards guest-provided text to a native
script element. The text only sets a boolean marker in the test page. In the
unrestricted control, the marker is set in both browsers even though the caller
ran inside QuickJS. Under a nonce-based script CSP, that unnonced native script
does not execute, while the trusted bootstrap and Wasm engine continue to run.

This demonstrates a concrete obligation for the new host: a DOM binding must
route application scripts into the guest engine instead of admitting native
execution. The interpreter cannot make a permissive native script-insertion
binding safe by itself. The nonce is fixed for this isolated diagnostic and is
not a proposed production authorization design. The fixture has no local-only
resource broker, navigation policy or complete external-effect policy; its CSP
result establishes only the tested script-execution control.

## Reproduction and validation

The study retains a dependency lock and source under
`research/feasibility-bindings`. With Node 26.2.0 and Playwright's installed
Chromium/Firefox browsers:

```sh
cd research/feasibility-bindings
npm ci
npx playwright install chromium firefox
npm run probe
npm run typecheck
```

The build generates the guest wrappers and bundles them without application
downleveling. It separately bundles the browser-side engine loader and serves
all fixture resources from a temporary loopback origin. Generated code and
engine binaries are excluded from Git. All four browser runs and a strict TypeScript check passed. Startup timings in the receipt are individual samples,
not application performance estimates. Source and report formatting were checked.

[generator]: https://github.com/jsdom/webidl2js/blob/d61dde003ea3ff5de60b9e4b115dd6a79e150656/README.md
[prior-bindings]: https://github.com/privacy-frames/host/blob/da55971a802cd0efe9ca8db62e6a2ecbf4fe4663/docs/research/wasm-runtime/browser-binding-reuse.md
