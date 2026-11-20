# Management and bootstrap authority

The runtime separates installation management from application bootstrap requests. A
fixed trusted `connect.html` document may install, list and remove applications;
an application document may receive the installed resources and interpreter needed
to start that application. Message payloads cannot choose either role.

## Production predicates and callers

`src/runtime/authority.ts` contains three synchronous predicates used by the actual
receivers:

| Predicate                 | Required observations                                                                                                            | Caller                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `acceptsManagerSender`    | Receiver live and unbound; native trusted event; embedded document; sender is its parent; sender origin in trusted configuration | `src/bridge/connect.ts`, before reading the request payload            |
| `clientCanManage`         | Resolved native client ID equals the captured event source ID; window client; exact fixed trusted bridge URL                     | `src/runtime/worker.ts`, after `Clients.get`                           |
| `managementPortIsCurrent` | Receiver live; candidate is the privately retained native endpoint                                                               | Bridge binding continuation, request forwarding and reply continuation |

The bridge copies the initial observations from native `MessageEvent` properties
and its own private state. It accepts exactly one transferred endpoint after those
checks. Subsequent operations use that endpoint, with native trusted port events;
there is no message field that changes the allowed origin, current endpoint or
receiver state. A second bootstrap cannot replace a bound endpoint.

A nonpersisted native `pagehide` marks the bridge closed before clearing and
closing its endpoint and pending reply ports. The ready continuation rechecks the
endpoint after asynchronous storage initialization. Request and reply callbacks
also recheck it, so an already queued callback cannot regain authority after
closure. A persisted page keeps the same endpoint while in the back-forward cache.

The service worker captures the source ID from a genuine native event and resolves
that ID through its own `Clients.get`. Management begins only for the exact
trusted bridge URL. Admission, client enumeration and storage reads can suspend;
install and remove therefore resolve and authorize the source again immediately
before entering the mutation. A successful reply requires another fresh lookup.
A client that disappears or changes role during preparation receives no success
or private result. Error replies contain a local diagnostic.

Application bootstrap also re-resolves the captured source before transferring its
catalog. The installation generation must still match, and the current recipient
must remain a window at that installation's application alias. The catalog contains
trusted cached interpreter/worker bytes and installed resources; its creation does
not authorize an arbitrary bootstrap module supplied by the application.

## What is checked

Run `tsx formal/quickjs/management-authority-check.ts` for direct Gillian
verification of the three production predicate bodies after TypeScript erasure.
The extractor rejects imports, top-level execution and generated runtime helpers.
Sixteen contracts cover accepted and rejected sender observations, arbitrary client
identity strings and each mismatching role condition, current/stale/closed endpoints
and an unbound receiver. Claims and client snapshots own ordinary data properties;
endpoint references remain native private objects. Four altered predicate bodies
must fail their expected postconditions. A run that checks zero contracts must
also fail the driver.

`tsx --test test/guest-management-authority.test.ts` exercises the actual bundled
bridge and worker with controlled platform observations. It covers all 64 sender
Boolean combinations, deferred admission and client lookup, client loss before a
reply, changed catalog recipient, independent controller queues, pending binding
closure and queued request/reply callbacks. Removing the actual origin check or
client URL check admits the corresponding unauthorized fixture. These fixtures
control native observations and storage dependencies; they test adapter control
flow rather than browser authenticity.

`tsx test/guest-management-authority.ts` runs the actual production bridge and
service worker in Chromium and Firefox. Native events and ports connect genuinely
different origins. The configured parent can list the empty installation database;
an unrelated parent is denied after the test observes its genuine event arriving.
A preexisting application-URL document is denied management even when its payload
claims the manager role and bridge URL. A temporary bundle with the origin check
removed accepts the unrelated parent. The server supplies placeholder trusted
assets that are never used to execute application code; IndexedDB and service-worker
client lookup remain the browser implementations.

Receipts record source and bundle hashes under
`results/quickjs-confinement/management-{authority-implementation,adapters,browser}.json`.
The predicate proof establishes those Boolean decisions. The adapter and browser
tests establish the listed executions; neither is an exhaustive proof of the
asynchronous receivers.

## Platform and surrounding contracts

- The browser supplies authentic `isTrusted`, event source, send-time origin,
  transferred ports and `Clients.get` results. Guest objects cannot impersonate
  those native objects. The verified predicates receive snapshots constructed by
  the native receivers, never identity assertions copied from peer data.
- `connect.html`, its script, configuration and service-worker bytes come from the
  trusted runtime deployment/cache. The exact bridge URL denotes those trusted
  bytes. Application-controlled responses cannot replace them.
- Guest navigation and native history access preserve the application's physical
  URL role. The current guest history adapter updates the fragment while retaining
  the physical application path. A native history capability that could change an
  application document's path to `connect.html` would invalidate URL-based role
  authorization. The management predicates do not prove the absence of that leak.
- A transferred native endpoint remains private to its holders. Navigating the
  sender does not give its replacement document the old JavaScript endpoint.
  Native closure and bfcache behavior are browser premises; the fixture explicitly
  invokes queued callbacks to check the additional production lifecycle guards.
- JavaScript run-to-completion, structured-clone messages, native URL parsing,
  promise scheduling, IndexedDB transactions and the trusted build/proof toolchain
  retain their specified behavior. Application prototype changes cannot modify
  this worker or trusted bridge realm.

## Concurrency boundaries

The management queue serializes one service-worker instance. Another controller
instance has its own queue; authorization depends on fresh browser observations
rather than assuming one global mutex. Storage transaction atomicity is supplied
by IndexedDB. The existing active-application check and subsequent installation
mutation are separate asynchronous steps, not a global transaction over browser
windows and storage.

Authorization linearizes when the worker obtains and accepts a fresh client
snapshot before the operation. The browser may close that client after this check;
an already admitted storage operation may finish. This work does not promise
cancellation of a transaction already started. The final lookup prevents a success
or resource response based solely on the earlier snapshot.

Cross-application storage namespacing remains outside this security contract. The
protected state here is the host's installation metadata, installed resources and
management authority. Complete network confinement additionally depends on the
interpreter boundary, native effect policy and bootstrap provenance reviewed in
the other components.
