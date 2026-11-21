# Resource generations and local publication

The resource contract permits a confined context to keep using bytes captured
before installation removal. It requires each successful catalog read to belong
to its captured admitted generation, and every missing or invalid read to fail
locally. It does not require that generation to remain installed when a later
message transfers the captured catalog.

## Production correspondence

| Stage          | Actual owner                                        | Enforced contract and premise                                                                                                                                                                                                                                  |
| -------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admission      | `src/runtime/admission.ts`, `admitInstallation`     | Validates identity, paths, resource count/size, declared hashes and entry membership. Inputs arrive by structured clone in the trusted worker realm. Hash comparison establishes package consistency, not publisher authenticity.                              |
| Commit         | `src/runtime/storage.ts`, `putApp`                  | Writes body records and metadata in one transaction over both stores. Metadata omits the bodies. Each commit gets a UUID; generation uniqueness is a premise, not a theorem about randomness.                                                                  |
| Read           | Same module, `getResource`                          | Reads metadata and body in one readonly transaction. Completion requires the expected generation and an existing body, returning that transaction's cloned bytes. The caller selects the path from captured admitted metadata.                                 |
| Catalog        | `src/guest/catalog.ts`, `createGuestCatalog`        | Every parallel read uses the same captured generation. Replacement can make the catalog fail. Successful reads retain that generation if generations are not reused and host storage is modified only through reviewed commits.                                |
| Response       | `src/runtime/worker.ts`, resource and icon branches | Selects a resource from `app.resources` before reading its path with `app.generation`. Missing resources and failures return `Response.error()`. Trusted bootstrap bytes come from the separate trusted cache.                                                 |
| Confined reads | `src/guest/resources.ts`, `GuestResources`          | Serves captured bytes, locally created blobs and data URLs. Missing script/fetch reads fail; missing rendering resources become empty local data. No native networking fallback is called. Catalog references and bytes must remain private to trusted owners. |

IndexedDB supplies structured cloning, transaction isolation and atomic commit.
The host must protect its installation database and bootstrap cache from direct
application mutation. Parallel catalog reads use distinct transactions, not one
catalog-wide transaction: their common provenance follows from the captured
generation and its uniqueness, rather than a simultaneous database snapshot.
The [IndexedDB specification](https://w3c.github.io/IndexedDB/#transaction-scheduling)
defines the transaction scheduling relied on here.

## Unicode cleanup repair

The old deletion range ended at `[id, '\uffff']`. An admitted path beginning with
U+FFFF and continuing with another code unit sorts above that endpoint. Replacing
or removing its installation could leave the corresponding body record behind.
The new private `resourceKeys` helper uses `[id, '']` through `[id, []]`, excluding
the upper endpoint. Under [IndexedDB key ordering](https://w3c.github.io/IndexedDB/#compare-two-keys),
an array sorts after every string, so the range contains every `[id, stringPath]`
without including another application's ID.

Runtime `safePath` admits literal U+FFFF paths. The normal installer obtains paths
from `URL.pathname`, where that character is percent encoded; `safePath` refuses
percent signs and the installer chooses a generated hashed path instead. Runtime
admission accepts the broader literal path, so cleanup must cover it too.

Current worker and catalog callers require metadata membership before calling
`getResource`. The helper itself checks generation and body existence, not path
membership. This caller premise matters: the old orphan body could otherwise be
returned for an arbitrary path alongside a newer metadata generation. The review
found a cleanup/provenance defect, not an application network communication route.

## Small checks

Run the source callback and bounded transaction checks:

```sh
node --import tsx formal/quickjs/resource-publication/check.ts
```

The driver extracts the actual `getResource` completion callback through the
TypeScript AST, erases its types and invokes it with controlled request results.
Twelve cases cover absent metadata, two generation values and present/missing
bodies, including a valid zero-length body. These are finite actual-body checks;
they do not prove the full asynchronous function or native IndexedDB behavior.

The separate state model enumerates all 24 orders of two resource reads, one
atomic replacement and one atomic removal. Generations 0 and 1 are distinct;
metadata and bodies commit together; byte snapshots are copied into the captured
result. Every successful checked read has captured generation 0. Removing the
model's generation check produces 12 provenance counterexamples. This is an
abstract omission control, separate from the production omission controls below.
The model assumes complete cleanup; native tests must establish the repaired range.

The receipt is `results/quickjs-confinement/resource-publication/model.json` and
includes source, extracted-body and harness hashes. It records these finite checks
and assumptions rather than a machine-checked unbounded proof.

## Deductive callback contract still needed

A Gillian proof of the extracted callback would need explicit specifications for
the native promise's `resolve` and `reject` closures. The useful postcondition is
one resolution with the original byte snapshot exactly when the generation matches
and a body exists; otherwise it is one rejection and no resolution. Preconditions
must supply ordinary owned request-result properties, stored metadata with an own
generation property, native buffer snapshots, the Error constructor contract and
nonthrowing promise-settlement callbacks. A private observation log could record
which settlement closure was called.

That proof would cover the completion decision under those contracts. Establishing
that a native transaction invokes it with a consistent committed snapshot would
still require the IndexedDB contract and actual caller correspondence. The current
finite-body runner does not supply those higher-order verifier specifications;
no Gillian callback proof is claimed here.

## Native IndexedDB qualification

The initial native run passed all production and omission-control expectations in
Chromium 153.0.8010.12 and Firefox 155.0. Its receipt is
`results/quickjs-confinement/resource-publication/browser-initial.json`. That run
records browser versions and source/bundle hashes, but not executable hashes.
The fresh provenance run also passed all six expected outcomes. Its `browser.json`
records the exact selected executable paths and SHA-256 hashes, browser-profile
launcher, Node version and source/bundle hashes. Both runs cover local IndexedDB
behavior; they do not qualify a combined confinement release.

```sh
node --import tsx test/resource-publication.ts
```

The driver bundles actual admission, storage and catalog source and runs the
fixture with native IndexedDB in Chromium and Firefox on loopback. It checks
literal-path admission and native key/range ordering, metadata/body separation,
replacement/removal cleanup, unchanged unrelated installations, stale generations,
missing bodies and captured bytes surviving removal. Each variant uses a fresh
browser database. Non-loopback page requests are aborted and recorded; this is a
local persistence fixture, not a browser-wide egress experiment.

Two temporary bundles restore the old cleanup bound or remove the actual
completion callback's generation guard. The old bound must fail replacement and
removal cleanup plus removed-body refusal. Omitting the generation guard must fail
stale-generation refusal. The driver writes source hashes, served bundle hashes,
browser versions, executable hashes and observations to
`results/quickjs-confinement/resource-publication/browser.json` only after the
expected production/control outcomes pass.
