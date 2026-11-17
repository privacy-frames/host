# Check existing applications without application service-worker execution

Type: research
Label: wayfinder:research
Status: claimed
Assignee: DamenH
Blocked by: 03-current-demo-contract.md, 09-application-service-worker-scope.md

## Question

How do the existing supported applications and visible examples behave when
navigator.serviceWorker is absent, or registration rejects? Inspect actual
publisher builds/source, feature detection, registration call ordering and
service-worker-dependent resource/caching/startup paths. Distinguish optional
offline setup from required application functionality. Standard manifests and
CacheStorage are separate APIs. Record what source establishes and what requires
later runtime testing; do not modify applications or select a fake API contract.

## Research context

Branch: research/wasm-app-service-workers
Worktree: /home/damen/Projects/privacy-frames-research-app-service-workers
Findings: docs/research/wasm-runtime/app-service-worker-dependencies.md
