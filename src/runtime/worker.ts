import { getApp, listApps, putApp, deleteApp, getResource } from './storage.ts';
import { admitInstallation } from './admission.ts';
import {
  applicationIdentity,
  applicationURL,
  publicAlias,
} from '../shared/runtime-url.ts';
import { createGuestCatalog, GUEST_BOOTSTRAP_REQUEST } from '../guest/catalog.ts';
import { manifestURL, webManifest } from './pwa.ts';
import type { RuntimeEvent } from '../shared/types.ts';
import { rewriteGuestCSS } from '../guest/css.ts';

const worker = self as unknown as ServiceWorkerGlobalScope;
const base = new URL('./', worker.location.href);
const boot = 'pf-guest-bootstrap-' + __BUILD_ID__;
const trusted = [
  'index.html',
  'connect.html',
  'connect.js',
  'guard.js',
  '__guest_worker_registry__.js',
  'guest-worker.js',
  'guest-shared-worker.js',
  'guest-worklet.js',
  'engine.wasm',
  'host.css',
  'config.json',
  'report.html',
  'pwa-192.png',
  'pwa-512.png',
];
const events: RuntimeEvent[] = [];
const record = (kind: string, url: string, method = 'GET') => {
  events.push({ kind, url, method, time: new Date().toISOString() });
  if (events.length > 500) events.shift();
};
const controlURL = new URL('connect.html', base).href;

function headers(type: string, nonce?: string, document = false): HeadersInit {
  return {
    'Content-Type': type,
    'Content-Security-Policy': [
      "default-src 'none'",
      `script-src ${nonce ? "'nonce-" + nonce + "' " : ''}'wasm-unsafe-eval' blob:`,
      "connect-src 'none'",
      "style-src 'unsafe-inline' data: blob:",
      'img-src data: blob:',
      'font-src data: blob:',
      'media-src data: blob:',
      `worker-src blob: ${new URL('__guest_worker_registry__.js', base).href} ${new URL('sw.js', base).href}`,
      'frame-src about:',
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      ...(document
        ? [
            "frame-ancestors 'self'",
            'sandbox allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals',
          ]
        : []),
    ].join('; '),
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'X-DNS-Prefetch-Control': 'off',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Permissions-Policy':
      'camera=(), microphone=(self), geolocation=(), usb=(), serial=(), hid=(), bluetooth=(), payment=(), attribution-reporting=(), browsing-topics=(), identity-credentials-get=()',
    'Connection-Allowlist': '(response-origin); redirects=block; webrtc=block',
  };
}

async function installation(input: string | undefined) {
  if (!input) return;
  const alias = applicationIdentity(input, base);
  if (!alias) return;
  return (await listApps()).find((app) => publicAlias(app.id) === alias);
}

worker.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(boot);
      await cache.addAll(trusted.map((path) => new URL(path, base).href));
    })(),
  );
});
worker.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (worker.registration.navigationPreload)
        await worker.registration.navigationPreload.disable();
      await worker.clients.claim();
      for (const name of await caches.keys())
        if (name.startsWith('pf-guest-bootstrap-') && name !== boot)
          await caches.delete(name);
    })(),
  );
});

let managementQueue = Promise.resolve();
worker.addEventListener('message', (event) => {
  const port = event.ports[0];
  if (!port || !event.source || !('id' in event.source)) return;
  const sourceID = event.source.id;
  const operation = async () => {
    try {
      const client = await worker.clients.get(sourceID);
      if (!client) throw new Error('Browser client is unavailable');
      const message: unknown = event.data;
      if (!message || typeof message !== 'object')
        throw new Error('Invalid host request');
      if ('type' in message && message.type === GUEST_BOOTSTRAP_REQUEST) {
        const app = await installation(client.url);
        if (!app || client.type !== 'window')
          throw new Error('Application client required');
        const engine = await (
          await caches.open(boot)
        ).match(new URL('engine.wasm', base).href);
        if (!engine?.ok) throw new Error('Guest engine is unavailable');
        const bootstrapBytes = async (path: string) => {
          const response = await (
            await caches.open(boot)
          ).match(new URL(path, base).href);
          if (!response?.ok) throw new Error('Worker bootstrap is unavailable');
          return response.arrayBuffer();
        };
        const value = await createGuestCatalog(app, base, await engine.arrayBuffer(), {
          dedicated: await bootstrapBytes('guest-worker.js'),
          shared: await bootstrapBytes('guest-shared-worker.js'),
          worklet: await bootstrapBytes('guest-worklet.js'),
        });
        const current = await getApp(app.id);
        if (current?.generation !== app.generation)
          throw new Error('Installation changed');
        port.postMessage({ ok: true, value }, [
          value.engineWasm,
          value.workerBootstrap.dedicated,
          value.workerBootstrap.shared,
          value.workerBootstrap.worklet,
          ...value.resources.map((item) => item.bytes),
        ]);
        return;
      }
      if (client.url !== controlURL || client.type !== 'window')
        throw new Error('Trusted manager bridge required');
      if (!('operation' in message)) throw new Error('Management operation required');
      const payload = 'payload' in message ? message.payload : undefined;
      let value: unknown;
      if (message.operation === 'install') {
        const app = await admitInstallation(payload, base);
        const clients = await worker.clients.matchAll({ type: 'window' });
        if (
          clients.some(
            (candidate) =>
              applicationIdentity(candidate.url, base) === publicAlias(app.id),
          )
        )
          throw new Error('Close application windows before replacing an installation');
        app.installedAt = new Date().toISOString();
        await putApp(app);
        value = { id: app.id };
      } else if (message.operation === 'list') {
        value = (await listApps()).map((app) => ({
          id: app.id,
          manifest: app.manifest,
          source: app.source,
          installedAt: app.installedAt,
          size: app.size,
          additionalResources: app.capture.additionalResources,
        }));
      } else if (message.operation === 'remove' && typeof payload === 'string') {
        const app = await getApp(payload);
        const clients = await worker.clients.matchAll({ type: 'window' });
        if (
          app &&
          clients.some(
            (candidate) =>
              applicationIdentity(candidate.url, base) === publicAlias(app.id),
          )
        )
          throw new Error('Close application windows before uninstalling');
        await deleteApp(payload);
        value = true;
      } else if (message.operation === 'events') value = events;
      else throw new Error('Unknown management operation');
      port.postMessage({ ok: true, value });
    } catch (error) {
      port.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  managementQueue = managementQueue.then(operation, operation);
  event.waitUntil(managementQueue);
});

worker.addEventListener('fetch', (event) => {
  event.respondWith(
    (async () => {
      const request = event.request;
      const url = new URL(request.url);
      const client = event.clientId
        ? await worker.clients.get(event.clientId)
        : undefined;
      const app =
        (await installation(client?.url)) ||
        (request.mode === 'navigate' ||
        /\/__manifest\.webmanifest$|\/__icon\//.test(url.pathname)
          ? await installation(url.href)
          : undefined);
      const cache = await caches.open(boot);
      const publicPath =
        url.origin === base.origin && url.pathname.startsWith(base.pathname)
          ? url.pathname.slice(base.pathname.length)
          : '';
      if (!app) {
        // Only fixed trusted bootstrap bytes are public. No runtime network fallback.
        if (request.method === 'GET' && !url.search && trusted.includes(publicPath)) {
          const cached = await cache.match(url.href);
          if (cached) return cached;
        }
        return Response.error();
      }
      if (
        request.method === 'GET' &&
        !url.search &&
        ['pwa-192.png', 'pwa-512.png'].includes(publicPath)
      )
        return (await cache.match(url.href)) || Response.error();
      const entry = applicationURL(app, base);
      if (
        request.method === 'GET' &&
        !url.search &&
        url.href === new URL('guard.js', base).href &&
        request.destination === 'script'
      )
        return (await cache.match(url.href)) || Response.error();
      const suffix =
        url.origin === entry.origin && url.pathname.startsWith(entry.pathname)
          ? url.pathname.slice(entry.pathname.length)
          : '';
      if (
        request.destination === 'sharedworker' &&
        request.method === 'GET' &&
        !url.search &&
        client &&
        url.href === new URL('__guest_worker_registry__.js', base).href
      ) {
        const source = await cache.match(url.href);
        return source
          ? new Response(await source.arrayBuffer(), {
              headers: headers('text/javascript'),
            })
          : Response.error();
      }
      if (['worker', 'sharedworker'].includes(request.destination))
        return Response.error();
      if (request.mode === 'navigate') {
        if (
          request.destination !== 'document' ||
          request.method !== 'GET' ||
          url.origin !== entry.origin ||
          (url.pathname !== entry.pathname &&
            url.pathname !== entry.pathname + 'index.html')
        ) {
          record('blocked-navigation', url.href, request.method);
          return Response.error();
        }
        const nonce = crypto.randomUUID().replaceAll('-', '');
        const bootstrap = new URL('guard.js', base).href;
        const document =
          '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="manifest" href="' +
          manifestURL(app, base).href +
          '"></head><body><script nonce="' +
          nonce +
          '" src="' +
          bootstrap +
          '"></script></body></html>';
        return new Response(document, {
          headers: headers('text/html;charset=utf-8', nonce, true),
        });
      }
      if (
        url.href === manifestURL(app, base).href &&
        request.method === 'GET' &&
        !url.search
      ) {
        return new Response(JSON.stringify(webManifest(app, base)), {
          headers: { 'Content-Type': 'application/manifest+json' },
        });
      }
      const iconPrefix = new URL(publicAlias(app.id) + '/__icon/', base);
      if (
        url.origin === iconPrefix.origin &&
        url.pathname.startsWith(iconPrefix.pathname)
      ) {
        const icon = Number(url.pathname.slice(iconPrefix.pathname.length));
        const icons = app.resources.filter((item) => /image\//.test(item.contentType));
        const resource = icons[icon];
        if (resource && Number.isSafeInteger(icon) && icon >= 0)
          return new Response(await getResource(app.id, resource.path, app.generation), {
            headers: headers(resource.contentType),
          });
        return Response.error();
      }
      if (request.method !== 'GET') return Response.error();
      const original = new URL(url);
      original.hash = '';
      const resource = app.resources.find(
        (item) => item.path === suffix || item.url === original.href,
      );
      if (!resource) {
        record('blocked', url.href, request.method);
        return Response.error();
      }
      if (/\b(?:text\/html|image\/svg\+xml)\b/i.test(resource.contentType)) {
        // Application documents are data for the prepared guest renderer, never a
        // browser-controlled native script/context entry route.
        if (
          ['iframe', 'frame', 'object', 'embed', 'script'].includes(request.destination)
        )
          return Response.error();
      }
      record('installed', url.href, request.method);
      const body = await getResource(app.id, resource.path, app.generation);
      if (/^text\/css(?:;|$)/i.test(resource.contentType)) {
        const text = rewriteGuestCSS(new TextDecoder().decode(body), (input) => {
          if (input.startsWith('#') || /^(?:data:|blob:)/i.test(input)) return input;
          const address = new URL(input, resource.url);
          const match = app.resources.find((candidate) => candidate.url === address.href);
          return match
            ? new URL(match.path, entry).href
            : new URL('__unavailable__', entry).href;
        });
        return new Response(text, { headers: headers(resource.contentType) });
      }
      return new Response(body, { headers: headers(resource.contentType) });
    })().catch((error) => {
      console.error(error);
      return Response.error();
    }),
  );
});
