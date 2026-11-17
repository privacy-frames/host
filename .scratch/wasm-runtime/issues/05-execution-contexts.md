# Choose how application execution contexts run

Type: grilling
Label: wayfinder:grilling
Status: claimed
Assignee: DamenH
Blocked by: 01-quickjs-capabilities.md, 02-boa-capabilities.md, 03-current-demo-contract.md, 11-main-engine-placement.md

## Question

How will application-created dedicated/shared workers, worklets and child documents execute under the new host? Distinguish guest APIs from the trusted browser service worker hosting files. Decide engine instances, scheduling, messaging, resource access and native browser context creation while preserving required behavior and confinement.

## Scope clarification

Application service-worker execution is excluded by
[Exclude application service-worker execution from the first fork release](09-application-service-worker-scope.md).
The host service worker and manifest/offline behavior remain in scope. Investigate
existing applications' dependency on registration before deciding the guest API
surface; do not silently retain the former publisher executor.

## Decisions recorded

Damen agreed that application-created dedicated workers run in real browser
Workers, each containing its own Wasm JavaScript engine. The host prepares the
worker environment before executing guest code. Worker bindings preserve
parallel computation, messaging and termination under the same confinement
policy as the main application context.

The browser executes the trusted worker bootstrap and engine. Application
JavaScript executes inside that engine. Worklets and child documents remain open parts of this decision.

Damen also agreed that application-created shared workers use real browser
SharedWorkers, each running a guest engine. Multiple windows of an installed
application can connect to the same shared worker. The host controls creation
and connection routing; the bindings must preserve shared lifetime and message
port behavior. This records the intended architecture; engine startup and
browser support still need qualification during implementation planning.
