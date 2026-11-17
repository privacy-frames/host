# Qualify guest engines inside AudioWorklet

Type: research
Label: wayfinder:research
Status: claimed
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
