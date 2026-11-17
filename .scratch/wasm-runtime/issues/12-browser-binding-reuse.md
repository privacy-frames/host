# Find reusable browser bindings for a Wasm JavaScript engine

Type: research
Label: wayfinder:research
Status: resolved
Assignee: DamenH
Blocked by: 01-quickjs-capabilities.md, 02-boa-capabilities.md, 04-dom-binding-boundary.md

## Question

Which established libraries or generators could reduce the code maintained for
native-backed DOM and browser API bindings with QuickJS or Boa? Inspect actual
source and embedding contracts for guest object identity, host callbacks,
synchronous reentry, memory/object lifetime, type information and confinement.
Distinguish reusable binding infrastructure from a complete browser environment.
Do not recommend a new HTML/CSS renderer, generic native evaluation escape or
application source downleveling as an unexamined substitute.

## Research context

Branch: research/wasm-browser-bindings
Worktree: /home/damen/Projects/privacy-frames-research-browser-bindings
Findings: docs/research/wasm-runtime/browser-binding-reuse.md

## Answer

[Browser-binding reuse research](https://github.com/privacy-frames/host/blob/da55971/docs/research/wasm-runtime/browser-binding-reuse.md)
is recorded on research/wasm-browser-bindings at commit da55971. The branch is
an evidence artifact and is not merged.

quickjs-emscripten-sync supplies identity/callback/marshalling helpers, but not
a transparent DOM implementation or confinement. webidl2js can generate guest
interface semantics; native forwarding still needs adapters. Boa interop and
web-sys reduce different sides of the bridge rather than automatically joining
them. Selected mutable callback paths reject recursive borrowing. Buffer copies
do not establish live native Wasm memory aliases.

This resolves the library-source investigation. No runtime probes were run,
no library or engine was selected, and synchronous reentry, lifetime, object
identity, buffers and authority still require contracts and execution evidence.
