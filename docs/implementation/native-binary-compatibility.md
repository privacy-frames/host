# Native binary compatibility

Ordinary guest arrays use QuickJS storage. Views over native Wasm memory and
shared buffers use the browser's storage, so a Wasm import callback or another
worker can read and write the same bytes. `test/guest-wasm.ts` checks callbacks,
aliases, growth, detachment, atomic updates, native decoding and default shared
buffer slicing against unrestricted browser controls.

One known difference concerns custom `Symbol.species` on a Wasm shared buffer.
Chromium 153 exposes `WebAssembly.Memory({shared: true}).buffer` as a
non-extensible object. Its `structuredClone` wrapper is also non-extensible.
The bridge cannot attach its private constructor getter to either wrapper.
Consequently, slicing that buffer uses the native default species and ignores
a custom species set on the guest `SharedArrayBuffer` constructor. Default
slicing still produces an independent shared data block with the expected bytes.
Firefox 155 exposes an extensible wrapper and honors the guest species hook.

The runtime keeps the original shared data block. It does not emulate shared
memory with a byte copy. A replacement slice algorithm would also need to
preserve native rejection of a species constructor returning another wrapper
for the source data block; object identity alone cannot establish that condition.
