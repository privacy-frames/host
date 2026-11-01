import { prepareWindowRealm } from '../../../src/runtime/contexts/window-realm.ts';
import { bindingProbe, cacheCallbackProbe, webStorageCallbackProbe } from './probe.ts';
declare global {
  interface Window {
    runGlobalBindingProbe(): Promise<unknown>;
  }
}
prepareWindowRealm({
  application: 'binding-fixture',
  applicationURL: location.origin + '/app/',
  scriptNonce: 'fixture',
}).admitContent({
  scripts: [],
  installationGeneration: 'generation-a',
  source: location.origin + '/app/',
  aliases: [],
});
window.runGlobalBindingProbe = async () => ({
  bindings: bindingProbe(),
  webStorage: webStorageCallbackProbe(),
  cache: await cacheCallbackProbe(),
});
