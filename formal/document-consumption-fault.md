# Document-consumption authority fault

Run `node formal/document-consumption-fault.ts` after installing Playwright
Chromium and Firefox. The test extracts the existing bounded
`test/document-consumption-race.ts` browser fixture at asserted anchors and
builds three variants with the same trusted-policy plugin. Separate in-memory
esbuild mutations remove the child's post-consumption `current()` check or the
parent's final post-relay check from the actual document-controller source.
Each mutation asserts one matching removal. Production source is never edited.

The fixture pauses after a real IndexedDB intent consumption, then uses an
independent registry or simulated storage mutation to close the child or change
its owner or generation stamp. In the normal build, unchanged authority returns
the expected body, while all three changed-authority cases reject without a payload.
With the child guard removed, all three instead return that same body. Both builds
assert the intent was consumed before the mutation; the mutation case also
asserts the final validation was never called. The fault must be observable or
the test fails.

The parent variant uses the same pause after real consumption. It covers eight
cases: unchanged authority, child closure, child ownership and generation changes,
parent closure, parent ownership and generation changes, and intent closure.
The normal build delivers only the unchanged case. Removing the final parent
check also delivers the three parent-change cases, while the remaining checks
still refuse the child changes and intent closure. Chromium and Firefox reproduce
both fault controls.

The [receipt](evidence/document-consumption-fault.json) records browser versions,
source, test and bundle hashes, outcomes, and a `completed` flag. This tests
content delivery and authorization using actual controller and IndexedDB code,
with simulated browser-client identities and in-memory context storage. It does
not demonstrate network disclosure, browser-authentication bypass or a complete
controller-to-browser refinement.
