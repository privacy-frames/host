import { internalRecord } from '../../shared/primordials.ts';
import { getApp } from '../storage.ts';
import { ContextRegistry } from './model.ts';

const identifier =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

/** The transport supplies the actual parent; packets select only its child ID. */
export async function closeWorkerChild(
  client: Pick<Client, 'id' | 'url' | 'type'> | undefined,
  child: unknown,
  contexts: ContextRegistry,
  store = internalRecord({ getApp }),
): Promise<boolean> {
  if (!client || typeof child !== 'string' || !identifier.test(child))
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
