import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';
import { launch } from '../../test/browser-profile.ts';

const parentRelay = process.env.PF_DOCUMENT_PARENT_RELAY === '1';
const relayKey = 'local-document-fixture';
// A native browser prerequisite experiment. The transport and fetch adapter are
// production code; this fixed-resource worker is not runtime admission or C1.
const compiled = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'ts',
    contents: `
      ${
        parentRelay
          ? "import { connectParentChannel } from './src/runtime/contexts/parent-channel.ts';"
          : "import { createControllerClient } from './src/runtime/controller-client.ts';"
      }
      import { createResourceFetch } from './src/runtime/resource-fetch.ts';
      import { createPolicyTools } from './src/runtime/enforcement/native.ts';
      const runtimeOrigin = self.origin;
      (async () => {
        try {
          const host = ${
            parentRelay
              ? `await connectParentChannel(parent,runtimeOrigin,${JSON.stringify(relayKey)})`
              : 'createControllerClient()'
          };
          const identity = await host.request({type:'identity'});
          const localFetch = createResourceFetch(
            (url, headers) => host.request({type:'read',url,headers}),
            createPolicyTools(),
          );
          const result = await (await localFetch(runtimeOrigin + '/one/data.json')).json();
          parent.postMessage({type:'local-child-result',ok:true,identity,result,
            documentURL:location.href}, runtimeOrigin);
        } catch (error) {
          parent.postMessage({type:'local-child-result',ok:false,error:String(error),
            documentURL:location.href}, runtimeOrigin);
        }
      })();
    `,
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
});
const parentBundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'ts',
    contents: `
      import { acceptChildChannel } from './src/runtime/contexts/parent-channel.ts';
      import { createControllerClient } from './src/runtime/controller-client.ts';
      import { ownDescriptor } from './src/shared/primordials.ts';
      const apply=Reflect.apply;
      const frameWindow=ownDescriptor(HTMLIFrameElement.prototype,'contentWindow').get;
      const connected=ownDescriptor(Node.prototype,'isConnected').get;
      globalThis.installLocalDocumentRelay=(frame,key)=>{
        const host=createControllerClient();
        let current=true;
        const server=acceptChildChannel({
          child:()=>apply(frameWindow,frame,[]),origin:location.origin,key,
          isCurrent:()=>current && apply(connected,frame,[]),
          handle:(message:unknown)=>{
            if(!message || typeof message!=='object' || !('type' in message) ||
              (message.type!=='identity' && message.type!=='read'))
              throw new Error('Unsupported fixture relay operation');
            return host.request(message);
          },
        });
        return ()=>{current=false;server.close();};
      };
    `,
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
});
const parentScript = parentBundle.outputFiles[0].text;
const childScript = compiled.outputFiles[0].text;
const childHTML =
  '<!doctype html><script nonce="fixture">' +
  childScript.replaceAll('</script', '<\\/script') +
  '</script>';
const worker = `
const instance = crypto.randomUUID();
const trace = [];
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('message', event => {
  const port = event.ports[0];
  if (!port) return;
  event.waitUntil((async () => {
    try {
      if (event.data === 'claim') {
        await self.clients.claim();
        port.postMessage({ok:true,value:instance}); return;
      }
      if (event.data?.type === 'trace') {
        port.postMessage({ok:true,value:trace}); return;
      }
      const source = event.source;
      trace.push({phase:'received',operation:event.data?.type,id:source?.id,url:source?.url});
      const client = source && 'id' in source ? await self.clients.get(source.id) : undefined;
      trace.push({phase:'lookup-completed',operation:event.data?.type,id:client?.id,url:client?.url});
      if (!client || client.type !== 'window' || client.id !== source.id)
        throw new Error('Actual child window client unavailable: ' + JSON.stringify({source:source && {id:source.id,type:source.type,url:source.url},lookup:client && {id:client.id,type:client.type,url:client.url}}));
      if (event.data?.type === 'identity') {
        port.postMessage({ok:true,value:{instance,id:client.id,url:client.url,type:client.type,messageSourceURL:source.url}});
      } else if (event.data?.type === 'read' &&
        event.data.url === new URL('/one/data.json',location.origin).href) {
        const body = new TextEncoder().encode('{"value":42}').buffer;
        port.postMessage({ok:true,value:{url:event.data.url,status:200,statusText:'OK',
          headers:[['content-type','application/json']],body}},[body]);
      } else throw new Error('Not admitted');
    } catch(error) { port.postMessage({ok:false,error:String(error)}); }
    finally { port.close(); }
  })());
});`;
const requests: Array<{ path: string; time: number }> = [];
const policy =
  "default-src 'none'; script-src 'nonce-fixture'; frame-src blob:; worker-src 'self'; connect-src 'none'";
const receiver = http.createServer((request, response) => {
  requests.push({ path: request.url || '/', time: Date.now() });
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/parent.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(parentScript);
  } else if (request.url === '/sw.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(worker);
  } else if (request.url === '/network-control') {
    response.setHeader('Content-Type', 'application/json');
    response.end('{"receiver":true}');
  } else {
    response.setHeader('Content-Type', 'text/html');
    if (request.url !== '/control') response.setHeader('Content-Security-Policy', policy);
    response.end(
      '<!doctype html><title>Local document controller probe</title>' +
        (parentRelay ? '<script nonce="fixture" src="/parent.js"></script>' : ''),
    );
  }
});
await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
const address = receiver.address();
assert(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const rows: object[] = [];
let completed = false;
try {
  for (const profile of [
    { engine: chromium, stale: false },
    { engine: firefox, stale: false },
    { engine: firefox, stale: true },
  ]) {
    const browser = await launch(
      profile.engine,
      profile.stale
        ? {
            firefoxUserPrefs: { 'dom.serviceWorkers.testUpdateOverOneDay': true },
          }
        : {},
    );
    try {
      const control = await browser.newPage();
      await control.goto(origin + '/control');
      const start = requests.length;
      assert.deepEqual(
        await control.evaluate(async () => (await fetch('/network-control')).json()),
        { receiver: true },
      );
      assert(requests.slice(start).some((item) => item.path === '/network-control'));
      await control.close();
      for (const later of ['absent', 'sibling', 'ancestor'] as const) {
        for (const carrier of ['srcdoc', 'blob'] as const) {
          const context = await browser.newContext();
          try {
            const parent = await context.newPage();
            await parent.goto(origin + '/one/page');
            const original = await parent.evaluate(async () => {
              const registration = await navigator.serviceWorker.register('/sw.js', {
                scope: '/one/',
                updateViaCache: 'none',
              });
              const deadline = Date.now() + 10000;
              while (registration.active?.state !== 'activated') {
                if (Date.now() > deadline) throw new Error('Activation timed out');
                await new Promise((resolve) => setTimeout(resolve, 25));
              }
              const active = registration.active!;
              const instance = await new Promise<unknown>((resolve, reject) => {
                const channel = new MessageChannel();
                const timer = setTimeout(
                  () => reject(new Error('Claim timed out')),
                  10000,
                );
                channel.port1.onmessage = (event) => {
                  clearTimeout(timer);
                  channel.port1.close();
                  resolve(event.data.value);
                };
                active.postMessage('claim', [channel.port2]);
              });
              while (!navigator.serviceWorker.controller) {
                if (Date.now() > deadline) throw new Error('Controller timed out');
                await new Promise((resolve) => setTimeout(resolve, 25));
              }
              if (!(await registration.unregister()))
                throw new Error('Unregister failed');
              if (await navigator.serviceWorker.getRegistration(location.href))
                throw new Error('Original scope still registered');
              return instance;
            });
            assert.equal(typeof original, 'string');
            const parentIdentity = await parent.evaluate(
              () =>
                new Promise<unknown>((resolve, reject) => {
                  const channel = new MessageChannel();
                  const timer = setTimeout(
                    () => reject(new Error('Parent identity control timed out')),
                    5000,
                  );
                  channel.port1.onmessage = (event) => {
                    clearTimeout(timer);
                    channel.port1.close();
                    resolve(event.data);
                  };
                  navigator.serviceWorker.controller!.postMessage({ type: 'identity' }, [
                    channel.port2,
                  ]);
                }),
            );
            assert(
              parentIdentity &&
                typeof parentIdentity === 'object' &&
                'ok' in parentIdentity &&
                parentIdentity.ok === true,
            );

            if (later !== 'absent') {
              const setup = await context.newPage();
              await setup.goto(origin + '/two/setup');
              await setup.evaluate(
                async (scope) => {
                  const registration = await navigator.serviceWorker.register('/sw.js', {
                    scope,
                    updateViaCache: 'none',
                  });
                  const deadline = Date.now() + 10000;
                  while (registration.active?.state !== 'activated') {
                    if (Date.now() > deadline)
                      throw new Error('Later activation timed out');
                    await new Promise((resolve) => setTimeout(resolve, 25));
                  }
                },
                later === 'sibling' ? '/two/' : '/',
              );
            }
            const registrations = await parent.evaluate(async () =>
              (await navigator.serviceWorker.getRegistrations()).map(
                (item) => item.scope,
              ),
            );
            assert(!registrations.includes(origin + '/one/'));
            let changed = Date.now(),
              count = requests.length;
            const deadline = Date.now() + 20000;
            while (Date.now() - changed < 3000) {
              assert(Date.now() < deadline, 'Setup did not become quiet');
              await parent.waitForTimeout(100);
              if (requests.length !== count) {
                count = requests.length;
                changed = Date.now();
              }
            }
            const start = requests.length;
            const result = await parent.evaluate(
              ({ carrier, html, parentRelay, relayKey }) =>
                new Promise<unknown>((resolve) => {
                  const frame = document.createElement('iframe');
                  let blob: string | undefined;
                  const cleanupRelay = parentRelay
                    ? Reflect.get(window, 'installLocalDocumentRelay')(frame, relayKey)
                    : undefined;
                  const finish = (value: unknown) => {
                    clearTimeout(timer);
                    removeEventListener('message', receive);
                    cleanupRelay?.();
                    frame.remove();
                    if (blob) URL.revokeObjectURL(blob);
                    resolve(value);
                  };
                  const receive = (event: MessageEvent) => {
                    const data: unknown = event.data;
                    if (
                      event.source === frame.contentWindow &&
                      data &&
                      typeof data === 'object' &&
                      'type' in data &&
                      data.type === 'local-child-result'
                    )
                      finish(data);
                  };
                  const timer = setTimeout(
                    () => finish({ ok: false, error: 'Child reply timed out' }),
                    25000,
                  );
                  addEventListener('message', receive);
                  if (carrier === 'srcdoc') frame.srcdoc = html;
                  else {
                    blob = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
                    frame.src = blob;
                  }
                  document.body.append(frame);
                }),
              { carrier, html: childHTML, parentRelay, relayKey },
            );
            await parent.waitForTimeout(3000);
            const observed = requests.slice(start);
            const trace = await parent.evaluate(
              () =>
                new Promise<unknown>((resolve, reject) => {
                  const channel = new MessageChannel();
                  const timer = setTimeout(
                    () => reject(new Error('Trace timed out')),
                    5000,
                  );
                  channel.port1.onmessage = (event) => {
                    clearTimeout(timer);
                    channel.port1.close();
                    resolve(event.data);
                  };
                  navigator.serviceWorker.controller!.postMessage({ type: 'trace' }, [
                    channel.port2,
                  ]);
                }),
            );
            const row = {
              browser: profile.engine.name(),
              version: browser.version(),
              forcedStale: profile.stale,
              later,
              carrier,
              registrations,
              original,
              result,
              parentIdentity,
              trace,
              requests: observed,
            };
            rows.push(row);
            console.log(JSON.stringify(row));
            assert(result && typeof result === 'object' && 'ok' in result);
            if (parentRelay)
              assert.equal(result.ok, true, 'Parent-mediated local read failed');
            if (result.ok === true) {
              assert(
                'identity' in result &&
                  result.identity &&
                  typeof result.identity === 'object',
              );
              assert(
                'id' in result.identity &&
                  typeof result.identity.id === 'string' &&
                  result.identity.id,
              );
              assert('instance' in result.identity);
              // Use the looked-up native client; the message source URL can be empty.
              if (parentRelay || later !== 'ancestor')
                assert.equal(result.identity.instance, original);
              if (parentRelay) {
                assert(
                  'value' in parentIdentity &&
                    parentIdentity.value &&
                    typeof parentIdentity.value === 'object' &&
                    'id' in parentIdentity.value,
                );
                assert.equal(result.identity.id, parentIdentity.value.id);
              }
              assert('result' in result);
              assert.deepEqual(result.result, { value: 42 });
            } else {
              assert('error' in result && typeof result.error === 'string');
              assert(
                [
                  'Error: Host controller is unavailable',
                  'Error: Host request timed out',
                ].includes(result.error),
                'Unexpected transport failure requires review',
              );
            }
            if (later !== 'ancestor' || profile.engine === chromium)
              assert.deepEqual(observed, []);
            else assert(observed.every((item) => item.path === '/sw.js'));
          } finally {
            await context.close();
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
  completed = true;
} finally {
  const hash = (value: string | Uint8Array) =>
    createHash('sha256').update(value).digest('hex');
  const sourcePaths = [
    'src/runtime/controller-client.ts',
    'src/runtime/private-channel.ts',
    'src/runtime/contexts/parent-channel.ts',
    'src/runtime/resource-fetch.ts',
    'src/runtime/enforcement/native.ts',
    'src/shared/primordials.ts',
  ];
  await writeFile(
    new URL(
      parentRelay ? './parent-document-broker.json' : './local-document-controller.json',
      import.meta.url,
    ),
    JSON.stringify(
      {
        completed,
        parentRelay,
        scope:
          'Native local child documents after parent unregistration; direct or explicitly parent-mediated transport using actual production channel/resource adapters and a fixed trusted resource fixture. Relay identity denotes the parent, not native child authentication. Not production admission, preparation or complete confinement.',
        runnerSHA256: hash(await readFile(import.meta.filename)),
        childScriptSHA256: hash(childScript),
        parentScriptSHA256: hash(parentScript),
        workerSHA256: hash(worker),
        policy,
        sourceHashes: Object.fromEntries(
          await Promise.all(
            sourcePaths.map(async (path) => [path, hash(await readFile(path))]),
          ),
        ),
        rows,
      },
      null,
      2,
    ) + '\n',
  );
  receiver.closeAllConnections();
  await new Promise<void>((resolve) => receiver.close(() => resolve()));
}
