# Registration overlap during a later launch

Unregistering a controller does not establish a permanent boundary if a later
launch can register its scope again. The Firefox experiment reproduces update
requests from local document creation after that scope is reused. The original
page retains its controller reference and its local fetch response still comes
from the original worker.

Run `node formal/runtime-verification/registration-overlap.ts`. The
[receipt](registration-overlap.json) records 27 samples across Chromium, Firefox
and Firefox with the forced-stale check. This is a native browser experiment;
the production launch protocol is unchanged.

## Setup and observations

Each sample uses a fresh browser context. The first page registers a worker for
`/one/`, explicitly requests control, unregisters it and verifies that its
registration is absent. A separate setup page then either leaves that scope
absent, registers `/one/` again, or registers the distinct sibling scope `/two/`.
All registrations use the same script URL and options. The second registration
does not call `clients.claim()`.

After a measured three-second quiet interval, the original page performs a local
fetch or creates a `srcdoc`/Blob iframe. The fetch response contains a per-global
token so the test can identify the serving worker. The server records every HTTP
request during the operation and three subsequent seconds.

| Later registration           | Chromium      | Firefox       | Firefox forced stale |
| ---------------------------- | ------------- | ------------- | -------------------- |
| Absent                       | None observed | None observed | None observed        |
| Reused scope, local fetch    | None observed | None observed | None observed        |
| Reused scope, local document | None observed | Update        | Update               |
| Distinct sibling scope       | None observed | None observed | None observed        |

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
maintenance path of an existing private execution. Distinct scopes avoid the
observed overlap trigger, but their allocation and lifetime still need an
implementation argument. This is registration separation within one origin;
applications still share origin storage and browser permissions.

The proof must account for scope reuse while old clients or queued operations
remain, registration/activation ordering, retained controller handles and local
resource delivery to new contexts. These bounded observations do not establish
those lifecycle properties. The [message broker](message-resource-broker.md)
supplies a transport candidate for contexts that cannot rely on interception.

## Unbounded scope/queue model

Run `node formal/runtime-verification/registration-lifetime-check.ts` with the
pinned Lean release. `RegistrationLifetime.lean` models registration-map changes
and a queue of update jobs attributed to one old client. Six checked theorems
cover initial safety, single-step preservation, arbitrary finite traces, the
no-network consequence, and two concrete delivery cases. The checker records
the standard logical axiom dependencies and rejects unexpected reports. A
delivery rule that transmits unconditionally fails proof checking.

The model requires the protected scope to remain absent and every old-client job
to retain that scope. It permits arbitrary queue lengths and interleavings of
other-scope registration, unregistration and delivery. Its scope-reuse
counterexample includes a job queued before reuse. That schedule is a model
result rather than an observed browser trace.

Scope names are abstract natural numbers. The model does not implement a URL
allocator, reproduce browser registration code, establish private controller
ownership or prove independence of trusted launch traffic. Those are
implementation and browser correspondence obligations. The
[model receipt](registration-lifetime.json) records their separation from the
checked propositions.
