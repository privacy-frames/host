# Current demonstration and compatibility contract

Research date: 17 November 2026. Source inspected: host
`e92eb2566b0aebc7f13416ec6af7b6737ba840eb`, on `research/wasm-demo-contract`.
This is a source and receipt audit, with publisher documentation checks; no
application, performance, deployment or confinement tests were run for this note.

## What the new host must deliver

The destination is a complete greenfield host around a WebAssembly JavaScript
engine, with a manager at `pf.damenh.com` very similar or identical to the present
interface. QuickJS and Boa are candidates, not selections. All presently supported
applications remain in scope as applications. The selected tasks below establish
specific observed behavior and useful regression checks; they do not reduce
PhotoCraft to one brush stroke or CyberChef to To Base64. Existing code may be
reused, but its native-JavaScript runtime, protocols, package format and origin
layout are not architectural commitments. There is no migration or backward
compatibility requirement. IFC and the JSFlow implementation are excluded.
These are the user's recorded instructions in the [working map](../../../.scratch/wasm-runtime/map.md).

The supported surface still has real limits: confinement intentionally prevents
remote collaboration, cloud synchronization and uncaptured navigation/resources.
Keeping an application supported means preserving its useful local behavior under
those restrictions, not enabling every online feature advertised by its publisher.
The current source describes this resource rule in [README](../../../README.md)
and [implementation boundaries](../../../IMPLEMENTATION.md).

## Evidence and revision boundaries

| Evidence                                                                                                                                                                                                                                  | Revision and scope                                                                                                                                                                            | What it establishes                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Compatibility evaluation](../../../evaluation/compatibility.md), [explicit-list public receipt](../../../results/evaluation/compatibility-explicit-lists-public.json)                                                                    | Host `97f2b835609eedc95c9f52a470c7c32046f1b5fb`; 29 October 2026, completed 10:51:09 UTC; Chromium 153.0.8010.12 and Firefox 155.0                                                            | All eight selected native/confined tasks and offline checks passed, 16 browser/app pairs, stable artifact hashes.                                                                                                                            |
| [Later trusted-runtime release ledger](../../../results/trusted-runtime/release.json), [public receipt](../../../results/trusted-runtime/compatibility-public.json), [release account](../../../evaluation/trusted-runtime-completion.md) | Qualified host `b8c5b8e08b3ee1a2644924923ad98457e4c0f3f5`; public matrix completed 29 October 2026, 23:32:02 UTC; same browser versions; publisher `b8637f0dc5b5e56ae0b6397fdae8501598b7d39e` | Another 16-pair passing task/offline matrix, with stable deployed artifact hashes. This later record must not be silently replaced by the older evaluation page.                                                                             |
| Starting host source and [surface inventory](../../../SURFACE_INVENTORY.md)                                                                                                                                                               | `e92eb2566b0aebc7f13416ec6af7b6737ba840eb`                                                                                                                                                    | Source behavior and intended controls. The inventory explicitly says final regressions, corpus evaluation, independent network checks and publication of its current batch remain pending. Neither historical matrix verifies this revision. |

The later release retained failed deeper CyberChef runs: Firefox file processing
crashed initially and passed an unchanged sequential repeat; a Chromium animated
SVG observation failed once and passed a repeat. Their causes remain unconfirmed.
Firefox cancellation remains unqualified because its native control was unstable.
See the [release's verification and limits](../../../evaluation/trusted-runtime-completion.md)
and its initial/repeat receipt links. An all-green selected matrix does not erase
those observations. This audit did not establish what revision the live sites
serve today.

## Manager and installation behavior

The [configured catalog](../../../deployment/config.json) contains eleven visible
examples: Notebook, PhotoCraft, Hostile app, Code playground, Pitch Training,
Wikipedia article, Excalidraw, Squoosh, diagrams.net, CyberChef and StackEdit.
[Manager UI source](../../../src/manager/app.tsx) provides the URL field, Install
button, optional supplemental resources, installation/error status, example
buttons, installed count and refresh, and expandable diagnostics. Each installed
card shows its name/source with Open and Remove; Open creates a new tab without
an opener ([card source](../../../src/manager/components/application-list.tsx)).
Preserve that flow, responsive layout and familiar appearance when replacing the
execution backend. The resource-list widget accepts a URL, upload or pasted text;
choosing a catalog URL selects its published list automatically.

Installation downloads public content with CORS-readable responses, omits
credentials and rejects redirects. It executes no publisher JavaScript. The
importer follows HTML/CSS declarations and literal JavaScript imports; a
`text/uri-list` supplies dependencies generated or selected dynamically. Lists
contain absolute HTTPS URLs, comments and blank lines, with a 256 KiB list limit.
Missing explicit resources or the entry document reject installation; failed
automatically discovered dependencies are recorded while successful resources
remain. Runtime admission independently validates the package. Limits are 1,000
resources and 100 MiB, including document adaptation. Installation succeeds for
an admitted graph, not for an entire site's potential feature set.
Sources: [README](../../../README.md), [importer](../../../src/installation/import-website.ts),
[resource-list parser](../../../src/installation/resource-list.ts),
[resource capture](../../../src/installation/resource-capture.ts),
[admission](../../../src/runtime/admission.ts), [limits](../../../src/shared/policy.ts).

## Applications and workflows

The release observations in this table come from the two matrices above and the
[task implementation](../../../test/evaluation-compatibility.ts). The rightmost
column identifies compatibility obligations implied by preserving the application,
including features still needing an explicit qualification inventory. It is not a
claim that every listed API or optional workflow has passed.

| Application and admitted publisher                                                                               | Demonstrated task and offline scope                                                                                                                                                                                                          | Application behavior to retain and investigate                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PhotoCraft, [original hosted editor](https://share.damenh.com/craft/hVO5F2d3gEg2c4hY5/)                          | Import generated PNG; paint and sample changed pixel. Offline reopening establishes editor startup, not persistence of an unsaved image.                                                                                                     | Interactive Wasm image editing: original JS glue and guest Wasm, file input, image decode, canvas/rendering, pointer/keyboard input, local export and editor controls. Identify the actual GPU/WebGL surface before choosing a DOM/rendering bridge.                                                                                  |
| Pitch Training, [original publisher](https://damenh.github.io/pitch-training/)                                   | Play note, answer an exercise, retain history after ordinary/offline reload. Deeper public tests cover piano sample decode/playback, microphone pitch analysis and stopping capture, settings/history/IndexedDB persistence and hash routes. | Preserve musical interaction, audio buffers and user activation, microphone permission/denial, worker readiness and saved state. Chromium's synthetic 220 Hz input produced 220.8 Hz; Firefox's recorded 1002.1 Hz result establishes capture/analysis, not matching the same controlled frequency.                                   |
| Wikipedia, [Albert Einstein HTML endpoint](https://en.wikipedia.org/w/rest.php/v1/page/Albert_Einstein/html)     | Render the captured article, scroll to its final section offline.                                                                                                                                                                            | Ordinary HTML/CSS/images, readable layout, fragment navigation and scrolling. Following links to uncaptured articles is outside the demonstrated graph and must fail locally.                                                                                                                                                         |
| Excalidraw, [licensed Pages mirror](https://privacy-frames.github.io/apps/excalidraw/)                           | Draw and move rectangle; saved localStorage x coordinate changes; offline task/reopening.                                                                                                                                                    | Preserve interactive drawing, canvas, geometry, text/fonts, pointer/keyboard events and local scene persistence/import/export. Remote collaboration is not an admitted network capability.                                                                                                                                            |
| Squoosh, [licensed Pages mirror](https://privacy-frames.github.io/apps/squoosh/)                                 | Encode deterministic 256×256 PNG into a smaller decodable JPEG; changing quality changes bytes; encoding repeats offline.                                                                                                                    | Preserve browser image processing UI, file/Blob/ArrayBuffer routes, workers and app-supplied codec Wasm. Other codecs, transforms and export combinations need coverage; the JPEG task is not the whole application.                                                                                                                  |
| diagrams.net, [licensed Pages mirror with `?offline=1`](https://privacy-frames.github.io/apps/drawio/?offline=1) | Drag palette rectangle; changed SVG; repeat insertion offline.                                                                                                                                                                               | Preserve local diagram editing, SVG/DOM interaction, drag/drop, dialogs, keyboard controls, fonts/stencils and local files. The catalog uses the documented offline URL; the runtime has no publisher-specific branch. Full static mirror is 112,387,927 bytes and exceeds 100 MiB; the successful graph does not include all assets. |
| StackEdit, [licensed Pages mirror](https://privacy-frames.github.io/apps/stackedit/)                             | Edit Markdown and observe rendered heading before/after offline reload.                                                                                                                                                                      | Preserve editing/preview, local workspace/files and IndexedDB persistence, relevant embedded renderers and local import/export. Cloud synchronization requires forbidden network access and was not demonstrated.                                                                                                                     |
| CyberChef, [original publisher](https://gchq.github.io/CyberChef/)                                               | Matrix: expected To Base64. Deeper receipts: text round trips and file hashes, confined offline repetition; Chromium cancellation/restart and animated SVG, with intermittent failures/repeats described above.                              | Preserve the local recipe workbench, operations, text/binary/file processing, workers, cancellation/restart and output renderers. Other recipes/dependencies are not qualified by one successful recipe.                                                                                                                              |

Pitch detail is recorded in [the public receipt](../../../results/pitch-training-deployed.json)
and [test source](../../../test/pitch-training.ts). CyberChef deeper evidence is
indexed by [the trusted-runtime ledger](../../../results/trusted-runtime/release.json).
Publisher documentation confirms Squoosh's browser codec purpose
([upstream](https://github.com/GoogleChromeLabs/squoosh)), CyberChef's broader
encoding/analysis workbench ([upstream](https://github.com/gchq/CyberChef)),
client-side diagramming ([draw.io](https://github.com/jgraph/drawio)) and the
Markdown editor ([StackEdit](https://github.com/benweet/stackedit)). Those moving
upstream pages describe application purpose; they do not qualify the captured
versions or enlarge admitted networking permissions.

The four mirrors are packaging inputs, not untouched original deployments.
[Publisher packaging](../../../evaluation/publisher-packaging.md) records snapshots,
license notices, SHA-pinned archives, URL relocation and modification inventories.
Its standalone tests exercised selected tasks, not all codecs or optional features.
The [pinned publisher source](https://github.com/privacy-frames/apps/tree/b8637f0dc5b5e56ae0b6397fdae8501598b7d39e)
contains maintained examples and supplemental lists, including PhotoCraft's JS
and `_bg.wasm` and Pitch Training's generated workers/piano samples.
A direct research download of PhotoCraft's listed JS returned HTTP 403; this note
therefore does not infer WebGL support from that bundle or treat live installation
as reverified.

## Hosted examples and browser surface

The [publisher's example sources](https://github.com/privacy-frames/apps/tree/b8637f0dc5b5e56ae0b6397fdae8501598b7d39e/examples)
provide Notebook (React, local notes, JSON/image resources and precache worker),
Hostile app (API and event disclosure probes) and Code playground (editable
HTML/CSS/JavaScript with a disclosure attempt). Smaller image and ordinary
fixtures exercise private pixels/files, document import, nested CSS, manifest,
service-worker preparation and Wasm. They remain acceptance inputs even though
only three are visible catalog examples. Public installation of all eleven
examples in [the deployed-host runner](../../../test/deployed.ts) is separate from
proving each one's useful workflow; the deeper matrix supplies the latter for
eight applications.

| Surface                               | Required behavior and evidence boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JavaScript and DOM                    | Original application language semantics plus browser objects, CSS/layout, selectors, markup, custom elements, dynamic scripts/modules, URL resolution, frames/documents and supported popups. Existing native-backed support is described in [implementation boundaries](../../../IMPLEMENTATION.md). Autonomous custom elements are admitted; customized built-ins and document replacement are restricted. Native object identity/prototype behavior cannot be assumed to survive an engine bridge.                                                                     |
| Canvas, SVG and WebGL                 | 2D/pixel and SVG tasks are evidenced above. Canvas/font/image/file behavior is central to drawing/image apps. WebGL/WebGL2, GPU objects, OffscreenCanvas and transfer routes need an explicit publisher-asset/API census; no inspected matrix asserts WebGL coverage. Treat rendering needs as an unresolved compatibility obligation, not grounds to omit the applications.                                                                                                                                                                                              |
| Audio and microphone                  | Pitch exercises decoded samples, running audio context, capture and stop, browser permission, persisted state. [Worklet fixture](../../../test/worklet-platform.ts) separately tests AudioWorklet/OfflineAudioContext and browser-available paint-worklet behavior. Browser absence is not a passed implementation.                                                                                                                                                                                                                                                       |
| Guest Wasm                            | Must support app-supplied Wasm in addition to the JS engine's own Wasm: byte/streaming instantiate, typed memory, callable imports/exports, worker execution, resource MIME/aliases and offline bytes. [Wasm test](../../../test/wasm.ts) checks module/Blob worker imports, instantiateStreaming, computation and rejected disclosure; [Wasm contract probe](../../../test/realm-wasm-contract.ts) is research, not a new production qualification.                                                                                                                      |
| Scheduling/events                     | Preserve synchronous DOM reads and mutations, dispatch/cancellation before default actions, callback reentrancy and exceptions; promises/microtasks, timers, animation frames and script load/error order also matter. [Synchronous boundary fixture](../../../test/trusted-computation.ts), [DOM probe](../../../test/realm-dom.ts), [dynamic scripts](../../../test/dynamic-scripts.ts) and [publisher event semantics](../../../test/publisher-events.test.ts) are separate evidence sources. An asynchronous message bridge alone does not establish these semantics. |
| Dedicated/shared workers and worklets | Classic/module/Blob/nested workers, importScripts/import graphs, postMessage/ports/transferables, termination and same-application shared connections. [Worker](../../../test/worker-contexts.ts), [shared-worker](../../../test/shared-worker-contexts.ts) and [worklet](../../../test/worklet-contexts.ts) fixtures define existing cases. Every child must inherit confinement before app code runs. SharedArrayBuffer, Atomics and threaded Wasm are not established by these receipts.                                                                               |
| Private persistence                   | Application-scoped localStorage/sessionStorage including property/prototype/event routes, IndexedDB and Cache Storage; preserve browser transaction/response behavior and offline reopening. See [storage tests](../../../test/scoped-storage.ts), [policy tests](../../../test/storage-policy.ts) and [storage adapters](../../../src/runtime/storage/). Shared-origin permission and cross-app isolation remain unproved; namespacing is not a separate origin.                                                                                                         |

## Two different service-worker responsibilities

The host's native service worker admits packages, authenticates browser-client
roles and serves local resources. Its lifecycle, controller replacement and
browser-maintained updates belong to the trusted host. The manager also has an
[offline worker](../../../src/manager/offline-worker.ts). These mechanisms must
be considered separately from publisher service-worker APIs.

Publisher registrations currently run in prepared foreground executors. They
expose mediated install/activate/message/fetch events, synchronous `respondWith`
selection and `waitUntil` lifetimes, scoped clients/messages and unregister. They
do not replace native host control or gain fallback networking. Updates,
openWindow and navigation preload operations reject as unsupported. Responses
cannot create executable documents/scripts or replace response policy; failed
handlers produce failure rather than silently bypassing app policy. This is a
restricted compatibility profile, not native background-service-worker parity.
Sources: [publisher events](../../../src/runtime/publisher/events.ts),
[publisher controller](../../../src/runtime/publisher/controller.ts),
[publisher tests](../../../test/publisher-contexts.ts).

The [known maintenance counterexample](../../../formal/runtime-verification/service-worker-maintenance.md)
shows why the distinction matters: private input can determine whether worker
startup induces a request for the trusted host worker script, even when app
resources are delivered locally. Later local candidates pass selected fresh
registration cases but forced-age classic-dynamic/module cases still record HTTP
violations; other runs miss native positive controls. No complete confinement
claim follows. A replacement must block application-dependent network effects,
including browser maintenance traffic; it cannot classify these away as harmless
host requests. The paused lifetime experiment was not modified or executed here.

## Offline, PWA and static deployment

Present deployment uses three GitHub Pages origins: manager `pf.damenh.com`,
runtime `apps.pf.damenh.com`, installer `install.pf.damenh.com`. Publishers stay off
all trusted origins. Static application routes return 404 until intercepted by
the host worker; no server-side routing or SPA fallback is required. Retain a
static deployment option and publisher CORS requirements while allowing a new
origin/route design to be chosen explicitly. [README deployment](../../../README.md)
and [configuration](../../../deployment/config.json) own these facts.

The host generates local PWA identities/scopes/manifests from admitted standard
publisher metadata and icons, not a custom SDK. [Manifest adaptation](../../../src/runtime/pwa.ts)
and [compatibility tests](../../../test/compatibility.ts) cover distinct identities,
launch/hash routes and Chromium desktop install/launch through native PWA APIs.
Offline manager startup and installed-app reopening are separate from OS install.
[Mobile tests](../../../test/mobile.ts) use mobile-sized browser contexts for layout,
opener and denied-storage behavior; [their receipt](../../../results/mobile.json)
is not real-device evidence. Firefox desktop PWA installation, WebKit and real
mobile installation remain unqualified. General application updates remain deferred.

## Reuse candidates and decisions still needed

Reuse candidates include React/Tailwind manager components and styles, catalog,
URL-list parser and declaration importer, admission validation/digests, resource
metadata/body storage, manifest adaptation, publisher archives/lists, static
build/deployment scripts, tests and historical receipts. Inspect them against
the new boundary before adopting them. Current native-method captures, rewritten
scripts, iframe compiler, object wrappers, worker guards and publisher executor
protocols encode the old architecture; retaining them is not required. The
[source map](../../../IMPLEMENTATION.md) identifies these ownership boundaries.

The architecture work still needs to resolve:

1. Which original app versions/resources define reproducible support, and which
   additional local workflows qualify each app beyond historical selected tasks?
   Record optional unsupported features explicitly rather than shrinking the target.
2. Which DOM/layout/rendering, WebGL, audio and file APIs those versions actually
   call, including dynamically selected code, and how their objects cross the
   Wasm-engine boundary without losing identity, synchronous events or lifetime?
3. How guest Wasm, workers, shared workers, worklets and mediated publisher workers
   execute and share/transfer memory while inheriting the same confinement policy?
4. How the static host delivers offline/PWA behavior while preventing private-input
   control over host service-worker maintenance and other browser network effects?
5. Whether 100 MiB/1,000 resources remains the intended product limit, especially
   for diagrams.net's larger optional graph; current receipts cannot answer this
   by demonstrating only one admitted subset.

Completion requires fresh revision-bound application and hostile controls for the
new host, plus independent network observations and separately scoped deployment,
desktop-PWA and real-device checks. Historical receipts supply comparison cases;
they are not verification of the new engine or the starting proof branch.
