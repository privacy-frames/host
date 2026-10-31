# Native worker policy partitions

Run `node formal/runtime-verification/worker-policy-overlap.ts`.
The fixture bundles the production namespace helpers twice, changing only the
shared policy constant between the current and preceding versions. Two documents
retain native SharedWorker connections in one browser context. After the first
connection, the server changes its bootstrap script from revision 1 to revision 2
at the same URL. Application identity and installation generation stay unchanged.

Eight production observations cover shared and publisher names, classic and
module scripts, and Chromium and Firefox. Reconnecting with the preceding policy
name reuses the revision-1 global without another script request. Connecting with
the current policy name creates a distinct revision-2 global and one new script
request. Another connection with that current name shares the new global without
an additional request.

Eight test-only fault observations remove the actual policy contribution from
both namespace helpers. The same fresh-instance assertion detects reuse of the
old global in every case. Source files remain unchanged during the experiment.
The receipt records browser versions, instance identities, server request counts,
source hashes and all four helper-bundle hashes. Partial results survive failure.

Production names now include context policy version 5. Their parsers reject other
policy prefixes and the former unversioned format. Unit checks also cover owner,
generation, source, script type and logical-name separation. The public shared
worker name remains the application’s original name.

These experiments check namespace partitioning, not complete production admission
or remote leakage. A new global requires a script fetch in this native fixture;
the remaining local-delivery and service-worker-maintenance obligations are still
open. Old globals are not revoked by changing a name. Retained connections,
tickets, queued work and mixed-policy lifetimes require their own arguments.
