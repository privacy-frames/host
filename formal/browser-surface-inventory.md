# Browser surface and implementation obligations

This inventory reviews source at `2449929b26adc7dad41b54c9d4de2c4b3bdb0a69`.
It maps the browser-facing part of the confinement argument to code and fixtures.
It does not establish that every browser effect is mediated, or that the finite
lifecycle model proves the JavaScript implementation. Fresh and historical test
evidence is distinguished below.

Application scripts, modules and WebAssembly execute natively. Our parser and
markup computations run in a detached private iframe; native hooks remain beside
application code. Installed applications share a runtime origin. Local rendering,
input and storage effects must be distinguished from outbound communication and
from trusted browser/controller maintenance traffic.

## Additional module-loading review for policy 8

Import declarations, re-exports and `import()` are language syntax, so a Web IDL
member inventory does not enumerate their effect paths. HTML's
[HostLoadImportedModule hook](https://html.spec.whatwg.org/multipage/webappapis.html#hostloadimportedmodule)
connects module loading to its module-script fetch algorithms. Include code
constructed through eval and Function when those operations are available.

The worker realm still uses native HTTP module delivery. Local classic entry and
`importScripts` delivery do not establish locality for dynamic import from those
scripts. The
[maintenance comparison](runtime-verification/service-worker-maintenance.md)
tests these paths separately. The
[29 October Service Workers draft](https://www.w3.org/TR/2026/CRD-service-workers-20261029/#create-fetch-event-and-dispatch)
also schedules soft updates for stale registrations during subresource handling;
a locally supplied resource response does not establish zero remote effects.

**U:** complete module-delivery mediation and its registration-lifetime argument.
The [loader boundary experiment](runtime-verification/module-loader-assessment.md)
shows why configuring a compatibility loader's fetch hook is insufficient by
itself. Neither native constructor URL admission nor an API-name inventory closes
this obligation.

## Evidence labels and provenance

- **R:** a named fixture includes an independent receiver and an unrestricted
  positive control for the stated route. This is empirical evidence within that
  fixture's browser/version and revision bounds.
- **L:** local assertions, functional controls or protocol observations exist;
  they do not independently establish absence of outbound communication.
- **S:** a source control was identified, but a calibrated browser route was not
  established by this review.
- **U:** the control, native calibration or coverage is unresolved/unverified.

An API missing from a tested browser is not evidence that the runtime would block
it if present. A caught exception is not a receiver observation. Aggregate network
checks do not supply a working native control for every API attempted inside them.

The [fresh evidence index](evidence/index.json) identifies seven local browser
receipts from source `2449929`, whose production files match `bf3ba33`. The
network, prototype and document-context receipts below were rerun in this worktree.
Other rows retain their historical revision; those runs are not new verification.

| Receipt                                                                                                     | Recorded revision        | Scope                                                                        |
| ----------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| [Chromium network](evidence/results-network.json), [Firefox network](evidence/results-network-firefox.json) | `2449929`                | HTTP/TCP, STUN and syscall-observed DNS controls; Chromium 153 / Firefox 155 |
| [Prototype confinement](evidence/contexts-prototype-confinement.json)                                       | `2449929`                | Same-runtime WebSocket upgrades and native reference controls                |
| [Document contexts](evidence/contexts-document-contexts.json)                                               | `2449929`                | Context-specific checks; inspect each fixture's control scope                |
| [Worklets](../results/contexts/worklets.json), [publisher executors](../results/contexts/publishers.json)   | `eb80a0a`                | Historical context-specific checks                                           |
| [Connection Allowlist](../results/trusted-runtime/connection-allowlist.json)                                | Dirty `d941bc0` snapshot | Header-only responses, separate from runtime CSP/hooks                       |

Array-shaped historical receipts must be inspected per row; a file's presence is
not a uniform provenance record. The [old release ledger](../results/release.json)
and [trusted-runtime ledger](../results/trusted-runtime/release.json) refer to
their own releases, not automatically to this model.

## Context creation and publication

| Surface / disposition in current code                                                        | Enforcement entry points                                                                                                                                                                                                                                                                             | Checks and remaining obligation                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root document: trusted setup precedes publisher content                                      | [guard.ts](../src/runtime/guard.ts), `prepareWindowRealm` in [window-realm.ts](../src/runtime/contexts/window-realm.ts), [document-renderer.ts](../src/runtime/contexts/document-renderer.ts)                                                                                                        | **L:** [context-csp.ts](../test/context-csp.ts), [realm-enforcement.ts](../test/realm-enforcement.ts), [document-renderer.ts](../test/document-renderer.ts). Browser must preserve parser-blocking bootstrap order and enforce startup response policy.                                                                                                                      |
| Frames and object/embed-style child requests: mediated creation and prepared document routes | [document-factory.ts](../src/runtime/contexts/document-factory.ts), [document-controller.ts](../src/runtime/contexts/document-controller.ts), [document-intents.ts](../src/runtime/contexts/document-intents.ts), [document-guard.ts](../src/runtime/contexts/document-guard.ts)                     | **R/L:** [document-contexts.ts](../test/document-contexts.ts), [document-factory.ts](../test/document-factory.ts), [document-client-identity.ts](../test/document-client-identity.ts). Check actual creator/reserved client, generation, pending/null references and nested startup. `srcdoc` may be a mediated input; native unprepared `srcdoc` insertion is not admitted. |
| Initial blank/SVG documents, named/indexed references and replacement                        | Same factory/controller plus [model.ts](../src/runtime/contexts/model.ts), [resources.ts](../src/runtime/contexts/resources.ts)                                                                                                                                                                      | **L:** [document-initial-reuse.ts](../test/document-initial-reuse.ts), [document-hidden-initialization.ts](../test/document-hidden-initialization.ts), [document-navigation-seeding.ts](../test/document-navigation-seeding.ts), [document-native-svg.ts](../test/document-native-svg.ts). **U:** all browser scheduling/lifecycle interleavings.                            |
| Popups: prepared native window behind a facade                                               | [popup-factory.ts](../src/runtime/contexts/popup-factory.ts), document intent/controller path                                                                                                                                                                                                        | **R/L:** [popup-contexts.ts](../test/popup-contexts.ts); [popup-receivers.ts](../test/popup-receivers.ts) compares unsafe and guarded getters/methods/setters on a real child. That latter fixture explicitly does not cover full controller admission or network confinement.                                                                                               |
| Dedicated workers: real native threads, guarded classic/module/Blob/nested startup           | [worker-factory.ts](../src/runtime/contexts/worker-factory.ts), [worker-guard.ts](../src/runtime/contexts/worker-guard.ts), `prepareWorkerRealm` in [worker-realm.ts](../src/runtime/contexts/worker-realm.ts), [worker.ts](../src/runtime/worker.ts)                                                | **R/L:** [worker-contexts.ts](../test/worker-contexts.ts), [worker-destinations.ts](../test/worker-destinations.ts), [worker-root-aliases.ts](../test/worker-root-aliases.ts), [network.ts](../test/network.ts). Preserve pre-start transfer/detachment, private bootstrap channel, nesting and actual termination.                                                          |
| Shared workers: application/generation namespace and authenticated connections               | [shared-worker-factory.ts](../src/runtime/contexts/shared-worker-factory.ts), [shared-worker-guard.ts](../src/runtime/contexts/shared-worker-guard.ts), [shared-controller.ts](../src/runtime/contexts/shared-controller.ts), [shared-connections.ts](../src/runtime/contexts/shared-connections.ts) | **R/L:** [shared-worker-contexts.ts](../test/shared-worker-contexts.ts), [shared-connections.ts](../test/shared-connections.ts), header-only worker control below. A supplied worker name is not authorization.                                                                                                                                                              |
| Audio/paint worklets: admitted module graph and real browser processor execution             | [worklet-factory.ts](../src/runtime/contexts/worklet-factory.ts), [worklet-controller.ts](../src/runtime/contexts/worklet-controller.ts), [worklet-source.ts](../src/runtime/contexts/worklet-source.ts), [worklet-guard.ts](../src/runtime/contexts/worklet-guard.ts)                               | **R/L:** [worklet-platform.ts](../test/worklet-platform.ts), [worklet-guard.ts](../test/worklet-guard.ts), [worklet-contexts.ts](../test/worklet-contexts.ts). Guard refuses known HTTP/storage globals if exposed; dynamic imports are rejected. **U:** a complete future-worklet capability inventory; absent paint support is not a passing paint test.                   |
| Autonomous custom elements: accepted; customized built-ins: refused                          | [enforcement/dom.ts](../src/runtime/enforcement/dom.ts), `CustomElementRegistry.define` and creation wrappers                                                                                                                                                                                        | **L:** [custom-elements.ts](../test/custom-elements.ts). Constructors/callbacks execute natively and must encounter already-installed hooks.                                                                                                                                                                                                                                 |
| ShadowRealm and XSLTProcessor: denied where present                                          | `installEffectPolicy` in [effects.ts](../src/runtime/enforcement/effects.ts)                                                                                                                                                                                                                         | **S/L:** [global-bindings.ts](../test/global-bindings.ts), [fixtures/global-bindings/hazards.ts](../test/fixtures/global-bindings/hazards.ts). The research realm adapters are not a production fallback.                                                                                                                                                                    |
| Our private parser iframe: trusted code only, detached before application execution          | [trusted/context.ts](../src/runtime/trusted/context.ts), [trusted/client.ts](../src/runtime/trusted/client.ts), [trusted/entry.ts](../src/runtime/trusted/entry.ts)                                                                                                                                  | **L:** [trusted-boundary.ts](../test/trusted-boundary.ts), [trusted-computation.ts](../test/trusted-computation.ts). String boundary, foreign-error handling, coercion and prototype/reference checks; the boundary fixture expressly makes no receiver claim.                                                                                                               |

Context authority is durable controller state, not merely a label stored in a
guest. [controller-store.ts](../src/runtime/contexts/controller-store.ts) and
[model.ts](../src/runtime/contexts/model.ts) define the application, parent,
generation and lifecycle records consumed by context routes. Tests in
[context-generation.ts](../test/context-generation.ts),
[lifecycle.ts](../test/lifecycle.ts) and the document precommit fixtures cover
particular schedules. Crash recovery, BFCache, every cancellation schedule and
all concurrent replacement histories remain **U** unless separately calibrated.

## Network transports and browser-created requests

| Surface / current disposition                                                                                                   | Code                                                                                                                                                                                                                                                                | Evidence and limit                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fetch, XHR and cache downloads: map admitted resources; unknown requests fail                                                   | [resource-aliases.ts](../src/runtime/resource-aliases.ts), fetch handler in [worker.ts](../src/runtime/worker.ts), [contexts/resources.ts](../src/runtime/contexts/resources.ts)                                                                                    | **R:** [network.ts](../test/network.ts) has independent HTTP/TCP/STUN and syscall DNS controls, including classic/module/nested worker probes. **L:** [cache-aliases.ts](../test/cache-aliases.ts), [runtime-admission.test.ts](../test/runtime-admission.test.ts). No application-triggered network fallback is authorized. |
| Images, CSS, fonts, media, scripts, SVG and resource-bearing attributes: native loads only after mapping/validation             | [enforcement/dom.ts](../src/runtime/enforcement/dom.ts), [resource-elements.ts](../src/runtime/enforcement/resource-elements.ts), [scripts.ts](../src/runtime/enforcement/scripts.ts), [shared/runtime-url.ts](../src/shared/runtime-url.ts), runtime CSS rewriting | **R/L:** [dynamic-scripts.ts](../test/dynamic-scripts.ts), [resource-elements.ts](../test/resource-elements.ts), [native-markup.ts](../test/native-markup.ts), [run.ts](../test/run.ts). Coverage is selected routes, not every present/future resource attribute.                                                           |
| DNS-prefetch, preconnect, preload/prefetch/prerender/modulepreload and speculation rules: uncontrolled runtime insertion denied | Markup/script/element policies above; DNS-prefetch response header in [response-policy.ts](../src/runtime/response-policy.ts)                                                                                                                                       | **R:** [network.ts](../test/network.ts) attempts these routes and calibrates actual private/control DNS sends. **U:** every browser speculative-connection mechanism and all header-initiated variants.                                                                                                                      |
| WebSocket and WebSocketStream: denied, including same-origin recovery routes                                                    | [effects.ts](../src/runtime/enforcement/effects.ts), protected globals/prototypes                                                                                                                                                                                   | **R:** [prototype-confinement.ts](../test/prototype-confinement.ts) observes runtime-origin upgrades with unsafe native controls; [network.ts](../test/network.ts) observes external upgrades. CSP and same-origin allowlisting alone cannot supply this restriction. Stream-specific native calibration is **U**.           |
| RTCPeerConnection/RTCDataChannel and prefixed RTC APIs: denied                                                                  | Named constructors and `RTC`/`webkitRTC` scan in [effects.ts](../src/runtime/enforcement/effects.ts)                                                                                                                                                                | **R:** [network.ts](../test/network.ts) has active STUN UDP controls. **U:** separately calibrated TURN, peer-data and every constructor-recovery route. The hook's universal effectiveness remains an implementation obligation.                                                                                            |
| WebTransport, TCPSocket, UDPSocket: denied where exposed                                                                        | [effects.ts](../src/runtime/enforcement/effects.ts)                                                                                                                                                                                                                 | **R:** [WebTransport receiver test](webtransport/README.md) uses a working HTTP/3 endpoint and observes no confined UDP in Chromium and Firefox. Direct TCP/UDP socket APIs lack equivalent native controls.                                                                                                                 |
| EventSource, sendBeacon, fetchLater and pending beacons: denied                                                                 | [effects.ts](../src/runtime/enforcement/effects.ts)                                                                                                                                                                                                                 | **S/L:** source deny list and general boundary probes. API-specific active controls, deferred delivery and browser shutdown behavior are **U**.                                                                                                                                                                              |
| Speech synthesis/recognition, remote playback/presentation and URL-bearing media artwork: denied; local Web Audio retained      | [effects.ts](../src/runtime/enforcement/effects.ts)                                                                                                                                                                                                                 | **L:** [helpers/boundary-probes.ts](../test/helpers/boundary-probes.ts), [pitch-training.ts](../test/pitch-training.ts). No active remote speech/casting/OS artwork receiver is established by those functional assertions.                                                                                                  |
| WebAssembly: native computation, imported effects use the same environment                                                      | CSP and prepared environment; [modules.ts](../src/runtime/modules.ts)                                                                                                                                                                                               | **L/R:** [wasm.ts](../test/wasm.ts) checks tasks/imported network attempts. It does not prove that engine execution has no implementation defects.                                                                                                                                                                           |

### Connection Allowlist is additional enforcement

[response-policy.ts](../src/runtime/response-policy.ts) sets
`(response-origin); redirects=block; webrtc=block`.
[connection-allowlist.ts](../test/connection-allowlist.ts) tests the header without
CSP or application hooks: **R** for direct/SW-generated documents and
dedicated/shared worker responses. Its publisher row is the native SharedWorker
execution class, not the full publisher protocol. Chromium 153 blocks the tested
external HTTP/WebSocket traffic and document STUN traffic; Firefox 155 ignores
the header. Same-origin HTTP/WebSocket remains possible.

The unrestricted test service worker can relay an external request on behalf of
a restricted document. Its mediated redirect probe also reaches the target.
These controls demonstrate why client policy cannot authorize a generic native
controller proxy. The trusted native `sw.js` is fetched from static hosting;
headers attached to synthetic application responses do not become its policy.
See [the measured scope](../evaluation/connection-allowlist.md).

## Navigation, parser effects and other browser agents

| Surface / current disposition                                                                                                          | Code                                                                                                                                                                                                                                             | Checks and assumptions                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Location changes, links, forms and cross-document exits: cancel/refuse; root history remains in installation scope                     | [navigation.ts](../src/runtime/enforcement/navigation.ts), [navigation-targets.ts](../src/runtime/enforcement/navigation-targets.ts), [shared/application-navigation.ts](../src/shared/application-navigation.ts), CSP `form-action`             | **R/L:** [context-navigation.ts](../test/context-navigation.ts), [navigation-targets.ts](../test/navigation-targets.ts), [application-history.ts](../test/application-history.ts), [launch-query.ts](../test/launch-query.ts). Startup requires Navigation API support; cancellation before forbidden effects is a browser obligation.                                                           |
| Native back/forward/go/traverse and document.write/open/writeln: denied                                                                | [navigation.ts](../src/runtime/enforcement/navigation.ts)                                                                                                                                                                                        | **L:** boundary/history tests. User browser UI traversals, external context-menu actions and full BFCache behavior are separate; do not infer coverage from a JavaScript denial.                                                                                                                                                                                                                 |
| Modifier/auxiliary clicks, context menu, rich HTML paste/drop: native default actions suppressed                                       | Capturing listeners in [navigation.ts](../src/runtime/enforcement/navigation.ts)                                                                                                                                                                 | **S/L:** targeted navigation and markup fixtures. OS/browser UI actions outside document dispatch are not controlled by those listeners.                                                                                                                                                                                                                                                         |
| Markup, Range, shadow roots, templates and HTML/XML/SVG construction: validated before live insertion                                  | [enforcement/native-markup.ts](../src/runtime/enforcement/native-markup.ts), [inert-documents.ts](../src/runtime/enforcement/inert-documents.ts), [trusted/fragment.ts](../src/runtime/trusted/fragment.ts)                                      | **R/L:** [native-markup.ts](../test/native-markup.ts), [inert-documents.ts](../test/inert-documents.ts), renderer/document fixtures. Viewless construction is not a new executable realm. Namespace, default-action and parser correspondence remain browser obligations.                                                                                                                        |
| Application service workers: logical registration/events inside prepared executors; no native controller authority                     | [publisher/client.ts](../src/runtime/publisher/client.ts), [publisher/controller.ts](../src/runtime/publisher/controller.ts), [publisher/guard.ts](../src/runtime/publisher/guard.ts), [publisher/events.ts](../src/runtime/publisher/events.ts) | **R/L:** [publisher-contexts.ts](../test/publisher-contexts.ts), [website-installation.ts](../test/website-installation.ts), [publisher-store.ts](../test/publisher-store.ts). Native registration/update/preload/postMessage routes are denied by [effects.ts](../src/runtime/enforcement/effects.ts).                                                                                          |
| Management and installer channels: exact source/origin/session and browser-client role                                                 | [bridge/connect.ts](../src/bridge/connect.ts), [installation/session.ts](../src/installation/session.ts), [installation/controller.ts](../src/installation/controller.ts), native worker message handler                                         | **L:** [installation-origin.ts](../test/installation-origin.ts), [separate-runtime.ts](../test/separate-runtime.ts), [installation-session.test.ts](../test/installation-session.test.ts). A supplied URL/role/handle cannot substitute for the actual client. Installation intentionally permits credentialless downloads before private runtime execution; it does not execute publisher code. |
| BroadcastChannel, navigator locks, sharedStorage and origin-wide storage-manager access: refused                                       | [effects.ts](../src/runtime/enforcement/effects.ts)                                                                                                                                                                                              | **S/L:** known API deny paths and authority probes. Existing MessageChannel/postMessage transfers are not globally banned; their native peer identities and protected control ports matter.                                                                                                                                                                                                      |
| Notifications, Web Share, NFC, protocol registration, ad auction/interest-group operations and credentials APIs: refused where present | [effects.ts](../src/runtime/enforcement/effects.ts)                                                                                                                                                                                              | **S:** concrete deny list. Native OS/service/device success controls are **U**. Push/sync APIs are not separately wrapped there; their access through native service-worker registration is intended to be unavailable. Independent push/sync coverage is **U**.                                                                                                                                 |
| PWA/browser agents: host-owned identity/manifest scope                                                                                 | [pwa.ts](../src/runtime/pwa.ts), runtime manifest/icon paths                                                                                                                                                                                     | **L:** [compatibility.ts](../test/compatibility.ts) covers Chromium native install/launch/offline restart. Browser updater, launch infrastructure and OS behavior are trusted platform effects, not automatically application egress. Other platform/manual install UI coverage is **U**.                                                                                                        |
| Print and document picture-in-picture: refused                                                                                         | `window.print`, `DocumentPictureInPicture.requestWindow` and the window accessor in [navigation.ts](../src/runtime/enforcement/navigation.ts)                                                                                                    | **S:** wrappers identified; native print/PiP success controls and OS interactions are **U**.                                                                                                                                                                                                                                                                                                     |

## Permission and local-authority boundaries

| Surface                                                                                         | Actual control / evidence                                                                                                                                                                                                                    | Scope limit                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Microphone and local audio                                                                      | Permissions Policy `microphone=(self)`; [pitch-training.ts](../test/pitch-training.ts) grants/synthesizes microphone input and tests denial handling                                                                                         | **L:** feature behavior, not per-application permission isolation. Grants belong to the shared runtime origin.                                                                                                                                |
| Camera, geolocation, USB, serial, HID, Bluetooth, payment and selected ad/privacy features      | Explicit empty directives in [response-policy.ts](../src/runtime/response-policy.ts)                                                                                                                                                         | **S:** source policy identified. Unsupported/ignored directive tokens and every device operation need native calibration; no complete device-permission proof.                                                                                |
| Clipboard                                                                                       | `Clipboard.write/writeText` denied in [effects.ts](../src/runtime/enforcement/effects.ts)                                                                                                                                                    | **S:** reads and browser/OS clipboard UI are not uniformly wrapped. Do not infer blanket clipboard isolation.                                                                                                                                 |
| Web Storage, IndexedDB and caches                                                               | [web-storage.ts](../src/runtime/enforcement/web-storage.ts), [contexts/storage.ts](../src/runtime/contexts/storage.ts), [storage/indexed-db.ts](../src/runtime/storage/indexed-db.ts), [storage/caches.ts](../src/runtime/storage/caches.ts) | **L:** [scoped-storage.ts](../test/scoped-storage.ts), [storage-proxy-receiver.ts](../test/storage-proxy-receiver.ts). Namespacing is supported behavior; strict cross-app isolation is outside the prototype guarantee.                      |
| Cookies, Storage Access handles, legacy filesystem/WebSQL, OPFS                                 | Cookie access suppressed by navigation policy; Storage Access/legacy factories denied by web-storage policy; `navigator.storage` denied by effects policy                                                                                    | **L/S:** [storage-policy.ts](../test/storage-policy.ts) primarily concerns trusted bridge partitioning; boundary probes test native-handle denial. Do not confuse the trusted manager's Storage Access API use with app permission to use it. |
| Local file selection/export, screen capture, sensors and other permission APIs not listed above | No complete permission wrapper/enumeration was identified                                                                                                                                                                                    | **U:** no promise of a universal local-authority sandbox. Local release needs a separate authorization policy if included in the model; these capabilities are not automatically remote-network escapes.                                      |

## Browser assumptions and unresolved coverage

The implementation relies on browser origin separation, service-worker request
attribution/interception, native property/brand behavior, navigation cancellation,
response-policy enforcement and isolation of detached private globals. It also
trusts the delivered host/controller/setup code and the browser's execution of it
before publisher code. Receiver tests check selected manifestations of these
obligations; the lifecycle model cannot establish the browser mechanisms.

Native controller updates, navigation preloads, manifests/icons and browser/OS
agents require traffic attribution. A blanket assertion that every observed
connection is an app leak would be wrong. Conversely, labeling traffic trusted
requires showing that its URL/body/timing is not an unauthorized application data
channel; the label alone is not an authorization check.

`installEffectPolicy` denies named interfaces and scans RTC-prefixed globals. It
does not automatically refuse every future browser API. `sealRuntimeBindings`
protects the selected existing values; protecting an unknown native constructor
from replacement does not remove its authority. The worklet platform fixture
enumerates a fixed candidate list, not all present/future globals.

The review found a conditional FedCM request that bypassed the service worker
in the earlier runtime. The [receiver finding below](#conditional-fedcm-receiver-finding-and-fix)
describes the browser state required to reproduce it and the current source fix.

This inventory has not compared every interface against Web Platform Tests or a
versioned complete Web IDL/global-feature enumeration. That part of
[the verification plan](PLAN.md) remains open. Missing route-specific controls
above must remain **U/S**, rather than being promoted by the broad application
corpus or an aggregate zero-network receipt. WebKit, real mobile devices,
extensions, browser defects, physical side channels and availability are not
verified by the named desktop fixtures.

## Native feature snapshot

`node formal/browser-enumeration.ts` records an unrestricted localhost Window,
Navigator, Document and dedicated Worker in `browser-features.json`. It captures
property names and native constructor static and prototype names without invoking getters.
The October 2026 snapshot records Chromium 153 and Firefox 155. Compare two saved
snapshots with `python3 formal/browser-feature-diff.py OLD.json NEW.json`; added
and removed names require review against this inventory.

This is a discovery aid. It does not classify a name as a network capability,
execute each API, inspect every object returned by a getter, or enumerate every
context type. An unchanged snapshot is not proof of complete mediation.

The [bounded Web IDL join](idl-surface-report.md) compares members from selected
pinned specifications with that snapshot and links a small set of reviewed
members to evidence. Its remaining observed members are review candidates, not
automatically network effects or vulnerabilities.
The [background-agent probe](background-agents.md) follows up on native
registration recovery with working Chromium background-fetch and one-shot sync
controls; periodic sync still lacks a working permission control.

## Standards and WPT follow-up

Sources were inspected on 30 October 2026. WPT paths below are pinned to
[`7e1243dd51da4162ea4a0b0e539b40db0144b22c`](https://github.com/web-platform-tests/wpt/tree/7e1243dd51da4162ea4a0b0e539b40db0144b22c).
Their existence supplies test designs, not passing results for our runtime.

A systematic enumeration needs three inputs, rather than only a list of global
constructors:

1. The [Fetch request taxonomy](https://fetch.spec.whatwg.org/#concept-request-destination)
   covers destinations, initiators and modes. It explicitly excludes `serviceworker`
   and `webidentity` from JavaScript's observable destination enum because those
   requests skip service workers. Browser-internal reporting is another separate
   route. A service-worker fetch log cannot enumerate all outbound communication.
2. [Webref's curated IDL](https://github.com/w3c/webref/tree/6ac6259c96b11e0aea5c34a16822eb06add278c9/ed/idl)
   supplies interfaces, exposure sets, mixins, static operations and navigator
   members. Record those alongside actual browser/version feature enumeration;
   a draft interface is not evidence of shipping support. Static operations matter:
   protecting a constructor binding does not deny its own network-capable methods.
3. Normative algorithms and WPT supply the missing behavior: request attribution,
   service-worker bypass, permissions, preconditions, deferred delivery and native
   controls. IDL alone does not identify every effect. HTML attributes, CSS URLs,
   response headers and browser agents must be included alongside script APIs.

The comparison identified these concrete follow-ups:

| Route                                  | Primary source / WPT starting point                                                                                                                                                                                                                                                                 | Current evidence or missing check                                                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FedCM static operations                | [FedCM IDL](https://github.com/web-platform-tests/wpt/blob/7e1243dd51da4162ea4a0b0e539b40db0144b22c/interfaces/fedcm.idl), [SW non-observation test](https://github.com/web-platform-tests/wpt/blob/7e1243dd51da4162ea4a0b0e539b40db0144b22c/fedcm/fedcm-not-observed-by-service-worker.https.html) | Conditional same-origin request reproduced below; current source blocks the static entry points and disables the policy feature.                                                                                                 |
| Browser-generated reports              | [Reporting delivery](https://www.w3.org/TR/reporting-1/#attempt-delivery), [WPT reporting](https://github.com/web-platform-tests/wpt/tree/7e1243dd51da4162ea4a0b0e539b40db0144b22c/reporting)                                                                                                       | Modern delivery skips SW. [Calibrated tests](#modern-reporting-api-and-persisted-nel) cover selected full-Chromium reporting and persisted NEL cases; other types, lifecycles and Firefox remain open.                           |
| Anchor/area auditing                   | [HTML hyperlink auditing](https://html.spec.whatwg.org/multipage/links.html#hyperlink-auditing), [WPT auditing](https://github.com/web-platform-tests/wpt/tree/7e1243dd51da4162ea4a0b0e539b40db0144b22c/html/semantics/links/hyperlink-auditing)                                                    | The [receiver follow-up](#hyperlink-auditing-receiver-follow-up) calibrates native `ping` and observes service-worker mediation in the tested profiles.                                                                          |
| Deferred requests                      | [WPT fetch-later](https://github.com/web-platform-tests/wpt/tree/7e1243dd51da4162ea4a0b0e539b40db0144b22c/fetch/fetch-later)                                                                                                                                                                        | The [fetchLater probe](fetch-later.md) calibrates native uploads and page-close behavior. Other keepalive, deactivation, discard and background delivery routes remain open.                                                     |
| Browser installation                   | [Web Install draft](https://wicg.github.io/install-element/)                                                                                                                                                                                                                                        | The [experimental-feature probe](web-install.md) observes native manifest fetches bypassing SW and sandbox denials for both tested entry points. Default Chromium did not expose them; other browsers and overloads remain open. |
| Header-driven and alternate networking | [Connection Allowlist WPT](https://github.com/web-platform-tests/wpt/tree/7e1243dd51da4162ea4a0b0e539b40db0144b22c/connection-allowlist/tentative)                                                                                                                                                  | Contains early-hints/link-header, worker/SW, WebRTC, WebSocket, WebTransport and payment-manifest cases. Import relevant cases with working receivers; our existing header fixture does not cover every one of them.             |

This identifies gaps in the earlier source inventory. It is not a completed
Webref/WPT cross-product audit, nor a claim that every listed candidate is an
escape. Permission and sandbox preconditions must be tested before assigning a
new browser route to a reachable model action.

## Conditional FedCM receiver finding and fix

[The reproducer](fedcm-conditional-probe.ts) builds actual historical source
`2449929b26adc7dad41b54c9d4de2c4b3bdb0a69` and current source without touching
shared deployment builds. Run it after `npm ci` and installing Playwright Chromium:

```sh
git cat-file -e 2449929b26adc7dad41b54c9d4de2c4b3bdb0a69^{commit}
node formal/fedcm-conditional-probe.ts
```

The historical commit must be available locally; a shallow CI checkout must fetch
it or use full history. Both versions use the measuring checkout's pinned
installed dependencies. The receipt records the lock hash, relevant current
source hashes, runner hash and both emitted fixture hashes.

The [receiver receipt](evidence/fedcm-conditional.json) uses ordinary Chromium
153.0.8010.12 with an ephemeral same-origin IdP/RP server. Every profile starts
fresh: disconnect first rejects without network traffic. A native FedCM request
then presents the account chooser; CDP selects its synthetic account. This seeds
browser-owned connected-account state before preparing the application. It is a
controlled prerequisite, not proof that a fresh confined app can create it.

After actual `prepareWindowRealm`/`admitContent`, `privacyHost.mode` is
`network-isolated` and `navigator.credentials.get` is denied. An independent
service worker returns 403 for ordinary unknown fetches. Historical static
`IdentityCredential.disconnect` nevertheless sends a same-origin POST containing
`client_id=private-marker-...`, observed by the HTTP server. That request skips the
service-worker gate and is permitted by the original same-origin CSP/allowlist.

Four seeded profiles distinguish the controls:

| Profile                                                   | Asserted outcome                                                      | Receiver traffic after preparation                             |
| --------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| Historical source, original connect-src self              | Disconnect resolves; ordinary fetch returns SW blocked                | Config/well-known GETs and disconnect POST carrying the marker |
| Historical source, connect-src none                       | Disconnect NetworkError; ordinary fetch TypeError                     | None                                                           |
| Historical source, only identity-credentials-get disabled | Disconnect NotAllowedError; ordinary fetch SW blocked                 | None                                                           |
| Fixed current source and generated policy                 | Disconnect SecurityError from runtime hook; ordinary fetch SW blocked | None                                                           |

Current source disables `identity-credentials-get` in Permissions Policy and
denies `IdentityCredential.disconnect` and `IdentityProvider.getUserInfo` where
exposed. The latter static method's full connected-iframe receiver path remains
unverified; its source denial must not be presented as that missing native test.
The [FedCM disconnect algorithm](https://w3c-fedid.github.io/FedCM/#dom-identitycredential-disconnect)
requires existing connection state and a connect-src check before requesting the
IdP. The native result is conditional on that state, not an unrestricted-origin or
fresh-profile installed-application escape. It demonstrates why browser-owned
persistent authority must be accounted for alongside our context registry.

On October 30, 2026 the runtime deployed host revision
`ebc6d0f784dd0943a8342879996e206eed86b271`. The live `sw.js`, `guard.js`,
`document-guard.js` and `worker-guard.js` matched the locally built bytes. A
fresh Chromium installation of the notes example received the identity policy
and its static disconnect call raised `SecurityError`. Repeat with
`node formal/live-identity-check.ts`. This deployment check does not seed FedCM
state or replace the local receiver test.

The [local compatibility receipt](evidence/compatibility-local-after-identity-fix.json)
records the application corpus run against the fixed build in Chromium and
Firefox. Its recorded checkout was dirty because the source fix had not yet
been committed when the run began; the receipt records the actual build hashes.
The tested window and document guards and service worker match the deployed
files. This is compatibility evidence, not an additional identity receiver test.

## Hyperlink auditing receiver follow-up

[The actual-source fixture](hyperlink-auditing-probe.ts) and
[receipt](evidence/hyperlink-auditing.json) add a calibrated same-origin `ping`
check. Run `node formal/hyperlink-auditing-probe.ts`; it uses ephemeral ports and
builds its own fixture without changing shared deployment output. The receipt
records the source revision, relevant source hashes, emitted fixture hash and
runner hash.

Native Chromium 153.0.8010.12 `a.click()` and `area.click()` produce independently
observed POST requests with body `PING` and marker-bearing auditing URLs/headers.
With the fixture's blocking service worker, those same requests are observed in
its fetch handler and never reach HTTP. After actual `prepareWindowRealm` and
`admitContent` with generated runtime headers, fragment navigation still works,
`privacyHost.mode` is `network-isolated`, and the auditing requests remain caught
by that worker. This route did not bypass service-worker mediation.

Firefox 155.0's ordinary profile emits no native control ping, so that profile
cannot establish runtime rejection. An explicitly recorded profile enabling
`browser.send_pings` and disabling `browser.send_pings.require_same_host` activates
both native controls. Its worker-controlled and prepared cases also produce zero
marker-bearing HTTP requests and show the requests in the worker log. Browser
`/sw.js` update GETs are retained separately rather than mislabeled as auditing
leaks. This is not a complete installed-controller/lifecycle or physical-user-click
coverage claim.

The ping fixture does not test modern reporting or NEL; separate receiver
controls are described below. The
[Reporting delivery algorithm](https://www.w3.org/TR/reporting-1/#attempt-delivery)
uses a null client and skips service workers. Current host responses do not
configure reporting endpoints, and publisher response forwarding admits only a
small header set. That source constraint is not a native reporting receiver
control. Legacy CSP reports, document-scoped Reporting API delivery and persisted
NEL/Report-To state require distinct setup and delivery-time observations.

## Legacy CSP reporting receiver follow-up

[The scoped fixture](reporting-probe.ts), run with `node formal/reporting-probe.ts`,
uses actual current preparation and generated response headers. Its
[receipt](evidence/reporting.json) records source/runner/bundle hashes, browser
versions, exact document headers, worker observations and independent HTTP bodies.
The test worker allows only fixed setup GETs without query strings; ordinary
application fetches and attempted report uploads receive 403.

Native `report-uri` controls in Chromium 153.0.8010.12 and Firefox 155.0 deliver
`application/csp-report` POSTs containing an application-selected blocked image
URL marker. The browsers then differ:

| Context                                                      | Chromium                                                | Firefox                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------- |
| Native reporting document, no worker                         | Marker report reaches HTTP                              | Marker report reaches HTTP                              |
| Same reporting document under blocking worker                | Worker observes and refuses report; no marker HTTP      | Report bypasses worker and reaches HTTP                 |
| Actual prepared environment, production headers              | No marker HTTP; metadata injection raises SecurityError | No marker HTTP; metadata injection raises SecurityError |
| Actual prepared environment with fixture-injected report-uri | Worker observes/refuses report                          | Marker report bypasses worker and reaches HTTP          |

The last row is an adverse **trusted-header configuration** control. Production
responses do not contain that directive; the fixture adds it solely to establish
the browser route. The attacker controls an image URL that triggers a violation,
not the receiver configuration. Thus the test demonstrates a browser-originated
channel when reporting is configured, not a default production escape.

No application path to configure report-uri, report-to, Reporting-Endpoints or NEL
was identified in the reviewed production source. In addition to generated
headers in [response-policy.ts](../src/runtime/response-policy.ts),
[document-content.ts](../src/runtime/contexts/document-content.ts),
[markup.ts](../src/shared/markup.ts) and
[native-markup.ts](../src/runtime/enforcement/native-markup.ts) restrict policy
metadata. [Publisher response forwarding](../src/runtime/publisher/controller.ts)
accepts only content-language, cache-control, expires, last-modified, etag and
vary from application response headers. The dynamic metadata probe confirms one
blocked injection route; it is not an exhaustive proof over every DOM operation.

Legacy report-uri must not be conflated with modern Reporting API delivery. The
[CSP legacy request algorithm](https://www.w3.org/TR/CSP3/#report-violation)
uses the violating environment as its client; the modern reporting delivery
algorithm has a null client and disables service workers. Native implementation
behavior is recorded per browser rather than assuming that all `report`
destinations have identical routing.

Modern Reporting API and NEL now have separate calibrated controls below. Legacy
reporting results do not establish their behavior.

## Modern Reporting API and persisted NEL

Run [the scoped fixture](modern-reporting-probe.ts) with
`node formal/modern-reporting-probe.ts` after installing Playwright Chromium and
making `openssl` available. The [receipt](evidence/modern-reporting.json) contains
actual executable arguments, source and bundle hashes, document headers, worker
observations, and independent HTTPS receiver bodies. It uses full Chromium
153.0.8010.12, removes Playwright's `--disable-background-networking`, and enables
short reporting delays. HTTPS uses a temporary certificate with an SPKI exception,
matching the approach in the
[WPT Chrome runner](https://github.com/web-platform-tests/wpt/blob/7e1243dd51da4162ea4a0b0e539b40db0144b22c/tools/wptrunner/wptrunner/browsers/chrome.py).
It changes no system trust settings.

| Scenario                                                                        | Independent receiver observation                                                                                                   |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Native modern CSP reporting                                                     | Actual `application/reports+json` POST contains the blocked-image marker                                                           |
| Native NEL before prepared execution                                            | Success report contains the requested URL marker                                                                                   |
| Actual preparation and production headers, with that NEL policy still active    | Unknown GET, POST and image requests are worker-blocked; no application marker reaches either HTTP receiver or reporting collector |
| Actual preparation with fixture-added `Reporting-Endpoints` and CSP `report-to` | Modern CSP report carries the application-selected external image URL marker to the separate collector origin                      |
| Native NEL after prepared execution                                             | Another requested URL marker reaches the reporting collector                                                                       |

The modern reporting control bypasses the service worker despite the generated
`connect-src 'self'` and `Connection-Allowlist: (response-origin)` policies. The
application controls the violating image URL; the fixture controls the reporting
endpoint and CSP directive. Current production responses supply neither reporting
header. This is a demonstrated conditional browser-originated channel, not a
current production escape. Deployment reporting configuration is part of the
confinement assumptions.

The NEL policy is deliberately seeded before preparation and remains active for
the final native control on the same origin and browser context. The collector
uses another origin so NEL does not recursively report its own uploads. Synthetic
worker refusals produced no marker-bearing NEL upload in this test; the fixture
rechecks that result after the final successful native upload. This covers the
specific attempted GET, POST and image requests, not every network error,
context lifecycle, persisted policy variant or browser implementation. Firefox
modern reporting and NEL remain unverified. A sampled header-free deployment
response does not establish the absence of policy on all routes or in persisted
browser state.

The [live check](live-identity-check.ts) also samples direct runtime responses and
an installed application response for reporting headers and CSP reporting
directives. Those samples passed on October 30, 2026. They do not inspect earlier
responses, untested routes or reporting policies already stored in a browser.

## Optional background-networking reporting diagnostic

[The native diagnostic](reporting-background-probe.ts) compares ordinary
Playwright Chromium with a launch that removes only
`--disable-background-networking`. It asserts the actual browser command line,
not just the launch options. Run it manually after `npm ci`, installing
Playwright Chromium and making `openssl` available:

```sh
node formal/reporting-background-probe.ts
```

It is not a default CI requirement. The
[diagnostic receipt](evidence/reporting-background-networking.json) is explicitly
**UNCALIBRATED** for modern Reporting API and NEL delivery. The three profiles are
loopback HTTP with the default flag, loopback HTTP with that flag removed, and
loopback HTTPS with it removed. Each has an active legacy CSP report receiver.
The modern controls generate CSP reports and use CDP's privileged test-report
command as an additional uploader diagnostic; that command is not an application
capability.

Restoring background networking did not produce an observed modern/NEL upload in
these earlier headless-shell profiles. Full Chromium subsequently delivered both
native controls using the same SPKI approach, as recorded above. The executable
choice therefore matters; the old zero-upload result is not containment evidence.
The temporary certificate exception is not an installed trust anchor, but official
WPT uses this exception for reporting tests and the new independent uploads
calibrate this specific profile. The diagnostic remains outside default CI.
