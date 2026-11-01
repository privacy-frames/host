import { internalRecord } from '../../shared/primordials.ts';
import { applicationURL } from '../../shared/runtime-url.ts';
import { getApp } from '../storage.ts';
import {
  CONTEXT_POLICY_VERSION,
  ContextRegistry,
  type ContextIdentity,
  type WorkerBootstrapMetadata,
} from './model.ts';
import { withWorkerAuthority } from './worker-control.ts';
import { parseWorkerBirth } from './worker-birth-protocol.ts';
import { workerResourceAliases } from './worker-aliases.ts';

type NativeClient = Pick<Client, 'id' | 'url' | 'type'>;
interface NativeWorkers {
  list(): Promise<readonly NativeClient[]>;
  get(id: string): Promise<NativeClient | undefined>;
}

/** The private factory owns source admission; the controller resolves native ID. */
export async function bindWorkerBirth(
  parent: NativeClient | undefined,
  packet: unknown,
  contexts: ContextRegistry,
  base: URL,
  clients: NativeWorkers,
  store = internalRecord({ getApp }),
): Promise<WorkerBootstrapMetadata> {
  const input = parseWorkerBirth(packet);
  const url = new URL(input.url);
  if (
    url.protocol !== 'blob:' ||
    url.origin !== base.origin ||
    url.href !== input.url ||
    url.search ||
    url.hash
  )
    throw new Error('Worker bootstrap must be a local runtime Blob');
  let binding: { parent: string; application: string } | undefined;
  try {
    return await withWorkerAuthority(
      parent,
      input.path,
      contexts,
      async (owner) => {
        const identity = await contexts.resolve(owner);
        if (!identity) throw new Error('Worker parent unavailable');
        const app = await store.getApp(identity.application);
        if (!app || app.generation !== identity.installationGeneration)
          throw new Error('Worker installation changed');
        const matches = (await clients.list()).filter(
          (client) => client.type === 'worker' && client.url === url.href,
        );
        if (matches.length !== 1 || matches[0].id === owner.id)
          throw new Error('Worker bootstrap has no unique native client');
        const native = await clients.get(matches[0].id);
        if (!native || native.type !== 'worker' || native.url !== url.href)
          throw new Error('Native worker disappeared');
        const child: ContextIdentity = internalRecord({
          policyVersion: CONTEXT_POLICY_VERSION,
          installationGeneration: app.generation,
          id: input.id,
          application: app.id,
          parent: owner.id,
          kind: 'dedicated-worker',
          state: 'preparing',
          url: native.url,
        });
        await contexts.bind(native.id, child);
        binding = { parent: owner.id, application: app.id };
        const current = await clients.get(native.id);
        if (
          !current ||
          current.type !== 'worker' ||
          current.url !== native.url ||
          !(await contexts.isCurrent(current, child))
        )
          throw new Error('Native worker changed during binding');
        const entry = applicationURL(app, base);
        return internalRecord({
          identity: child,
          runtime: base.href,
          applicationURL: entry.href,
          module: input.module,
          ...workerResourceAliases(
            app,
            new URL(`__contexts/${child.id}/resources/`, entry),
            base,
          ),
        });
      },
      store,
    );
  } catch (error) {
    if (binding) await contexts.closeChild(binding.parent, binding.application, input.id);
    throw error;
  }
}
