# Local resource reads over controller messages

Window `fetch()` and window cache downloads now read installed resources through
the private controller transport. Native resource loads use the same controller
reader. That reader authenticates the browser client, selects an exact resource
from its installation, and checks its authority and installation generation after
asynchronous resource and publisher work. A failed read never tries the network.
Generated manifests and captured manifest icons use one public-resource reader
for native browser loads and authenticated message reads.

The change removes the second copy of resource selection, publisher interception
and CSS relocation from the HTTP handler. Application code and resource lists
remain unchanged. Worker fetches, scripts, styles, images, document bootstraps and
other native loads still use HTTP routes; their maintenance behavior remains
part of the unfinished repair.

Trusted document, popup, worker and worklet factories capture their control
operation before application-facing adapters are installed. Their registration
and closure requests still use their existing HTTP protocols. Routing those
operations through the resource adapter would reject them as unadmitted GETs;
the document integration test caught that dependency during this change.

## Implementation contracts

`resource-broker.ts` owns resource selection and generation checks for both
transports. The message parser validates the URL and header pairs before making
a native Request object. Packet fields cannot select an installation or client.
The controller looks up the actual message source in the browser client table.

The publisher controller receives the same admitted resource and request headers
through either transport. Its existing restrictions on executable responses,
credentials, redirects and response metadata remain in place. CSS responses use
the same relocation function and selected representation headers. Publisher
execution itself still has HTTP startup and resource obligations.

`resource-fetch.ts` uses native Request construction and native Response bodies.
It preserves the recorded response URL and type across clones, forwards request
headers, and rejects cancelled reads. Only admitted GET requests enter the
message reader. Blob and data requests keep native local fetching. Integrity
metadata is checked by native Fetch against a temporary local Blob URL, which is
revoked afterward. This delegates digest parsing and selection to the
[Fetch integrity algorithm](https://fetch.spec.whatwg.org/#main-fetch).

The adapter buffers bodies and bounds message bodies to 100 MiB. Constructor
responses have mutable headers; native Fetch's immutable response-header guard
is not reproduced. Cross-realm metadata access, resource timing and buffering
also need separate treatment before claiming full API equivalence. The captured
native handles, private metadata maps and response validation still need an
ownership and correspondence proof.

The generation checks are asynchronous observations, not one transaction across
the registry and resource database. The proof must identify a grant point and
account for delivery already in flight at revocation. C8 also needs an explicit
argument distinguishing immutable installation inputs from the locally produced
data that the existing publisher-worker profile can return.

## Browser checks

Run `npm run build`, then
`node formal/runtime-verification/resource-fetch-browser.ts`. The runner checks
the ordinary guard's exact bytes and constructs a second guard that bypasses
only the window message-fetch adapter. Other runtime files stay unchanged.

The [receipt](resource-fetch-browser.json) records 14 cases across Chromium,
Firefox and Firefox with its forced-stale service-worker preference. Each case
uses a fresh browser context. After three seconds without receiver traffic,
synthetic private input chooses whether to fetch several fixed local resources.
Independent servers record all HTTP requests during the action and the following
three seconds. The app checks concurrent JSON reads, Request headers, cloned
responses, binary bytes, Wasm streaming, cancellation and matching/mismatching
integrity metadata.

In forced-stale Firefox, the native local-response control and the installed
adapter-bypass control both produce a service-worker script request when reads
occur. Neither produces one in its no-read case. The normal installed adapter
produces no HTTP request in any recorded case. This repairs the selected window
fetch trigger under those conditions. It does not close the separate worker or
document triggers.

Unit tests challenge malformed requests and replies, foreign and missing
resources, generation changes, closure during publisher handling, cancellation,
CSS relocation and native body operations. The browser experiment checks actual
transport behavior; the unit fixtures supply finer scheduling and input control.

The [compatibility receipt](resource-fetch-compatibility.json) records all eight
applications completing their selected native and confined tasks and reloading
offline in Chromium and Firefox. Source and artifact hashes match the tested
candidate. The complete context suite, independent network receiver groups in
both browsers and all 167 unit tests passed locally. The shared-worker fixture
now records both old and new installation identities before comparing them;
the former comparison read absent fields from the old result and was vacuous.
