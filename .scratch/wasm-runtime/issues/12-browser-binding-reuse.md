# Find reusable browser bindings for a Wasm JavaScript engine

Type: research
Label: wayfinder:research
Status: claimed
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
