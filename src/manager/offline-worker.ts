/** Cache the trusted library UI. Application confinement lives on the other origin. */
const worker = self as unknown as ServiceWorkerGlobalScope;
const base = new URL('./', worker.location.href);
const cacheName = 'pf-library-' + __BUILD_ID__;
const files = [
  'index.html',
  'manager.js',
  'host.css',
  'config.json',
  'report.html',
  'pwa-192.png',
  'pwa-512.png',
];
const urls = new Set(files.map((path) => new URL(path, base).href));
worker.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await (await caches.open(cacheName)).addAll([...urls]);
      await worker.skipWaiting();
    })(),
  );
});
worker.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await worker.clients.claim();
      const previous = (await caches.keys()).filter((name) => name !== cacheName);
      if (previous.length) {
        for (const client of await worker.clients.matchAll({ type: 'window' })) {
          const url = new URL(client.url);
          if (
            url.origin === base.origin &&
            [base.pathname, base.pathname + 'index.html'].includes(url.pathname)
          )
            void client.navigate(client.url).catch(console.error);
        }
        await Promise.all(previous.map((name) => caches.delete(name)));
      }
    })(),
  );
});
worker.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Fragments select client-side installation inputs, not a different cached shell.
  url.hash = '';
  if (url.href === base.href) url.pathname += 'index.html';
  if (event.request.method === 'GET' && urls.has(url.href))
    event.respondWith(
      (async () => {
        return (await (await caches.open(cacheName)).match(url.href)) || Response.error();
      })(),
    );
});
export {};
