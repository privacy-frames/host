import { strings, internalRecord } from '../../shared/primordials.ts';
import { parseDocumentSurface } from './document-surface.ts';
import { applicationURL } from '../../shared/runtime-url.ts';
import { response } from '../response-policy.ts';
import { getApp, getResource } from '../storage.ts';
import type { StoredInstallation } from '../storage.ts';
import { CONTEXT_POLICY_VERSION, ContextRegistry } from './model.ts';
import { DocumentIntentStore } from './document-intents.ts';
import type { DocumentIntentMetadata } from './document-intents.ts';
import type { DocumentBootstrapConfiguration } from './document-protocol.ts';
import { documentRequestInput, parseDocumentRequest } from './document-request.ts';
interface DocumentControllerOptions {
  base: URL;
  contexts: ContextRegistry;
  intents: DocumentIntentStore;
  client(id: string): Promise<Client | undefined>;
  application(client: Client): Promise<string | null>;
  bootstrap(): Promise<Response | undefined>;
}
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const routePattern = new RegExp(`/__contexts/(${UUID})/(document\\.(?:html|svg))$`);
function bootstrapURL(
  app: StoredInstallation,
  intent: DocumentIntentMetadata,
  base: URL,
): URL {
  return new URL(
    `__contexts/${intent.id}/document.${intent.kind}`,
    applicationURL(app, base),
  );
}
/** Only native browser identities select the owner of registration and payloads. */
export function createDocumentController(options: DocumentControllerOptions) {
  const { base, contexts, intents } = options;
  async function owner(clientId: string): Promise<
    | {
        client: Client;
        app: StoredInstallation;
      }
    | undefined
  > {
    if (!clientId) return;
    const client = await options.client(clientId);
    if (!client || client.type !== 'window') return;
    const application = await options.application(client);
    const app = application ? await getApp(application) : undefined;
    return app?.generation ? internalRecord({ client, app }) : undefined;
  }
  async function parentStillOwns(intent: DocumentIntentMetadata): Promise<boolean> {
    const parent = await owner(intent.parentClient);
    return (
      parent?.app.id === intent.application &&
      parent.app.generation === intent.installationGeneration
    );
  }
  async function documentContextResponse(
    event: FetchEvent,
  ): Promise<Response | undefined> {
    const request = event.request;
    const url = new URL(request.url);
    url.hash = '';
    if (url.origin !== base.origin) return;
    // Trusted code is public, but this entry point serves only a reserved child.
    // Avoid clients.get while its first parser-blocking script is still loading.
    if (url.pathname === new URL('document-guard.js', base).pathname) {
      const id = url.searchParams.get('context');
      if (
        request.method !== 'GET' ||
        request.destination !== 'script' ||
        request.mode === 'navigate' ||
        !id ||
        url.search !== '?context=' + id ||
        !new RegExp('^' + UUID + '$').test(id)
      )
        return Response.error();
      const intent = await intents.inspect(id);
      if (!intent || intent.state !== 'bound' || intent.childClient !== event.clientId)
        return Response.error();
      const app = await getApp(intent.application);
      const bound =
        app &&
        (await contexts.resolve(
          internalRecord({
            id: event.clientId,
            url: bootstrapURL(app, intent, base).href,
          }),
        ));
      if (!app || app.generation !== intent.installationGeneration || bound?.id !== id)
        return Response.error();
      return (await options.bootstrap()) || Response.error();
    }
    const match = strings.match(url.pathname, routePattern);
    if (!match) return;
    const intent = await intents.inspect(match[1]);
    if (!intent) return Response.error();
    const app = await getApp(intent.application);
    if (!app || app.generation !== intent.installationGeneration) return Response.error();
    const target = bootstrapURL(app, intent, base);
    const expected = new URL(match[2], target);
    if (url.href !== expected.href || url.search) return Response.error();
    if (strings.startsWith(match[2], 'document.')) {
      if (
        request.method !== 'GET' ||
        request.mode !== 'navigate' ||
        request.destination !== (intent.carrier === 'popup' ? 'document' : 'iframe') ||
        !event.resultingClientId ||
        match[2] !== 'document.' + intent.kind ||
        !(await parentStillOwns(intent))
      )
        return Response.error();
      const bound = await intents.bind(
        internalRecord({ id: intent.id, nonce: intent.nonce }),
        event.resultingClientId,
        app.generation,
      );
      if (!bound) return Response.error();
      try {
        await contexts.bind(
          event.resultingClientId,
          internalRecord({
            policyVersion: CONTEXT_POLICY_VERSION,
            id: intent.id,
            application: app.id,
            installationGeneration: app.generation,
            parent: intent.parentClient,
            kind: 'window',
            state: 'preparing',
            url: target.href,
          }),
        );
      } catch (error) {
        await intents.close(intent.id, intent, intent.parentToken);
        throw error;
      }
      const source = new URL('document-guard.js', base);
      source.search = '?context=' + intent.id;
      const script = `<script ${intent.kind === 'svg' ? 'href' : 'src'}="${source.href}" nonce="${intent.nonce}" data-privacy-context="${intent.id}"></script>`;
      const shell =
        intent.kind === 'svg'
          ? `<svg xmlns="http://www.w3.org/2000/svg">${script}</svg>`
          : `<!doctype html><html><head><meta charset="utf-8">${script}</head><body></body></html>`;
      const directory = new URL('__contexts/', applicationURL(app, base)).href;
      return response(
        shell,
        intent.kind === 'svg' ? 'image/svg+xml' : 'text/html',
        200,
        internalRecord({
          scriptNonce: intent.nonce,
          popups: true,
          workerSource: directory,
          frameSource: directory,
          controllerSource: new URL('sw.js', base).href,
          embedded: intent.carrier === 'frame',
        }),
      );
    }
    return Response.error();
  }
  async function request(
    clientId: string,
    operation: unknown,
    payload: unknown,
  ): Promise<unknown> {
    const actual = await owner(clientId);
    const identity = actual && (await contexts.resolve(actual.client));
    if (
      !actual ||
      identity?.kind !== 'window' ||
      identity.application !== actual.app.id ||
      identity.installationGeneration !== actual.app.generation
    )
      throw new Error('Document client not authorized');
    const current = async () => {
      if (
        !(await contexts.isCurrent(actual.client, identity)) ||
        (await getApp(actual.app.id))?.generation !== actual.app.generation
      )
        throw new Error('Document authority changed');
    };
    const body = parseDocumentRequest(payload);
    if (operation === 'create') {
      const surface = parseDocumentSurface(body, true);
      const input = await documentRequestInput(
        body,
        actual.app,
        base,
        internalRecord({ getResource }),
      );
      await current();
      const intent = await intents.issue(
        internalRecord({
          application: actual.app.id,
          installationGeneration: actual.app.generation,
          parentClient: actual.client.id,
        }),
        input,
        surface,
      );
      try {
        await current();
      } catch (error) {
        await intents.close(intent.id, intent, intent.parentToken);
        throw error;
      }
      return internalRecord({
        id: intent.id,
        nonce: intent.nonce,
        parentToken: intent.parentToken,
        kind: intent.kind,
        carrier: intent.carrier,
        ...(intent.popup ? internalRecord({ popup: intent.popup }) : internalRecord({})),
        url: bootstrapURL(actual.app, intent, base).href,
      });
    }
    if (
      !body ||
      typeof body !== 'object' ||
      !('id' in body) ||
      typeof body.id !== 'string' ||
      !new RegExp('^' + UUID + '$').test(body.id)
    )
      throw new Error('Invalid document identifier');
    const intent = await intents.inspect(body.id);
    const app = actual.app;
    if (
      !intent ||
      intent.application !== app.id ||
      intent.installationGeneration !== app.generation
    )
      throw new Error('Document unavailable');
    if (operation === 'close') {
      if (!('parentToken' in body) || typeof body.parentToken !== 'string')
        throw new Error('Document parent token required');
      const closed = await intents.close(
        intent.id,
        internalRecord({
          application: app.id,
          installationGeneration: app.generation,
          parentClient: actual.client.id,
        }),
        body.parentToken,
      );
      if (closed) await contexts.closeChild(actual.client.id, app.id, intent.id);
      return internalRecord({ closed });
    }
    if (identity.id !== intent.id || intent.childClient !== actual.client.id)
      throw new Error('Document child not authorized');
    const key = internalRecord({ id: intent.id, nonce: intent.nonce });
    if (operation === 'configuration') {
      const content = await intents.read(key, actual.client.id, app.generation);
      if (!content) throw new Error('Document configuration unavailable');
      await current();
      const configuration: DocumentBootstrapConfiguration = internalRecord({
        id: intent.id,
        nonce: intent.nonce,
        parentToken: intent.parentToken,
        policyVersion: CONTEXT_POLICY_VERSION,
        kind: intent.kind,
        carrier: intent.carrier,
        ...(intent.popup ? internalRecord({ popup: intent.popup }) : internalRecord({})),
        url: bootstrapURL(app, intent, base).href,
        application: app.id,
        installationGeneration: app.generation,
        applicationURL: applicationURL(app, base).href,
        runtimeURL: base.href,
        content: internalRecord({
          installationGeneration: app.generation,
          aliases: content.input.aliases.map(([source, mapped]) => [source, mapped]),
          source: app.source,
          documentBase: content.input.baseURL || content.input.sourceURL,
        }),
      });
      return configuration;
    }
    if (operation !== 'content') throw new Error('Unknown document operation');
    const content = await intents.consume(key, actual.client.id, app.generation);
    if (!content) throw new Error('Document content unavailable');
    await current();
    return content.input;
  }
  return internalRecord({ respond: documentContextResponse, request });
}
