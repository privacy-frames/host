# Shared-worker startup failure

The shared-worker bootstrap keeps one readiness promise for all connections to the
same admitted worker. Once session creation succeeds, the bootstrap owns that
session until its application entry finishes starting. If startup rejects, it
closes that exact session and preserves the original rejection even when cleanup
also throws. Concurrent and later valid connections observe the same failed
promise; they close locally without guest `connect` delivery or queued-message
replay. A successful session remains available when an individual port closes.

Run `node --import tsx --test test/guest-shared-worker-startup.test.ts`. The tests
bundle the production bootstrap against controlled native scope and port fixtures.
They defer session creation and startup, exercise two pending connections and a
later connection, and check cleanup, failure reporting and successful publication.
A temporary bundle omits the actual session cleanup; the cleanup assertion rejects
it while the port-error checks still pass. These fixtures supply native events and
port scheduling; they do not establish browser termination or MessagePort lifetime.

Source hashes and test output are under
`results/quickjs-confinement/shared-startup/`. Existing browser context qualification
is deferred to the integrating branch.
