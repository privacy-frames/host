# Compare complete guest-engine integration approaches in one feasibility pass

Type: task
Label: wayfinder:task
Status: claimed
Assignee: DamenH
Blocked by: 01-quickjs-capabilities.md, 02-boa-capabilities.md, 03-current-demo-contract.md, 04-dom-binding-boundary.md, 11-main-engine-placement.md, 12-browser-binding-reuse.md, 15-audio-worklet-feasibility.md, 16-defer-application-wasm.md

## Question

Run one coordinated feasibility study of QuickJS and Boa against the amended
application contract. Cover persistent main-thread execution; synchronous DOM
calls, native event cancellation and nested callbacks; object identity,
prototypes and lifetime; classic/modules/promises; native dedicated/shared
workers and child documents containing guest engines; structured clone and
transfers; storage; canvas and audio buffers; AudioWorklet; and the confinement
boundary. Use bounded executable browser probes where possible. Record exact
versions, controls, results and missing evidence. Identify which mechanisms can
be reused and which require substantial implementation.

Application Wasm and application service-worker execution remain deferred.
Do not turn this into a production runtime implementation or change deployment.
Do not claim complete application support or a confinement proof from small
fixtures. Preserve native HTML/CSS rendering and original application code.

## Direction

Damen requested a single broad feasibility pass rather than separate rounds of
permission for individual probes. Synchronous DOM reentry is part of this pass;
its existing ticket remains a specific evidence requirement. Research tasks may
run in parallel, with one consolidated comparison and recommendation afterward.
No engine is selected by creating this study.

## Shared probe contract

Every report distinguishes executed observations, source evidence and inference.
Use Chromium and Firefox where installed. Test guest-to-host-to-guest dispatch
with a cancelable native event, preventDefault before dispatch returns, nested
callbacks and errors. Exercise identity on repeated native-object access, guest
prototype extension, typed arrays and ordinary worker message transfers.
Document minimal fixture bindings versus any reusable complete Web API binding.
Report startup/size and representative costs if measured, without extrapolating
microbenchmarks to application performance. Include a negative/control case for
claims about enforcement. Keep admitted/local-only resource policy explicit.

Evidence branches: research/wasm-study-quickjs,
research/wasm-study-boa, research/wasm-study-contexts.
