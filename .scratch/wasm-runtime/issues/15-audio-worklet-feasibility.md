# Qualify guest engines inside AudioWorklet

Type: research
Label: wayfinder:research
Status: resolved
Assignee: DamenH
Blocked by: 01-quickjs-capabilities.md, 02-boa-capabilities.md, 03-current-demo-contract.md

## Question

Can QuickJS or Boa execute application AudioWorklet code inside the browser's
native AudioWorklet environment? Check engine build and initialization, processor
registration, synchronous process callbacks, audio buffers and messaging, and
execution deadlines. Identify established embedding support and the smallest
executable probes needed to qualify each candidate. Check the current supported
applications for actual worklet requirements. Distinguish AudioWorklet from
other worklet types. Use primary sources; separate source evidence from measured
behavior and leave untested compatibility explicit.

## Direction

Damen agreed to investigate this before choosing an engine. Worklet support has
not yet been established or excluded. No production implementation changes are
authorized by this research ticket.

Research branch: research/wasm-audio-worklet
Findings: docs/research/wasm-runtime/audio-worklet-feasibility.md

## Resolution

Research and limited browser controls completed on branch
`research/wasm-audio-worklet`, commit
`b23d81e0f33155d6787d3fe7396bf1966a59c465`.
[Findings](https://github.com/privacy-frames/host/blob/b23d81e0f33155d6787d3fe7396bf1966a59c465/docs/research/wasm-runtime/audio-worklet-feasibility.md).

Native Wasm AudioWorklet controls passed Chromium and Firefox, both compiling
inside the worklet and receiving a precompiled module. quickjs-emscripten 0.32.0
initialization failed in both because TextDecoder was unavailable. Guest code
and buffer processing were not reached. This qualifies a loader limitation,
not failure of all QuickJS worklet builds. Boa execution was not tested.

The inspected corpus contains a registration diagnostic and native DSP test
fixtures; no custom application DSP dependency was found in the inspected
bundles. PhotoCraft and optional assets remain gaps. Neither candidate has
established unchanged application AudioWorklet support. Startup, registration,
buffer/callback semantics and live deadlines require the report's bounded probes.
The worklet architecture decision remains open.
