# Find a viable application WebAssembly integration

Type: research
Label: wayfinder:research
Status: resolved
Assignee: DamenH
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

Research branch: research/wasm-guest-webassembly
Findings: docs/research/wasm-runtime/guest-webassembly-architecture.md

## Resolution

Source research completed on branch `research/wasm-guest-webassembly`, commit
`9579c6ef319d268f41367d702546ce2f6b328b23`.
[Findings](https://github.com/privacy-frames/host/blob/9579c6ef319d268f41367d702546ce2f6b328b23/docs/research/wasm-runtime/guest-webassembly-architecture.md).

The native browser backend leaves guest ArrayBuffer backing-store integration
unresolved. Copies at construction or only around exports do not cover callbacks,
growth or concurrent shared-memory access. txiki.js supplies a concrete
QuickJS-NG/WAMR binding with live aliases and growth handling, but its browser
build and incomplete API remain unqualified. Boa/Wasmi is another integration
candidate, with buffer ownership still to design.

Three fetched Squoosh codec resources matched recorded hashes; the threaded
encoder glue shares Module/Memory and uses SharedArrayBuffer/Atomics. This is
source evidence, not a new application execution result or proof that the
threaded path is selected in the current host. No runtime probes were run.
The report specifies bounded memory, growth, reentry, worker and codec probes.
No backend or engine has been selected.
