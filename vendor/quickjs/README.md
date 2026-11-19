# QuickJS

Privacy Frames builds its JavaScript interpreter from this directory. The runtime
and browser tests use the resulting engine and loader together. The
quickjs-emscripten TypeScript bindings and FFI adapter remain npm dependencies.

`upstream/` contains QuickJS 2025-09-13 from quickjs-emscripten v0.32.0, including
its existing WebKit workaround. `c/interface.c` and the two loader extensions come
from the same revision. `source.json` records the revision, source paths, local
changes and compiler image. Preserve the upstream license files when editing or
redistributing this code.

## Build

Install Docker and Node.js 24, then run:

```sh
npm ci
npm run build:engine
```

The first build downloads the Emscripten image pinned by digest. Compilation runs
with networking disabled, a read-only source mount, `-O3` and link-time
optimization. Output goes to `generated/`; generated binaries are not committed.
`npm run build`, `npm run typecheck` and `npm test` also prepare the engine.
Prepare it explicitly before running individual test scripts in a fresh checkout.

The build receipt records source, loader and Wasm hashes. Unchanged inputs and
matching outputs reuse the previous build. To force recompilation, delete
`generated/build.json`. Application build IDs include this receipt.

## Engine changes

Edit the C source here and rebuild. Keep the loader and Wasm binary from the same
build, and update the FFI bindings when changing the exported C interface. The
existing TypeScript binding fixes remain in `patches/`.

## Indexed buffer access

The engine can accelerate numeric indexing on trusted host-created Proxy objects.
For fixed, non-shared Wasm buffers, small Wasm modules import application memory
and provide typed reads and writes. Their native exports enter the interpreter's
private function table. Application Wasm receives neither that table nor the
interpreter heap. Other properties, methods and Proxy invariant checks keep their
existing paths. Object coercion and unsupported view types use the ordinary
bridge.

Host-backed views of other fixed buffers can use a private QuickJS cache with C
dirty tracking.
The cache has a 128 MiB budget and reclaims inactive stores; buffers that do not fit
retain native access. Pending writes publish before native consumers. Native
calls invalidate private caches and disable access records for detached buffers.
Shared and resizable buffers retain actual native views.

Access records borrow a rooted QuickJS view handle or hold trusted accessor
function pointers. `IndexedAccess` keeps the handles alive, unlinks records before
freeing them, and releases table entries before disposing the interpreter.
