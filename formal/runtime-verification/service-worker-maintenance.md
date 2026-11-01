# Application-triggered service-worker update checks

Policy 6 allowed application-dependent update requests when creating an HTTP
worker, although the host supplied the worker's response from its local cache.
The [archived receipt](service-worker-maintenance-policy6.json) records sixteen
samples with native and confined updates in both browsers. Whether the request
occurred depended on a private input bit; its fixed URL did not prevent disclosure.
The [historical runner](https://github.com/privacy-frames/host/blob/d545180d1b5cf5d28427796d23aef17ee612291c/formal/runtime-verification/service-worker-maintenance.ts)
matches the runner hash in that receipt.

The policy-7 [local startup candidate](local-worker-startup.md) removes the HTTP
bootstrap. Its [archived receipt](service-worker-maintenance-policy7.json) records 32 samples:
classic and module workers with dependencies, native and confined execution,
Chromium and Firefox, and two worker/no-worker pairs per group. Every confined
sample produced zero HTTP requests at either receiver. Each native group produced
two update requests across its two worker samples, with quiet no-worker controls.

## Running the regression

Build the host with `npm run build`, then run
`node formal/runtime-verification/service-worker-maintenance.ts`. The fixture uses
owned loopback HTTP servers and the built manager, installer and runtime. It does
not recover native constructors or execute publisher code during installation.

The application has a private-bit input, worker-type selector and button. Clicking
the button creates a worker only for bit `1`. The current fixture covers classic
`importScripts`, dynamic import from a classic worker, and static import from a
module worker. Each reports readiness. Installation uses
an explicit resource list. Native controls use the same application and a native
service worker that supplies all worker scripts and dependencies locally.

Every sample gets a fresh browser context. After application initialization, the
fixture requires three seconds without observed traffic, followed by another
idle interval. It then enters the bit, clicks the button and waits for readiness
or the no-worker response. It records every HTTP request during the action and
three subsequent seconds. The input order reverses in the second pair.
One worker sample terminates after readiness; the other retains its worker
through observation. Each sample records that lifetime explicitly.

Every confined sample must have zero runtime and publisher requests. Native
scheduling can suppress an individual update, so each native group must contain
at least one positive update observation. A missing native control fails the
check. Missing native controls and forbidden HTTP observations are collected
across the completed groups before the final assertion. Samples, groups and the failure reason survive partial runs;
`completed: false` cannot establish a successful regression.

The receipt records browser versions, source/build hashes, idle controls and
server observations. Source, runner and artifact hashes must remain stable during
the run. These are local HTTP measurements, not deployed HTTPS or mobile results.

## Why the bootstrap changed

The earlier factory started a native worker at a runtime HTTP URL. Fetch classifies
worker script loads as
[non-subresource requests](https://fetch.spec.whatwg.org/#non-subresource-request).
The Service Workers
[fetch-event algorithm](https://w3c.github.io/ServiceWorker/#create-fetch-event-and-dispatch)
can schedule an update even when its fetch handler supplies the response. The
[update algorithm](https://w3c.github.io/ServiceWorker/#update-algorithm) bypasses
service-worker interception when fetching the controlling script.

The new factory supplies a local Blob guard through its private native URL gate.
Native-client binding and metadata arrive through the private parent channel.
Application preparation still precedes entry loading. The separately published
dedicated guard and its HTTP bootstrap handler are removed.

## Forced aged-registration comparison

Run the same fixture with `PF_STARTUP_STALE=1` to exercise Firefox's
`dom.serviceWorkers.testUpdateOverOneDay` preference. This selects the browser's
aged-registration update check; it does not reproduce a naturally aged profile.
The output is `service-worker-startup-stale.json`, separate from the fresh run.
Native positive controls and the zero-HTTP confined expectation remain enabled.

The archived
[policy-7 receipt](service-worker-startup-stale-policy7.json) records a confined
classic startup update. The policy-8 local classic entry/importScripts candidate
then passes its selected classic cases, but module startup still reaches the
runtime service-worker script. The
[initial policy-8 receipt](service-worker-startup-stale-policy8-initial.json)
preserves that failure with its exact source and artifact hashes. The current
[forced-age output](service-worker-startup-stale.json) also tests dynamic import
from a classic worker. A run with forbidden HTTP cannot pass the release gate.

The frozen policy-8 candidate records 48 fresh-registration samples without HTTP.
Each of its six native groups demonstrates two worker-triggered updates. The
forced-age comparison retains all 24 samples and fails on four confined
operations: both classic-dynamic worker samples and both module-worker samples
reach `/runtime/sw.js`. The classic `importScripts` cases remain quiet. The
[candidate validation](local-classic-script-validation.json) binds those results,
the full suite and the eight-app comparison to stable source and build hashes.

## Missing controls in later runs

The [CI comparison at revision 23ca1b1](ci-startup-policy8.json) stopped after twelve
samples because neither Chromium classic-dynamic native sample produced an update.
Its forced-age step was skipped. The uploaded forced-age JSON was an older
checked-in receipt, not a result of that CI job. The current workflow removes
historical receipts before setup and runs the forced-age step independently.

A [local retained-worker comparison](service-worker-maintenance-policy8-retained-initial.json)
also missed both Chromium classic native updates and stopped after four samples.
Retaining workers did not establish a reliable control. The current comparison
records both lifetimes and collects all groups; a missing native control still
fails the check. The [later forced-age receipt](service-worker-startup-stale-policy8-fragments.json)
retains all 24 observations and four HTTP violations for the fragment-patch source.

## Remaining scope

This regression covers fresh registrations and the selected classic/module
graphs. It does not establish behavior after arbitrary registration ages,
replacement, or pending browser work. Shared/publisher startup, document creation,
worklets and other HTTP resource paths need separate arguments. The
[backend comparisons](maintenance-backends.md) found additional update triggers
in native fixtures, including forced-stale Firefox cases; those fixtures do not
implement the new admission protocol. Complete C4 coverage remains open.
