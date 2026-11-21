# Browser-owned services and confinement

## Scope decision on 21 November 2026

The project keeps web-only hosting and trusts the browser's normal built-in
services. Autofill and similar browser-service communication are outside the
host's application-transport enforcement claim. Application network calls,
resource URLs, navigation and explicit communication APIs remain within scope,
regardless of which browser process implements them.

The experiment below characterized a broader zero-browser-communication target.
Its recorded outcome is retained with that original scope. Under the
[current threat model](../../threat-model.md), this normal browser-service
behavior is part of the trusted platform, not a requirement to change deployment.

This static review covers browser services that can act on displayed content or
retained browser state without an application fetch. Source was reviewed at
`5f61e08bcd73d26ced1df8e1c42863bafec9cfb1`; the relevant DOM, browser,
web-services, worker factory/registry, runtime worker and bridge files matched that
commit throughout the static review. Primary documents were consulted on
20 November 2026. The installed-runtime experiment below was added on 21 November.
It used blank synthetic controls and an owned loopback mock, with outside
networking disabled.

The clearest route identified during the broader review was browser form classification. Chromium can query
its prediction service when it observes eligible forms, before submission. Form
appearance and structure are application-controlled, so even request occurrence
can depend on confidential application state. Blocking JavaScript transports and
form submission does not cover that producer. The sources below establish its
mechanism and prerequisites; they do not establish an observed disclosure from the
current installed runtime. The later experiment below establishes this route in
one explicitly recorded browser configuration.

## Installed-runtime experiment

At source `0195a96`, the controlled fixture installed a small application through
the real manager and installer, then closed that browser process. A new process
reopened only the installed application from the same profile. Its document was
served by the production runtime service worker, and its readiness marker was
checked before the observation began.

The application initially displayed a button and no inputs. After ten seconds,
the test clicked that button. The application's own JavaScript then rendered a
form with seven blank controls through the guest DOM bridge. Nothing was typed or
submitted. The mock counted classification requests before and after that action:

| Case                                                               | Before rendering the form | After rendering the form |
| ------------------------------------------------------------------ | ------------------------: | -----------------------: |
| Native page, server communication disabled                         |                         0 |                        0 |
| Native page, default server-communication feature state            |                         0 |                        1 |
| Installed confined app, default server-communication feature state |                         0 |                        1 |

The runtime response contained its actual `connect-src 'none'`,
`form-action 'none'`, sandbox, Permissions Policy and Connection Allowlist headers.
Those controls did not suppress the observed browser-owned request. The request
recorded during installation was counted separately; that process had exited
before the runtime observation.

The browser was Chrome for Testing `153.0.8010.12`, revision
`971a7443b0c9b0a9b2860529b33331b76077ec62`. The native and confined cases left
`AutofillServerCommunication` at its default state. Only the negative control
disabled it. All cases removed Playwright's background-networking disable switch.
The earlier feature-enabled run at `973b1aa` produced the same counts and is
retained under `feature-enabled-control/`. These are fresh-profile, headless
observations with the recorded arguments, not a survey of user configurations.

Docker `--network none`, dropped capabilities and a read-only root filesystem
provided the independent network boundary. Only loopback interfaces were present.
Chromium's supported diagnostic server override directed classification to the
owned mock; no real classification service received a request. The observation is
about the browser selecting and initiating this request after confined rendering,
with its destination replaced for the experiment.

The [driver](../../../test/browser-owned-services.ts),
[container fixture](../../../test/browser-owned-services.container.ts) and
[receipt](../../../results/quickjs-confinement/browser-owned-services/result.json)
record source/build hashes, exact browser identity, actual process arguments,
container configuration, response headers and counts. The earlier exploratory
receipts are retained separately and do not substitute for this process-separated
observation. A successful fixture execution records `qualifiedConfinement: false`;
it is a finding against the original broader target, not a passing security qualification.

## Web-controlled suppression candidates

The exact-revision source review did not find a query opt-out in the following
mechanisms. This does not establish that every possible web control has
been ruled out.

- `Permissions-Policy: autofill=()` controls cross-origin filling. The
  [filling decision](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/autofill/core/browser/foundations/autofill_driver_router.cc#87)
  consults it; `FormsSeen` routes extracted forms separately. The
  [driver](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/autofill/content/browser/content_autofill_driver.cc#498)
  also enables that filling permission for the main frame and same-origin descendants.
- Removing `allow-forms` affects
  [form submission](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/third_party/blink/renderer/core/html/forms/html_form_element.cc#650).
  The reviewed
  [extraction path](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/autofill/content/renderer/autofill_agent.cc#1961)
  updates the form cache and sends `FormsSeen` without that submission gate.
- `autocomplete=off` becomes
  [field metadata](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/autofill/content/renderer/form_autofill_util.cc#2051).
  The reviewed
  [query encoding](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/autofill/core/browser/crowdsourcing/autofill_crowdsourcing_encoding.cc#576)
  does not use `should_autocomplete` to exclude those fields.

Connection Allowlists are
[enabled by default](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/services/network/public/cpp/features.cc#351)
in this revision. The emitted `(response-origin); redirects=block; webrtc=block`
also matches the
[header parser](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/services/network/public/cpp/connection_allowlist_parser.cc#83).
The separate experimental iframe-attribute feature does not control the base
response-header feature.

Enforcement uses the URL loader factory's
[restriction identifier](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/services/network/cors/cors_url_loader_factory.cc#433).
[ChromeAutofillClient](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/chrome/browser/ui/autofill/chrome_autofill_client.cc#433)
uses the browser-process factory, whose
[construction](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/content/browser/storage_partition_impl.cc#3580)
explicitly selects `GetNoOpNetworkRestrictionsId()`. Request isolation metadata
does not replace that factory identifier. A document's allowlist therefore does
not govern this reviewed producer, even if that document's policy is correctly
registered. Capturing the header alone still does not qualify document-side
enforcement; that requires a working native request and its corresponding blocked
control.

A separate native-DOM exploration compared HTTP, HTTP child, preserved blank,
`srcdoc` and Blob documents. It used the default server-communication feature
state, the same loopback-only container boundary, and a form containing eight
blank controls, including a password field. The test then entered a fixed
synthetic name and focused the password control:

| Native document         | Requests after rendering | Requests after focus |
| ----------------------- | -----------------------: | -------------------: |
| HTTP                    |                        1 |                    1 |
| HTTP child              |                        1 |                    1 |
| Preserved `about:blank` |                        0 |                    1 |
| `about:srcdoc`          |                        1 |                    1 |
| Blob                    |                        0 |                    1 |

Initial silence in blank and Blob documents therefore did not survive the tested
interaction. This exploration did not run the guest interpreter or the runtime's
CSP, so it cannot qualify their combination or identify every possible control.
The exact producer of the post-focus request remains unisolated. The
[executed source, observations and scope](../../../results/quickjs-confinement/browser-owned-services/document-modes/scope.json)
are retained; document type alone is not an established mitigation.

## What the existing headless launch qualifies

One representative read-only launch inspection reported `HeadlessChrome/153.0.8010.12`, revision
`971a7443b0c9b0a9b2860529b33331b76077ec62`. The source trace below now uses that
revision. Captured launchServer process arguments include
`--disable-background-networking` and disable-features entries `Translate` and
`OptimizationHints`, but no `AutofillServerCommunication` entry. The argument
observation came from process spawn arguments; Browser.getBrowserCommandLine was
unavailable without its automation flag. This is launchServer metadata, not an
argument trace from every historical test run. The table gives static consequences
of that launch and the indicated context mode; it does not establish native service
positive controls. No forms or service requests were tested.

| Path                                           | Exact-revision gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Consequence for current headless evidence                                                                                                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remote spelling                                | `SpellingServiceClient::IsAvailable` rejects off-the-record contexts, disabled spelling/service preferences and missing suitable dictionary configuration. [Service gate](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/spellcheck/browser/spelling_service_client.cc)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Nonpersistent Playwright contexts cannot calibrate the enhanced-spelling path. Quiet results there do not verify the document's suppression controls for a normal profile.                                                             |
| Autofill prediction queries                    | Server communication is enabled by default. The manager requires a valid server URL and the feature; the request's off-record handling supplies variations metadata rather than denying the request. [Feature default](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/autofill/core/common/autofill_debug_features.cc), [request gate](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/autofill/core/browser/crowdsourcing/autofill_crowdsourcing_manager.cc)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Neither the supplied disable-features subset nor the background-networking switch establishes suppression on this reviewed producer chain. Preferences, form eligibility, earlier renderer gates and caches still require calibration. |
| Autofill submission votes                      | `ShouldUploadForm` requires autofill enabled, a qualifying form and a context that is not off the record. [Upload gate](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/autofill/core/browser/foundations/browser_autofill_manager.cc)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | These uploads are disabled in off-record test contexts. That does not imply prediction queries are disabled, or qualify ordinary-profile submission behavior.                                                                          |
| Translation                                    | TranslateService passes the background-networking switch to a resource-request notifier; its false permission disables language-list refreshing. A hardcoded language list remains. The reviewed translation feature definitions and manager contain no generic Translate gate matching the legacy argument; TranslateScript has a separate request path. [Translate service](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/chrome/browser/translate/translate_service.cc), [notifier](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/web_resource/resource_request_allowed_notifier.cc), [language list](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/translate/core/browser/translate_language_list.cc), [feature definitions](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/translate/core/common/translate_features.cc), [script requests](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/translate/core/browser/translate_script.cc) | Language-list request suppression is established statically. Suppression of every translation action is not. The legacy feature name and absence of headless UI are not native positive controls for ordinary browser translation.     |
| Optimization hints / cloud-assisted autofill   | OptimizationHints is an actual feature and `IsOptimizationHintsEnabled` reads it. Ordinary autofill crowdsourcing has its own feature. [Hints gate](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/optimization_guide/core/optimization_guide_features.cc)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | The supplied flag disables this hints feature. It does not establish that every remote model executor or form-understanding feature is disabled; those require their own account, preference and executor trace.                       |
| Retained identity/reporting/registration state | A fresh test context lacks the deliberately established state needed for some conditional paths.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Fresh quiet runs do not qualify retained FedCM accounts, NEL policy or aged registrations. No blanket suppression is credited to background-networking for these routes.                                                               |

## Routes and current controls

| Browser-owned route                                               | Documented mechanism and prerequisites                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Current owner / mitigation                                                                                                                                                                                                                 | Required premise or evidence gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enhanced spelling                                                 | Chrome documents sending editable text for remote suggestions when the service is enabled. Basic spelling is local. [Chrome spelling documentation](https://support.google.com/chrome/a/answer/13616585?hl=en)                                                                                                                                                                                                                                                                                   | `dom.ts` prepares HTML with spellcheck disabled, and `browser.ts` protects the attribute/property mutation paths.                                                                                                                          | HTML permits user-forced checking to override the attribute; the IDL getter can still report false. Suppression therefore needs a browser-configuration contract, beyond the attribute invariant. [HTML checking algorithm](https://html.spec.whatwg.org/multipage/interaction.html#spelling-and-grammar-checking)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Writing suggestions and autocorrection                            | Editable controls/regions can invoke browser input assistance. HTML defines the controls and permits writing-suggestion preference overrides; it does not require a remote backend. [HTML editing services](https://html.spec.whatwg.org/multipage/interaction.html#writing-suggestions)                                                                                                                                                                                                         | `dom.ts` forces writingsuggestions=false and autocorrect=off; `browser.ts` protects their mutation/removal paths.                                                                                                                          | Current controls are source-supported. Remote processing for a particular keyboard/browser remains a separate implementation question; this review does not label all suggestions or autocorrection as network services.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Page translation                                                  | Chrome supports page translation and automatic language preferences. Firefox documents on-device text translation, with language resources downloaded separately. [Chrome translation settings](https://support.google.com/chrome/answer/173424), [Firefox translation](https://support.mozilla.org/en-US/kb/website-translation)                                                                                                                                                                | No enforced translate attribute or trusted no-translate metadata was found in the current DOM preparation. Interpreter isolation does not hide rendered text from the browser.                                                             | translate=no expresses translation policy for content; Chromium also documents a no-translate meta hint. Neither is a demonstrated security boundary against every browser/user action here. Enterprise TranslateEnabled=false disables Chrome's built-in translation, but a web page cannot set that browser policy. [HTML translate](https://html.spec.whatwg.org/multipage/dom.html#attr-translate), [Chromium translation design](https://chromium.googlesource.com/website/+/HEAD/site/developers/design-documents/translate/index.md), [TranslateEnabled policy](https://chromium.googlesource.com/chromium/src/+/376fc41e87a058f7a7b300b0ec3a4982b4ec0960/components/policy/resources/templates/policy_definitions/Miscellaneous/TranslateEnabled.yaml) |
| Ordinary autofill/password-manager form predictions               | Chrome documents sending form structure and field names to improve matching. Pinned Chromium source parses forms when either autofill or password management is enabled; query eligibility and cache checks then apply. [Chrome data documentation](https://support.google.com/chrome/answer/14271924?hl=en), [parsing gate](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/autofill/core/browser/foundations/browser_autofill_manager.cc) | The host keeps real native form controls. Submission is cancelled and CSP has form-action none, but autocomplete is not a protected attribute.                                                                                             | Browser-process prediction traffic is outside the application's managed fetch path. autocomplete=off is not a proved classification opt-out, and disabling address autofill alone can leave password-manager parsing enabled. There is no verified mandatory page opt-out in this implementation; detailed prerequisites follow below.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Cloud-assisted form understanding                                 | Chrome documents server-side form understanding for compatible forms and signed-in users with the feature enabled. Current policy source also describes server processing of form structure. [Chrome feature documentation](https://support.google.com/chrome/answer/142893?hl=en), [AutofillGenAiSettings source](https://chromium.googlesource.com/chromium/src/+/HEAD/components/policy/resources/templates/policy_definitions/GenerativeAI/AutofillGenAiSettings.yaml)                       | No host enforcement of that browser setting was found. The navigator facade does not control browser UI services.                                                                                                                          | The policy shown is supported from Chrome 156; it does not establish behavior of the qualified Chromium 153 binary. Feature rollout, account state and actual collected data need version-specific review. Disabling model training is distinct from preventing server processing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| FedCM account disconnect / acquisition                            | Disconnect requires a connected-account tuple keyed by top-level origin, RP origin, IdP and account. Current draft checks identity-credentials-get and connect-src before fetching configuration. A publisher-origin login does not automatically establish the runtime-origin tuple. [FedCM draft](https://w3c-fedid.github.io/FedCM/#dom-identitycredential-disconnect)                                                                                                                        | `web-services.ts` omits native credentials from its navigator facade; `browser.ts` excludes credential/identity interfaces. Runtime headers deny identity-credentials-get and use connect-src none.                                        | Current Chromium source additionally enforces the disconnect Permissions Policy in the browser process. Source-to-tested-binary correspondence and all alias paths still need qualification; historical FedCM observations are not current reachability evidence. [Pinned RequestService](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/content/browser/webid/request_service.cc)                                                                                                                                                                                                                                                                                                                                  |
| Document reporting: CSP, policy, intervention/deprecation reports | Reporting requires configured endpoints and a corresponding report. Delivery explicitly uses service-workers mode none. The modern endpoint list is initialized from the document/worker response. [Reporting API draft](https://w3c.github.io/reporting/#attempt-to-deliver-reports-to-endpoint)                                                                                                                                                                                                | `runtime/worker.ts` constructs fresh response headers; it supplies no Reporting-Endpoints, Report-To, report-uri or report-to configuration. Publisher response headers are not forwarded. `dom.ts` rejects meta http-equiv insertion.     | The fresh-response producer blocks application-supplied reporting configuration. Deployment headers and legacy browser reporting state need their own check. ReportingObserver alone is a local observer, not an endpoint installer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Retained Network Error Logging policy                             | NEL caches origin/partition-scoped policies. Its trigger is an actual HTTP-network-fetch attempt, and reports can include request information. [NEL draft](https://w3c.github.io/network-error-logging/#network-requests)                                                                                                                                                                                                                                                                        | Current generated responses contain no NEL or reporting configuration; app resource requests are locally mediated.                                                                                                                         | A service-worker Response.error is not, by itself, an established NEL trigger: the spec requires a network attempt. Retained policy plus some separately reachable browser-owned network request is the conditional case to resolve. A fresh app does not imply fresh origin/partition state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Service-worker maintenance and preload                            | Registration/script maintenance can bypass service-worker interception. Fetch handling may schedule a soft update for a non-subresource request or a stale registration. [Service Workers algorithms](https://w3c.github.io/ServiceWorker/#handle-fetch)                                                                                                                                                                                                                                         | Guest registration/navigation-preload access is hidden; trusted activation/bridge code disables navigation preload. Dedicated/shared guest bootstraps use validated local Blob URLs; the HTTP registry is prepared before guest execution. | Blob startup removes the reviewed HTTP worker-load trigger. Trusted maintenance can still occur; its independence from private application choices needs a current lifecycle argument. Old maintenance receipts establish a mechanism, not the new runtime's complete coverage.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Autofill: the source-supported conditional case

The following trace is pinned to Chromium commit
`971a7443b0c9b0a9b2860529b33331b76077ec62`, rather than inferred from a UI label:

- `BrowserAutofillManager::ShouldParseForms` permits parsing if either autofill or
  password management is enabled. Disabling address autofill alone is insufficient.
- `AutofillManager` processes forms seen by the renderer and requests predictions
  for changed form signatures. Eligibility filters include HTTP(S), useful text
  controls, size/field thresholds and search-form exclusions. The reviewed path
  does not require submitting the form. [Manager](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/autofill/core/browser/foundations/autofill_manager.cc), [form eligibility](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/autofill/core/browser/form_qualifiers.cc)
- `StartQueryRequest` additionally requires a valid server configuration, enabled
  server-communication feature, acceptable field count and nonempty encoded query.
  A cache hit can suppress a request. The browser client supplies a browser-process
  URL loader, rather than the application's document loader. [Crowdsourcing manager](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/autofill/core/browser/crowdsourcing/autofill_crowdsourcing_manager.cc), [Chrome loader ownership](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/chrome/browser/ui/autofill/chrome_autofill_client.cc)

A conditional counterexample therefore requires an eligible native form, browser
classification enabled, an uncached query and a private application choice that
changes the form presented to the browser. It does not require claiming that raw
input values are uploaded: form structure is itself application-controlled, and
the occurrence of a browser-owned request is observable. Hashing, scrubbing or
noise in metadata is not a proof that request occurrence is independent of that
choice. This was a source-supported candidate at the static-review checkpoint.
The installed-runtime experiment above subsequently established reachability in
the recorded browser configuration.

The host's current submission cancellation and form-action directive constrain
form submission, not that browser-process prediction request. HTML's sandboxed
forms flag is specified to block submission; the review found no standard promise
that it disables remote form classification. HTML also permits a user override of
autocomplete=off. Removing allow-forms or adding autocomplete=off therefore needs
specific implementation evidence before being treated as a security control.
[HTML sandbox flags](https://html.spec.whatwg.org/multipage/browsers.html#sandboxed-forms-browsing-context-flag),
[HTML autofill override](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofilling-form-controls:-the-autocomplete-attribute)

This was a potential architectural obstruction to the original unconditional
zero-browser-communication claim.
The current host cannot enforce the required browser profile setting through its
existing web interfaces. Treating the browser as trusted is insufficient unless
its contract includes keeping this page's private rendered state local. A browser
configuration premise would be an additional requirement, not an implementation
proof of the original guarantee.

## Design of the loopback-only coverage check

This was the experiment design at the static-review checkpoint. The Docker-based
fixture above implements the independent network boundary that was unavailable
in the initial namespace attempt.

Chromium has an official `--autofill-server-url` override, documented as accepting
a server prefix. `GetAutofillServerURL` chooses a valid command-line URL before its
default. The exact-revision `AutofillServerCommunicationTest` exercises this
configuration with an EmbeddedTestServer. A malformed override falls through to
other configuration, so merely finding the argument is insufficient.
[Switch definition](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/autofill/core/common/autofill_switches.cc),
[URL selection](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/autofill/core/browser/crowdsourcing/autofill_crowdsourcing_manager.cc),
[Chromium's test](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/components/autofill/core/browser/crowdsourcing/autofill_crowdsourcing_manager_unittest.cc)

A future defensive fixture can count requests at an owned loopback mock using only
blank/synthetic form controls, comparing an unrestricted native page with the
installed runtime. It needs a validated absolute loopback override, independent
non-loopback egress denial, known classification settings and the eligibility/cache
prerequisites above. It need not retain request bodies or use saved user data.
This override covers ordinary crowdsourcing, not every cloud-assisted service.

A received native-control request is required before interpreting a quiet confined
case. If the native control never queries, the outcome remains unqualified. If
both cases query, that identifies a missing browser-owned control; neither
transport success nor the absence of private field values resolves the security
property. The initial attempt could not create a user/network namespace: UID
mapping returned Operation not permitted. That attempt established no independent
network boundary and qualified no native control. The later Docker fixture records
its own boundary and results separately.

## Coverage follow-up

Autofill and spelling-service suppression are optional platform research under
the adopted trust model. Application API restrictions, trusted response/header
provenance and host-controlled maintenance remain implementation obligations.

1. Preserve the exact browser revision and full launch/configuration receipt, then finish the autofill trace
   through renderer extraction, relevant sandbox gates, query encoding and cache
   selection. Record which settings disable both ordinary classification and
   cloud-assisted features. Signed-in, fresh, retained and off-the-record states
   require separate treatment; off-the-record spelling behavior proves nothing
   about autofill.
2. Determine whether any mandatory web-controlled opt-out prevents classification
   before private DOM publication. Translation hints and autocomplete need native
   control evidence, not just reflected attribute tests. If none can enforce the
   prerequisite, expose that architectural limit in the confinement claim rather
   than quietly excluding browser-owned effects.
3. Requalify spelling/suggestion attribute preparation and all mutation paths on
   the current QuickJS source. The old `ua-spelling.md` receiver observations are
   historical evidence only. Match each suppression claim to browser preferences;
   a false IDL getter does not establish actual service suppression.
4. Verify trusted response/header provenance for all document and worker producers,
   including retained reporting/NEL state and origin partition assumptions. Keep
   document Reporting-Endpoints distinct from cached origin policy. Resolve NEL's
   network-attempt prerequisite before describing any local failure as a channel.
5. Connect current FedCM native capability denial and header policy to the exact
   browser implementation, and cover current Blob worker/registry/preload lifecycle
   in the maintenance model. Fresh-profile tests alone cannot establish behavior
   with retained registrations or account state.

These obligations concern browser-service communication. Storage namespaces and
browser permission isolation between installed apps remain outside this review's
claim, and the table is not an exhaustive list of browser functionality.
