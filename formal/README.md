# Confinement verification

Current implementation-connected work is under [quickjs/](quickjs/README.md).

## Earlier native-runtime verification work

These models, implementation checks and browser experiments describe the native
JavaScript runtime that preceded the QuickJS fork. Its source is preserved at
[3013bd5](https://github.com/privacy-frames/host/tree/3013bd51d4fde27cd8adf327e7009430641c8e40)
in the host repository. Check out that revision to
reproduce implementation-dependent runners in this directory.

The browser findings remain relevant research evidence, including private-input
signals through service-worker maintenance. Models and receipts referring to
removed native guards do not verify the QuickJS implementation. Current runtime
checks are listed in [SURFACE_INVENTORY.md](../SURFACE_INVENTORY.md).
