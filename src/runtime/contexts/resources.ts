import { strings, internalSet, internalRecord } from '../../shared/primordials.ts';
import { ContextRegistry } from './model.ts';
import { getApp, getResource } from '../storage.ts';
import { applicationURL } from '../../shared/runtime-url.ts';
import { response } from '../response-policy.ts';
import { isExecutableScriptType, mime } from '../../shared/policy.ts';
const resourceDestinations = internalSet<RequestDestination>([
  '',
  'script',
  'style',
  'image',
  'font',
  'audio',
  'video',
  'track',
]);
interface ResourceStore {
  getApp: typeof getApp;
  getResource: typeof getResource;
}
export interface ContextResourceDiagnostic {
  reason: string;
  clientId: string;
  resultingClientId: string;
  destination: RequestDestination;
  boundContext?: string;
  boundClient?: string;
}
/** Some nested worker requests have no browser client ID. Their bootstrap-issued
 * bearer grants only this context's immutable resource graph. */
export async function contextResourceResponse(
  event: Pick<FetchEvent, 'request' | 'clientId'> &
    Partial<Pick<FetchEvent, 'resultingClientId'>>,
  registry: ContextRegistry,
  base: URL,
  store: ResourceStore = internalRecord({ getApp, getResource }),
  diagnose?: (diagnostic: ContextResourceDiagnostic) => void,
): Promise<Response | undefined> {
  const url = new URL(event.request.url);
  url.hash = '';
  if (url.origin !== base.origin) return undefined;
  const match = strings.match(
    url.pathname,
    /\/__contexts\/([a-f0-9-]{36})\/(resources\/.+)$/,
  );
  if (!match) return undefined;
  const deny = async (reason: string) => {
    if (diagnose) {
      const bound = await registry.resourceCapability(match[1], '');
      diagnose(
        internalRecord({
          reason,
          clientId: event.clientId,
          resultingClientId: event.resultingClientId || '',
          destination: event.request.destination,
          boundContext: bound?.identity.id,
          boundClient: bound?.client,
        }),
      );
    }
    return Response.error();
  };
  if (
    event.request.method !== 'GET' ||
    url.search ||
    event.request.mode === 'navigate' ||
    event.resultingClientId
  )
    return deny('request-shape');
  const capability = await registry.resourceCapability(match[1], event.clientId);
  if (!capability) return deny('context-authority');
  const app = await store.getApp(capability.identity.application);
  if (!app) return deny('application-missing');
  if (capability.identity.installationGeneration !== app.generation)
    return deny('installation-generation');
  const directory = new URL(
    `__contexts/${capability.identity.id}/`,
    applicationURL(app, base),
  );
  // Firefox labels descendant module imports as "worker". Unlike a new Worker
  // startup, that fetch has the exact existing worker client and no reserved
  // resulting client. Bearer possession alone never admits that destination.
  const workerModule =
    event.request.destination === 'worker' &&
    event.clientId !== '' &&
    event.clientId === capability.client &&
    event.resultingClientId === '';
  if (!resourceDestinations.has(event.request.destination) && !workerModule)
    return deny('resource-destination');
  const resource = app.resources.find(
    (item) => new URL('resources/' + item.path, directory).href === url.href,
  );
  if (!resource) return deny('resource-missing');
  const contentType = resource.contentType || mime(resource.path);
  const essence = strings.toLowerCase(strings.trim(strings.split(contentType, ';')[0]));
  if (
    workerModule &&
    (!strings.includes(essence, '/') || !isExecutableScriptType(essence))
  )
    return deny('module-content-type');
  return response(
    await store.getResource(
      app.id,
      resource.path,
      capability.identity.installationGeneration,
    ),
    contentType,
  );
}
