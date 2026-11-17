# Application dependencies on service workers

Research date: 17 November 2026. This is a publisher-source audit, not a runtime
qualification. No application, browser or paused lifetime experiment was executed.

## Finding

Excluding application service-worker execution does not establish compatibility
by itself. Notebook, Excalidraw, Pitch Training and diagrams.net have source paths
that continue without successful registration. StackEdit starts its editor
independently but leaves a rejected registration promise. Squoosh calls the API
without feature detection in asynchronous side work; its image-processing startup
is separate. The ordinary fixture requires registration, readiness and a generated
worker response before completing initialization. The evidence for each conclusion
and its revision limits appears below.

The first fork still has to support the existing applications and preserve their
useful local behavior. The [scope decision](../../../.scratch/wasm-runtime/issues/09-application-service-worker-scope.md)
excludes publisher registration/execution/lifecycle/fetch interception while
retaining the trusted host worker, standard manifests and host offline resources.
It does not select API absence, rejected registration or a successful stub. This
report does not select one either. None of the inspected sources justifies a
fake successful registration: some code awaits readiness, reads active workers,
posts messages or requests worker-generated content.

## Sources and reproducibility

The host catalog is [deployment/config.json](../../../deployment/config.json) at
host `e92eb2566b0aebc7f13416ec6af7b6737ba840eb`. The baseline application and receipt
audit is [current-demo-contract.md](https://github.com/privacy-frames/host/blob/3a6876a02bc3bc49b88b6de08f8ca9f291b413ff/docs/research/wasm-runtime/current-demo-contract.md).
The maintained publisher checkout was read without modification at
`b8637f0dc5b5e56ae0b6397fdae8501598b7d39e`. Its
[archive lock](https://github.com/privacy-frames/apps/blob/b8637f0dc5b5e56ae0b6397fdae8501598b7d39e/mirrors/lock.json)
and [build source](https://github.com/privacy-frames/apps/blob/b8637f0dc5b5e56ae0b6397fdae8501598b7d39e/scripts/build.ts)
identify the archived inputs and the existing URL relocation used by the mirrors.
All four archives were downloaded and SHA256-verified against that lock before
inspection. This research did not rebuild or modify a publisher.

| Archived input                                                                                                               | SHA256                                                             | Source paths inspected inside archive                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [Squoosh](https://github.com/privacy-frames/apps/releases/download/snapshots-2026-10-27/squoosh-snapshot.tar.gz)             | `1b51595497144a8fe0a96727ed8d2c7fce2b92586003afbb56da3a8df400e20b` | `index.html`, `c/initial-app-af47d7fe.js`, `c/Compress-5b50107e.js`, `c/sw-bridge-ceda69b8.js`, `serviceworker.js` |
| [Excalidraw](https://github.com/privacy-frames/apps/releases/download/snapshots-2026-10-27/excalidraw-snapshot.tar.gz)       | `9cd3de2cf2f3931dc4b56ab4317932d21dcad6c3a1b4618709f3abfbbf86bb4c` | `assets/index-BboF1hDf.js`, `assets/workbox-window.prod.es5-B9K5rw8f.js`, `sw.js`                                  |
| [StackEdit](https://github.com/privacy-frames/apps/releases/download/snapshots-2026-10-27/stackedit-snapshot-notices.tar.gz) | `2e0b12d6e83c154506093d22b0646ff3777c888751db8ecd531d282f1c54954d` | `static/js/app.4a860d498cf8c210e5e8.js`, `static/js/vendor.bc2ba2c5746645190c07.js`, `sw.js`                       |
| [diagrams.net](https://github.com/privacy-frames/apps/releases/download/snapshots-2026-10-27/drawio-snapshot.tar.gz)         | `18ba8a2f6af92d432404b3490b1894ce909c3573655784e9984dfd16f1d4c170` | `js/app.min.js`, `js/diagramly/{App,Editor,EditorUi,Menus}.js`, `service-worker.js`                                |

Local cached publisher/test sources were checked first. The original host
worktree contained maintained example sources/builds and inventory records, but
not the mirror archives. A local PhotoCraft publisher copy was available; the
external Pitch Training and CyberChef builds required separate source checks.
Their evidence limits are recorded in their application entries. Download success
from Python is not evidence of a CORS-readable browser install. No current CORS,
live deployment equivalence or confinement claim follows from this audit.

## Catalog applications

### Notebook

[Notebook app source](https://github.com/privacy-frames/apps/blob/b8637f0dc5b5e56ae0b6397fdae8501598b7d39e/examples/notes/app.tsx)
starts the article fetch, then calls
`navigator.serviceWorker?.register('./sw.js').catch(() => {})` in a React effect.
Absence short-circuits; rejected registration is swallowed. Note editing, word
count and localStorage saving do not depend on registration. The article and
illustration are ordinary admitted resources. Its
[worker](https://github.com/privacy-frames/apps/blob/b8637f0dc5b5e56ae0b6397fdae8501598b7d39e/examples/notes/sw.ts)
precaches the shell/article/image, claims clients and serves cache-first with a
fetch fallback. It does not generate a required application response. Source
therefore supports treating this worker as optional publisher offline setup,
provided the host independently supplies those resources offline.

### Excalidraw

In the locked archive's main bundle, `Tae` checks
`'serviceWorker' in navigator` before loading Workbox. It catches Workbox import
and registration errors through an optional callback. The entry calls `Tae()`
and immediately renders the React application; it does not await registration.
API absence skips setup; rejected registration is caught. The worker precaches
assets, provides navigation fallback to `index.html`, and caches fonts, locales
and selected chunks. Those files still require host admission and URL handling
when the publisher worker is absent. Sources: the Excalidraw archive above,
main-bundle `Tae` and final `pGe.render` call; `sw.js` route declarations.

There is a separate CacheStorage path: the drawing component's
`restoreFileFromShare` reads `web-share-target` / `shared-file`, consumes it and
loads a file. It is selected by the `web-share-target` query parameter. Ordinary
scene initialization takes the other branch. The inspected `sw.js` has no matching
share-target producer. This audit establishes the consumer's dependency, not that
OS sharing worked in the archived deployment. Retaining manifests alone cannot
populate that cache.

### StackEdit

The locked vendor bundle's offline-plugin `install` checks
`'serviceWorker' in navigator` and HTTPS/localhost before registration. Without the
API it may try legacy `applicationCache` if that browser object exists. With the
API present it calls `register('/sw.js', {})`. Its rejection handler invokes an
optional `onError`, then returns `Promise.reject(error)`; the chain is not returned
to the caller. Thus rejected registration can produce an unhandled rejection.
It does not synchronously abort the caller or gate editor initialization.
The main bundle calls `install` with update callbacks and continues initialization;
its explicit browser prerequisite here is IndexedDB. Sources: StackEdit archive,
vendor `function n(){return"serviceWorker"in navigator...}` and app module
containing `l.install({onUpdateReady:...})`.

The worker's `__wpo` asset list and offline-plugin implementation cache the static
shell, fonts and `/app` route. Application documents are handled by the page's
IndexedDB/localStorage logic, rather than a worker-generated startup response.
Publisher updates and their reload notifications disappear with the worker;
local editing/preview has no inspected dependency on successful registration.
The legacy AppCache fallback is not a requirement inferred for the new host.

### Squoosh

The locked build does **not** guard its bridge calls with an availability check.
`offliner` calls `navigator.serviceWorker.register`, inspects `controller`, installs
a controller-change listener and may inspect registration/update state.
`mainAppLoaded` stores a `user-interacted` flag in IndexedDB and calls
`getRegistration` to send `cache-all`. API absence makes these async functions
reject. `offliner` also does not await or catch the registration promise, so
rejection can remain unhandled. A host with only a rejecting `register` method
would still fail subsequent missing `controller`, event or registration APIs.
Sources: Squoosh archive, `c/sw-bridge-ceda69b8.js`.

The main app constructs image-editor state and loads `Compress` separately from
the bridge promise. It invokes `offliner` without awaiting it; the compressor
queues its initial image update before invoking `mainAppLoaded` asynchronously.
The inspected startup therefore does not await successful registration for local
image selection/encoding. Whether the resulting errors affect a particular guest
engine's event loop or UI requires runtime testing. Source does not establish a
clean error-free unsupported path. Sources: `c/initial-app-af47d7fe.js` constructor,
its inline copy in `index.html`, and `c/Compress-5b50107e.js` constructor.

The `?share-target` route is different: it awaits a worker message containing the
shared file. `getSharedImage` installs a message listener and posts `share-ready`
to the controller. The worker intercepts a form POST, redirects to that route,
waits for readiness and posts the uploaded file to the resulting client. This
flow cannot be supplied by a static manifest or a successful registration stub.
The worker also redirects `/editor` to `/`, precaches the shell and selected
codec resources, and caches demo images. The host must supply admitted codec
assets directly; publisher precaching is not their only loader. Sources:
`serviceworker.js` functions `ie`, `ce`, install/fetch/message listeners and
`sw-bridge-ceda69b8.js` `getSharedImage`.

### diagrams.net

The catalog URL includes `?offline=1`. In the locked archive,
`Editor.enableServiceWorker` requires `'serviceWorker' in navigator`, `pwa != 0`
and either that offline flag, an explicit enable flag or a publisher hostname.
It catches inaccessible service-worker property access. With the API absent,
the service-worker branch is disabled even though `offline=1` remains in effect.
`App.main` launches registration/update work separately from later `new App(new
Editor(...))`. Registration rejection is logged through
`App.logServiceWorkerError`; it is not awaited as an editor prerequisite. A first
load can explicitly skip registration depending on settings/channel state.
Sources: diagrams.net archive, `js/diagramly/Editor.js` enable condition,
`App.js` `App.main` (registration around line 1072; UI creation around line 1414),
and the corresponding code in the deployed `js/app.min.js`.

This does remove publisher-specific features. The language menu tracks
`serviceWorker.ready` to expose its offline management dialog. Warming a language
bundle posts `warmLazy` to an active worker, with a timeout/fallback callback.
Page code separately enumerates/deletes `workbox-precache-v2` caches to report or
remove offline languages. The worker fetch handler serves precached/lazy assets
and has caching/failure metadata responses. None is an inspected prerequisite to
opening the editor, but host resource capture must include languages/stencils
actually used. API absence does not grant otherwise unavailable resources.
Sources: `js/diagramly/Menus.js`, `EditorUi.js` offline-language methods,
`service-worker.js` fetch and `warmLazy` handlers. The full static mirror remains
larger than the existing admission limit; see
[publisher packaging](../../../evaluation/publisher-packaging.md).

### Pitch Training

The recorded demonstration used `assets/index-BvkNtD_8.js`, SHA256
`19f36372a1f4b908dc9a2be95089409d701cba17061d5624a325873bfc6ac717`,
according to [the deployed receipt](../../../results/pitch-training-deployed.json)
and the publisher's
[inventory](https://github.com/privacy-frames/apps/blob/b8637f0dc5b5e56ae0b6397fdae8501598b7d39e/mirrors/pitch-training-inventory.json).
That URL returned HTTP 404 during this audit. Its exact released bytes were not
recovered. The publisher repository's pre-30-October commit
`2a3cd73c9190165ee0496e1591afcda135a5e6b0` supplies the relevant source, without
proving a build-to-receipt identity.

At that source revision,
[prepareOffline](https://github.com/DamenH/pitch-training/blob/2a3cd73c9190165ee0496e1591afcda135a5e6b0/src/lib/pwa.svelte.ts)
returns with status `unavailable` when the API is absent or the context insecure.
Registration and `ready` are inside a try/catch; rejection sets status `error`.
`initializePwa` calls it without awaiting it, and
[main.ts](https://github.com/DamenH/pitch-training/blob/2a3cd73c9190165ee0496e1591afcda135a5e6b0/src/main.ts)
continues to mount the app. The
[install component](https://github.com/DamenH/pitch-training/blob/2a3cd73c9190165ee0496e1591afcda135a5e6b0/src/components/InstallApp.svelte)
uses that state for offline/install/update feedback. It is not a global exercise
startup gate. Publisher update/reload requires a real registration and active
worker; an unsupported contract cannot truthfully report publisher offline readiness.

The current live [entry](https://damenh.github.io/pitch-training/) references a
different [bundle](https://damenh.github.io/pitch-training/assets/index-jS8dkhmw.js),
SHA256 `5bf9a6fd27798274c5a5c03473a66ee96ecc6bfe8bd4c04c78ac1c93d55ca5ff`.
It independently contains the same availability/catch/non-awaited initialization
pattern. The live [worker](https://damenh.github.io/pitch-training/sw.js), SHA256
`b746b504b2fcdc1ad5ca33cdc7e2de673509e58da31a4e0e14c3eb7aa462f058`, precaches
shell/piano resources and intercepts share-target POSTs. It stores shared files in
`pitch-training-share` and redirects to Import; the
[page consumer](https://github.com/DamenH/pitch-training/blob/2a3cd73c9190165ee0496e1591afcda135a5e6b0/src/lib/incoming.svelte.ts)
reads that cache separately from the file-handler launch route. Host-managed
offline resources can replace shell caching, but they do not implement that POST
handoff. These current bytes are not a requalification of the historical build.

### PhotoCraft, CyberChef and Wikipedia

The cached PhotoCraft publisher HTML starts Wasm through its generated JS glue.
Neither HTML nor glue contains service-worker registration or CacheStorage calls;
the Wasm binary also has no `serviceWorker`, `service-worker` or `caches` literal.
This is evidence of no discovered dependency, not proof against dynamically
constructed calls. The inspected local files match the published filenames in the
[resource list](https://github.com/privacy-frames/apps/blob/b8637f0dc5b5e56ae0b6397fdae8501598b7d39e/examples/resource-lists/photocraft.uris):
HTML SHA256 `6574d32a360d7928d160d86e39d0617310374325692d054b2c7e15fc52465c93`,
JS `9d0cd08076224bfac6cf21b6e4bc68b2e4edd2492ecaeaff8d2a84ec0e23b8a4`,
Wasm `ba4f823d2d2f913411cdd272be71dad9ce9b5182bc3b038597502ca395ecc003`.
The local copy was inspected read-only. It does not resolve the baseline's live
HTTP 403/CORS limitation or prove equivalence to its historical capture.

The live [CyberChef entry](https://gchq.github.io/CyberChef/) and
[main bundle](https://gchq.github.io/CyberChef/assets/main.js) contained no
`serviceWorker`, `service-worker` or `caches.` occurrence. Their SHA256 values were
`cd72b0946ab5b47d96f5a2c250474c9a2f46b59642891c08a75005436f230517` and
`5e43b84f72923b34c776606bb0a1fbb7321a296b5589cebe507f8e4c31e81717`.
This covers the entry/main source search, not every lazy recipe/worker or the
unrecovered historical release. The publisher
[resource list](https://github.com/privacy-frames/apps/blob/b8637f0dc5b5e56ae0b6397fdae8501598b7d39e/examples/resource-lists/cyberchef.uris)
includes ordinary application workers; those remain in scope.

The Wikipedia catalog item is the captured
[HTML endpoint](https://en.wikipedia.org/w/rest.php/v1/page/Albert_Einstein/html),
not the interactive Wikipedia website shell. Its established task is rendering,
scrolling and local fragment navigation, as recorded in the baseline contract.
No new byte-level capture or service-worker qualification was performed here.

## Other visible examples and the required fixture exception

The maintained
[Hostile app](https://github.com/privacy-frames/apps/blob/b8637f0dc5b5e56ae0b6397fdae8501598b7d39e/examples/adversary/app.ts)
invokes service-worker registration as an explicit authority probe. Its per-probe
try/catch records either synchronous failure or promise rejection. Its UI does
not require a successful registration. Absence and rejection can both be observed
as failure, but neither observation alone proves confinement. The
[Code playground](https://github.com/privacy-frames/apps/blob/b8637f0dc5b5e56ae0b6397fdae8501598b7d39e/examples/playground/app.ts)
has no service-worker startup path in its supplied app source; users can still
type code that probes the unsupported API.

The non-catalog
[ordinary fixture main](https://github.com/privacy-frames/apps/blob/b8637f0dc5b5e56ae0b6397fdae8501598b7d39e/examples/ordinary/main.ts)
has an unconditional top-level await of registration, then `ready`, then a fetch
of `/phase.json`. Only afterward does it update the phase text and attach the
disclosure-test click handler. Absence throws; rejected registration rejects
module evaluation; a fake registration plus unresolved readiness hangs. Its
[worker](https://github.com/privacy-frames/apps/blob/b8637f0dc5b5e56ae0b6397fdae8501598b7d39e/examples/ordinary/sw.ts)
creates a JSON response in CacheStorage during install and serves it through
fetch interception. CacheStorage availability alone does not create or route that
response. Even a successful stub with a fabricated active state would fail the
resource dependency. This fixture's previous success expectation conflicts with
the explicit exclusion; record it as an unsupported publisher-worker acceptance
case for this release. Do not patch the publisher or synthesize its receipt.

## Consequences for the first release

API absence and rejected registration require different checks. Absence should
include property detection (`'serviceWorker' in navigator`), optional chaining,
direct property use and property access that throws. A present-but-undefined
property passes an `in` test and then fails a method call. A rejected-registration
profile also has to define the rest of the visible container: event listeners,
controller, registration enumeration and readiness are used by these publishers.
The exact unsupported contract remains a host decision.

Host offline delivery must resolve the admitted shell, dynamically selected
chunks, fonts, language bundles and codec Wasm without publisher fetch handlers.
It must not fall back to networking when a publisher cache would have done so.
Manifest adaptation and app-scoped CacheStorage remain separate obligations.
Share-target POST handlers, worker messages, publisher updates and offline-language
warming are real lost publisher-worker behaviors; static manifest preservation
does not supply them. The selected historical workflows do not qualify these
optional integration routes.

Later runtime qualification should exercise the actual unsupported contract on
pinned, original publisher bytes: ordinary local startup/edit/import/export,
reload and host offline reopen for every supported application; Squoosh encoding
despite asynchronous errors; StackEdit rejection handling; Pitch status/exercise
interaction; diagrams.net with `offline=1` and missing language assets; and the
ordinary fixture's explicit unsupported result. Test share/import routes
separately from file-picker and OS file-handler paths. Capture unhandled errors,
pending readiness and UI state, alongside independent network observations.
Historical passing matrices cannot answer those questions for a Wasm-engine host.
