# Controller messages from local child documents

Local documents cannot uniformly reuse the production controller client after
parent unregistration. The native experiment completes eighteen cases across
Chromium, Firefox and Firefox with the forced-stale preference. Only Chromium's
`srcdoc` documents complete the controller-backed resource read.

Run `node formal/runtime-verification/local-document-controller.ts`. The
[receipt](local-document-controller.json) records the exact runner, bundled child,
worker and imported production-source hashes. This is a browser prerequisite
experiment, not a production bootstrap change.

## Setup and results

Each case starts with a fresh browser context. A trusted parent registers and
claims a worker for `/one/`, unregisters it, verifies that scope is absent, and
completes a controller identity request. A separate setup page then either does
nothing, registers the sibling `/two/`, or registers the covering `/` scope.
A measured three-second quiet period precedes local child creation.

The child contains the production `controller-client` and `resource-fetch`
adapters. Its fixture controller returns one fixed local JSON resource and
checks native message-source IDs through `clients.get()`. The child uses a
private reply port. The parent records the result, waits another three seconds,
and retrieves the original worker's diagnostic trace. Unrestricted fetch first
calibrates the owned HTTP receiver. The document policy denies native connections
and permits trusted inline scripts, Blob frames and service-worker setup.

| Child and browser | Controller-backed read | Observed HTTP |
| --- | --- | --- |
| Chromium `srcdoc` | Returns the local value and original worker token | None in all three scope cases |
| Chromium Blob iframe | No native controller | None in all three scope cases |
| Firefox `srcdoc` and Blob iframe | Request times out | Worker script request with the covering scope; none with absent or sibling scope |
| Firefox forced stale, both forms | Request times out | Same scope-dependent result |

The Firefox parent control succeeds in every case. Its worker trace contains
no child request. This does not identify whether a different worker receives a
child request or prove that delivery could never occur after the twenty-second
client timeout. It establishes that the tested transport does not complete.
The failed child cases provide no evidence of successful local resource delivery.

Chromium reports an empty URL on the `srcdoc` message-source object, while
`clients.get(source.id)` returns the same native client ID with `about:srcdoc`.
The fixture uses the looked-up client. Comparing the two URL strings would reject
a working native identity path. Both values are retained in the diagnostic data.

## Consequences for the runtime

A local bootstrap needs a transport independent of child-controller inheritance.
The existing worker broker prototype relays through a trusted parent; extending
that mechanism to documents is the next candidate. Its authority must come from
the owning parent's browser binding and a private channel created for that
specific child. Child-provided identity fields cannot establish ownership.

The grant must identify the installation and generation, survive only the
permitted lifecycle, and be revalidated around asynchronous reads. The child
must receive trusted setup before application code, and application code must
never obtain the broker's native handles. These are implementation obligations;
the parent control in this experiment does not discharge them.

Registration separation remains necessary for the current service-worker-based
architecture. A working relay would not suppress the observed covering-scope
update. Context bootstraps, DOM/CSS resources, module graphs and later launches
still need delivery and lifecycle arguments that produce no forbidden request.
