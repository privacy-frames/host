import type { QuickJSSyncVariant } from '@jitl/quickjs-ffi-types';

/** Bindings stay upstream; the engine and loader are built from our source. */
export const quickjsVariant: QuickJSSyncVariant = {
  type: 'sync',
  importFFI: () =>
    import('@jitl/quickjs-wasmfile-release-sync/ffi').then((module) => module.QuickJSFFI),
  importModuleLoader: () =>
    import('../../vendor/quickjs/generated/engine.mjs').then((module) => module.default),
};
