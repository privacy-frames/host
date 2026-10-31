# Local bootstrap and unregistration experiments

Changing the worker bootstrap URL to a Blob would close the observed initial
worker-load trigger. It would leave other update triggers in the tested browsers.
These experiments compare browser mechanisms before changing the runtime.

Run `node formal/runtime-verification/maintenance-backends.ts` for registered
service workers. Run the same command with `PF_MAINTENANCE_UNREGISTER=1` for
unregistration before the operation. Each sample uses a fresh browser context,
an owned HTTP server, and a measured three-second quiet interval after setup.
Operations must complete successfully. The server records every HTTP request
for three seconds after completion, including requests for fixed trusted URLs.
Known positive triggers use up to three fresh samples. Every omission is
recorded; a group without a positive observation fails. Unexpected traffic in
a quiet case also fails. This accounts for observed update-check omissions
without assuming deterministic delivery.

The runner removes the old receipt before starting and retains partial rows,
failure and `completed: false` if the comparison fails. Receipts pin the runner,
browser launcher and package lock as well as the browser version.

## Registered workers

The [registered receipt](maintenance-backends.json) records the eleven operation
groups for each browser profile, including any repeated positive-control samples:

| Operation                                  | Chromium      | Firefox       | Firefox forced stale |
| ------------------------------------------ | ------------- | ------------- | -------------------- |
| Idle or message-only request               | None observed | None observed | None observed        |
| Classic or module HTTP worker              | Update        | Update        | Update               |
| Classic or module Blob worker              | None observed | None observed | None observed        |
| Cached fetch, including from a Blob worker | None observed | None observed | Update               |
| `srcdoc` or Blob iframe                    | None observed | Update        | Update               |
| Locally supplied HTTP iframe               | Update        | Update        | Update               |

“Update” means that the HTTP server received `/sw.js`; it does not mean the
application resource fell back to the network. The resource response was local.

The stale profile explicitly enables Firefox's
`dom.serviceWorkers.testUpdateOverOneDay` testing preference. A
[pinned Gecko source reference](https://github.com/mozilla/gecko-dev/blob/a212459d6295a4be914c1c2376453002435e91d4/dom/serviceworkers/ServiceWorkerRegistrationInfo.cpp#L427)
shows that this preference makes the age check return true. This is a controlled
age-check experiment, not a naturally aged profile or a claim that the tested
Firefox binary was built from that source revision. Its paired fresh-profile
fetch and idle controls distinguish the tested behavior.

## Unregistered workers

The standard's
[unregister operation](https://w3c.github.io/ServiceWorker/#navigator-service-worker-unregister)
allows existing clients to remain controlled after removal of the registration.
That suggests suppressing updates while retaining local delivery. The
[unregistered receipt](maintenance-unregistered.json) tests this candidate.

The existing page retains its controller and local fetch/message delivery.
New native HTTP classic workers, module workers and frames reach the server in
both browsers after unregistration. The receiver returns `network-ready` or
`Network frame`, whereas intercepted responses return `ready` or `Local frame`.
Retaining the parent's controller does not establish interception of the new
context's bootstrap request.

A newly created Blob worker in Firefox also sends its later resource request to
the server. The distinctive `network-cached` response differs from the locally
intercepted `cached` response. Chromium retains interception for this Blob-worker
case.

## Implications for the implementation

Keep both candidates out of production until their remaining obligations are
resolved. A worker-only Blob change leaves document and stale-resource triggers.
Unregistration can remove the interception on which a new context relies.
The [queue-fence experiment](registration-fence.md) addresses ordering of selected
same-scope jobs. Even if that boundary is established, these delivery failures
must be resolved before unregistration can form part of the launch protocol.

A message-based local resource broker is a candidate for further investigation:
the tested message-only operations produce no update request, including with the
forced-stale check. Its proof would need to establish private channel ownership,
resource admission, preparation before application execution, and the absence of
native HTTP loading in every supported context. These native experiments do not
establish those implementation properties.
