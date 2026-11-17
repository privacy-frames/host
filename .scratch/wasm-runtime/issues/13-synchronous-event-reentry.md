# Calibrate synchronous DOM event reentry in candidate embeddings

Type: task
Label: wayfinder:task
Status: open
Assignee: unassigned
Blocked by: 01-quickjs-capabilities.md, 02-boa-capabilities.md, 04-dom-binding-boundary.md, 11-main-engine-placement.md, 12-browser-binding-reuse.md

## Question

Run bounded native-browser comparisons of candidate embedding paths for the
required guest-to-host-to-guest synchronous callback sequence. Establish that
preventDefault changes the native event during dispatch and that nested DOM
calls, exceptions and event identity behave as required. Record actual versions,
controls and limitations. This is decision evidence for the full host, not an
application prototype or a complete DOM/confinement qualification.
