# Choose the DOM and browser binding boundary

Type: grilling
Label: wayfinder:grilling
Status: open
Assignee: unassigned
Blocked by: 01-quickjs-capabilities.md, 02-boa-capabilities.md, 03-current-demo-contract.md

## Question

Which approach can preserve ordinary application DOM behavior while keeping guest JavaScript and browser authority separated: direct native DOM bindings, a virtual DOM/browser implementation, or a justified combination? Resolve synchronous reads, object identity, callbacks/events, layout/canvas and every path that can cause native execution or external effects. Compare maintainability and the proof boundary using the engine and compatibility findings.
