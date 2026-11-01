# Private native script URL admission

This records the policy-6 native Trusted Types integration and its validation
receipts. That candidate retained HTTP worker bootstrap and refused Blob workers
in CSP. The subsequent [policy-7 candidate](local-worker-startup.md) uses the gate
for local dedicated-worker startup; the policy-6 receipts retain their original
source and build scope.

## Implementation

`response-policy.ts` requires Trusted Types and permits only the reserved
`privacy-frames-runtime` and `default` policy names. Window and worker preparation
reserve both names before application execution. Shared and publisher worker
names include the new context policy version, preventing reuse of policy-5 globals.

`enforcement/script-urls.ts` keeps the named policy and its captured createScriptURL
method in a private closure. Its returned function accepts text and produces a
native branded value for trusted callers. Those callers validate the resource or
bootstrap first and pass the value directly into a captured native sink. They do
not convert it back to a string or return it to application code.

The default policy permits ordinary HTML and Script values and throws for every
script URL. Its URL callback uses neither caller-supplied sink arguments nor
application functions. Default HTML/Script acceptance supplies no confidentiality
guarantee; the existing DOM, navigation, context and effect adapters remain required.

Application HTML/Script policies use local facades. They run the application's
conversion callback and call only the captured public default-policy HTML or
Script method. They never receive the private URL policy or its minting method.
Script-URL and parser-options callbacks are refused, and host policy names remain
reserved. These facades are a compatibility adapter rather than native policy
objects; they do not extend the browser's native policy-name allowlist.

Bypassing the facade and invoking the retained native factory still cannot
create another URL issuer under CSP. The facade therefore exposes no minting
authority beyond the public HTML/Script methods already available to the
application.

Preparation checks actual enforcement. It gives a raw empty Blob URL to the
native Worker constructor and requires the exact private refusal thrown by the
default policy. Shared-worker globals without that constructor use native
importScripts and require the same refusal, including for module workers.
An accepted handle is terminated and preparation fails; the Blob
is revoked in either outcome. A missing API, missing enforcement or occupied
policy name refuses preparation. API presence alone does not pass this check.

The private gate feeds dedicated and shared worker factories, the publisher
executor, classic worker entry/importScripts calls, and dynamic/rendered HTML
script URLs. Logical application-facing script URLs remain strings. The private
computation frame reserves its own policies before evaluating trusted source;
its frame and policies are not published to the application.

## Native checks

Run `npm run test:trusted-runtime`. The
[gate receipt](../../results/contexts/script-url-gate.json) covers eight cases in
Chromium and Firefox using the production helper. Normal cases exercise private
Worker construction, a prepared worker's classic imports, native script setters,
HTML assignment and eval. Replaced policy methods and URL coercion methods receive
no calls during those private operations. The earlier
[source-policy experiment](local-worker-bootstrap.md) supplies explicit controls
showing that those replacements are active when called directly.
The production-helper cases also check native HTML/Script brands from application
policies, argument forwarding, URL-method refusal, and CSP rejection through a
fixture-retained original native policy-creation method.

The other six cases remove the required CSP, remove the Trusted Types API or
occupy the private policy name. Every case refuses setup before publishing the
test exerciser. The fixture allows owned marker HTTP loads and omits the other
runtime adapters; these are gate tests, not whole-confinement observations.

The installed worker regression also retains a fixture-only native constructor
captured before guard setup. Ordinary, Blob and controller-script URL strings now
fail synchronously with TypeError, before the controller records a startup
attempt. The separate directory-CSP test deliberately brands its inputs to check
that CSP still refuses unapproved sources independently of raw-string refusal.
The shared-worker protocol test retains a host-issued bootstrap brand through
a fixture-only constructor hook so it can still challenge native ticket
admission. Its separate raw-string construction attempt must fail. Production
does not include that hook.

Two fixture changes were needed. Firefox refused inline SVG bootstrap metadata
under the new CSP; the owned document-factory fixture now serves that metadata
in its external bootstrap script. The detached DOMPurify research candidate
also needed captured HTML branding for parsing after its frame was removed.
Its adapter can mint HTML only and refuses Script/ScriptURL creation. DOMPurify
remains a comparison dependency, not a production parser or application-specific
runtime exception.

The first unchanged-application comparison exposed a Firefox startup failure in
Pitch Training when its framework requested an HTML-only policy. The general
policy facade recovers that behavior without a publisher-name check or an app
patch. All eight applications then passed their selected standalone/confined
tasks and offline reloads in both browsers. The compatibility receipt retains
its exact source and artifact inputs.

The [candidate validation record](script-url-validation.json) ties the checks to
one source and build, including the sixteen maintenance observations that still
contradict complete confinement.

## Remaining obligations

The named policy alone does not protect an unprepared same-origin realm: the
native experiment demonstrates that such a realm can mint an accepted URL.
Existing context and navigation mediation must establish preparation and reserve
names in every reachable global. Complete authority mapping and caller ownership
proofs remain open, including non-exposure of reusable branded values.

Native module loading, parser-created scripts, worklets and other consumers do
not acquire coverage from the Worker/importScripts tests. Their resource and
context contracts remain separate obligations. Browser contracts, prototype
behavior and enforcement need review for other versions or configurations.

This gate is a prerequisite for evaluating local worker bootstrap. Native client
discovery still needs factory ownership, parent/generation checks and late-binding
cancellation. Local dependencies, module graphs and registration lifetime must
also be addressed before the maintenance channel can be considered repaired.
