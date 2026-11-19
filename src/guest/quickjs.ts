import type { QuickJSSyncVariant } from '@jitl/quickjs-ffi-types';

/** Bindings stay upstream; the engine and loader are built from our source. */
export const quickjsVariant: QuickJSSyncVariant = {
  type: 'sync',
  importFFI: () =>
    import('@jitl/quickjs-wasmfile-release-sync/ffi').then((module) => module.QuickJSFFI),
  importModuleLoader: () =>
    import('../../vendor/quickjs/generated/engine.mjs').then((module) => module.default),
};

/** Capture the trusted instance for our C extensions without exposing the SDK's
 * protected internals or publishing the module to application JavaScript. */
export function captureQuickJSVariant(
  capture: (
    module: import('../../vendor/quickjs/generated/engine.mjs').IndexedEmscriptenModule,
  ) => void,
): QuickJSSyncVariant {
  return {
    ...quickjsVariant,
    importModuleLoader: async () => {
      const { default: load } = await import('../../vendor/quickjs/generated/engine.mjs');
      return async (options) => {
        const module = await load(options);
        capture(module);
        return module;
      };
    },
  };
}
