# Choose the implementation route and acceptance gates for the full host

Type: grilling
Label: wayfinder:grilling
Status: open
Assignee: unassigned
Blocked by: 06-engine-choice.md, 07-confinement-argument.md

## Question

Given the engine, bindings, context architecture and security claim, what build sequence leads to the complete greenfield host with the required applications and a similar or identical pf.damenh.com interface? Identify justified reuse, deleted/superseded machinery, acceptance gates and deployment checks. The destination is the full host rather than a small prototype.

Apply [Defer application WebAssembly support](16-defer-application-wasm.md) to
the first-release acceptance gates and catalog. Preserve the deferred application
requirements for later work, and qualify affected optional features explicitly.
