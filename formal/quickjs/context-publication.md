# Context preparation identities and cancellation

Frame and popup preparation now use fresh private object tokens. Starting a
preparation makes its token live; cancellation replaces that token and marks the
preparation closed. A continuation may publish only if its captured token is still
current and live. Object identity avoids the loss of freshness that occurs when a
JavaScript Number counter can no longer advance.

The production kernel is `src/guest/contexts/lifecycle-kernel.ts`. Its state record
owns token and closed data properties in the native host. Guest application values
do not contain that record or its tokens.

## Checked implementation contracts

Run `node --import tsx formal/quickjs/context-publication-check.ts`. The checker
extracts all three exported production functions, erases their TypeScript types,
and rejects omitted runtime declarations, extra functions and transpiler helpers.
Gillian verify mode checks eight contracts: begin and close, freshness with a
retained framed object, and acceptance for current/stale tokens in live/closed states.

Four mutations fail their intended postconditions: reusing a token, leaving a
cancelled preparation live, ignoring closure and ignoring token identity. A fifth
control displaces the annotations; the checker rejects the zero-contract invocation.
The report requires the actual named procedure and path results, not just a
successful tool exit.

The separation-logic contracts require private records with owned writable data
properties, ordinary retained object identities, and ownership of unrelated fields
through framing. The parser, TypeScript erasure, Gillian semantics, verifier and
solver are trusted. Source hashes identify the reviewed callers but do not prove
those callers' ownership or control flow.

## Unbounded epoch model

Run `PF_LEAN=/path/to/lean python3 formal/quickjs/context-publication-lean.py` with
Lean 4.35.0. Nine theorems are checked with trust zero and no axiom dependencies.
The model uses natural numbers as ghost names for newly allocated object identities;
the production implementation does not use a numeric generation counter.

The theorems establish freshness/validity after each step, acceptance of the new
live token, rejection after cancellation and preservation across arbitrary finite
begin/invalidate histories. An already retained token cannot become current again.
A checked example shows that reopening a reused token revives an old continuation.
Changing invalidation to leave the model live makes its cancellation theorem fail.

The connection to production is the meaning of fresh JavaScript object allocation
and the checked function postconditions. This is a manually stated correspondence,
not a verified TypeScript compiler or proof of native browser behavior.

## Production callers

The document factory invalidates its token and clears owned pending/session fields
before calling abort, rejection or session cleanup. Reentrant cleanup therefore
cannot overwrite a newer preparation. Configure rechecks the invalidation identity
before selecting its source. Async completion checks current identity, closure,
factory disposal and native frame connectedness before logical load publication.
A stale returned session is closed locally.

Popup preparation follows the same identity protocol. It aborts the previous
preparation, preserves the actual named Window handle and checks currentness before
and after waits. Pagehide cleanup acts only on the session it still owns. Disposal
invalidates every recorded context even if one cleanup reports an exception.

The actual create-and-render callback receives AbortSignal. It checks cancellation
after compilation, before environment attachment and before rendering; an abort
closes the session's interpreter and environment. After an awaited render it checks
again before returning usable session authority. Already-running guest computation
may finish confined; cancellation prevents later guest entry and publication.
Closing the session is idempotent, and rendering a closed session fails locally.

`test/guest-context-publication.ts` runs independent browser fixtures in Chromium
and Firefox. They cover out-of-order frame/popup completion, close while pending,
reentrant cleanup and queued Window messages after producer disposal. A real child
session is held at native engine compilation, its logical document is replaced,
and compilation is then allowed to continue; its old guest script must not execute.
An uncancelled child runs the corresponding script. Removing the real caller's
signal forwarding and abort checks from a temporary bundle lets the stale script
execute despite the factory's remaining postcheck, and the fixture rejects that
variant in both browsers.

These tests exercise current callers. They are not deductive proofs of the full
factories. Remaining caller obligations include private record ownership across all
aliases, native frame/document lifetime, callback scheduling, successful engine
closure and the absence of an unmediated browser effect during preparation.

## Native premises and limits

The browser must preserve fresh object identity, synchronous AbortSignal dispatch,
trusted versus synthetic native events, initial about:blank context semantics and
same-origin access rules. Native close/termination and MessagePort queues retain
their separate contracts. A disposed producer drops its own queued synthetic
Window messages; target-session replacement semantics still require review.

The epoch results do not verify workers, worklet correlation IDs, installation
management or the complete browser effect catalogue. The pre-change source review
is in `reviews/contexts-management.md`. Receipts for this component are kept under
`results/quickjs-confinement/` with source, caller, tool and browser hashes.
