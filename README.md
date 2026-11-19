# Privacy Frames

Install a web application from its URL and run a local copy with private input.
The installer downloads public resources. Application JavaScript runs in QuickJS
compiled to WebAssembly; the browser supplies the DOM, rendering and audio.

The manager is at **https://pf.damenh.com/**, installation uses
**https://install.pf.damenh.com/**, and applications run at
**https://apps.pf.damenh.com/<short-source-id>/<app-name>/**. All three sites use
GitHub Pages. Unrestricted examples and licensed mirrors live in
[privacy-frames/apps](https://github.com/privacy-frames/apps).

## Develop locally

Use Node 24 or newer:

```sh
npm ci
npx playwright install chromium firefox
npm run build
npm run typecheck
npm run format:check
npm test
npm run serve
```

`npm ci` applies the pinned QuickJS wrapper patch in `patches/`. Its regression
covers Wasm memory growth during promise jobs and reflection. Installation must
run package scripts.

Open http://127.0.0.1:4210/privacy-frames/. The runtime uses port 4211 and the
installer uses 4219. Local publisher fixtures use other ports, matching the
separate production origins. `npm run build` prepares those fixtures from the
revision in `publisher-source-ref.txt`.

## Sharing

Copy link creates an installation link containing the application URL and any
supplemental resource list. Opening it installs and launches the app in the same
tab. An existing installation opens directly. Private files and stored application
data are not included in the link.

## Runtime

Guest objects and prototype changes stay in the interpreter. Trusted native code
forwards permitted browser operations and handles callbacks synchronously, so an
application event handler can cancel a native browser action. Browser-interface
metadata is generated from the pinned Webref IDL corpus; native browser methods
perform Web IDL conversion and brand checks.

Guest fetch and XHR read an immutable resource catalog. Native rendering receives
Blob or data URLs, including rewritten CSS dependencies. Dedicated workers,
SharedWorkers and audio worklets run guest engines in prepared native contexts.
Child windows retain their initial blank document and receive host-rendered markup.

Installation follows explicit HTML, CSS and literal module references without
running application code. A supplemental `text/uri-list` supplies resources chosen
dynamically by an application. The entry and listed resources are mandatory;
other unavailable dependencies fail locally. Installation limits are 100 MiB and
1,000 resources.

Downloads require a trusted host confirmation and release the supplied file from
confinement. The browser may use network services to screen an approved download.

Application Wasm executes natively with policy-mediated imports. Native memory,
SharedArrayBuffer and Atomics retain the browser's actual storage and synchronization
semantics across prepared dedicated workers. See
[the Wasm bridge](docs/implementation/native-wasm.md) for its boundaries and known
compatibility limits. Application service-worker execution remains deferred.
Storage APIs use
application-scoped names, but applications share an origin and browser permission
grants; cross-application storage isolation is not claimed.

## Verification

`npm test` runs unit, engine, browser-service, context, network-policy and manager
installation checks. `npm run test:pitch` checks unchanged Pitch Training,
including audio, microphone input and offline persistence.

For the larger application corpus, build the pinned publisher mirrors with
`npm --prefix publisher-source run build`, then run `npm run test:compatibility`.
`PUBLISHER_DIRECTORY` can select another built publisher checkout. Browser
receipts are written under `results/guest-runtime/`.

[REPORT.md](REPORT.md) explains the threat model and mechanism.
[SURFACE_INVENTORY.md](SURFACE_INVENTORY.md) maps enforcement to implementation and
tests. Historical native-runtime experiments remain under `formal/`; reproduce
those against [the native source baseline](https://github.com/privacy-frames/host/tree/3013bd51d4fde27cd8adf327e7009430641c8e40).
Current evidence must come from the QuickJS implementation.

## Deployment

`deployment/config.json` defines origins and catalog entries. The host repository
publishes `dist-manager/`. The deployment repositories
[privacy-frames/runtime](https://github.com/privacy-frames/runtime) and
[privacy-frames/installation](https://github.com/privacy-frames/installation) build a
pinned host revision and publish only their respective role output.

Unrestricted application files must never be published to a trusted host origin.
`npm run test:assets` compares deployed files with the local release build and
checks that publisher paths are absent from trusted sites.
