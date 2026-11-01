# Local worker bootstrap prerequisites

Two native experiments address the remaining HTTP worker bootstrap. Neither
changes the production factory, its CSP or its admission protocol.

## Native identity without a bootstrap fetch

Run `node formal/runtime-verification/blob-worker-identity.ts`.
Twelve cases cover classic/module workers, registered/unregistered service workers,
Chromium, Firefox and forced-stale Firefox. An HTTP worker supplies the existing
FetchEvent-based identity control. A separate Blob worker runs a metadata-only
script and completes a transferred-port handshake with its owning native handle.

In every case, `clients.matchAll({type: 'all', includeUncontrolled: true})` returned
one worker client with the exact Blob URL. The worker-only query returned it too,
and `clients.get()` resolved its native ID and URL. The HTTP worker's independently
recorded resulting-client ID also resolved. The page remained the native source
of relayed controller requests; a parent relay did not become a worker sender.
No Blob bootstrap fetch event or HTTP request occurred during creation and the
following three seconds, after setup became quiet.

The dated [Service Workers specification](https://www.w3.org/TR/2026/CRD-service-workers-20261029/#clients-matchall)
includes worker clients in this query. The [receipt](blob-worker-identity.json)
records the actual browser observations, including native IDs, URLs and query
results. Chromium had no WorkerNavigator service-worker container; Firefox did.
The lookup therefore offers a common route that does not require that container.

This establishes a candidate for retaining the current native-client registry.
It does not authenticate a factory's claim to a supplied URL. A production birth
protocol must establish ownership, require an unambiguous live native client,
check the installation and parent chain, and cancel a late binding after closure.
A private-port reply containing a URL is not itself native identity evidence.

## Source admission for Blob workers

Run `node formal/runtime-verification/local-bootstrap-policy.ts`.
Fourteen metadata-only cases examine native CSP and Trusted Types in Chromium and
Firefox. The ordinary controls run both scripts before restrictions. These test
pages deliberately omit the production DOM and navigation mediators.

| Candidate                                | Observed in both browsers                                                                                                                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact Blob URL in `worker-src`           | Both the intended prefix and the other script failed. This input did not selectively admit the bootstrap.                                                                                                                                             |
| Named Trusted Types policy               | Raw URL strings threw; the policy-created TrustedScriptURL ran. Duplicate policy creation was refused in that global.                                                                                                                                 |
| Fresh same-origin child                  | The unprepared child could create the same policy name and mint a URL accepted by the parent's native Worker constructor.                                                                                                                             |
| Additional `trusted-types 'none'`        | The existing parent policy still supplied a working worker URL. Fresh children could not create policies, but neither could the resulting Blob workers. Creating the Blob in a differently configured helper frame did not change that worker result. |
| Default policy refusing every script URL | Ordinary HTML assignment and eval worked. Raw worker strings and script-src assignments were refused; private policy-created worker URLs ran. Direct default-policy URL creation also failed with a spoofed sink argument.                            |
| Captured policy method under mutation     | Replacing the policy method and TrustedScriptURL coercion methods did not affect private minting or native Worker construction. Explicit calls confirmed both replacements were active.                                                                 |
| Classic worker imports                    | A worker created its own named policy. Raw importScripts input was refused before the marker ran; its private TrustedScriptURL loaded that marker.                                                                                                      |

[HTML's Worker constructor](https://html.spec.whatwg.org/multipage/workers.html#dom-worker)
uses TrustedScriptURL checks. The [Trusted Types specification](https://www.w3.org/TR/trusted-types/)
also defines policy creation and default-policy handling. The
[receipt](local-bootstrap-policy.json) pins the native results and source inputs;
API presence alone is not the enforcement check.

A private script-URL policy, combined with a default policy that permits ordinary
HTML/Script values but rejects all script URLs, is worth integrating next. Host
script-URL sinks would need explicit private values. Application code must never
receive a URL-minting policy or a reusable trusted URL. Every application-reachable
global must already be prepared and have its reserved policies established.
The fresh-child case shows why DOM/context mediation remains necessary; it is a
counterexample to the policy-only design, not an escape from the current host.

The mutation cases exercise a captured policy method and direct native sink call.
They record zero application coercion calls during that operation, followed by a
successful explicit coercion control. Converting the trusted value to a string
would invoke the replacement and discard the native brand. Production code must
retain the private policy and captured minting method, then supply the branded
object directly to its captured native sink. This experiment does not establish
that every production caller already follows that rule.

The `'none'` experiment also prevents using that directive as a simple blanket
repair: a worker guard could not create its own policy for later native script
imports or nested worker construction. Its entry script ran, so this was policy
creation failure rather than a failed worker bootstrap.

## Runtime integration obligations

The current runtime has several callers that supply plain script URL strings.
The gate must cover them before CSP can require typed inputs. This table records
the reviewed entry points; it is not a complete browser-sink inventory.

| Caller | Required integration |
| --- | --- |
| `contexts/worker-factory.ts` | Mint the validated host bootstrap URL directly into the captured native Worker constructor. Keep the policy and branded value out of the returned handle. |
| `contexts/shared-worker-factory.ts` and `publisher/client.ts` | Apply the same rule to both native SharedWorker construction paths, preserving names, type and existing admission checks. |
| `contexts/worker-realm.ts` | Gate both initial classic entry loading and subsequent importScripts calls. Reserve the worker's policies before loading application code; parent policies do not reserve names in the worker. |
| `enforcement/scripts.ts`, `enforcement/dom.ts` and `contexts/document-renderer.ts` | Supply private branded URLs to native script setters and attribute calls after existing resource validation. Preserve logical string URLs in application-facing getters and records. |
| `trusted/context.ts` | Prepare the private computation frame's policies before evaluating its trusted source. The parent default policy does not establish that child's default policy. |

The public default policy must reject every script URL, including explicit calls
with caller-supplied sink arguments. Its HTML and Script identity callbacks retain
ordinary application behavior; existing markup, navigation and context controls
remain responsible for admitting that behavior. Native module loading, worklet
loading, parser-created scripts and other URL consumers need separate coverage;
this worker/import experiment does not establish that those paths use this gate.

Integration requires positive tests for unchanged script, worker, shared-worker
and publisher behavior, plus raw-constructor and fresh-realm rejection controls.
Test unavailable enforcement as a refused launch, rather than accepting a missing
Trusted Types API as a successful case. The runner now rejects missing support
and requires the recorded fresh-child and inherited-policy observations.

## Production gate

Before adding Blob URLs to the runtime worker policy, connect private URL minting,
native-client discovery, parent ownership, preparation and publication. Include
raw-constructor controls, policy leakage attempts, fresh-realm routes, pending
closure and controller replacement. Preserve native Worker handles and ordinary
asynchronous operation. Refuse unsupported preparation before application code.

Local bootstrap alone leaves native importScripts/module loading and other HTTP
resource paths. Those need local delivery and their own contracts. Registration
lifetime and the known service-worker maintenance channel remain open; neither
experiment establishes complete confinement.
