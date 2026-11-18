# Native browser forwarding from generated interface metadata

The guest engine uses standard Web IDL declarations to identify browser
interfaces, their prototype ancestry and declared members. `@webref/idl` supplies
the declarations extracted from specifications; `webidl2` parses them at build
time. `scripts/guest-bindings.ts` merges partial interfaces and included mixins,
retains operation overloads and writes `src/guest/generated-interfaces.ts`.
The generated manifest records exact package versions and a hash of the source
filenames and bytes.

That full table is a build/test reference. The runtime imports
`src/guest/runtime-interfaces.ts`, backed by a separate generated projection.
It retains every interface identity, parent and exposure, plus the global
members used to provision Window and worker facades. Argument schemas, type
strings and source-document lists are excluded from browser bundles. Both
tables come from the same compilation pass; no application names or profiles
control the projection.

This refines the feasibility study's generated-wrapper recommendation. A second
complete set of webidl2js implementation classes would repeat conversions which
the native browser already performs. The production bridge instead decodes the
receiver and arguments, then calls the native operation. The browser supplies
its existing Web IDL conversion and brand checks. Guest prototypes and wrappers
remain in the guest engine; native receivers stay in trusted host records.

The metadata table contains interface shape for the full pinned corpus. It does
not authorize those interfaces or operations. For example, WebSocket appears in
Window exposure metadata even though the runtime must withhold that capability.
The native-effect policy independently decides which globals, operations,
arguments and returned objects the application may access.

The full reference's `src/guest/interfaces.ts` provides derived-first ancestry lookup, member and
overload lookup, exposure queries, and implicit iterable/maplike/setlike members.
Constants belong to both interface objects and prototypes. Native availability
still needs checking because the standards corpus includes features which a
particular browser may not implement.

Unknown application properties and prototype extensions belong to guest objects.
Known native attributes may use native getters/setters through the policy.
Readonly, Replaceable, LegacyUnforgeable and SameObject annotations remain in
the full reference; native descriptors supply per-object read/write behavior.
The table cannot substitute for
listener lifetime, callback scheduling, source routing or effect policy.

The generator rejects incomplete primary interfaces, unresolved includes,
missing parents and inheritance cycles. `test/guest-bindings.test.ts` also checks
the pinned corpus's exposure, DOM ancestry, mixins, overloads and collection
declarations. Browser integration tests must separately establish how those
declarations behave through the actual guest/native bridge.

`test/guest-runtime-bindings.test.ts` checks projection and exposure parity.
The size harness compiles the same window and worker entries against both
projections without minification. Its receipt records bundle sizes, hashes and
whether each metadata module appears in the bundler graph, under
`results/guest-runtime/interface-projection.json`.
