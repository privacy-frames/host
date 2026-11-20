# QuickJS confinement implementation handoff

## Active objective

Execute every stage of the autonomous confinement verification plan, preserving
the existing applications, native Wasm performance and GitHub Pages deployment.
Do not mark the goal complete from component results or test counts.

## Branch and recovery

Worktree: `/home/damen/Projects/privacy-frames-quickjs-proof`.
Branch: `quickjs-confinement-proof`, based on planning commit `4d06014`.
Remote main at execution start: `10bc6cc`.
Remote recovery tag: `pre-quickjs-confinement-proof-2026-11-20` -> `10bc6cc`.
Production source remains `5f62e61`; no implementation deployment has occurred.

## Stage 0 baseline complete

Baseline-only commit: `37fe54c9f749b38d2da3035671678cb65728cec6`.
Artifacts: `results/quickjs-confinement/baseline/summary.json` and its referenced
130 hash-checked artifacts. Runtime source and dist stayed unchanged from `4d06014`.
All baseline processes are terminal; owned Xvfb :119 was stopped.

Full npm test (109 units, 122 maintenance observations / 60 confined samples),
typecheck, format, Pitch Training, native/confined image tests, all 48 paired export
comparisons, 72 live asset hashes and existing Helium persistence passed.
The initial corpus matrix retains a Chromium diagrams.net offline locator timeout;
its unchanged targeted retry passed. The cause remains unestablished. Preserve
both attempts and investigate candidate behavior rather than relabeling the first.

Panda medians across three paired runs: Chromium 2064 ms native, 8985 ms confined,
8901 ms offline; Firefox 2116 / 7848 / 7850 ms respectively.

## Active implementation checkout

Root uses `/home/damen/Projects/privacy-frames-quickjs-kernel`, auxiliary branch
`quickjs-confinement-kernel`, so initial source changes did not affect baseline.
Checkpoint `03a03cf` adds bounded identity allocation, private object cache epochs,
owned optional index state, null-prototype proxy handlers and captured operations.
Core browser checks passed in Chromium and Firefox, 111 unit tests passed and
four isolated helper-defense controls failed at their intended checks in both
browsers. This is component evidence, not a complete boundary proof.

A subsequent simplification changes explicit `return undefined` to a bare return,
removing an ambient global binding from the allocator proof. Actual-source Gillian
checks passed again, including exhaustion, guard/increment/wrap faults and rejection
of zero-contract success. Caller ownership/range correspondence remains pending.

After committing current formal/docs, merge the checked auxiliary source changes
into the proof branch. Do not merge unfinished registry implementation or stale
candidate receipts. No deployment has occurred.

## Fresh evidence

`formal/quickjs/calibrate.ts` invokes the pinned Gillian image through the existing
verification-report checker. The fresh run passed all three stateful-closure
contracts and rejected the missing-increment fault at postcondition checking.
Receipt: `results/quickjs-confinement/calibration.json`.
Log: `/tmp/pf-proof-calibration.log`, session 15961.
This calibrates the tool; no production kernel has been verified by this run.

## Reviews and next source changes

The native-effects source review is in `formal/quickjs/reviews/native-effects.md`.
Its agent now owns new `src/guest/native-policy.ts`, its independent unit tests
and `docs/implementation/native-policy.md` in the auxiliary checkout. It must not
change browser/engine integration without root coordination.
The Wasm agent owns `formal/quickjs/wasm/**` and its new receipts there.
The baseline agent now reviews contexts/management under
`formal/quickjs/reviews/contexts-management.md` in that checkout.
It identified native get/set/call fallbacks, first-key method-wrapper caching,
parser/markup paths and string-only CSS rewriting as contracts requiring work.

Guest-boundary review returned findings but its turn was then terminated by
automatic cybersecurity screening. Its review must not be treated as complete.
Returned findings require root verification and independent regression fixtures:

- Native/guest numeric identity allocation and numeric cache epochs do not have
  unbounded freshness once Number increments cease advancing.
- Optional `ProxyRecord.index` has no owned field initially, so reads and writes
  can encounter an application-modified Object prototype.
- Captured constructors do not protect later mutable `.create` calls; several
  guest-side traps also use global reflection or symbols after guest execution.
- Classification through `instanceof` can invoke modified hasInstance behavior.

These are proof and isolation obligations, not demonstrations of remote disclosure.
Root verified the optional index field and the numeric increments in source.
The remaining reported paths still need targeted confirmation.

After baseline completion, prioritize bounded/fail-closed identity allocation,
private epoch tokens and private-record/primordial integrity, with contracts tied
to actual caller paths. Then integrate pre-execution native operation policy and
its effect families. Keep compatibility fixtures independent of application names.

## Tools

Node: `/home/damen/.local/share/mise/installs/node/24.18.0/bin`.
Lean: `/home/damen/Projects/privacy-frames-runtime-proof/.tools/lean-4.35.0-linux`.
Gillian container digest is pinned in `formal/runtime-verification/gillian.ts`.
Do not replace historical receipts to represent current proof work.
