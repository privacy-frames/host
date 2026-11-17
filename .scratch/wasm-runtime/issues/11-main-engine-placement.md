# Choose where the main application engine runs

Type: grilling
Label: wayfinder:grilling
Status: resolved
Assignee: DamenH
Blocked by: 01-quickjs-capabilities.md, 02-boa-capabilities.md, 04-dom-binding-boundary.md

## Question

Should the main application's Wasm JavaScript engine run on its browsing
context's main thread, enabling direct synchronous host DOM calls, or in a browser
worker with an additional DOM communication mechanism? Preserve the existing
applications' synchronous API and event behavior. Application-created workers
and worklets remain a separate execution-context decision.

## Answer

Damen agreed on 2026-11-17 that the main application's Wasm JavaScript engine
runs on its browsing context's main thread. He specifically identified
preventDefault as a reason to retain synchronous event handling.

Guest event callbacks must be callable within native event dispatch. Their
preventDefault and propagation operations must affect the real event during
that dispatch; a later asynchronous cancellation message does not satisfy the
contract. Main-thread placement enables synchronous bindings but does not by
itself prove that a chosen embedding supports nested callback reentry.

Application-created worker execution remains a separate decision. Preserve
normal asynchronous application behavior; main-thread placement is not a rule
requiring all guest operations to be synchronous.
