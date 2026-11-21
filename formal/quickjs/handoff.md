# QuickJS confinement implementation handoff

## Current integration

The browser and its normal built-in services remain trusted. Application network
operations, resource loads and navigation remain confined. Keep the static web-only
design and the current production deployment; the verification goal is active.

Primary checkout: `/home/damen/Projects/privacy-frames-quickjs-kernel`, branch
`quickjs-confinement-kernel`. Production is still executable `5f62e61` with release
evidence `10bc6cc`. No candidate from this work has been deployed.

The binary policy passed the full suite, twelve-case application matrix, Pitch
and three paired image rounds at `81967aa`. Receipts are preserved under
`integrated-81967aa/` and `images-81967aa/`. These qualify that earlier source,
not the event changes below. All 48 Squoosh export hashes matched; the original
25% performance investigation threshold remains unchanged.

C8 resource publication is integrated in `19cfa11` and its verification wiring in
`31eafb3`. Native IndexedDB production and omission controls pass in both browsers.
The component CI run at `31eafb3` passed all fifteen drivers; fresh hash-matched
receipts and logs are archived under `ci-31eafb3/`. The bounded transaction checks
do not establish complete asynchronous correspondence or UUID freshness.

Selected browser events, existing-handle callback dispatch, explicit strict trusted
bootstrap evaluation, primitive-string length and error-handle cleanup are integrated
through `3523490`. Focused Chromium/Firefox checks pass, including cross-window
listener marshalling and native method shape. All 232 unit tests, types and formatting
passed. C5 bootstrap calibration is now included in the component runner; its three
strict-option omission controls fail their intended semantic probes. The application
runtime remains non-strict by default. Generic native browser forwarding remains.

Initial combined-suite failures are preserved under `integrated-events-initial/`.
`ceb44b5` corrects the cleanup spy timing and selected-adapter omission controls
without changing runtime source. `8d5f4e0` applies the native EventTarget global
receiver convention through one shared codec invocation path. `ea1fd87` restricts
that convention to actual null/undefined, preserving native rejection of
`document.all`. Native controls and their earlier failures are preserved.

The Abort family is integrated at `a6f695e`; its own producers, reasons, handlers
and inherited EventTarget operations are reviewed. Request.signal remains outside
that producer set. `111885f` closes an owned shared-worker session when startup
fails while preserving the original failure. `9758c2c` blocks native Window writes
until engine attachment and after closure.

CSS/Audio deferred conversion is integrated at `40b0205`, corrected at `374c8aa`.
The correction removes inference of one API's string binding from CSS.escape.
Only decoded resource URL values receive scalar/NUL normalization; whole CSS text
retains native handling. Failed whole-text preprocessing comparisons and the raw
unquoted-NUL grammar limitation remain recorded. `6a221e6` extends mapping to
FontFace string sources while preserving native validation of genuine binary
candidates, including native rejection where appropriate. No catalog or worker
initialization field was added. Both-browser Window/Worker and QuickJS controls pass.

The combined source through FontFace passed 248 units, type checking, formatting
and focused FontFace checks. Combined Window-write, context-publication and shared
startup checks also pass. The earlier full suite at executable `640785e` was
intentionally interrupted during maintenance checks so the completed fixes could
be integrated. It is not a full-suite pass; its source/artifacts and interrupted
log are preserved under `integrated-events-abort/`.

The remaining isolated work is now integrated. `52fc409` captures ordinary native
intrinsic identities during trusted realm setup and maps them to the receiving
guest's privately captured handles. `2d82b0b` keeps old generic proxies refused
after explicit alias replacement; new alias encodings retain their intended
identity. Foreign dynamic constructors remain outside this catalog.

`887f951` withholds pending Window documents, API references and native mutation.
`786c91b` makes native prototype deferral an explicit internal result: ordinary
property polling stays usable, while explicit prototype reflection fails locally.
No temporary null prototype is cached. The original combined popup-polling failure
is preserved under `deferred-prototype-initial/` and `deferred-prototypes/`.
The latest executable source is `786c91b`, including the shared exposure catalog
in `24a6dfe`. Production remains unchanged; the remote backup is through `7177eb9`.

Root is qualifying the combined source. Source changes are frozen during the
component runner, full suite, application matrix, Pitch and paired image checks.
The earlier `privacy-frames-browser-policy` and `privacy-frames-abort-policy`
worktrees are integrated. Preserve their original branch references, including
`quickjs-abort-policy`, while those worktrees serve newer isolated tasks. The
`privacy-frames-realm-intrinsics` / `quickjs-realm-intrinsics` and
`privacy-frames-window-writes` / `quickjs-window-reflection` checkpoints are also
integrated. The final prototype repair is on `quickjs-deferred-prototypes`.

Root owns suite wiring and exact executable provenance. The event fixtures now
explicitly launch the executable whose path/hash they record; earlier receipts
using Playwright's implicit headless selection retain that qualification limit.
Combined checks must finish before their receipts are reported as passing. The
full confinement argument still has generic forwarding and caller/composition
obligations; functional qualification does not discharge them.

Publisher inputs remain the `8db931d` checkout at
`/home/damen/Projects/privacy-frames-quickjs-proof/publisher-source`; set
`PUBLISHER_DIRECTORY` to its `dist` directory. The unrelated Xvfb :99 (PID 12947)
must remain running. No owned performance display is currently active.

Continue the [resumption plan](../../docs/implementation/confinement-verification-resumption.md).
The [security argument](README.md#security-argument) records C1–C8 premises and gaps;
[incoming message producers](reviews/message-producers.md) records the closed-peer
provenance obligation. Remaining work includes browser-family mediation, reference
and effect composition, lifecycle callers, upgrade tests and release qualification.

## Historical checkpoint before event integration

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
branch `quickjs-confinement-kernel`. Latest executable source is `81967aa`. The
remote development branch is backed up through `afe426a`, including the binary
policy and CI evidence follow-up `86260c3`. `ffca4da`
preserves the stabilization receipts, including failed and unqualified diagnostics.

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

### Active work and process state

The earlier stabilization sessions, including 25524, are terminal. The current
binary qualification sequence is described below. Preserve failures before any
future retry. The earlier owned Xvfb :119 was cleaned up; never stop the unrelated
existing Xvfb :99 (PID 12947).

The NativeBinary operation policy is committed at `81967aa`. All 220 units,
formatting, typecheck, build, the actual GuestEngine browser fixture, native Wasm
policy controls and the eleven native/confined Wasm fixtures passed. The browser
fixture confirms unknown native buffer getters remain unexecuted in Chromium and
Firefox; primitive geometry shadows, growth and synchronization checks still pass.
An independent read-only review identified no concrete confinement defect, while
retaining the engine ownership/composition premises.

Session 91701 is terminal: full npm test, all twelve Chromium/Firefox application
cases including offline tasks, and Pitch in both browsers passed. Maintenance
recorded 122 observations, 60 confined cases and zero confined receiver hits.
The matrix has no new runtime-error or console-object counts relative to
`0195a96`; optional analytics/cloud resources remain refused locally.
Full-suite, matrix and Pitch receipts/logs are archived under
`integrated-81967aa/`.

Session 50883 is terminal: all three paired native/confined image rounds passed
all 24 cases, including offline confined exports. All 48 Squoosh export hashes
matched native. The original 25% median investigation threshold was unchanged:
Chromium online/offline medians were 9721/10686 ms (+8.19%/+20.05%); Firefox was
7894/8567 ms (+0.59%/+9.13%). Raw outliers, including an 18006 ms Chromium offline
sample, remain in the archive. Results are under `images-81967aa/`; matrix/Pitch
and full-suite evidence are under `integrated-81967aa/`. The owned Xvfb :119 was
cleaned up; only unrelated :99 remains. The performance command freeze is cleared.

Two isolated follow-up worktrees are based on `afe426a`, share installed
node_modules and have copied matching engine artifacts:

- `/home/damen/Projects/privacy-frames-browser-policy`, branch
  `quickjs-browser-policy`: uncommitted composed event policy, prepared-target
  delivery rechecks, existing-handle callable recognition/dispatch, and three
  strict trusted-factory eval sites. Thirty-six focused Node checks, type/format,
  and actual BrowserEnvironment/QuickJS fixtures passed in Chromium and Firefox
  (pre-strict 43274, final-strict 95511). Other EventTarget families remain
  unclaimed; explicit borrowed operations need qualification before widening
  producers. Brand owns engine/browser source. The C5 agent owns only new
  `formal/quickjs/bootstrap-mode/` calibration files; refresh their hashes after
  the final engine repair. Root authorized readString to read primitive UTF-16
  length via getProp, since actual SDK getLength returns undefined, and
  finally-dispose guestError info without weakening NUL/surrogate recovery.
  That repair and its tests are still in progress. The earlier Node smoke GC
  assertion is preserved: direct-TSX baseline/current controls both failed;
  equivalent esbuild controls both passed. Actual SDK evaluation observed
  ReferenceError `__name` in TSX-polluted factory source. Complete diagnostics
  and pre-change input snapshots are retained; error-cleanup masking is separate
  from that first initialization failure. Do not grant unknown callback authority
  through default owner/encode, or edit NativePolicy/NativeHost/Wasm modules.
- `/home/damen/Projects/privacy-frames-resource-publication`, branch
  `quickjs-resource-publication`: coherent commit
  `25b882e3c64c6a77275c994a8d0344e518befb04` is ready for root cherry-pick after
  saving this binary checkpoint. The small storage helper uses upper-open
  `[id, []]` after lower `[id, '']`, covering all string paths including U+FFFF
  suffixes. Twelve actual completion cases and twenty-four bounded transaction
  schedules passed. Native IndexedDB production and two omission variants passed
  in both browsers, including refined provenance run 1135 with exact binary
  hashes. No package/shared API changes. The full asynchronous/caller argument
  and production UUID freshness remain premises; no deductive callback proof is
  claimed. Current worker/catalog callers select paths from metadata. Captured
  admitted local bytes may finish after removal. The cleanup bug established no
  new network communication route.

Root integrates and qualifies these worktrees; neither has changed the frozen
kernel candidate. No production deployment has occurred.

The management-composition task is integrated at `16b281e`: actual bundled
receivers passed 143 bounded schedules and four omitted-recheck controls. Its
two-controller publication-freshness counterexample is preserved separately from
management authorization. Three synchronous predicates have sixteen contracts;
neither those proofs nor the schedules establish every asynchronous execution.
The NativeBinary implementation and independent review tasks are complete.

The component-verification command and GitHub workflow are also integrated at
`16b281e`. All fourteen drivers passed on that revision in run `44924608486`.
Hash-matched CI receipts and logs are archived under
`results/quickjs-confinement/ci-16b281e/`. This is the pre-NativeBinary source,
not qualification of later runtime changes. The follow-up passed all fourteen
drivers again at `afe426a` in run `44927181816`; hash-matched receipts are archived
under `ci-afe426a/`. The aggregate runner clears its old summary before input
collection and records each receipt path.

The integration checkout `/home/damen/Projects/privacy-frames-quickjs-proof` remains
on `quickjs-confinement-proof` at `9d9e401`. Preserve its untracked identity and
calibration receipts before merging. Publisher inputs remain the pinned
`8db931d` checkout there at `publisher-source`; set PUBLISHER_DIRECTORY to its
dist directory when using the development checkout.

### Integrated components

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

### Open reviews and coverage

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

Remaining work includes native browser forwarding, source-linked caller
and protocol composition, complete application-effect coverage, upgrade
verification, CI and qualified deployment. Continue the work
without marking the goal complete from these component results.

### Historical resumption planning checkpoint

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

### Previous objective (20 November)

The earlier goal was to execute every stage of the autonomous confinement verification plan, preserving
the existing applications, native Wasm performance and GitHub Pages deployment.
Do not mark the goal complete from component results or test counts.

### Branch and recovery

Worktree: `/home/damen/Projects/privacy-frames-quickjs-proof`.
Branch: `quickjs-confinement-proof`, based on planning commit `4d06014`.
Remote main at execution start: `10bc6cc`.
Remote recovery tag: `pre-quickjs-confinement-proof-2026-11-20` -> `10bc6cc`.
Production source remains `5f62e61`; no implementation deployment has occurred.

### Stage 0 baseline complete

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

### Active implementation checkout

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

### Fresh evidence

`formal/quickjs/calibrate.ts` invokes the pinned Gillian image through the existing
verification-report checker. The fresh run passed all three stateful-closure
contracts and rejected the missing-increment fault at postcondition checking.
Receipt: `results/quickjs-confinement/calibration.json`.
Log: `/tmp/pf-proof-calibration.log`, session 15961.
This calibrates the tool; no production kernel has been verified by this run.

### Reviews and next source changes

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

### Tools

Node: `/home/damen/.local/share/mise/installs/node/24.18.0/bin`.
Lean: `/home/damen/Projects/privacy-frames-runtime-proof/.tools/lean-4.35.0-linux`.
Gillian container digest is pinned in `formal/runtime-verification/gillian.ts`.
Do not replace historical receipts to represent current proof work.
