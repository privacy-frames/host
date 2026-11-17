# Choose how workers and publisher service-worker behavior execute

Type: grilling
Label: wayfinder:grilling
Status: open
Assignee: unassigned
Blocked by: 01-quickjs-capabilities.md, 02-boa-capabilities.md, 03-current-demo-contract.md

## Question

How will application-created dedicated/shared workers, worklets, child documents and publisher service-worker behavior execute under the new host? Distinguish guest APIs from the trusted browser service worker hosting files. Decide engine instances, scheduling, messaging, resource access and native browser context creation while preserving required behavior and confinement.
