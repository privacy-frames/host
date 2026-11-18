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
