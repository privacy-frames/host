# QuickJS

Privacy Frames builds its JavaScript interpreter from this directory. The runtime
and browser tests use the resulting engine and loader together. The npm package
supplies the TypeScript bindings and FFI adapter; its prebuilt engine is not
used.

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

Vendoring does not change buffer semantics. QuickJS's private interpreter memory
remains separate from application Wasm memory. Direct access to application memory
requires further engine work; this build still uses the existing buffer bridge.
