import { internalRecord } from '../shared/primordials.ts';
import { ContextRegistry } from './contexts/model.ts';
import { prepareRuntimeDocument } from './document.ts';
import { getApp, getResource } from './storage.ts';

interface ContentStore {
  getApp: typeof getApp;
  getResource: typeof getResource;
}

/** The caller supplies a client looked up by the browser, never packet identity. */
export async function readInstalledContent(
  client: Pick<Client, 'id' | 'url' | 'type'> | undefined,
  contexts: ContextRegistry,
  base: URL,
  store: ContentStore = internalRecord({ getApp, getResource }),
) {
  if (!client || client.type !== 'window') throw new Error('Root client required');
  const root = await contexts.resolve(client);
  if (!root || root.kind !== 'window' || root.parent !== null)
    throw new Error('Root client not authorized');
  const app = await store.getApp(root.application);
  if (!app || app.generation !== root.installationGeneration)
    throw new Error('Installation unavailable');
  const bytes = await store.getResource(app.id, app.manifest.entry, app.generation);
  if (!(await contexts.isCurrent(client, root)))
    throw new Error('Root authority changed');
  const current = await store.getApp(app.id);
  if (!current || current.generation !== app.generation)
    throw new Error('Installation changed');
  return internalRecord({
    ...prepareRuntimeDocument(app, bytes, base),
    installationGeneration: app.generation,
  });
}
