`quickjs-emscripten-core` 0.32.0 caches typed-array views into Wasm memory for output parameters. Guest execution can grow that memory and detach those views. In `executePendingJobs`, the lost context pointer causes the SDK to create an extra context; disposing the runtime then aborts because that context is still retained. Upstream tracks the same defect in [issue #240](https://github.com/justjake/quickjs-emscripten/issues/240).

The patch reads output parameters through a fresh view of the current heap in `executePendingJobs`, `getOwnPropertyNames` and `getLength`. It covers the CommonJS and ES module distributions. `npm ci` applies it through `patch-package`; an incompatible dependency update fails installation. The engine test allocates 32 MiB inside a Promise job, checks reflection and array length after growth, and disposes the runtime in Chromium and Firefox.

The patch also adds `newArrayBufferBacking` for fixed buffers allocated by the
host. The existing copied conversion APIs remain available. The new API knows
the allocation it passes to [`QTS_NewArrayBuffer` in the pinned 0.32.0 C wrapper](https://github.com/justjake/quickjs-emscripten/blob/v0.32.0/c/interface.c#L498-L503).
QuickJS owns that allocation through the wrapper's free callback; the API does
not discover pointers inside guest objects.

The returned original handle must stay alive. Synchronous `writeFrom` and
`readInto` methods check that handle and context, validate attachment and length
with intrinsics captured at context creation, then read the current Wasm heap.
They return no heap view. Transfers invalidate access through the original
buffer even when the destination still owns its allocation. The engine retains
the original handle for the mirror and gives other callers duplicates.
Guest-created buffers use the existing copied fallback.

The engine regression checks byte synchronization after heap growth, tampered
guest intrinsics, zero-length buffers, rejected access after detachment and
disposal, and transfer destinations left unchanged by rejected writes.
