# Worker resource reads through parent channels

Dedicated-worker `fetch()` and cache downloads now use the same local Response
adapter as windows. A prepared worker sends the read over its private parent port.
Each parent prepends its factory-created child ID; the controller starts from the
actual native sender and checks every parent/client binding, application,
installation generation and policy version in that path. Packet assertions of
identity provide no authority.

The controller uses the existing context-resource resolver for worker-scoped URLs,
passing the verified worker client ID. Ordinary installation URLs use the existing
resource reader, including publisher handling and CSS relocation. It buffers the
response body, then revalidates the ancestor chain and installation generation.
The parent also refuses a reply if its local factory has closed that child. A
missing resource, failed reader or invalid binding produces a local error.

The guard installs the adapter before application execution. It preserves the
shared adapter's GET Request handling, response URL/type across clones, binary
bodies, Wasm streaming, abort behavior and native integrity checks against a local
Blob. Bodies remain buffered and bounded to 100 MiB. This does not establish full
Fetch API equivalence; the [shared adapter contracts](resource-fetch.md) describe
its remaining semantic differences and proof obligations.

Shared-worker and publisher roots retain an explicit HTTP transport through the
existing worker-only control endpoint. That endpoint now accepts resource reads
and returns their buffered response as binary data. Dedicated descendants relay
through their owning root, so a descendant of a shared/publisher worker still
uses that root's HTTP transport. A private-channel failure never retries over HTTP.
No new HTTP route was added.

## Native observations

Run `npm run build`, then:

```sh
node formal/runtime-verification/resource-fetch-browser.ts
PF_RESOURCE_CONTEXT=worker node formal/runtime-verification/resource-fetch-browser.ts
```

The shared runner records fourteen window cases and fourteen dedicated-worker
cases: native local-response controls, confined reads and an actual adapter-bypass
fault, across Chromium, Firefox and forced-stale Firefox. Each worker is prepared
and warmed before the private-input interval. Both independent servers must be
quiet before the operation and observe the operation plus three subsequent
seconds. This interval excludes the worker's HTTP bootstrap.

In the worker cases, a private bit chooses between no read and concurrent local
resource reads. Matching and mismatching integrity metadata, binary bytes, Wasm,
cloning and cancellation have explicit result assertions. Forced-stale Firefox
sends a service-worker script request in the native and adapter-bypass read cases;
the corresponding confined reads produce no HTTP. The fault removes the actual
`fetchResource` property from the worker realm's resource adapter. Production
source files remain unchanged during the fault experiment.

Chromium also repeats the worker reads after a native controller stop/restart.
CDP must report stopped, then running after the reads. A unique blocked-resource
observation in the production controller's module-local event history must
vanish. Both observed histories remain below the 300-entry cap, excluding history
eviction as the reason for that loss. The same worker then returns the expected
resource values without HTTP. No equivalent Firefox termination control is
established. The receipt records transitions, history sizes and receiver traffic.

The [worker receipt](worker-resource-fetch-browser.json) retains partial results
on failure and hashes its runner, restart helper, selected guard source, fault
bundle and build. The [window receipt](resource-fetch-browser.json) checks the
same server path for ordinary window reads. The native integration suite also
checks a positive JSON read across four worker hops, including three nested
worker levels. Its explicit
resource list includes the JSON input; the runtime does not discover it by
executing the application.

The [candidate validation record](worker-resource-validation.json) ties 184 unit
checks, the context suite, nine worker-authorization samples, four startup
schedules and the independent host/network checks to the frozen build. The
[application comparison](worker-resource-compatibility.json) records all eight
unchanged applications completing their selected tasks and offline reloads in
both browsers.

## Remaining obligations

Ancestor checks are sequential observations, not one atomic tree snapshot. Caller
ownership, private-channel secrecy, asynchronous grant points and implementation
refinement still require proofs. The unit cases exercise controlled closure and
replacement during a reader action; they do not establish arbitrary schedules.

Worker script bootstraps, native module/importScripts loads, XHR, DOM/CSS loading
and shared/publisher root HTTP remain outside this repair. Their browser
maintenance behavior still prevents the complete C4 claim. Registration lifetime,
local bootstrap delivery and browser-effect coverage remain separate work.
