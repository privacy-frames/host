# Build the Privacy Frames host around a WebAssembly JavaScript engine

Label: wayfinder:map

## Destination

Deliver a complete greenfield hard fork of Privacy Frames using a JavaScript
engine implemented in WebAssembly, preserving the current demonstration's
supported applications, required browser behavior and a manager at pf.damenh.com
that is very similar or identical to the current interface.

## Notes

- User direction, 2026-11-17: this is new work with a new approach. Existing code
  may be reused where useful; there is no requirement to preserve the existing
  runtime architecture or maintain backward compatibility.
- This map charts the decisions leading to the full host. A disposable probe may
  settle a question, but a small prototype is not the destination. Implementation
  follows the architectural decisions; no engine has been selected.
- QuickJS and Boa are initial engine candidates. Prioritize JavaScript and web
  feature compatibility; performance is secondary but important.
- Prefer original application JavaScript without polyfills, transpilation or
  downleveling. Those techniques are open alternatives requiring an explicit
  trade-off rather than silent compatibility assumptions.
- IFC is out of scope for this work. JSFlow may inform research; its
  implementation must not be used.
- Preserve the current host's confinement requirements. Existing counterexamples
  and unproved claims are research inputs, not satisfied requirements.
- Starting source: host commit e92eb2566b0aebc7f13416ec6af7b6737ba840eb.
  The public compatibility release has its own source pin and scoped evidence.
- Working branch: wasm-runtime-wayfinding; worktree:
  /home/damen/Projects/privacy-frames-wasm-wayfinding.
- Use the wayfinder, grilling, domain-modeling and research skills from
  mattpocock/skills. Consult the repository AGENTS.md and Damen's AI Voice registry
  when editing end-product prose. Damen's replacement instructions from
  2026-11-17 apply; consult /home/damen/.agents/code-preferences/README.md for
  substantial architecture/style choices. Private preference evidence stays out
  of published artifacts.
- Tracker: local Markdown under .scratch/wasm-runtime, following wayfinder's
  default when no tracker configuration is provided. Child questions live in
  issues/*.md. Status is open, claimed or resolved. Blocked-by entries refer to
  filenames; a ticket is available only after every blocker is resolved.
- Research findings live on their own research/* branches and are not merged.
  Resolutions link the findings and their exact commits. Human decisions require
  conversation with Damen; the agent must not resolve them on his behalf.

## Decisions so far

- [Current demonstration behavior and application compatibility contract](issues/03-current-demo-contract.md): the source/receipt audit identifies the application, browser and installation baseline, with unqualified surfaces kept explicit.

- [QuickJS language, WebAssembly embedding and host feature support](issues/01-quickjs-capabilities.md): pinned upstream/wrapper research separates language support from browser bindings and guest Wasm.
- [Boa language, WebAssembly embedding and host feature support](issues/02-boa-capabilities.md): release-source research distinguishes engine, optional runtime APIs and the application embedding still required.

- [Exclude application service-worker execution from the first fork release](issues/09-application-service-worker-scope.md): retain the host worker and manifest/offline handling; application worker execution is deferred.

## Not yet specified

Application-specific incompatibilities may emerge when candidate bindings meet
actual application code. Their mechanisms and required qualification work cannot
yet be specified. Language, binding, context, security and build-route decisions
already have tickets; their details live there.

## Out of scope

- Application service-worker registration/execution/lifecycle/fetch interception for the first release; see [the scope decision](issues/09-application-service-worker-scope.md).
- Information-flow control, label propagation or declassification.
- Using the JSFlow implementation.
- Backward compatibility with the old runtime's internal protocols or formats.
- Patching applications or adding engine-specific publisher conventions as an
  unexamined substitute for required compatibility.
