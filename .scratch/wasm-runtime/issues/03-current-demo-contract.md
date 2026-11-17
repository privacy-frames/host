# Current demonstration behavior and application compatibility contract

Type: research
Label: wayfinder:research
Status: resolved
Assignee: DamenH
Blocked by: none

## Question

Which user-visible behavior, supported application workflows and browser features must the full greenfield fork preserve? Inspect the host repository, tests, deployment configuration, public release receipts and application resources where needed. Distinguish historical observed support, intended requirements, unverified behavior and current limitations. Include workers, virtual publisher service workers, app-provided Wasm, DOM/canvas/audio, synchronous events, storage, install/offline/PWA behavior, static hosting/CORS and confinement requirements. Identify reusable host modules separately from architecture commitments. Do not reduce an application's support to only the narrow historical selected task.

## Research context

Branch: research/wasm-demo-contract
Worktree: /home/damen/Projects/privacy-frames-research-demo-contract
Findings: docs/research/wasm-runtime/current-demo-contract.md

## Answer

The existing demonstration contract is documented in the research note at
[Current demonstration behavior and compatibility contract](https://github.com/privacy-frames/host/blob/3a6876a02bc3bc49b88b6de08f8ca9f291b413ff/docs/research/wasm-runtime/current-demo-contract.md).
Research branch: research/wasm-demo-contract, commit
3a6876a02bc3bc49b88b6de08f8ca9f291b413ff. The branch is an evidence artifact and
is not merged.

The eight applications and eleven visible examples remain scope. Historical
selected task/offline passes establish specific behavior, not complete app-wide
qualification. The note inventories required browser surfaces and separates host
service-worker responsibility from restricted publisher service-worker behavior.
It records distinct public release pins, later unmerged work, static deployment,
installation, storage and PWA evidence scopes. PhotoCraft's GPU API census,
threaded guest Wasm and complete per-app API coverage remain unresolved.

This resolves the initial source/receipt investigation, not the human decisions
about bindings, context execution or additional qualification workflows. Those
remain on the map's open tickets.

## Subsequent scope decision

[Defer application WebAssembly support](16-defer-application-wasm.md) amends the
first-release compatibility target. The historical research remains unchanged;
PhotoCraft and Squoosh are later targets, and other Wasm-dependent features
require explicit qualification before being advertised as supported.
