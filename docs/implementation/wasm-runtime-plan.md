# QuickJS runtime implementation

Branch: wasm-runtime. Worktree: /home/damen/Projects/privacy-frames-wasm-runtime.
Base: 3013bd51d4fde27cd8adf327e7009430641c8e40.

## Accepted direction

The user authorized implementation through completion on 2026-11-18 after the
combined feasibility study recommended QuickJS, generated Web IDL bindings and
explicit native forwarding. This is a greenfield hard fork with the existing
manager experience. Application Wasm and application service-worker execution
remain deferred. PhotoCraft and Squoosh remain later compatibility targets.

Application JavaScript runs only inside QuickJS. Trusted host code runs in the
native browser. Native DOM, rendering, audio and real worker/document contexts
remain browser responsibilities. Every context starts trusted host code before
guest code. Guest eval/Function remain guest operations. Prototype extensions in
the guest must not mutate native browser prototypes.

Retain local-only runtime resource delivery: admitted bytes or local failure,
never a network fallback. Preserve separate manager/installer/runtime origins,
static GitHub Pages hosting, scoped storage functionality, short application
URLs, resource lists and standard manifests. Storage namespacing is not a claim
of cross-application security isolation.

## Execution

1. Build the QuickJS engine boundary, scheduler, value conversion and guest/native
   object ownership. Preserve synchronous callbacks, events and cancellation.
2. Generate browser-interface metadata/wrappers from standard Web IDL; forward
   native operations through explicit policy. Supply core browser globals, DOM,
   storage, files, canvas, Intl and audio without rewriting application sources.
3. Replace shared-realm native application execution with trusted QuickJS window,
   worker/shared-worker and worklet bootstraps. Use the host service worker to
   deliver immutable resources and authenticate management. Render application
   markup only after policy, with native script execution excluded.
4. Integrate unchanged Pitch Training through installation, launch, interaction,
   audio/storage and offline reopening; then qualify Notebook, Wikipedia,
   Excalidraw, diagrams.net, StackEdit, CyberChef and host diagnostics. Expand
   general browser behavior using independent fixtures, never publisher branches.
5. Run type/format/build checks, semantic and confinement tests with independent
   controls and request observations. Remove superseded execution paths once the
   replacement passes. Revise report and deployment documentation.
6. Push the implementation and publish only after the replacement's own acceptance
   evidence supports release. Preserve a remote recovery point and the existing
   demonstration until then. Report actual outcomes and unresolved limitations.

## Evidence

The combined feasibility report is docs/research/wasm-runtime/combined-feasibility.md.
Research branches are evidence, not production dependencies. Production checks
and receipts for this branch must be newly executed.

## Integration contracts and current ownership

- Engine agent owns src/guest/engine.ts, protocol.ts, guest-runtime.ts and codecs.
  API: GuestEngine.create({host,globalObject,wasmModule,modules,onError});
  evaluate(source,url,mode='global'|'module'), get/set/bind globals,
  call(function,args,receiver), drainJobs/dispose, detachTransferred(list).
  Host mediates get/set/call/construct/ownKeys/descriptor/prototype on actual
  native objects. Descriptors must wrap native accessors through host policy.
- Bindings agent owns standard Webref metadata/helper/generator files. Build
  invokes generateGuestBindings(root). The refined binding approach uses standard
  metadata plus native WebIDL conversion/brands, avoiding duplicate generated
  implementation/conversion code. Remove unused webidl2js dependency afterward.
- Context agent owns src/guest/contexts/**. Catalog fields: application,
  generation, sourceURL, documentBase, runtimeURL, applicationURL, engineWasm,
  resources[{url,path,contentType,bytes}]. Factories serve fixed trusted worker
  bootstrap URLs and send catalog as first native message before guest access;
  entries queue application messages until the engine is ready. Native child
  about:blank contexts are prepared by trusted parent before application markup.
- Parent owns new src/guest/browser.ts native policy/globals, resource catalog,
  guest window bootstrap/markup renderer, serviceworker/build integration,
  application acceptance/report/deployment.

All guest fetch/XHR reads use admitted catalog bytes (supplied through a private
native SW MessageChannel). No native fetch is needed in application contexts:
engine Wasm bytes are in catalog and compiled before GuestEngine.create. Thus
connect-src 'none' is intended in window/worker CSP. CSS/images/media native
requests use self/data/blob as appropriate and the serviceworker returns local
admitted bytes or errors. Native WebSocket/WebTransport/WebRTC/etc are not
exposed by guest globals or returned-object policy.

Bootstrap elements/nonces are removed before guest markup; guest fetch of its
source URL returns captured application HTML, never trusted bootstrap response.
Native inline handlers/scripts remain disallowed by CSP and script source is
routed to QuickJS. DOM insertion/mutation must preprocess markup/scripts,
child-context attributes, resource URLs and navigation. Native original getter
functions must not bypass that mediation through descriptors/lookupGetter.
Guest prototype changes remain local. Root globalObject aliases window/self
with guest globalThis and exposes only chosen globals, not raw native Window.

The live manager gained installation share links after the original source pin.
Its nine changed manager files are reused from published main revision
f64e2686cf3689fc0bdb621553df817162657a5d so the fork preserves the current UI
and sharing behavior. The runtime summary includes captured additional resources
for those links. The native execution implementation is not merged.

## Implementation findings

Application-triggered native HTTP requests can schedule browser service-worker
maintenance even when the response is cached. Runtime rendering therefore uses
Blob/data resource URLs, native workers use registry-owned Blob bootstraps,
worklets load a local bootstrap, and child windows retain their initial blank
document. The registry is contacted only during trusted root startup; children
inherit prepared bootstrap URLs. HTTP resource/bootstrap fallbacks are removed.

The QuickJS wrapper's cached Wasm output views became detached during memory
growth. A minimal promise-job allocation reproduced the extra-context disposal
failure. The pinned SDK patch and clean-install regression are documented in
patches/README.md. Platform brand checks cache immutable internal-slot results;
application prototype changes remain local to the guest.

Functional qualification covers unchanged publisher sources. Objects and embeds
remain inert DOM nodes with source attributes withheld, because deleting them
breaks ordinary DOM queries. Hidden guest fields stay lazy at native dictionary
boundaries; structured-clone operations read enumerable application data.

Formal models and implementation checks from the native runtime are historical
research evidence, with the source baseline linked from formal/README.md. They do
not establish correctness of this implementation. Release qualification uses the
new guest engine/context/policy/installation and application suites.
