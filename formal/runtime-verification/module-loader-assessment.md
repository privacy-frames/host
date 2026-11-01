# Module delivery with an independent native policy

ES Module Shims provides worker support, a custom fetch hook, dependency-graph
loading, dynamic-import rewriting and cycle handling. Its mutable loading records
can select a native HTTP import without consulting the fetch hook. A separate
browser policy can deny that import while allowing the loader's Blob modules.

The [browser experiment](module-loader-browser.ts) uses the unmodified npm release
`es-module-shims@2.8.4`. It verifies the package's pinned SHA-512 integrity before
extracting it under `.tools/`. No dependency is added to the runtime. The
[receipt](module-loader-browser.json) records the distribution-file hash, runner
and launcher hashes, browser versions, native worker URLs and server requests.

## Controls and local policy

Each sample starts in a fresh browser context with a registered service worker.
The fixture embeds the loader in a Blob worker. Its fetch hook accepts six module
URLs and returns local Responses with their logical source URLs. Shim mode is
enabled and native passthrough is disabled. The entry returns `1`, and its loading
record contains a Blob URL. Repeating the load returns `1` without HTTP.

A native graph control loads identical source through HTTP. Both implementations
pass checks for one two-module function cycle, live re-exports, shared state-module
identity, computed dynamic import, import.meta URL/resolution and top-level await.
The native control requests all six source files; the shim uses the local hook.

Two unrestricted controls import a receiver module that returns `2`. One uses
native import directly; the other changes the loader record's Blob URL to the
receiver URL and calls the loader again. Both reach the receiver. The fetch hook
still records only the original entry read. In the forced-age Firefox profile,
both controls also trigger a service-worker update request.

Four restricted cases use a native CSP inserted into the parent document before
Blob-worker creation. It permits Blob scripts and workers, permits the loader's
evaluation operations, and denies HTTP scripts and connections. The fixture
removes the meta element before creating the worker; the inherited policy remains
enforced. Local loading succeeds. A record change, literal HTTP import and
computed HTTP import each reject with a native policy-violation event and no
request at the server.

All eight cases pass in Chromium, Firefox and Firefox with
`dom.serviceWorkers.testUpdateOverOneDay` enabled: 24 observations. All 12
restricted cases produce zero HTTP requests during the operation and three
subsequent seconds. The preference forces the registration age check; these are
not naturally aged profiles. The experiment does not prepare a production realm,
exercise its Trusted Types gate or establish complete confinement.

The [CI receipt](module-loader-browser-ci-policy8.json) separately records all 21
cases in the earlier fixture at revision `23ca1b1`, before the graph comparison was
added. Its twelve restricted cases also have zero HTTP. Its runner hash identifies
that earlier source; it does not certify the expanded fixture.

## Why the bootstrap matters

An [earlier partial comparison](module-loader-http-root-initial.json) used HTTP
worker roots. It observed service-worker update requests after setup, including
during the local-only operation. Its four retained rows and runner hash describe
that earlier fixture. The Blob-root comparison separately measures every request
after a quiet interval. A local module graph alone does not settle bootstrap or
pending-maintenance behavior.

Run `node formal/runtime-verification/module-loader-browser.ts` for the Blob-root
comparison. `PF_MODULE_LOADER_HTTP_ROOT=1` selects HTTP roots for comparison; that
mode records maintenance traffic and does not assert zero HTTP. The runner uses
ephemeral loopback ports and downloads the pinned package before browser testing.

`PF_MODULE_POLICY_PERSISTENT=1` uses a new temporary persistent profile for each
sample and writes `module-loader-browser-persistent.json`. Both modes explicitly
select the bundled full browser executable. Playwright background-service defaults
remain in effect; remote spelling and other browser services need their own
controls. Each temporary profile is removed after its context closes.

The [persistent-profile receipt](module-loader-browser-persistent.json) also
completes all 24 cases, with zero HTTP in its twelve restricted cases. Together
the two profile modes provide 48 observations of this candidate mechanism.

## Implementation implications

The native script policy is the candidate admission boundary. Loader-record
mutation can remain application behavior if it cannot cause a remote effect.
Reviewed upstream
[core.js](https://github.com/guybedford/es-module-shims/blob/dad483741836825d11568c97bb79b3bd1b1e38b2/src/core.js)
publishes the mutable registry as `importShim._r`, reuses existing records and
passes their selected `b` field to native dynamic import. Its
[environment module](https://github.com/guybedford/es-module-shims/blob/dad483741836825d11568c97bb79b3bd1b1e38b2/src/env.js)
defines native import and the configurable fetch hook. This source review is
pinned separately from the published distribution exercised by the fixture.

Production integration must supply local script bytes, establish the native
policy before application execution and preserve it in every child context.
Window scripts, inline modules, classic dynamic imports, eval-generated imports
and module workers need separate compatibility checks. Module identity, cycles,
live bindings, import attributes, import.meta and top-level await also need
validation against native execution. Other resource types and communication
mechanisms remain C4 obligations.
