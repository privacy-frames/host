import { prepareWorkerRealm } from '../../../src/runtime/contexts/worker-realm.ts';
import { CONTEXT_POLICY_VERSION } from '../../../src/runtime/contexts/model.ts';
import { bindingProbe, cacheCallbackProbe } from './probe.ts';
const send = self.postMessage.bind(self);
prepareWorkerRealm(
  {
    identity: {
      policyVersion: CONTEXT_POLICY_VERSION,
      installationGeneration: 'generation-a',
      id: 'fixture-worker',
      application: 'binding-fixture',
      parent: 'fixture-parent',
      kind: 'dedicated-worker',
      state: 'preparing',
      url: location.href,
    },
    runtime: location.origin + '/',
    applicationURL: location.origin + '/app/',
    rootAliases: [],
    aliases: [],
    module: false,
    scripts: [],
  },
  'message',
  async () => {
    throw new Error('This binding fixture does not execute publisher code');
  },
  async () => {
    throw new Error('This binding fixture does not read resources');
  },
  async () => {
    throw new Error('This binding fixture does not create workers');
  },
);
(async () => {
  try {
    send({ bindings: bindingProbe(), cache: await cacheCallbackProbe() });
  } catch (error) {
    send({ error: error instanceof Error ? error.message : String(error) });
  }
})();
