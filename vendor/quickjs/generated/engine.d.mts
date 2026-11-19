import type {
  EmscriptenModuleLoader,
  QuickJSEmscriptenModule,
} from '@jitl/quickjs-ffi-types';
/** Runtime functions exported by our Emscripten build. Kept off the guest API. */
export interface IndexedEmscriptenModule extends QuickJSEmscriptenModule {
  addFunction(fn: Function, signature: string): number;
  removeFunction(index: number): void;
}
declare const load: EmscriptenModuleLoader<IndexedEmscriptenModule>;
export default load;
