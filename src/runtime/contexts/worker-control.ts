import { internalRecord } from '../../shared/primordials.ts';
import { getApp } from '../storage.ts';
import { ContextRegistry, type ContextIdentity } from './model.ts';
import { parseWorkerControl, workerIdentifier } from './worker-protocol.ts';

/** The transport supplies the actual parent; packets select only its child ID. */
export async function closeWorkerChild(
  client: Pick<Client, 'id' | 'url' | 'type'> | undefined,
  child: unknown,
  contexts: ContextRegistry,
  store = internalRecord({ getApp }),
): Promise<boolean> {
  if (!client || !workerIdentifier(child))
    throw new Error('Invalid worker closure request');
  const parent = await contexts.resolve(client);
  if (!parent || parent.kind === 'worklet')
    throw new Error('Worker parent not authorized');
  const app = await store.getApp(parent.application);
  if (
    !app ||
    app.generation !== parent.installationGeneration ||
    !(await contexts.isCurrent(client, parent))
  )
    throw new Error('Worker parent authority changed');
  return contexts.closeChild(client.id, app.id, child);
}

/** Every delegated hop must match an actual native parent/client binding. */
export async function requestWorkerControl(
  client: Pick<Client, 'id' | 'url' | 'type'> | undefined,
  packet: unknown,
  contexts: ContextRegistry,
  store = internalRecord({ getApp }),
): Promise<unknown> {
  const input = parseWorkerControl(packet);
  if (!client) throw new Error('Worker control client missing');
  const root = await contexts.resolve(client);
  if (!root || root.kind === 'worklet')
    throw new Error('Worker control client not authorized');
  const app = await store.getApp(root.application);
  if (!app || app.generation !== root.installationGeneration)
    throw new Error('Worker installation unavailable');
  type Actor = { client: Pick<Client, 'id' | 'url' | 'type'>; identity: ContextIdentity };
  const actors: Actor[] = [{ client, identity: root }];
  let selected = actors[0];
  const visited = new Set([client.id]);
  for (const id of input.path) {
    const bound = await contexts.resourceCapability(id, '');
    if (
      !bound ||
      bound.identity.kind !== 'dedicated-worker' ||
      bound.identity.parent !== selected.client.id ||
      bound.identity.application !== app.id ||
      bound.identity.installationGeneration !== app.generation ||
      visited.has(bound.client)
    )
      throw new Error('Worker delegation not authorized');
    visited.add(bound.client);
    selected = {
      client: { id: bound.client, url: bound.identity.url, type: 'worker' },
      identity: bound.identity,
    };
    actors.push(selected);
  }
  for (const actor of actors)
    if (!(await contexts.isCurrent(actor.client, actor.identity)))
      throw new Error('Worker delegation changed');
  if ((await store.getApp(app.id))?.generation !== app.generation)
    throw new Error('Worker installation changed');
  if (input.operation === 'verify') return internalRecord({ verified: true });
  return internalRecord({
    closed: await closeWorkerChild(selected.client, input.id, contexts, store),
  });
}
