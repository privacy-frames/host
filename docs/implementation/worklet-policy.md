# Native capabilities in audio worklets

Application JavaScript executes in QuickJS. The audio worklet host now exposes explicit native policies through `NativeHost`; it has no reflective fallback for arbitrary native reads, writes, calls, descriptors, prototypes or construction.

The worklet admits three sources of authority:

- Trusted initialization installs two mediated internal callbacks for processor registration and retrieval of the processor's port. The guest runtime captures these callbacks and deletes their global names before application modules execute.
- Timing reads are restricted to `currentFrame`, `currentTime` and `sampleRate` on the exact native global. The console is an exact facade with listed logging methods.
- The host-created processor endpoint and its native deliveries produce MessagePorts and MessageEvents admitted by the shared MessagePort policy. Unknown endpoints are rejected even when they have the same native prototype.

The bootstrap port supplies native declarations during setup. Its identity is explicitly excluded from application admission. Processor ports come from the host-created AudioWorkletNode; transferred ports are admitted only from a native delivery's `ports` array. This relies on counterpart contexts preserving confinement and management endpoints never being transferred into application channels. Payload fields, constructor names and MessagePort brand tests confer no authority. Storage and permissions shared by applications remain outside this policy.

The MessagePort policy supports `postMessage`, `start`, `close`, event listeners and handler attributes. Guest callbacks have exact engine-recorded ownership. Native delivery admits the event and transferred endpoints before invoking the callback. Handler reads return the original guest callback. Transfer options and their iterator are consumed once; native posting and subsequent buffer detachment accounting use the same captured sequence. Failed native posting does not commit detachment.

Event fields and local propagation methods have explicit declarations. Native unforgeable `isTrusted` getters are captured on the delivered event itself. Descriptors and borrowed methods still pass through the registry's receiver and descriptor checks. There are no native event constructors, arbitrary EventTarget receivers or generic context-creation capabilities in this host. Arrays, records, typed buffers and WebAssembly retain their existing engine domains.

`test/guest-worklet-policy.test.ts` checks ownership, callback identity, native delivery, transferred endpoints, transfer conversion and unknown getters. Its temporary esbuild control omits the actual shared registry read for the fixture getter; that getter then executes once. Production rejects it before execution. Existing bootstrap tests retain their independent late-initialization cancellation control. `test/guest-contexts.ts` exercises actual QuickJS audio processors, native sample output and transferred buffers in Chromium and Firefox.

These checks establish coverage of this capability family. They do not establish closure of the browser host's remaining native families or prove the browser's native event and structured-clone implementations.
