# Installed-app navigation path

Run `npm run build`, then
`node formal/implementation-navigation/installed-run.ts`. The test installs a
small website through the ordinary manager and installation origin, then opens
it through the runtime. Application code creates and clicks a same-window link
containing a synthetic input value entered after startup.

The baseline root guard is rebuilt from source and must match the ordinary
`dist-runtime/guard.js` byte for byte. A second bundle removes only the native
cancellation call in the `navigate` listener. The test server substitutes that
bundle for the root guard in a fresh browser context; other runtime artifacts
remain unchanged. It records the actual guard response hash and requires the
root shell and guard to come from the real host service worker. Successful
application rendering uses the private content message implemented by that
hashed guard; the former installed-content HTTP request must be absent. The
fixture does not independently observe the private message port.

The normal runtime bridge disables navigation preload during setup. After
installation, trusted test code in that bridge verifies the disabled state,
sets a random header value and enables preload. This deliberately configured
state matches the earlier direct-preparation fixture.

The link targets an unavailable path within the runtime service-worker scope.
The Node server records incoming HTTP requests independently of application
reports. A native page delivers the marker without a preload header. The
installed baseline delivers no marker during the recorded observation interval,
and its genuine cancelable cross-document event is prevented. The altered
guard leaves the event unprevented, and the receiver observes the marker with
the configured preload header.

Chromium delivered one marker request in the altered case and ended on an error
page. Firefox delivered a preload request and another request without the
preload header, ending at the target URL. The receipt includes browser responses
and request failures; it does not establish the cause of Firefox's second
request. The fault-control assertion requires a seeded preload delivery rather
than assuming exactly one request.

`installed-result.json` pins source, runner and build hashes, browser versions,
served guard bytes, response headers, preload state, event observations and
receiver records. Its preload state is deliberate test setup;
the result is not a deployed escape claim. The remaining proof assumptions and
uncovered navigation routes are listed in the [browser contract](browser-contract.md).
