import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-wasmfile-release-sync';

export const createContext = async (module?: WebAssembly.Module) => {
  const engine = await newQuickJSWASMModuleFromVariant(
    newVariant(
      variant,
      module ? { wasmModule: module } : { wasmLocation: '/engine.wasm' },
    ),
  );
  return engine.newContext();
};
export const evaluate = (
  context: Awaited<ReturnType<typeof createContext>>,
  source: string,
) => {
  const result = context.evalCode(source).unwrap();
  const value = context.dump(result);
  result.dispose();
  return value;
};
