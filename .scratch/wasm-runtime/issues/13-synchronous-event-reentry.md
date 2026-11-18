# Calibrate synchronous DOM event reentry in candidate embeddings

Type: task
Label: wayfinder:task
Status: resolved
Assignee: DamenH
Blocked by: 01-quickjs-capabilities.md, 02-boa-capabilities.md, 04-dom-binding-boundary.md, 11-main-engine-placement.md, 12-browser-binding-reuse.md

## Question

Run bounded native-browser comparisons of candidate embedding paths for the
required guest-to-host-to-guest synchronous callback sequence. Establish that
preventDefault changes the native event during dispatch and that nested DOM
calls, exceptions and event identity behave as required. Record actual versions,
controls and limitations. This is decision evidence for the full host, not an
application prototype or a complete DOM/confinement qualification.

Execution is coordinated by [the combined feasibility study](17-combined-feasibility-study.md); no additional user approval is needed for each probe.

## Resolution

The combined feasibility study executed this sequence in Chromium 153.0.8010.12
and Firefox 155.0 with both QuickJS and Boa. Guest preventDefault changed the
real native events before nested dispatch returned. Persistent state, nested
callbacks and error controls were retained. QuickJS uses synchronous wrapper
calls. Boa requires scoped context lending and JsObject::call; naive RefCell
reentry and nested callback Context::eval have retained failing controls.

[QuickJS evidence](https://github.com/privacy-frames/host/blob/8036da0dbdf14239002a269f3d41d939849da55a/docs/research/wasm-runtime/feasibility-quickjs.md).
[Boa evidence](https://github.com/privacy-frames/host/blob/ddc0a102aefde49304efb20ab3fb8db335e07333/docs/research/wasm-runtime/feasibility-boa.md).

This resolves the bounded event mechanism test. Complete DOM event classes,
error reporting, task ordering and object lifetime remain implementation work.
