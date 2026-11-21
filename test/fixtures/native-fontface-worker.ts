import { nativeFontFaceChecks } from './native-fontface.ts';
declare const self: DedicatedWorkerGlobalScope;
try {
  self.postMessage({ result: nativeFontFaceChecks(self) });
} catch (error) {
  self.postMessage({ error: String(error) });
}
