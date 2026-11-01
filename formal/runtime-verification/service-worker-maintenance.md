# Application-triggered service-worker update checks

Policy 6 allowed application-dependent update requests when creating an HTTP
worker, although the host supplied the worker's response from its local cache.
The [archived receipt](service-worker-maintenance-policy6.json) records sixteen
samples with native and confined updates in both browsers. Whether the request
occurred depended on a private input bit; its fixed URL did not prevent disclosure.
The [historical runner](https://github.com/privacy-frames/host/blob/d545180d1b5cf5d28427796d23aef17ee612291c/formal/runtime-verification/service-worker-maintenance.ts)
matches the runner hash in that receipt.

The policy-7 [local startup candidate](local-worker-startup.md) removes the HTTP
bootstrap. The new [receipt](service-worker-maintenance.json) records 32 samples:
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
the button creates a worker only for bit `1`. The classic worker imports a script;
the module worker imports an ES module. Both report readiness. Installation uses
an explicit resource list. Native controls use the same application and a native
service worker that supplies all worker scripts and dependencies locally.

Every sample gets a fresh browser context. After application initialization, the
fixture requires three seconds without observed traffic, followed by another
idle interval. It then enters the bit, clicks the button and waits for readiness
or the no-worker response. It records every HTTP request during the action and
three subsequent seconds. The input order reverses in the second pair.

Every confined sample must have zero runtime and publisher requests. Native
scheduling can suppress an individual update, so each native group must contain
at least one positive update observation. A missing native control fails the
check. Samples, completed groups and the failure reason survive partial runs;
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

## Remaining scope

This regression covers fresh registrations and the selected classic/module
graphs. It does not establish behavior after arbitrary registration ages,
replacement, or pending browser work. Shared/publisher startup, document creation,
worklets and other HTTP resource paths need separate arguments. The
[backend comparisons](maintenance-backends.md) found additional update triggers
in native fixtures, including forced-stale Firefox cases; those fixtures do not
implement the new admission protocol. Complete C4 coverage remains open.
