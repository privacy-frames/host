# Choose where the main application engine runs

Type: grilling
Label: wayfinder:grilling
Status: claimed
Assignee: DamenH
Blocked by: 01-quickjs-capabilities.md, 02-boa-capabilities.md, 04-dom-binding-boundary.md

## Question

Should the main application's Wasm JavaScript engine run on its browsing
context's main thread, enabling direct synchronous host DOM calls, or in a browser
worker with an additional DOM communication mechanism? Preserve the existing
applications' synchronous API and event behavior. Application-created workers
and worklets remain a separate execution-context decision.
