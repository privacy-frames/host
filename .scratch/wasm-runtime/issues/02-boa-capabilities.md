# Boa language, WebAssembly embedding and host feature support

Type: research
Label: wayfinder:research
Status: resolved
Assignee: DamenH
Blocked by: none

## Question

What does current Boa support directly, what does a browser/Wasm embedding supply, and what must Privacy Frames implement for the existing application and browser-feature requirements? Distinguish ECMAScript features, modules/dynamic import, promise jobs, async behavior, typed arrays/shared memory/Atomics, workers, service workers, guest WebAssembly, DOM and storage. Check actual wasm32 build/embedding support and the boundary between Boa engine/runtime/bindings. Use pinned primary sources and mark unknowns. Include resource limits and licensing; do not select the engine.

## Research context

Branch: research/wasm-boa
Worktree: /home/damen/Projects/privacy-frames-research-boa
Findings: docs/research/wasm-runtime/boa-capabilities.md

## Answer

Boa v0.22 supplies language execution and host module/job hooks. Its optional
runtime implements selected APIs, but several similarly named WinterTC modules
are placeholders. DOM, Worker/ServiceWorker/worklet environments and guest
WebAssembly are absent. The provided browser Wasm evaluator creates a fresh
context per call, so a full application host needs a custom persistent embedding.
Source pins, declared gaps and unknowns are recorded; no app or engine runtime
tests were performed and no engine was selected.

[Research findings](https://github.com/privacy-frames/host/blob/4f2988fbfc116fa8d51953f532dede0bb715052d/docs/research/wasm-runtime/boa-capabilities.md).
Branch: research/wasm-boa; commit: 4f2988fbfc116fa8d51953f532dede0bb715052d.
The research branch is an evidence artifact and is not merged.
