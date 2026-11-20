# QuickJS confinement implementation handoff

## Implementation resumed

The planning checkpoint below is historical. Implementation has resumed under
the existing goal; every stage of the resumption plan remains in scope. Production
is unchanged. The integration branch was backed up remotely at `c4dd9fb`; the
auxiliary branch has since advanced and must be merged and pushed again after
the current component checkpoints.

Root committed exact guest-reference ownership and exception-handle cleanup in
`eca627a`. URL routing through every BrowserEnvironment host operation is in
`ff23763`; its independent actual-engine fixture and receipt are `65001ed` and
`eb01025`. The shared native-token codec and URL refactor are `07d93ac`, with
fresh browser evidence in `ce391f6`. Other native operation families still retain
general forwarding and prevent a complete mediation claim.

The binary helper audit confirmed that its private Map reads happen during setup.
It also found a private constructor Proxy handler with a mutable inherited trap.
The regression failed before repair. `02bd8b4` gives that handler a null prototype;
the prepared fixture and five isolated defense controls pass in Chromium 153 and
Firefox 155, recorded separately in `2fd214d`. These are helper-integrity checks,
not network-confinement tests. New URL, management and publication browser fixtures
are now included in the normal test scripts.

Management source and verification are committed in `7b01403` and `91a48cf`.
Sixteen actual predicate contracts, four failing predicate mutations, seven
controlled adapter cases and the native browser fixtures passed. The asynchronous
receivers remain tested and reviewed rather than deductively verified. Their
browser identity, trusted physical URL, channel and concurrency premises are in
`management-authority.md`.

Current independent work in the auxiliary checkout:

- The native-policy agent owns a new explicit audio-worklet host policy and
  `contexts/worklet-entry.ts` integration. The shared codec is available; no raw
  reflective fallback remains in its replacement. Its focused and actual-browser
  checks pass, committed in `b9a0bee` and `4344af0`. The current scoped receipt is
  `d9308d9`. Processor ports are
  admitted by trusted producer, while bootstrap control ports remain private.
- The Wasm agent owns exception-safe acquisition in `indexed-access.ts`, real
  SDK/compiled-C failure fixtures and selected actual-C record/control checks,
  committed in `9650617`, `bef0f49` and `ac1d80d`. Eight indexed tests, 243 record
  properties and 214 indexed-branch properties pass, with failing controls. C ABI
  projections, live-handle premises and excluded general Proxy continuations are
  explicit. The agent's engine lifetime repair is isolated on
  `quickjs-terminal-lifetime` at `/home/damen/Projects/privacy-frames-indexed-lifetime`.
  Its initial source/fixture commits are `7866829` and `2be7451`; a reproduced
  throwing-error-reporter cleanup gap is being repaired before integration.
- The management agent completed the standalone text-codec domain and its Node
  and actual-browser fixtures in `bc6e47a` and `d73d86a`. Browser routing for URL
  and text now shares owner selection (`0220644`); refreshed URL controls pass
  in both browsers (`20b4eb4`). One-time worker transfer-list conversion is
  committed in `4ca5fea`, with evidence in `5a037da`. The agent now owns the
  isolated `quickjs-wasm-policy` branch at
  `/home/damen/Projects/privacy-frames-wasm-policy`. Native funcref identity,
  protected import decoding, externref delegation and genuine cross-realm values
  must survive removal of that domain's raw forwarding.
- Root owns integration, package wiring, broader native-policy migration and
  release qualification. The complete `npm test` run finished successfully as
  session 54644 on frozen source `5a037da`: 189 units, core/context/policy/install
  suites, and 122 maintenance observations including 60 confined samples with no
  observed runtime/publisher/update requests. Formatting passed. Evidence and
  296 source hashes plus 30 build-artifact hashes are archived under
  `results/quickjs-confinement/integrated-5a037da/`. Neither isolated engine nor
  native-Wasm changes were part of this development checkpoint.

Do not label these components a complete confinement proof or deploy them as a
qualified release. Next: integrate the reviewed engine lifetime checkpoint after
its cleanup fix,
run the affected suites, then continue replacing browser forwarding families and
connecting their effect contracts to implementation proofs and browser coverage.

## Resumption planning checkpoint

Use the [resumption plan](../../docs/implementation/confinement-verification-resumption.md)
for the inspected state and remaining execution order. The earlier checkpoint
below predates the auxiliary branch's context, worklet and native-policy commits.
This planning turn changed no executable source or deployment.

At inspection, the integration branch remained at `4fb6e91` and the auxiliary
branch at `bea54db`. The auxiliary tree also contains uncommitted reference-owner,
exception-cleanup and management-authority work. Preserve and review those changes
before merging. Latest helper fixtures passed their intended prepared and fault
cases in Chromium and Firefox; those logs do not replace source-qualified receipts.

The management agent stopped safely with changes in `src/runtime/authority.ts`,
`src/runtime/worker.ts` and `src/bridge/connect.ts`. It reported a passing typecheck;
direct predicate verification, actual-adapter lifecycle tests and controls remain.
No management proof or release qualification was completed by that work.

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
