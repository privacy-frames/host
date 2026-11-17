# Defer application WebAssembly support

Type: grilling
Label: wayfinder:grilling
Status: resolved
Assignee: DamenH
Blocked by: none

## Question

Should application-provided WebAssembly remain a requirement for the first
release of the greenfield fork, given its memory-integration requirements and
application impact?

## Answer

On 2026-11-18, Damen agreed to defer application WebAssembly support after
reviewing the application impact. The JavaScript engine itself still runs in
Wasm. Trusted host dependencies may also use Wasm; this decision concerns the
application-facing WebAssembly execution API.

PhotoCraft and Squoosh are deferred compatibility targets because their core
functionality depends on application Wasm. They remain later requirements.
Excalidraw's basic drawing remains a target, but its Wasm-dependent font and
export paths need separate qualification. Pitch Training, Wikipedia, StackEdit,
diagrams.net and CyberChef remain targets for their applicable local workflows;
source inspection does not establish that all optional features work without
Wasm. Support must describe the workflows actually qualified.

Do not replace deferred functionality with patches to those applications or
present interface startup as successful image processing. Applications' own
existing JavaScript fallbacks may run unchanged. The guest's exact unsupported
WebAssembly API behavior remains to be specified.

Retain the findings in
[Find a viable application WebAssembly integration](14-guest-wasm-architecture.md)
for later work. Implementing that integration and qualifying guest Module/Memory
sharing no longer gate first-release engine selection. Ordinary typed arrays,
ArrayBuffers, worker messages and audio-buffer bindings remain required.
AudioWorklet feasibility remains a separate question; deferring application
Wasm does not itself defer AudioWorklet or the trusted engine's worklet bootstrap.
