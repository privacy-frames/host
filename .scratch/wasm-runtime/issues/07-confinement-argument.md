# Choose the confinement claim and verification boundary

Type: grilling
Label: wayfinder:grilling
Status: open
Assignee: unassigned
Blocked by: 03-current-demo-contract.md, 04-dom-binding-boundary.md, 05-execution-contexts.md

## Question

What must the Wasm execution boundary and host browser bindings establish for the original no-application-caused-remote-communication requirement? Identify trusted components, deferred browser effects, browser-owned services, code-execution routes and lifecycle obligations. Decide how to obtain implementation evidence without treating the entire JS interpreter's correctness as an unnecessary premise for confinement. IFC is excluded.
