# QuickJS language, WebAssembly embedding and host feature support

Type: research
Label: wayfinder:research
Status: resolved
Assignee: DamenH
Blocked by: none

## Question

What does current upstream QuickJS support directly, what does its browser/Wasm embedding supply, and what must Privacy Frames implement for the existing application and browser-feature requirements? Distinguish ECMAScript features, modules/dynamic import, promise jobs, async behavior, typed arrays/shared memory/Atomics, workers, service workers, guest WebAssembly, DOM and storage. Separate upstream QuickJS, QuickJS-NG and third-party Wasm wrappers. Use pinned primary sources and mark unknowns. Include embedding, binding, resource limits and licensing facts; do not select the engine.

## Research context

Branch: research/wasm-quickjs
Worktree: /home/damen/Projects/privacy-frames-research-quickjs
Findings: docs/research/wasm-runtime/quickjs-capabilities.md

## Answer

QuickJS supplies ECMAScript execution, modules and promise jobs. Browser DOM,
workers, service workers, worklets, storage and guest WebAssembly require host
facilities. Stable upstream, development head, QuickJS-NG and packaged Wasm
wrappers have different revisions and capabilities. Emscripten Atomics defaults,
experimental Intl/Temporal, wrapper age, scheduling and buffer-copy semantics
are documented with primary-source pins. No app or engine runtime tests were
performed for this research; engine selection remains a human decision.

[Research findings](https://github.com/privacy-frames/host/blob/fb922b0c5617f8250ce6a3ec8b617fc6ba8ccfae/docs/research/wasm-runtime/quickjs-capabilities.md).
Branch: research/wasm-quickjs; commit: fb922b0c5617f8250ce6a3ec8b617fc6ba8ccfae.
The research branch is an evidence artifact and is not merged.
