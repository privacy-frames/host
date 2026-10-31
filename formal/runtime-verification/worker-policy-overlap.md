# Native worker reuse across a bootstrap deployment

Run `node formal/runtime-verification/worker-policy-overlap.ts`.
The fixture uses the production shared-worker and publisher-worker name helpers
with native SharedWorker constructors. Two documents retain connections in one
browser context. After the first connection, the server changes the bootstrap
script at the same URL from revision 1 to revision 2. The application identity,
installation generation and worker name remain unchanged.

All eight observations in Chromium and Firefox reused the revision-1 global:
shared and publisher names, each with classic and module scripts. The independent
server recorded one initial script request and no second request on reuse.
Appending a different policy suffix to the native name created a distinct global
running revision 2 and produced one additional script request in every case.
The receipt records browser versions, native instance identities and source hashes.

This establishes a native reuse prerequisite for the open host-policy overlap
obligation. It does not run production admission, demonstrate unauthorized
execution or establish remote leakage. Existing binding checks can refuse an old
worker; these observations do not test those checks. The suffix is an experimental
partition, not an implemented production repair.

The next implementation step is to partition both native namespaces by the actual
host policy version, reject obsolete namespaces, and retain sharing within one
policy and installation generation. Native tests must exercise the resulting
production helpers and a control that removes the policy partition. Complete
upgrade handling also needs an account of live old contexts, retained tickets and
pending work; creating a fresh global alone does not discharge those obligations.
