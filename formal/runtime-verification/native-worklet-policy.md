# Native worklet script policy

The [native comparison](native-worklet-policy.ts) passes twelve AudioWorklet
cases in Chromium 153.0.8010.12 and Firefox 155.0. It uses an owned HTTP server,
native processors and rendered audio samples. The
[receipt](native-worklet-policy.json) records source, build and runner hashes
before and after the comparison.

A Blob entry importing a Blob dependency renders the expected sample without
HTTP under both tested policies. The stricter policy permits Blob/data and inline
scripts while denying HTTP scripts. Its HTTP entry control fails without a
server request; the permissive control downloads both entry and dependency and
renders successfully.

A Window import map redirects the dependency's HTTP address to a Blob URL. Both
engines ignore that mapping in the worklet graph: the permissive case requests
the HTTP dependency and renders, while the strict case fails without a request.
Window module preparation therefore cannot supply worklet graph linking through
the document's import map.

The experiment covers one acyclic dependency and AudioWorklet only. Production
integration must preserve shared module identity, cycles, live bindings and
repeated `addModule` calls, prepare the guard before application evaluation, and
cover PaintWorklet where available. No production policy is changed by this
fixture, and it does not establish registration-lifetime confinement.

The [compiler calibration](worklet-bundler-semantics.ts) adds six cases for a
cyclic module that reads a lexical binding before initialization. Native
AudioWorklets reject it in both browsers. Esbuild 0.28.2 changes the bindings to
`var`; its output registers and renders a processor instead. The pinned Rollup
4.67.4 browser distribution retains the lexical bindings, and its generated code
rejects in both browsers. Its WASM parser runs in Node against pinned local bytes;
the generated modules run in actual AudioWorklets. The
[receipt](worklet-bundler-semantics.json) records the sources, generated code,
compiler hashes and browser outcomes. Neither compiler is admitted to production
by this single rejection comparison.

The [local graph candidate](local-worklet-graph.md) now runs the compiler in a
private native service worker with embedded parser bytes. Its selected native
comparisons preserve shared state, live cyclic bindings and repeated entries.
The independent host-guard wrapper and preparation-omission controls pass their
selected checks. Production protocol integration remains pending.

Run after building:

```sh
node formal/runtime-verification/native-worklet-policy.ts
```
