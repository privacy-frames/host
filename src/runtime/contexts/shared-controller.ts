import { strings, ownDescriptor, internalRecord } from '../../shared/primordials.ts';
import { sharedWorkerKey, type SharedWorkerTicket } from '../../shared/shared-worker.ts';
import { applicationURL, resourceURL } from '../../shared/runtime-url.ts';
import { isExecutableScriptType, mime } from '../../shared/policy.ts';
import { response } from '../response-policy.ts';
import type { StoredInstallation } from '../storage.ts';
import {
  CONTEXT_POLICY_VERSION,
  ContextRegistry,
  type WorkerBootstrapMetadata,
} from './model.ts';
import { workerResourceAliases } from './worker-aliases.ts';
import { readDocumentRequest } from './document-request.ts';
import { SharedConnectionStore } from './shared-connections.ts';
interface SharedControllerOptions {
  base: URL;
  contexts: Pick<ContextRegistry, 'resolve' | 'resolveWorker' | 'bind'>;
  store: Pick<SharedConnectionStore, 'issue' | 'consume' | 'disconnect'>;
  installation(id: string): Promise<StoredInstallation | undefined>;
  client(id: string): Promise<Client | undefined>;
  application(client: Client): Promise<string | null>;
  bootstrap(): Promise<Response | undefined>;
}
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid shared worker request');
  const property = ownDescriptor(value, key);
  if (property && !('value' in property))
    throw new Error('Shared worker request accessors are not data');
  return property?.value;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || value.length > 32768)
    throw new Error('Invalid shared worker string');
  return value;
}
function json(value: unknown, status = 200) {
  return response(JSON.stringify(value), 'application/json', status);
}
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const bootstrapPath = /\/__contexts\/shared\/(classic|module)\.js$/;
const connectionPath = new RegExp(`/__contexts/(${UUID})/shared-connect$`);
/** Native startup and each subsequent native connection have separate grants. */
export function createSharedController(options: SharedControllerOptions) {
  const { base, contexts, store } = options;
  async function owner(id: string) {
    if (!id) return;
    const client = await options.client(id);
    if (!client || client.type !== 'window') return;
    const application = await options.application(client);
    const app = application ? await options.installation(application) : undefined;
    const identity = await contexts.resolve(client);
    return app &&
      identity?.kind === 'window' &&
      identity.application === app.id &&
      identity.installationGeneration === app.generation
      ? internalRecord({ app, client })
      : undefined;
  }
  function actor(app: StoredInstallation, client: string) {
    return internalRecord({
      application: app.id,
      installationGeneration: app.generation,
      client,
    });
  }
  async function request(clientId: string, packet: unknown) {
    const operation = field(packet, 'operation');
    if (operation !== 'connect' && operation !== 'disconnect')
      throw new Error('Invalid shared worker operation');
    const parent = await owner(clientId);
    if (!parent) throw new Error('Shared worker owner unavailable');
    const principal = actor(parent.app, parent.client.id);
    if (operation === 'disconnect')
      return internalRecord({
        closed: await store.disconnect(string(field(packet, 'ticket')), principal),
      });
    const source = new URL(string(field(packet, 'source')));
    if (source.username || source.password)
      throw new Error('Shared worker URL credentials refused');
    const type = field(packet, 'workerType');
    if (type !== 'classic' && type !== 'module')
      throw new Error('Invalid shared worker type');
    const hash = source.hash;
    source.hash = '';
    if (source.protocol === 'blob:') {
      if (source.origin !== base.origin)
        throw new Error('Shared worker Blob belongs to another origin');
    } else {
      const resource = parent.app.resources.find(
        (item) =>
          item.url === source.href ||
          resourceURL(parent.app, item.path, base).href === source.href,
      );
      if (
        !resource ||
        !isExecutableScriptType(
          strings.trim(
            strings.split(resource.contentType || mime(resource.path), ';')[0],
          ),
        )
      )
        throw new Error('Shared worker source is not installed JavaScript');
      source.href = resource.url;
    }
    source.hash = hash;
    const key = sharedWorkerKey(
      principal,
      internalRecord({ source: source.href, type, name: string(field(packet, 'name')) }),
    );
    const ticket = await store.issue(principal, key);
    const current = await owner(clientId);
    if (
      !current ||
      current.client.id !== parent.client.id ||
      current.app.id !== parent.app.id ||
      current.app.generation !== parent.app.generation
    ) {
      await store.disconnect(ticket, principal);
      throw new Error('Shared worker owner changed during preparation');
    }
    const grant: SharedWorkerTicket = internalRecord({
      ticket,
      key,
      application: parent.app.id,
      installationGeneration: parent.app.generation,
      bootstrapURL: new URL(
        `__contexts/shared/${type}.js`,
        applicationURL(parent.app, base),
      ).href,
    });
    return grant;
  }
  async function respond(event: FetchEvent): Promise<Response | undefined> {
    const request = event.request;
    const url = new URL(request.url);
    if (url.origin !== base.origin) return;
    const bootstrap = strings.match(url.pathname, bootstrapPath);
    const connection = strings.match(url.pathname, connectionPath);
    if (!bootstrap && !connection) return;
    if (url.search || url.hash || request.mode === 'navigate') return Response.error();
    if (bootstrap) {
      if (
        request.method !== 'GET' ||
        request.destination !== 'sharedworker' ||
        !event.resultingClientId
      )
        return Response.error();
      const parent = await owner(event.clientId);
      if (!parent) return Response.error();
      const entry = applicationURL(parent.app, base);
      const expected = new URL(`__contexts/shared/${bootstrap[1]}.js`, entry);
      if (url.href !== expected.href) return Response.error();
      const id = crypto.randomUUID();
      const identity = internalRecord({
        policyVersion: CONTEXT_POLICY_VERSION,
        installationGeneration: parent.app.generation,
        id,
        application: parent.app.id,
        parent: parent.client.id,
        kind: 'shared-worker' as const,
        state: 'preparing' as const,
        url: url.href,
      });
      await contexts.bind(event.resultingClientId, identity);
      const code = await options.bootstrap();
      if (!code) return Response.error();
      const resources = new URL(`__contexts/${id}/resources/`, entry);
      const metadata: WorkerBootstrapMetadata = internalRecord({
        identity,
        runtime: base.href,
        applicationURL: entry.href,
        module: bootstrap[1] === 'module',
        ...workerResourceAliases(parent.app, resources, base),
      });
      return response(
        `"use strict";\nglobalThis.__privacyContext=${JSON.stringify(metadata)};\n${await code.text()}`,
        'text/javascript',
        200,
        internalRecord({
          workerSource: new URL('__contexts/', entry).href,
          controllerSource: new URL('sw.js', base).href,
        }),
      );
    }
    if (
      request.method !== 'POST' ||
      request.destination !== '' ||
      event.resultingClientId
    )
      return Response.error();
    try {
      const body: unknown = await readDocumentRequest(request);
      if (connection) {
        const bound = await contexts.resolveWorker(event.clientId);
        if (!bound || bound.kind !== 'shared-worker' || bound.id !== connection[1])
          return Response.error();
        const app = await options.installation(bound.application);
        if (
          !app ||
          app.generation !== bound.installationGeneration ||
          url.href !==
            new URL(`__contexts/${bound.id}/shared-connect`, applicationURL(app, base))
              .href
        )
          return Response.error();
        const grant = await store.consume(
          string(field(body, 'ticket')),
          string(field(body, 'key')),
          actor(app, event.clientId),
        );
        return grant ? json(grant) : Response.error();
      }
      return Response.error();
    } catch (error) {
      return json(
        internalRecord({
          error: error instanceof Error ? error.message : 'Shared worker refused',
        }),
        400,
      );
    }
  }
  return internalRecord({ request, respond });
}
