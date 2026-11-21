# QuickJS confinement implementation handoff

## Current checkpoint

The browser and its normal built-in services are trusted. On 21 November the user
confirmed the static web-only deployment and this trust boundary after reviewing
the autofill diagnostic. Explicit application transports, resource requests and
navigation remain subject to confinement. The diagnostic receipts retain their
original broader zero-browser-communication outcome; they are not relabeled as
passing tests under the current scope.

The goal remains active. The stabilization checkpoint is finished; the
[resumption plan](../../docs/implementation/confinement-verification-resumption.md)
still requires implementation correspondence, composition, upgrade checks, CI
and release qualification. Production remains on executable source `5f62e61`.
No new candidate has been deployed.

Main development checkout: `/home/damen/Projects/privacy-frames-quickjs-kernel`,
branch `quickjs-confinement-kernel`. Latest committed source is `9017a34`; the
remote development backup is at `0195a96` before this checkpoint is saved.

`ef9af40` repairs CyberChef startup overhead by caching immutable native brand
membership for URL/text objects and skipping indexed-buffer probes for non-views.
Live attributes, prototype admission and descriptor checks remain enforced.
`45aa056` captures ArrayBuffer.isView before guest setup. CyberChef's focused
Chromium check passed Base64 and offline tasks at 63811 ms and 63534 ms, within
the unchanged 90-second limit. Both subsequent full compatibility matrices passed
all twelve Chromium/Firefox cases. Earlier failures and the CPU diagnostic are
preserved with their original scope.

The full suite at `973b1aa` passed 211 units, core/context/policy/installation
checks, Pitch and formatting. Its maintenance checks recorded 122 observations:
60 confined cases had no runtime/publisher/update receiver requests; native
controls recorded 52. The later `0195a96` checkpoint passed units, typecheck,
core checks, the twelve-case matrix, Pitch and formatting. These results have
separate source manifests under `results/quickjs-confinement/`.

Three paired native/confined image runs retained all Squoosh measurements. All
48 native/confined export hashes matched. Chromium confined median export time
was 9259 ms online and 9365 ms offline; Firefox was 9617 ms and 9766 ms. Changes
from the original baseline were +3.05%, +5.21%, +22.54% and +24.41%, respectively,
within the preselected 25% investigation threshold.

The third image run had a Firefox PhotoCraft offline download timeout. Its failed
receipt is preserved; an unchanged targeted retry passed. `9017a34` then replaced
blind canvas-menu sleeps in the test with visible-menu readiness checks and added
host-confirmation diagnostics. Two complete PhotoCraft rounds subsequently passed
in both browsers, native and confined, including offline confined exports. This
changes test interaction only; it does not establish the original timeout's cause.

`4cba8a3` makes `README.md` the canonical C1–C8 enforcement and evidence map.
The current threat-model/report edits record the user-confirmed browser trust
boundary. REPORT.md is a build input: its revision changes build hashes even
though runtime source is unchanged. Formatting, typecheck, build and actual
example smoke checks in Chromium/Firefox passed after these documentation edits.

## Active work and process state

All qualification sessions through 25524 are terminal. No browser qualification
job is currently running. Preserve failures before any future retry. The owned
Xvfb :119 was cleaned up; never stop the unrelated existing Xvfb :99 (PID 12947).

The next implementation work replaces generic NativeBinary forwarding with
explicit reviewed members using the existing NativePolicy/NativeHost codec.
The assigned implementation owns `src/guest/native-binary.ts` and focused binary
policy tests. It must preserve species hooks, native buffer identity, mixed
buffer set operations, DataView expandos and iterator ownership.

An independent management-composition task owns
`formal/quickjs/management-composition/`. It checks asynchronous caller schedules
and distinguishes authorization at the accepted operation from a stronger
current-generation-at-transfer property. Three synchronous predicates have
sixteen contracts; those contracts do not prove every asynchronous caller.
Neither task owns shared interfaces, build scripts or this handoff.

The integration checkout `/home/damen/Projects/privacy-frames-quickjs-proof` remains
on `quickjs-confinement-proof` at `9d9e401`. Preserve its untracked identity and
calibration receipts before merging. Publisher inputs remain the pinned
`8db931d` checkout there at `publisher-source`; set PUBLISHER_DIRECTORY to its
dist directory when using the development checkout.

## Integrated components

- Management predicates/receivers: `7b01403` with evidence `91a48cf`.
  Sixteen contracts for three production predicates and controlled/native browser cases pass;
  asynchronous receiver composition remains tested/reviewed rather than proved.
- Reviewed NativePolicy/NativeHost and URL/text families are integrated. Genuine
  native Wasm functions and buffers retain identity. The new Wasm family uses
  reviewed declarations, native-brand semantic anchors and explicit externref
  delegation. Repeated Exception stack adapters were repaired after independent
  review. Unknown native operations receive no implicit callable authority.
- Worklet host and MessagePort producer policy are integrated. Bootstrap control
  endpoints stay private. Queued delivery rechecks exact owner liveness before
  admitting an event or transferred endpoint.
- Indexed acquisition fixes are `9650617`; record/branch verification is in
  `bef0f49`/`ac1d80d`. The calibrated checks cover 243 record properties and 214
  selected indexed-branch properties. C ABI projections, live roots and excluded
  general Proxy continuations remain explicit premises.
- Engine logical close precedes idle-gated physical release. `set` encoding has
  an entry boundary; bound properties reject closed contexts. Error reporting
  cannot skip owned cleanup. Ten actual cases and five omission controls pass.
- Native listener conversion tracking preserves platform argument conversion
  and stores primitive cleanup arguments. Browser disposal attempts every owned
  cleanup. Transfer normalization runs once; failed sends do not detach sources.
  The legacy document.all dictionary regression and both conversion controls pass.

## Open reviews and coverage

The callback-routing review agent was stopped by cybersecurity screening. Its
review is incomplete and must not be counted as passed. Preserve this gap; do not
retry the rejected task by disguising its purpose or treating preliminary source
observations as a complete result.

`reviews/browser-owned-services.md` began as a static review in `e5b82bd` and now
includes source-linked suppression candidates, actual installed-runtime controls
and the native document-type exploration. The latest experiment is at `0195a96`.
It pins Chromium revision `971a7443b0c9b0a9b2860529b33331b76077ec62` and its
actual response headers/launch settings. Default-feature native and confined
requests are observed; ordinary user-profile prevalence and all browser families
are separate coverage obligations. The original namespace creation failure was
superseded by verified Docker network-none isolation.

Remaining work includes native browser/binary forwarding, source-linked caller
and protocol composition, complete application-effect coverage, upgrade
verification, CI and qualified deployment. Continue the work
without marking the goal complete from these component results.

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

## Previous objective (20 November)

The earlier goal was to execute every stage of the autonomous confinement verification plan, preserving
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
