# Document and popup control over private messages

Document and popup factories now request registration and closure through the
captured controller transport. Child guards obtain configuration and one-time
content through a private channel to their owning parent. These operations need no
HTTP requests. Native document navigation and guard-script loading still use
HTTP bootstrap addresses and remain part of the open maintenance obligation.

The controller looks up the browser's message source and resolves its current
window binding. That binding and the stored installation determine the owner;
payload fields cannot select an application or caller identity. Creation checks
the source against the admitted graph, then revalidates authority before and
after issuing the intent. A failed final check closes the issued intent.

The parent factory fixes the child identifier and parent token; child packets
cannot select another grant. Its handler accepts only configuration and content.
The controller authenticates the actual parent client, checks its token and
resolves the bound native child. It then uses the same child configuration and
content operations, rechecking the intent and both actors before returning the
result. Closing requires the owning parent and its token. Content consumption
remains a single IndexedDB operation that removes the payload. The controller rechecks the context and
installation after reading or consuming content and before returning it. These
checks are not one transaction across the context and installation stores.

The factories retain native fetch only for local Blob source reads. Other
resource reads continue using the existing resource adapter. The document
controller no longer serves HTTP registration, configuration, content or closure
operations; its HTTP handler serves the native shell and trusted guard script.
The separate dedicated-worker closure route remains an HTTP protocol.

## Evidence

`test/document-control.ts` runs the built controller with actual browser clients
and real storage in Chromium and Firefox. An inert child guard lets the fixture
order configuration and content calls. Test-only native handles let it challenge
client authorization without relying on the application-facing adapters. These
handles are absent from production code.

The fixture checks unbound clients, missing resources, invalid surfaces, parent
attempts to read through the child-only operation, a different window using the
correct parent token, and the owning parent using an incorrect token. Parent
relay reads fail before native child binding; the owning parent's configuration
read succeeds afterward. Concurrent parent and child content requests deliver
the payload once. A consumed intent cannot provide configuration again, and a
closed child cannot request another grant. A separate
message-only interval checks creation, closure and refusals against the host's
HTTP receiver. It excludes the preceding native navigation interval.

`test/document-consumption-race.ts` checks post-consumption closure and changes
to ownership or installation generation. Eight parent-relay cases cover unchanged
authority, those three child changes, three parent changes and intent closure.
Separate source mutations remove the child or parent final authority check; the
corresponding changed-authority cases then deliver content. The fixture uses the
actual controller and IndexedDB intent store, with simulated client identities
and context storage.
The document factory, rendering, popup receiver and installed document tests
exercise preparation and publication separately. Their receipts retain the
source and build inputs of each run.

`test/parent-channel.ts` also exercises the production document-parent handler
with a fixture controller. Wrong message types and unsupported operations never
reach that controller. Accepted child packets with forged identities or payloads
still forward only the factory's fixed identifier and token. This fixture does
not authenticate native service-worker clients; the built-controller test above
checks that boundary separately.

## Remaining obligations

Private controller handles, reply ports and factory state need an ownership
proof through callers, callbacks and permitted prototype changes. Registry and
installation revalidation need a defined grant point and correspondence to the
lifecycle model. Browser-owned update requests during native context creation
remain unresolved. The message-only receiver interval establishes neither
complete browser coverage nor the full confinement claim.
