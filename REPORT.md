# A static host for network isolated web applications

## Aim

A browser application can process a private file locally while retaining the
ability to contact its developer. This host installs a local copy and controls
its communication. The user supplies an application URL, installs its resources,
and opens it against private input.

The manager, installer and runtime are separate static websites. They require no
backend and use GitHub Pages. The implementation keeps native browser rendering
while running application JavaScript in a separate interpreter.

## Threat model

We assume the developer is malicious. The application may try to disclose private input, recover a restricted browser capability or
create an unrestricted execution context.

We trust the browser, the host and its dependencies, and the origins hosting the
manager, installer and runtime. Application code never runs on the manager or
installer origin. Private input enters the application only after trusted setup
has finished. Initial host startup may contact its origin; application code must
not cause network traffic during confined execution.

Local display, audio and file processing are intended. Downloads require a trusted
host confirmation. Approving an export releases the file supplied by the
application; the browser may send download metadata for security checks. The
[export boundary](https://github.com/privacy-frames/host/blob/main/docs/implementation/browser-exports.md)
describes this browser-service behavior. Browser
bugs, malicious extensions, developer tools, physical side channels and deliberate
browser-menu exports are outside this demonstration. Applications share a runtime
origin and browser permission grants. Storage namespacing supports ordinary apps;
it does not establish isolation between installed applications.

## Installation

The installer downloads explicit HTML and CSS dependencies and literal JavaScript
imports without executing application code. A user or publisher can supply a
plain URL list for resources selected dynamically. Publishers do not need to change application code.

Downloads omit credentials, require CORS access and reject redirects. Limits of
1,000 resources and 100 MiB apply as bytes arrive. The entry and explicitly listed
resources must be available. Other failed downloads are recorded; missing
resources fail locally during execution. The runtime validates paths, counts,
sizes and SHA-256 digests before publishing an installation.

## Execution

Application JavaScript runs in QuickJS compiled to WebAssembly. Its values,
functions and prototype extensions live in a separate heap. Trusted native code
provides browser interfaces and forwards permitted operations to real DOM nodes,
canvas contexts, audio graphs and storage. Callbacks can enter the interpreter
synchronously, preserving event cancellation.

The host uses generated Webref metadata for browser interface names and
inheritance. The browser performs native argument conversion and receiver checks.
The host separately controls operations that can communicate, navigate, create a
context or execute JavaScript. Script source, handler attributes and dynamic evaluation execute in QuickJS;
native script elements stay inert.

Guest fetch and XHR read admitted bytes directly. Native rendering receives Blob
or data URLs, with CSS references rewritten to local resources. This also avoids
HTTP requests that could provoke browser service-worker maintenance. CSP restricts
images, fonts, media and stylesheets to local URLs and forbids network connections.
Browser transports such as WebRTC are withheld.
The trusted service worker serves startup files and admitted resources without a
network fallback.

Dedicated workers and SharedWorkers contain guest engines in native worker
contexts. A trusted bootstrap registry prepares local worker URLs before any
application code runs, preserving sharing across app tabs. Child documents keep
their initial blank document and receive prepared markup. Audio worklets load a
trusted local bootstrap and run application processor code in a guest engine.

## Management and storage

Origin-checked message channels connect the manager to the installer and runtime.
The runtime service worker checks the actual browser client before accepting
management operations. Application-supplied identities cannot authorize an
installation or change runtime policy.

Local storage, session storage, IndexedDB and Cache Storage use scoped names
through ordinary application APIs. Native factories and host installation records
remain behind the trusted boundary.

## Evaluation

Browser tests exercise synchronous callbacks, prototype extensions, dynamic
scripts, parsing, workers, child windows, audio worklets, transfers and storage.
Communication tests observe independent receivers and include unrestricted
controls. A separate regression compares private-input-dependent context creation
with quiet controls, including Firefox's forced-age service-worker checks.

The application corpus tests installation, a useful interaction and offline
reopening. Current receipts and application-specific qualifications are recorded
in [evaluation/compatibility.md](https://github.com/privacy-frames/host/blob/main/evaluation/compatibility.md). These observations
are implementation evidence; a complete browser confinement proof remains open.

Application-provided Wasm and service-worker execution are deferred. PhotoCraft
and Squoosh remain future targets. IFC and selective release of private
information are separate research work.
