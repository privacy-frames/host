# Find a viable application WebAssembly integration

Type: research
Label: wayfinder:research
Status: open
Assignee: unassigned
Blocked by: 01-quickjs-capabilities.md, 02-boa-capabilities.md, 03-current-demo-contract.md, 11-main-engine-placement.md, 12-browser-binding-reuse.md

## Question

Which established implementation approaches can provide the application-facing
WebAssembly API while JavaScript runs inside a Wasm engine? Investigate native
browser Wasm bridging and applicable embedded Wasm runtimes, preserving live
ArrayBuffer/typed-array views, memory growth/detachment, callable imports/exports,
synchronous callback reentry and worker transfer semantics. Use primary sources
and distinguish existing implementation support from speculative integration.
Identify the bounded probes required for the existing image/codec applications;
do not assume byte copying alone satisfies their memory contracts.
