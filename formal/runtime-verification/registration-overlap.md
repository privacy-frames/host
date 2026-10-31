# Registration overlap during a later launch

Unregistering a controller does not establish a permanent boundary if a later
launch can register its scope again. The Firefox experiment reproduces update
requests from local document creation after that scope is reused or a covering
ancestor scope is registered. The original
page retains its controller reference and its local fetch response still comes
from the original worker.

Run `node formal/runtime-verification/registration-overlap.ts`. The
[receipt](registration-overlap.json) records 36 samples across Chromium, Firefox
and Firefox with the forced-stale check. This is a native browser experiment;
the production launch protocol is unchanged.

## Setup and observations

Each sample uses a fresh browser context. The first page registers a worker for
`/one/`, explicitly requests control, unregisters it and verifies that its
registration is absent. A separate setup page then either leaves that scope
absent, registers `/one/` again, registers the distinct sibling scope `/two/`, or
registers the ancestor scope `/`.
All registrations use the same script URL and options. The second registration
does not call `clients.claim()`.
After the second setup, the runner enumerates registrations again and requires
the exact old scope to remain absent except in the deliberate reuse cases.

After a measured three-second quiet interval, the original page performs a local
fetch or creates a `srcdoc`/Blob iframe. The fetch response contains a per-global
token so the test can identify the serving worker. The server records every HTTP
request during the operation and three subsequent seconds.

| Later registration             | Chromium      | Firefox       | Firefox forced stale |
| ------------------------------ | ------------- | ------------- | -------------------- |
| Absent                         | None observed | None observed | None observed        |
| Reused scope, local fetch      | None observed | None observed | None observed        |
| Reused scope, local document   | None observed | Update        | Update               |
| Distinct sibling scope         | None observed | None observed | None observed        |
| Ancestor scope, local fetch    | None observed | None observed | None observed        |
| Ancestor scope, local document | None observed | Update        | Update               |

“Update” means a request for `/sw.js`. The local document itself contains no
network resource. Chromium returns the original worker's token when the scope is
registered again; Firefox returns a different token. A successful `register()`
call therefore does not by itself establish a fresh worker global.

The child controller URL is recorded as a diagnostic. It is not authentication
evidence or proof that child messaging and resource interception work. The
separate [unregistration experiment](maintenance-backends.md) already shows loss
of new-worker interception in Firefox.

## Launch obligations

A candidate launch protocol must prevent a later registration from reviving the
maintenance path of an existing private execution. Different scope identities
are insufficient: an active ancestor scope also triggers the observed request.
Distinct sibling scopes avoid that trigger, but their allocation and lifetime still need an
implementation argument. This is registration separation within one origin;
applications still share origin storage and browser permissions.

The proof must account for scope reuse while old clients or queued operations
remain, registration/activation ordering, retained controller handles and local
resource delivery to new contexts. These bounded observations do not establish
those lifecycle properties. The [message broker](message-resource-broker.md)
supplies a transport candidate for contexts that cannot rely on interception.

## Prefix coverage and queued updates

Run `node formal/runtime-verification/registration-lifetime-check.ts` with the
pinned Lean release. `RegistrationLifetime.lean` represents scopes and client
association addresses as symbol lists. A scope matches an address when it is a
prefix. The association address selects a registration; it is not the remote
service-worker script destination.

The state records registrations, pending association lookups, authorized requests
and whether an old-client-caused request has transmitted. Authorization and
transmission are separate events. Unregistering removes a registration but
leaves authorized requests intact. A checked counterexample authorizes a request,
unregisters its scope, then transmits it. This is a model result, not a newly
observed browser schedule.

Fourteen checked propositions cover prefix separation, initial safety,
single-step preservation, arbitrary finite traces, the no-network consequence
and concrete counterexamples. Safety requires every registration to be
prefix-incomparable with the protected scope, queued association addresses to
remain within that scope, and no already-authorized old-client request at the
private boundary. Subject to those conditions, registration, unregistration,
queuing, authorization and transmission preserve safety for arbitrary finite
traces and queue lengths.

The model rejects same-scope reuse and covering ancestors. It also rejects a
registration below the protected scope, because that registration could cover a
reachable descendant address. Sibling registration is safe in the concrete
example. A separate theorem proves that distinct equal-length scope strings
cannot be prefixes of one another; it does not implement freshness, allocation
or browser URL serialization.

The checker requires the exact fourteen theorem names and their reported logical
axioms. The two prefix lemmas are axiom-free; the remaining proofs report
`propext` and `Quot.sound`. An unconditional-transmission fault and an
exact-scope-only registration rule fail proof checking. Replacing the actual
preservation proof with an unchecked proof body returns compiler success, but
adds `sorryAx`; the checker rejects those axiom reports even after removing the
compiler warning from its input.

## Correspondence still required

The production launch protocol must establish the model's premises. This needs
an argument for actual serialized scope URLs, native controller inheritance,
which registration an update selects, and the point where a pending request can
no longer be prevented. Unregistration alone cannot establish the initial
absence of authorized private effects. Trusted setup requests also need an
independence argument.

The model considers registration coverage in one origin and storage key. It does
not execute browser selection algorithms, bind native clients, implement a URL
allocator or preserve offline reload by itself. The existing thirty-six native
samples remain evidence about selected browser schedules. The
[model receipt](registration-lifetime.json) records the checked statements,
preconditions, toolchain and fault-control digests separately.
