# Checking the production authority predicate

Run `node formal/runtime-verification/authority-predicate-check.ts` with Docker
available. The runner extracts `sameAuthority` from the actual context registry,
erases TypeScript and checks twenty-seven heap contracts with Gillian. Runtime
source remains unchanged. Function copies receive different names so each
contract has an independently reported procedure; their extracted bodies are
the same.

The contracts check matching and mismatched context IDs, applications,
installation generations, parents, kinds, policy versions and URLs. A selected
mismatch must reject even when other fields differ. They include null root
parents and string child parents, cross-parent-type comparisons, missing
current records, aliased records and closed expectations. Postconditions retain
the owned records and their prototypes.

The preconditions require ordinary objects with owned data properties.
Identity, application, generation, kind, URL and state are strings; parent is
null or a string. The current policy version is 3, which the runner checks
against its source declaration. Refusal contracts allow arbitrary numeric
expected versions. Separate-record contracts own two disjoint records; aliased
contracts own one. Prototypes may differ and are not required to be frozen.

`sameAuthority` does not check the current record's state. For example, it can
accept a closed current snapshot against an open expectation when the seven
compared fields agree. Its callers obtain current snapshots through `resolve`
or `resolveWorker`, which filter closed records. Establishing those caller
contracts, private-record ownership and freshness through asynchronous reads
remains necessary. This predicate is also separate from authenticating a native
browser client and validating its URL.

## Controls and output checking

Eight isolated source mutations remove each field comparison or the closed
expectation check. Two additional controls return false for matching root or
child records, checking the positive contracts as well. Every mutation must fail
its selected postcondition; a compiler
error, timeout or successful contract does not satisfy the control. A separate
mutation moves annotations onto directives, producing a successful invocation
with zero checked contracts. The runner rejects that result.

The shared verifier driver validates the exact number and names of contracts,
every reported `s`/`f` outcome marker and the final procedure outcome. A normal
contract requires only successful markers and a successful summary. An expected
fault requires a failed marker, a postcondition diagnostic, failure status and
no successful summary. Marker counts describe the tool's output; they are not
an independent coverage measure.

`gillian-report.test.ts` checks the parser with multiple successful outcomes,
expected failures, missing names, extra or duplicated reports, contradictory
summaries, malformed markers and zero-contract output. The existing stateful
closure calibration, publication contracts and generated-state comparison are
rerun when the shared driver changes.

The [receipt](authority-predicate.json) records the actual source and function
hashes, contract text, erased-input and driver hashes, image digest, compiler
version, normal results and control results. Extraction, TypeScript erasure,
Gillian's JavaScript semantics, the verifier and solver remain trusted. The
checks do not establish full registry refinement, browser coverage or runtime
confinement.
