import { strings, internalRecord } from '../../shared/primordials.ts';
import { sharedWorkerKey, type SharedWorkerTicket } from '../../shared/shared-worker.ts';
import { applicationURL, resourceURL } from '../../shared/runtime-url.ts';
import { isExecutableScriptType, mime } from '../../shared/policy.ts';
import { response } from '../response-policy.ts';
import { getApp, type StoredInstallation } from '../storage.ts';
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
  contexts: ContextRegistry;
  store: SharedConnectionStore;
  client(id: string): Promise<Client | undefined>;
  application(client: Client): Promise<string | null>;
  bootstrap(): Promise<Response | undefined>;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid shared worker request');
  return value as Record<string, unknown>;
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
    const app = application ? await getApp(application) : undefined;
    return app ? internalRecord({ app, client }) : undefined;
  }
  function actor(app: StoredInstallation, client: string) {
    return internalRecord({
      application: app.id,
      installationGeneration: app.generation,
      client,
    });
  }
  return async function sharedResponse(event: FetchEvent): Promise<Response | undefined> {
    const request = event.request;
    const url = new URL(request.url);
    if (url.origin !== base.origin) return;
    const bootstrap = strings.match(url.pathname, bootstrapPath);
    const connection = strings.match(url.pathname, connectionPath);
    const operation = strings.match(
      url.pathname,
      /\/__contexts\/shared\/(connect|disconnect)$/,
    );
    if (!bootstrap && !connection && !operation) return;
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
      const body = object(await readDocumentRequest(request));
      if (connection) {
        const bound = await contexts.resolveWorker(event.clientId);
        if (!bound || bound.kind !== 'shared-worker' || bound.id !== connection[1])
          return Response.error();
        const app = await getApp(bound.application);
        if (
          !app ||
          app.generation !== bound.installationGeneration ||
          url.href !==
            new URL(`__contexts/${bound.id}/shared-connect`, applicationURL(app, base))
              .href
        )
          return Response.error();
        const grant = await store.consume(
          string(body.ticket),
          string(body.key),
          actor(app, event.clientId),
        );
        return grant ? json(grant) : Response.error();
      }
      const parent = await owner(event.clientId);
      if (
        !parent ||
        !operation ||
        url.href !==
          new URL(`__contexts/shared/${operation[1]}`, applicationURL(parent.app, base))
            .href
      )
        return Response.error();
      if (operation[1] === 'disconnect') {
        const closed = await store.disconnect(
          string(body.ticket),
          actor(parent.app, parent.client.id),
        );
        return json(internalRecord({ closed }), closed ? 200 : 403);
      }
      const source = new URL(string(body.source));
      if (source.username || source.password) return Response.error();
      if (body.type !== 'classic' && body.type !== 'module') return Response.error();
      const hash = source.hash;
      source.hash = '';
      if (source.protocol === 'blob:') {
        if (source.origin !== base.origin) return Response.error();
      } else {
        const resource = parent.app.resources.find(
          (resource) =>
            resource.url === source.href ||
            resourceURL(parent.app, resource.path, base).href === source.href,
        );
        if (
          !resource ||
          !isExecutableScriptType(
            strings.trim(
              strings.split(resource.contentType || mime(resource.path), ';')[0],
            ),
          )
        )
          return Response.error();
        source.href = resource.url;
      }
      source.hash = hash;
      const key = sharedWorkerKey(
        actor(parent.app, parent.client.id),
        internalRecord({
          source: source.href,
          type: body.type,
          name: string(body.name),
        }),
      );
      const ticket: SharedWorkerTicket = internalRecord({
        ticket: await store.issue(actor(parent.app, parent.client.id), key),
        key,
        application: parent.app.id,
        installationGeneration: parent.app.generation,
        bootstrapURL: new URL(
          `__contexts/shared/${body.type}.js`,
          applicationURL(parent.app, base),
        ).href,
      });
      return json(ticket);
    } catch (error) {
      return json(
        internalRecord({
          error: error instanceof Error ? error.message : 'Shared worker refused',
        }),
        400,
      );
    }
  };
}
