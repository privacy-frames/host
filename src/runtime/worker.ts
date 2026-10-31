import { webManifest, manifestURL } from './pwa.ts';
import { getApp, listApps, putApp, deleteApp, getResource } from './storage.ts';
import { mime } from '../shared/policy.ts';
import {
  applicationURL,
  applicationIdentity,
  resourceURL,
  publicAlias,
} from '../shared/runtime-url.ts';
import type { RuntimeEvent } from '../shared/types.ts';
import { isApplicationRoute } from '../shared/application-navigation.ts';
import { response } from './response-policy.ts';
import { css } from './document.ts';
import { readInstalledContent } from './content-broker.ts';
import { INSTALLED_CONTENT_REQUEST } from '../shared/types.ts';
import { admitInstallation } from './admission.ts';
import { CONTEXT_POLICY_VERSION, ContextRegistry } from './contexts/model.ts';
import type { WorkerBootstrapMetadata } from './contexts/model.ts';
import { workerResourceAliases } from './contexts/worker-aliases.ts';
import { controllerContextStorage } from './contexts/controller-store.ts';
import { contextResourceResponse } from './contexts/resources.ts';
import { createDocumentController } from './contexts/document-controller.ts';
import { DocumentIntentStore } from './contexts/document-intents.ts';
import { createSharedController } from './contexts/shared-controller.ts';
import { SharedConnectionStore } from './contexts/shared-connections.ts';
import { createWorkletController } from './contexts/worklet-controller.ts';
import { createPublisherController } from './publisher/controller.ts';
const worker = self as unknown as ServiceWorkerGlobalScope;
const BASE = new URL('./', worker.location.href);
const contexts = new ContextRegistry(controllerContextStorage(BASE));
const trustedFiles = [
  'index.html',
  'host.css',
  'config.json',
  'report.html',
  'pwa-192.png',
  'pwa-512.png',
  'guard.js',
  'worker-guard.js',
  'document-guard.js',
  'shared-worker-guard.js',
  'worklet-guard.js',
  'publisher-worker-guard.js',
  'connect.html',
  'connect.js',
];
function isManagerURL(input: string | undefined) {
  if (!input) return false;
  try {
    const u = new URL(input);
    return (
      u.origin === BASE.origin &&
      !u.search &&
      [BASE.pathname + 'connect.html'].includes(u.pathname)
    );
  } catch {
    return false;
  }
}
const BOOT = 'pf-trusted-bootstrap-' + __BUILD_ID__;
const documents = createDocumentController({
  base: BASE,
  contexts,
  intents: new DocumentIntentStore(),
  client: (id) => worker.clients.get(id),
  application: runtimeIdentity,
  bootstrap: async () =>
    (await caches.open(BOOT)).match(new URL('document-guard.js', BASE).href),
});
const sharedWorkers = createSharedController({
  base: BASE,
  contexts,
  store: new SharedConnectionStore(),
  client: (id) => worker.clients.get(id),
  application: runtimeIdentity,
  bootstrap: async () =>
    (await caches.open(BOOT)).match(new URL('shared-worker-guard.js', BASE).href),
});
const worklets = createWorkletController({
  base: BASE,
  owner: async (id) => {
    const client = id ? await worker.clients.get(id) : undefined;
    if (!client || client.type !== 'window') return;
    const application = await runtimeIdentity(client);
    const app = application ? await getApp(application) : undefined;
    const identity = await contexts.resolve(client);
    if (
      !app ||
      identity?.kind !== 'window' ||
      identity.installationGeneration !== app.generation
    )
      return;
    return { app, clientId: client.id };
  },
  readResource: (app, path, generation) => getResource(app.id, path, generation),
  guardSource: async () => {
    const cached = await (
      await caches.open(BOOT)
    ).match(new URL('worklet-guard.js', BASE).href);
    if (!cached) throw new Error('Trusted worklet guard unavailable');
    return cached.text();
  },
});
const publishers = createPublisherController({
  base: BASE,
  contexts,
  client: (id) => worker.clients.get(id),
  application: runtimeIdentity,
  windows: () => worker.clients.matchAll({ type: 'window' }),
  bootstrap: async () =>
    (await caches.open(BOOT)).match(new URL('publisher-worker-guard.js', BASE).href),
  resource: async (app, path) => {
    const item = app.resources.find((resource) => resource.path === path);
    return item
      ? response(
          await getResource(app.id, path, app.generation),
          item.contentType || mime(path),
        )
      : undefined;
  },
});
// Management roles are issued only to trusted document loads, then bound to the
// browser client ID. Changing a URL or supplying a claimed role is insufficient.
const ROLES = 'pf-management-clients-v1';
const roleURL = (id: string) =>
  new URL('__host-client/' + encodeURIComponent(id), BASE).href;
async function grantManagement(id: string) {
  if (id) await (await caches.open(ROLES)).put(roleURL(id), new Response('manager'));
}
async function hasManagement(id: string | undefined) {
  return !!id && !!(await (await caches.open(ROLES)).match(roleURL(id)));
}
const events: RuntimeEvent[] = [];
function record(kind: string, url: string, method: string) {
  events.push({ kind, url, method, time: new Date().toISOString() });
  if (events.length > 300) events.shift();
}
worker.addEventListener('install', (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(BOOT);
      await cache.addAll(trustedFiles.map((p) => new URL(p, BASE).href));
      await worker.skipWaiting();
    })(),
  ),
);
worker.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      await worker.clients.claim();
    })(),
  ),
);
async function identityFromURL(url: string | undefined): Promise<string | null> {
  if (!url) return null;
  const key = applicationIdentity(url, BASE);
  if (!key) return null;
  const matches = (await listApps()).filter((app) => publicAlias(app.id) === key);
  return matches.length === 1 ? matches[0].id : null;
}
async function runtimeIdentity(
  client: Pick<Client, 'id' | 'url' | 'type'> | undefined | null,
): Promise<string | null> {
  if (!client) return null;
  const bound = await contexts.resolve(client);
  if (bound) {
    const app = await getApp(bound.application);
    return app?.generation === bound.installationGeneration ? bound.application : null;
  }
  return null;
}
let managementQueue = Promise.resolve();
worker.addEventListener('message', (event) => {
  const packet: unknown = event.data;
  if (
    packet &&
    typeof packet === 'object' &&
    'type' in packet &&
    packet.type === INSTALLED_CONTENT_REQUEST
  ) {
    const port = event.ports[0];
    if (!port) return;
    event.waitUntil(
      (async () => {
        try {
          const client =
            event.source && 'id' in event.source
              ? await worker.clients.get(event.source.id)
              : undefined;
          const value = await readInstalledContent(client, contexts, BASE);
          port.postMessage({ ok: true, value });
        } catch (error) {
          port.postMessage({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          port.close();
        }
      })(),
    );
    return;
  }
  if (publishers.handlesMessage(event.data)) {
    event.waitUntil(publishers.message(event));
    return;
  }
  const port = event.ports[0];
  if (!port) return;
  const operation = managementQueue.then(async () => {
    try {
      const client =
        event.source && 'id' in event.source
          ? await worker.clients.get(event.source.id)
          : undefined;
      if (!client || !isManagerURL(client.url) || !(await hasManagement(client.id)))
        throw new Error('Management client not authorized');
      const message: unknown = event.data;
      if (!message || typeof message !== 'object' || !('operation' in message))
        throw new Error('Invalid manager message');
      const operation = message.operation;
      const payload = 'payload' in message ? message.payload : undefined;
      let value;
      if (operation === 'install') {
        const app = await admitInstallation(payload, BASE);
        const windows = await worker.clients.matchAll({ type: 'window' });
        if ((await Promise.all(windows.map((c) => runtimeIdentity(c)))).includes(app.id))
          throw new Error('Close application windows before replacing an installation');
        app.installedAt = new Date().toISOString();
        await putApp(app);
        value = { id: app.id };
      } else if (operation === 'list')
        value = (await listApps()).map((a) => ({
          id: a.id,
          manifest: a.manifest,
          source: a.source,
          installedAt: a.installedAt,
          size: a.size,
        }));
      else if (operation === 'remove') {
        if (typeof payload !== 'string') throw new Error('Invalid installation identity');
        const windows = await worker.clients.matchAll({ type: 'window' });
        if ((await Promise.all(windows.map((c) => runtimeIdentity(c)))).includes(payload))
          throw new Error('Close application windows before uninstalling');
        await deleteApp(payload);
        value = true;
      } else if (operation === 'events') value = events;
      else throw new Error('Unknown operation');
      port.postMessage({ ok: true, value });
    } catch (e) {
      port.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
  managementQueue = operation.catch(() => {});
  event.waitUntil(operation);
});
worker.addEventListener('fetch', (event) => {
  event.respondWith(
    (async () => {
      const req = event.request;
      const url = new URL(req.url);
      const documentResponse = await documents(event);
      if (documentResponse) return documentResponse;
      const sharedResponse = await sharedWorkers(event);
      if (sharedResponse) return sharedResponse;
      const workletResponse = await worklets.respond(event);
      if (workletResponse) return workletResponse;
      const publisherResponse = await publishers.respond(event);
      if (publisherResponse) return publisherResponse;
      if (
        (req.destination === 'iframe' || req.destination === 'frame') &&
        !isManagerURL(url.href)
      ) {
        record('blocked-document-startup', req.url, req.method);
        return Response.error();
      }
      const contextResource = await contextResourceResponse(
        event,
        contexts,
        BASE,
        undefined,
        (diagnostic) =>
          record(
            'blocked-context-resource:' + JSON.stringify(diagnostic),
            req.url,
            req.method,
          ),
      );
      if (contextResource) return contextResource;
      const boundWorker = event.clientId
          ? await contexts.resolveWorker(event.clientId)
          : undefined,
        client = boundWorker
          ? { id: event.clientId, url: boundWorker.url, type: 'worker' as const }
          : event.clientId
            ? await worker.clients.get(event.clientId)
            : null;
      // Fragments are application-local routing state, including on reload. They do
      // not select a different installed document or authorize a resource request.
      url.hash = '';
      // New execution contexts may start only at the controller's bootstrap route.
      // Their actual creator and reserved client are checked before serving code.
      if (
        [
          'worker',
          'sharedworker',
          'audioworklet',
          'paintworklet',
          'serviceworker',
        ].includes(req.destination)
      ) {
        const parentApplication = await runtimeIdentity(client);
        const parentApp = parentApplication ? await getApp(parentApplication) : null;
        const candidate = parentApp
          ? new URL('__contexts/', applicationURL(parentApp, BASE))
          : null;
        const suffix =
          candidate &&
          url.origin === candidate.origin &&
          url.pathname.startsWith(candidate.pathname)
            ? url.pathname.slice(candidate.pathname.length)
            : '';
        if (
          req.destination !== 'worker' ||
          req.method !== 'GET' ||
          url.search ||
          !/^[a-f0-9-]{36}\/(?:classic|module)\.js$/.test(suffix)
        ) {
          record('blocked-context-startup', req.url, req.method);
          return Response.error();
        }
      }
      // Browsers may fetch manifests/icons without an application client. These
      // fixed routes expose only public installation metadata and captured icons.
      const publicPath =
        url.origin === BASE.origin && url.pathname.startsWith(BASE.pathname)
          ? url.pathname.slice(BASE.pathname.length)
          : '';
      const publicRoute = publicPath.match(
        /^([A-Za-z0-9_-]{11})\/(__manifest\.webmanifest|__icon\/(\d+))$/,
      );
      if (publicRoute && req.method === 'GET' && !url.search && req.mode !== 'navigate') {
        const apps = (await listApps()).filter(
          (app) => publicAlias(app.id) === publicRoute[1],
        );
        if (apps.length === 1) {
          const app = apps[0];
          if (publicRoute[2] === '__manifest.webmanifest')
            return response(
              JSON.stringify(webManifest(app, BASE)),
              'application/manifest+json',
            );
          const resource = app.resources[Number(publicRoute[3])];
          const admitted = webManifest(app, BASE).icons.some(
            (icon) => new URL(icon.src, BASE).href === url.href,
          );
          if (admitted && resource)
            return response(
              await getResource(app.id, resource.path, app.generation),
              resource.contentType,
            );
        }
        return Response.error();
      }
      if (
        req.method === 'GET' &&
        !url.search &&
        ['pwa-192.png', 'pwa-512.png'].some(
          (path) => url.href === new URL(path, BASE).href,
        ) &&
        req.mode !== 'navigate'
      )
        return (await (await caches.open(BOOT)).match(url.href)) || Response.error();
      const id =
        (await runtimeIdentity(client)) ||
        (req.mode === 'navigate' ? await identityFromURL(url.href) : null);
      const isTrusted =
        url.origin === BASE.origin &&
        trustedFiles.some((p) => url.href === new URL(p, BASE).href);
      const manager = isManagerURL(client?.url) && (await hasManagement(client?.id));
      const readOnlyHost =
        client?.url === new URL('report.html', BASE).href ||
        [BASE.href, new URL('index.html', BASE).href].includes(client?.url || '');
      const managerNavigation = req.mode === 'navigate' && isManagerURL(url.href);
      const hostDocument =
        req.mode === 'navigate' &&
        (url.href === new URL('report.html', BASE).href ||
          [BASE.href, new URL('index.html', BASE).href].includes(url.href));
      if (!id && managerNavigation) await grantManagement(event.resultingClientId);
      if (
        req.method === 'GET' &&
        url.href === BASE.href &&
        !id &&
        (managerNavigation || manager || hostDocument)
      ) {
        return (
          (await (await caches.open(BOOT)).match(new URL('index.html', BASE).href)) ||
          Response.error()
        );
      }
      if (
        isTrusted &&
        req.method === 'GET' &&
        ((!id && (manager || readOnlyHost || managerNavigation || hostDocument)) ||
          (url.href === new URL('guard.js', BASE).href && id))
      ) {
        const cached = await (await caches.open(BOOT)).match(url.href);
        return cached || Response.error();
      }
      if (!id) {
        record(
          'blocked-unmanaged:' +
            JSON.stringify({
              clientId: event.clientId,
              resultingClientId: event.resultingClientId,
              destination: req.destination,
              clientURL: client?.url,
              bound: boundWorker?.id,
            }),
          req.url,
          req.method,
        );
        return Response.error();
      }
      const app = await getApp(id);
      if (!app) return response('<h1>Application not installed</h1>', 'text/html', 404);
      const entry = applicationURL(app, BASE);
      const contextPrefix = new URL('__contexts/', entry).pathname;
      if (url.origin === BASE.origin && url.pathname.startsWith(contextPrefix)) {
        const child = url.pathname
          .slice(contextPrefix.length)
          .match(/^([a-f0-9-]{36})\/(classic|module)\.js$/);
        if (
          child &&
          req.method === 'GET' &&
          !url.search &&
          req.destination === 'worker' &&
          client &&
          event.resultingClientId
        ) {
          const identity = {
            policyVersion: CONTEXT_POLICY_VERSION,
            id: child[1],
            application: app.id,
            installationGeneration: app.generation,
            parent: client.id,
            kind: 'dedicated-worker' as const,
            state: 'preparing' as const,
            url: url.href,
          };
          await contexts.bind(event.resultingClientId, identity);
          const bootstrap = await (
            await caches.open(BOOT)
          ).match(new URL('worker-guard.js', BASE).href);
          if (!bootstrap) return Response.error();
          const metadata: WorkerBootstrapMetadata = {
            identity,
            runtime: BASE.href,
            applicationURL: entry.href,
            ...workerResourceAliases(
              app,
              new URL('resources/', new URL('./', identity.url)),
              BASE,
            ),
          };
          return response(
            `"use strict";\nglobalThis.__privacyContext=${JSON.stringify(metadata)};\n${await bootstrap.text()}`,
            'text/javascript',
            200,
            {
              workerSource: new URL('__contexts/', entry).href,
              controllerSource: new URL('sw.js', BASE).href,
            },
          );
        }
        const closing = url.pathname
          .slice(contextPrefix.length)
          .match(/^([a-f0-9-]{36})\/close$/);
        if (
          closing &&
          req.method === 'POST' &&
          req.mode !== 'navigate' &&
          req.destination === '' &&
          !url.search &&
          client &&
          (await runtimeIdentity(client)) === app.id
        ) {
          const closed = await contexts.closeChild(client.id, app.id, closing[1]);
          return response('', 'text/plain', closed ? 200 : 404);
        }
        return Response.error();
      }
      if (req.mode === 'navigate') {
        // Any attempt to use a different document is refused. Bootstrap contains no untrusted markup.
        if (req.method === 'GET' && url.origin === entry.origin && !url.search) {
          const parts = url.pathname.slice(BASE.pathname.length).split('/');
          if (
            parts[0] === publicAlias(app.id) &&
            (parts.length <= 2 ||
              (parts.length === 3 && parts[2] === '') ||
              (parts.length === 3 && parts[2] === app.manifest.entry)) &&
            url.href !== entry.href
          )
            return new Response(null, { status: 302, headers: { Location: entry.href } });
        }
        if (!isApplicationRoute(url.href, entry.href) || req.method !== 'GET') {
          record('blocked-navigation', req.url, req.method);
          return Response.error();
        }
        if (req.destination !== 'document' || !event.resultingClientId)
          return Response.error();
        await contexts.bind(event.resultingClientId, {
          policyVersion: CONTEXT_POLICY_VERSION,
          installationGeneration: app.generation,
          id: crypto.randomUUID(),
          application: app.id,
          parent: null,
          kind: 'window',
          state: 'preparing',
          url: entry.href,
        });
        const script = new URL('guard.js', BASE).href;
        const nonce = crypto.randomUUID().replaceAll('-', '');
        return response(
          `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${app.manifest.name.replace(/[&<>"]/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }) as Record<string, string>)[c] || c)}</title><link rel="manifest" href="${manifestURL(app, BASE).href}"></head><body><script src="${script}" nonce="${nonce}" data-installation="${app.id}" data-application-url="${entry.href}"></script></body></html>`,
          'text/html',
          200,
          {
            scriptNonce: nonce,
            popups: true,
            workerSource: new URL('__contexts/', entry).href,
            frameSource: new URL('__contexts/', entry).href,
            controllerSource: new URL('sw.js', BASE).href,
          },
        );
      }
      if (req.method === 'GET') {
        const original =
          url.origin === BASE.origin
            ? new URL(url.pathname + url.search, new URL(app.source).origin).href
            : null;
        const resource = app.resources.find(
          (r) =>
            resourceURL(app, r.path, BASE).href === url.href ||
            r.url === url.href ||
            (original && r.url === original),
        );
        if (resource) {
          record('installed', req.url, req.method);
          const baseResponse = response(
            await getResource(app.id, resource.path, app.generation),
            resource.contentType || mime(resource.path),
          );
          const result = await publishers.intercept(event, app, resource, baseResponse);
          if (
            result.ok &&
            result.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ===
              'text/css'
          ) {
            const rewritten = response(
              css(app, await result.text(), resource.url, BASE),
              'text/css',
              result.status,
            );
            for (const name of [
              'content-language',
              'cache-control',
              'expires',
              'last-modified',
              'etag',
              'vary',
            ]) {
              const value = result.headers.get(name);
              if (value !== null) rewritten.headers.set(name, value);
            }
            return rewritten;
          }
          return result;
        }
      }
      record('blocked', req.url, req.method);
      return Response.error();
    })().catch((error) => {
      console.error(error);
      return Response.error();
    }),
  );
});
