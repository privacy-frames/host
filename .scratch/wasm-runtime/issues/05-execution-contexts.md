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
