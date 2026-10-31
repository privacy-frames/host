# EventSource and beacon controls

Run `node formal/eventsource-beacon-probe.ts` after installing Playwright
Chromium and Firefox. The fixture builds the actual window preparation and
response policy. Its independent same-origin HTTP receiver records URLs,
methods and bodies. A separate fixture service worker records fetch events,
serves only setup resources and refuses other requests.

In both tested browsers, an unrestricted EventSource receives a server event,
and an unrestricted `sendBeacon` sends a marker in a POST body to the receiver.
Under the fixture service worker alone, the worker observes and blocks each
request. Under actual window preparation, both calls throw `SecurityError` and
no marker reaches the receiver. An unprepared observer confirms that the worker
intercepted the prepared document request. The [receipt](evidence/eventsource-beacon.json)
records browser versions, source and fixture hashes, outcomes and receiver
observations.

The same fixture also instantiates a small WebAssembly module whose exported
function calls an imported JavaScript function. That function makes a
marker-bearing POST with `fetch`. The test checks that the Wasm import actually
ran: the native POST reaches the receiver, while the fixture service worker
observes and blocks it in the worker-controlled window. The prepared window
rejects POST in its local resource adapter before a native fetch event; the
fixture checks the TypeError result and absence of that marker in the worker log.

This tests selected same-origin calls and one Wasm import in a prepared window. It does not cover
installed-app startup, workers, recovered references, all destinations, or the
effect of removing either denial. The service-worker control does not establish
that every browser-generated request reaches a service worker.
