# Root content over a private controller channel

Root startup now obtains admitted document data through a message request rather
than the `?host-content=1` HTTP endpoint. The controller derives the installation
from the requesting browser client's root binding. The request contains no
application identity or resource URL. The former endpoint and its reserved-query
rule have been removed.

`content-broker.ts` requires a bound root window and matching installation
generation. It reads the installed entry from local storage, rechecks the root
binding and installation generation after the read, and prepares the same
document metadata as before. Missing bytes, closed or replaced authority and
installation changes reject the operation. The root still validates received
document data and prepares its realm before rendering application content.

`controller-client.ts` holds the native controller and per-request reply ports in
private closures. The publisher client uses this transport too. Native getters,
message operations and timers are captured before application execution. Reply
records and transfer arrays use the existing private prototypes. The transport
has no HTTP fallback.

## Contracts still to prove

The entry-point argument must connect the native message source to the browser
client lookup and registry binding. An asserted packet identity is never an
input to the resource read. The registry and installation store must preserve
the meaning of that binding across asynchronous operations and controller
replacement.

The storage argument must establish the generation check and byte read performed
by `getResource` in one IndexedDB transaction. The broker's later checks reject
observed replacement; they are not a claim that several asynchronous reads form
one atomic transaction. The complete protocol needs an explicit grant point and
an argument for reads already in flight when authority is revoked.

The ownership argument must establish that application code cannot obtain the
controller, reply ports, private record prototypes or captured operations.
Prototype-mutation tests challenge selected routes to those objects. They do not
prove that every alias or native returned reference preserves their secrecy.

## Evidence and limits

`test/content-broker.test.ts` checks valid reads, foreign or unbound clients,
workers and child windows, missing resources, and installation or authority
changes while bytes are pending. `test/controller-client.test.ts` checks reply
validation, timeout and send failure, and operation after application mutation
of browser accessors, native methods and the array iterator. Its platform objects
are protocol fixtures; they do not establish native browser lifetime behavior.

The iterator test initially failed because `internalData` iterated the ordinary
array returned by `Reflect.ownKeys`. The shared helper now gives that array its
private prototype before iteration. This avoids calling an application-supplied
iterator during normalization.

Actual browser startup, publisher, prototype and navigation tests supply separate
native evidence. The installed navigation fixture checks the served guard's
bytes, successful application rendering and absence of the former content HTTP
request. Its message-transport attribution follows from that checked guard
implementation; the fixture does not independently intercept the private port.
The navigation guard-removal control remains separate from the content broker.

The [compatibility receipt](root-content-compatibility.json) records all eight
applications completing their selected native and confined tasks and reloading
offline in Chromium and Firefox. Initial and final source hashes match the
candidate, and build artifacts remained stable. The complete context suite,
three independent network receiver groups in each browser, and all 153 unit
tests also passed locally. These are development-build results, not deployment
or real-device measurements.

This change removes one HTTP read. Native worker bootstraps, document creation
and other resource paths still have unresolved maintenance obligations. It does
not repair the demonstrated worker-update channel or establish complete C4.
Private record ownership, atomic publication and the browser-wide authority
argument also remain open.
