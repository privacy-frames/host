# Application-triggered service-worker update checks

The confined runtime can cause a network request when an application creates a
dedicated worker, even though the worker bootstrap is supplied locally. This
violates the current contract's prohibition on application-caused remote effects.
The destination and URL need not contain private bytes: whether a request occurs
can depend on private input.

## Reproduction

Build the host with `npm run build`, then run
`node formal/runtime-verification/service-worker-maintenance.ts`. The test uses
owned loopback HTTP servers and the actual built manager, installer and runtime.
It does not change guards, recover native constructors, execute publisher code
during installation, or contact third-party servers.

The installed application has an input and a button. After confinement starts,
the test enters a private bit. On a button click, the application creates an
ordinary worker only when that bit is `1`. Its worker returns a local readiness
message. The publisher supplies an explicit resource list for the worker; its
resources remain unchanged between cases.

Each case has a fresh browser context. The fixture waits for three seconds with
no server-observed traffic, then checks another idle interval before entering the
bit. It records all HTTP requests during the action and three subsequent seconds.
Two rounds reverse the input order. Native controls use the same application with
a service worker that supplies the worker script locally.

The checker requires no update request in either no-worker sample and at least
one update request across the two worker samples for each browser/profile pair.
It records individual omissions rather than requiring deterministic delivery.
CI run `41206920356` observed an update in one native Chromium worker sample and
none in the other; the former per-sample assertion rejected that run. The test
still fails when a group supplies no positive observation. CI run
[41232154107](https://github.com/privacy-frames/host/actions/runs/41232154107)
observed no update in either native Chromium worker sample and stopped at that
assertion. This is missing positive evidence, not a confinement result.

The runner now saves partial samples, completed groups and the failure reason
before cleanup when an observation check fails. Such a receipt has
`completed: false` and no completion timestamp. CI uploads this observation when
the probe actually ran, including on failure. A saved partial receipt does not
satisfy the missing control.

The [receipt](service-worker-maintenance.json) records Chromium and Firefox
versions, source and build provenance, idle controls and server observations.
These are local HTTP experiments, not deployed HTTPS measurements. The observation
window and repetitions do not establish a reliable channel capacity or exhaustive
browser behavior.

## Mechanism

Fetch classifies worker script requests as
[non-subresource requests](https://fetch.spec.whatwg.org/#non-subresource-request).
The Service Workers
[fetch-event algorithm](https://w3c.github.io/ServiceWorker/#create-fetch-event-and-dispatch)
schedules a soft update for this request class even when the fetch handler supplies
the response. The
[update algorithm](https://w3c.github.io/ServiceWorker/#update-algorithm) fetches
service-worker scripts with service-worker interception disabled.

Our bridge registers the trusted worker with `updateViaCache: 'none'`.
`createWorkerFactory` starts a native worker at an admitted runtime HTTP bootstrap
URL. Supplying that bootstrap locally therefore does not prevent the separate
browser update request. Denying the application's registration and update methods
does not prevent this browser-owned operation.

## Consequences for verification

C4 remains unsatisfied by this implementation. Earlier payload-marker tests do
not discharge this obligation because the observed URL is the fixed trusted
service-worker script. The finding needs no retained identity-provider state or
24-hour-old registration.

A candidate repair is to avoid native HTTP worker bootstrap loads by constructing
prepared workers from local Blob resources. That would address this trigger only
if the implementation preserves preparation and authority checks. A complete
repair must also cover shared workers, document creation, later resource fetches
and stale-registration behavior. The
[backend comparison](maintenance-backends.md) finds document-update triggers in
Firefox and cached-fetch updates with a forced stale check. It also shows loss of
new-worker interception after unregistering. Neither candidate is a complete repair.

Keep the complete confinement claim open. A change to caching headers, rate
limits or a trusted server that discards requests would not establish the current
no-request property.
