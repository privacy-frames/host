# Deferred fetch after page close

Run `node formal/fetch-later-probe.ts` after installing Playwright Chromium and
Firefox. [The fixture](fetch-later-probe.ts) builds current preparation source,
uses ephemeral loopback ports and records source, runner and bundle hashes in
[the receipt](evidence/fetch-later.json). It launches full Chromium with background
networking enabled; the actual executable arguments are recorded.

Chromium 153.0.8010.12 supplies three independent native POST controls:

| Native scenario                                     | Receiver result                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `activateAfter: 0`, page remains open               | Marker-bearing POST delivered                                      |
| `activateAfter: 60000`, page closed                 | No request before close; marker-bearing POST delivered after close |
| Same deferred close under a blocking service worker | Marker-bearing POST delivered; worker observes no deferred request |

The controlled document's ordinary unknown requests are refused by its worker.
Deferred fetch therefore needs its own restriction; service-worker interception
alone does not contain this native route.

The actual prepared runtime rejects `fetchLater` synchronously with SecurityError.
Calling the current property descriptor recovered from the Window prototype chain
also raises SecurityError. The fixture tests both immediate activation and a
60-second deferred request followed by closing the prepared page. Private markers
are created after preparation. Neither attempt reaches the independent HTTP
receiver; an ordinary marker-bearing fetch is rejected locally with TypeError.

A final native immediate upload after both prepared pages have closed confirms
that the uploader still works. The fixture then rechecks all recorded traffic
for prepared private markers. It asserts the three native deliveries, the
pre-close zeros, the worker bypass observation, and the prepared zeros.

The fixture also builds a test-only mutation that removes the `fetchLater`
entry from the effect policy in memory. It otherwise runs the same preparation,
response policy and blocking service worker. In Chromium, a request scheduled
after preparation reaches the independent receiver after that page closes; the
worker records the page but not the deferred request. The test fails unless this
marker is actually delivered. The mutation is never applied to production code.

Firefox 155 does not expose `fetchLater` in this profile. Its absence is recorded
without claiming that a supported implementation was contained. The test covers
these timing and page-close scenarios, not browser-process termination, session
restore, every quota condition, or other deferred APIs. No application code is
allowed to run before preparation, so the fixture does not seed a private request
using a native function retained by application code from an earlier phase.
