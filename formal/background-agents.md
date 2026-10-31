# Native background-agent registration acquisition

Run [the actual-source fixture](background-agents-probe.ts) with
`node formal/background-agents-probe.ts` after installing Playwright Chromium and
Firefox. It uses ephemeral loopback servers, builds current `prepareWindowRealm`
source without changing shared output, and records its source, runner and bundle
hashes in [the receipt](evidence/background-agents.json).

Chromium 153 supplies working native controls for both background download and
one-shot sync. A native page obtains a real `ServiceWorkerRegistration`, calls
`backgroundFetch.fetch` and registers a sync tag. The independent server receives
the download request and the sync handler's fetch. These requests originate from
browser/background-worker paths; the fixture's document request gate refuses
ordinary requests to their receiver URLs. The generator asserts both deliveries
before testing prepared execution.

The same browser context retains that native registration when a separately
prepared application document starts. Its source is restricted before application
code runs, with generated production response headers. No native registration or
preparation-time reference is handed to application code.

| Attempt after preparation                                           | Observed result in Chromium 153 and Firefox 155          |
| ------------------------------------------------------------------- | -------------------------------------------------------- |
| Virtual `navigator.serviceWorker.getRegistrations()`                | Empty list, despite the pre-existing native registration |
| Virtual `getRegistration('/')`                                      | No registration                                          |
| `Navigator.prototype.serviceWorker` getter                          | Returns the same virtual container                       |
| Native container-prototype `getRegistration` / `getRegistrations`   | SecurityError                                            |
| Native `ready` / `controller` getter applied to virtual container   | TypeError from native receiver validation                |
| Construct native ServiceWorkerContainer / ServiceWorkerRegistration | TypeError                                                |
| Register an unadmitted script                                       | SecurityError                                            |
| Ordinary marker-bearing receiver fetch                              | Local resource TypeError; no receiver request            |

Chromium also rejects native `backgroundFetch`, `sync` and `periodicSync` getters
applied to an object created with `ServiceWorkerRegistration.prototype`. Giving
an object the right prototype does not give it the platform object's internal
registration state. Firefox exposes none of those three properties in this
profile, so its result does not calibrate their network behavior.

A separate native page still obtains the original real registration after the
prepared attempts. It finds neither an application-private sync tag nor a
background download under that identifier. The independent receiver observes no
application-private marker. This distinguishes inability to acquire authority
from accidentally deleting the pre-existing registration.

## Source path and remaining limits

[The foreground client](../src/runtime/publisher/client.ts) captures its native
container/controller before application execution and keeps them in trusted
closures. The exposed container is an EventTarget-based virtual interface. Its
foreground registration records are also EventTargets; they have no native
`backgroundFetch`, `sync` or `periodicSync` managers.
[The effect policy](../src/runtime/enforcement/effects.ts) separately denies native
registration acquisition and redirects the navigator getter to the virtual
container. [Dedicated-worker preparation](../src/runtime/contexts/worker-realm.ts)
installs that effect policy with no application container, so its service-worker
getter denies access. This worker statement is source review, not an independent
prepared-worker acquisition probe in the fixture.

The fixture creates a persisted native registration but does not launch a
foreground publisher worker. Existing publisher tests cover those virtual
registrations; this test addresses whether a native registration is recovered
instead. It does not prove that every event, browser lifecycle or context can
never disclose one.

Chromium refuses the native periodic-sync control with NotAllowedError. A control
with the required permission and installed-app state is still needed to qualify
periodic sync. No production restriction was changed, and neither a registration
recovery nor a background-agent escape was demonstrated.
