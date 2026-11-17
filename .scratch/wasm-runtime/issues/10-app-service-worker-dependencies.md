# Check existing applications without application service-worker execution

Type: research
Label: wayfinder:research
Status: resolved
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

## Answer

[Application service-worker dependency research](https://github.com/privacy-frames/host/blob/ae73200f8130e3b29cb8b01edb2df7618f0281f0/docs/research/wasm-runtime/app-service-worker-dependencies.md)
is recorded on research/wasm-app-service-workers at
commit ae73200f8130e3b29cb8b01edb2df7618f0281f0. The research branch is not merged.

Source inspection finds registration-independent initialization for Notebook,
Excalidraw, Pitch Training and diagrams.net. StackEdit can leave a registration
rejection unhandled. Squoosh calls service-worker APIs in asynchronous side work;
its encoding path initializes separately, while share-target import requires its
worker. Source coverage and historical revision limits are explicit in the note.

The non-catalog ordinary test fixture requires readiness and worker-generated
JSON; it cannot retain its old successful-service-worker expectation under the
new scope. Mark that expectation unsupported rather than pretending a successful
stub supplies its data. Standard manifests, host offline delivery and CacheStorage
remain separate requirements. Actual fork behavior and the precise unsupported
API contract still need implementation evidence and a decision.
