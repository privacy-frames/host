# Native shared-worker issuing prerequisite

A trusted shared worker could retain local guard URLs across application windows.
Before designing that runtime component, the
[native fixture](local-shared-issuer.ts) tests whether the service worker can find
its browser client, transfer a management port and obtain a locally issued URL.
The child contains fixed fixture code. No publisher code runs in the issuer.

The [receipt](local-shared-issuer.json) records Chromium, Firefox and Firefox with
the registration age check forced. It explicitly selects full browser executables
and uses isolated contexts with Playwright background-service defaults. Every
case starts an HTTP shared-worker control
that reaches the server. The service worker then finds the issuer's native client.
After the parent installs local-only CSP, the fixture requests a Blob URL and
tries to start its child without HTTP.

The initial [queue comparison](local-shared-issuer-queue-initial.json) times out in
all three cases. The specification routes
[Client.postMessage](https://w3c.github.io/ServiceWorker/#client-postmessage)
to the recipient's ServiceWorkerContainer. Firefox exposes that container in the
shared worker, but its message queue needs `startMessages()`. With that correction,
both Firefox cases receive a trusted event from the native service worker and
start the local child. No HTTP reaches the server during those actions and three
subsequent seconds.

In the tested Chromium shared worker, `navigator.serviceWorker` is undefined.
The client is discoverable, but this direct-message candidate produces no reply
within ten seconds. The runner retains all three observations and exits with a
failed prerequisite. It does not establish that another transport is impossible.

This result prevents adopting the proposed direct-message issuer across both
engines. A second comparison uses a private port transferred during trusted
bootstrap:

```sh
PF_SHARED_ISSUER_TRANSPORT=port node formal/runtime-verification/local-shared-issuer.ts
```

The [port receipt](local-shared-issuer-port.json) passes all three profiles. The
issuer creates a management port, the initial window forwards it to the service
worker, and later requests use that port. Local child startup succeeds without
observed HTTP during the operation and three subsequent seconds. The kernel
therefore needs no exposed ServiceWorkerContainer for this transport.

The port message has no ServiceWorker source object. Native `isTrusted` alone does
not authenticate a manager; production must establish ownership of the private
port and authorize its transfer. The fixture's binding acknowledgment identifies
a native window, without establishing that window's management role.
Authentication, stable native sharing across windows, restart, issuer lifetime
and production integration remain unestablished.
