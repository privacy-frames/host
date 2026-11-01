# Shared-worker connection messages

Window connection and disconnection commands now use the private native
controller transport. The service worker resolves the sending browser client,
requires its current Window binding and derives the installation identity from
host state. Application-supplied identity fields grant no authority.

The controller validates the requested source and creates a one-use connection
ticket. Before returning it, the controller checks the Window and installation
generation again. Replacement during issuance revokes the unreturned ticket.
Disconnection uses the actual sending Window; another Window cannot close that
ticket by claiming its owner's identity. The IndexedDB ticket-consumption
protocol is unchanged.

The factory retains native SharedWorker handles and application MessagePorts.
It no longer builds HTTP command requests or parses JSON responses. The former
Window connect/disconnect routes are removed. This controller still serves the
native shared-worker bootstrap and worker-side ticket redemption over HTTP.
Worker control and resource reads also retain their separate HTTP adapters.

The installed comparison passes in Chromium and Firefox. It exercises classic,
module, Blob and offline shared workers, top-level await, transferred ports,
malformed grants, replacement and native network controls. A child document and
its parent share a worker; the parent's connection remains usable after the
child closes. Peer disconnection is refused, owner disconnection succeeds, and
the removed HTTP command routes fail. Independent receiver controls work while
the selected confined attempts produce no receiver requests or connections.

Three unit checks cover actual Window ownership, invalid request data and
replacement during ticket issuance. The native IndexedDB comparison separately
checks consumption across independent controllers. The worker-realm factory
path was removed: its worker caller could not obtain the required Window-owned
ticket. Shared-worker creation inside workers remains unsupported.

The first native comparison exposed a dispatcher mistake that sent shared
commands to the worklet controller; the corrected branch passes the installed
comparison. A child-fixture timeout then identified eager access to Chromium's
initial blank-frame service-worker container. Capturing its native getter and
using it only when needed fixes the fixture without changing runtime checks.
The initial failed receipt and compressed log are retained separately.

Local shared-worker startup, private worker-side transport, issuer ownership and
lifetime, and the independent HTTP-denying policy remain required for C4.
This change establishes the selected command transport, not complete confinement.
