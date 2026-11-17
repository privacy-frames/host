# Exclude application service-worker execution from the first fork release

Type: grilling
Label: wayfinder:grilling
Status: resolved
Assignee: DamenH
Blocked by: none

## Question

Must the first greenfield fork implement installed applications' service-worker
registration, execution, lifecycle and fetch interception, or only preserve the
host's service worker, installation metadata and offline resource delivery?

## Answer

Damen clarified on 2026-11-17 that application service workers are not in scope
for now, apart from the existing manifest-related behavior. Keep the trusted host
service worker, standard web app manifest handling and host-managed local/offline
resources. Do not carry over the old application service-worker executor as a
compatibility obligation.

The guest's exact unsupported-API behavior has not been decided. In particular,
API absence, rejected registration and a successful stub are different observable
contracts. Do not assume that a fake successful registration is harmless or that
all existing applications can run without their own service worker. The source
investigation has its own research ticket; required application support remains.
