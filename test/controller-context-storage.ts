import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, firefox, type Page } from 'playwright';
import { launch } from './browser-profile.ts';
import { testProvenance } from './provenance.ts';

interface Command {
  namespace: string;
  operation: 'bind' | 'close' | 'get' | 'lookup' | 'abort-bind';
  client?: string;
  context?: string;
  parent?: string;
  application?: string;
}
interface Outcome {
  ok: boolean;
  value?: unknown;
  error?: string;
  instance: string;
}
declare global {
  interface Window {
    contextStoreFixture(command: Command): Promise<Outcome>;
    contextStoreWorkerFixture(command: Command): Promise<Outcome>;
    restartContextStoreWorker(): void;
  }
}
await rm('results/contexts/controller-storage.json', { force: true });
const sourcePath = 'src/runtime/contexts/controller-store.ts';
const source = await readFile(sourcePath, 'utf8');
const variants = ['normal', 'client-fault', 'context-fault'] as const;
const bundles = new Map<string, Uint8Array>();
const sourceHashes: Record<string, string> = {};
const hash = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex');
for (const variant of variants) {
  const anchor =
    variant === 'client-fault' ? 'contexts.add(' : 'internalRecord({ unique: true })';
  const replacement =
    variant === 'client-fault' ? 'contexts.put(' : 'internalRecord({ unique: false })';
  if (variant !== 'normal') assert.equal(source.split(anchor).length, 2);
  const selected = variant === 'normal' ? source : source.replace(anchor, replacement);
  sourceHashes[variant] = hash(selected);
  let transformed = 0;
  const result = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'ts',
      contents: `
import { controllerContextStorage } from './src/runtime/contexts/controller-store.ts';
import { ContextRegistry, CONTEXT_POLICY_VERSION } from './src/runtime/contexts/model.ts';
const stores=new Map();
const instance=crypto.randomUUID();
const nativeAdd=IDBObjectStore.prototype.add;
async function execute(command) {
  try {
    const base=new URL('/context-store/'+encodeURIComponent(command.namespace)+'/',location.origin);
    let entry=stores.get(base.href);
    if(!entry){const storage=controllerContextStorage(base);entry={storage,registry:new ContextRegistry(storage)};stores.set(base.href,entry);}
    const client=command.client || 'client';
    const context=command.context || 'context';
    const parent=command.parent || 'parent';
    const application=command.application || 'application';
    const identity={policyVersion:CONTEXT_POLICY_VERSION,installationGeneration:'generation',
      id:context,application,parent,kind:'dedicated-worker',state:'preparing',url:base.href+'worker'};
    let value;
    if(command.operation==='bind') value=await entry.registry.bind(client,identity);
    else if(command.operation==='close') value=await entry.registry.closeChild(parent,application,context);
    else if(command.operation==='get') value=await entry.storage.get(client);
    else if(command.operation==='lookup') value=await entry.storage.lookupByContext(context);
    else if(command.operation==='abort-bind') {
      IDBObjectStore.prototype.add=function(...args){
        const request=Reflect.apply(nativeAdd,this,args);
        request.addEventListener('success',()=>this.transaction.abort(),{once:true});
        return request;
      };
      try { value=await entry.registry.bind(client,identity); }
      finally { IDBObjectStore.prototype.add=nativeAdd; }
    } else throw new Error('Unknown fixture operation');
    return {ok:true,value,instance};
  } catch(error) { return {ok:false,error:String(error),instance}; }
}
globalThis.contextStoreFixture=execute;
if(typeof document==='undefined') {
  addEventListener('message',async event=>{
    const reply=event.ports[0];
    reply.postMessage(await execute(event.data));reply.close();
  });
} else {
  let worker;
  globalThis.restartContextStoreWorker=()=>{worker?.terminate();worker=undefined;};
  globalThis.contextStoreWorkerFixture=command=>new Promise((resolve,reject)=>{
    worker ||= new Worker('/${variant}/fixture.js');
    const channel=new MessageChannel();
    const timer=setTimeout(()=>{channel.port1.close();reject(new Error('Worker fixture timed out'));},10000);
    channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};
    worker.postMessage(command,[channel.port2]);
  });
}
`,
    },
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    plugins:
      variant === 'normal'
        ? []
        : [
            {
              name: 'test-only-context-constraint-removal',
              setup(builder) {
                builder.onLoad(
                  { filter: /[/\\]contexts[/\\]controller-store\.ts$/ },
                  async ({ path }) => {
                    assert.equal(await readFile(path, 'utf8'), source);
                    transformed++;
                    return { contents: selected, loader: 'ts' };
                  },
                );
              },
            },
          ],
  });
  assert.equal(transformed, variant === 'normal' ? 0 : 1);
  bundles.set('/' + variant + '/fixture.js', result.outputFiles[0].contents);
}
const server = http.createServer((request, response) => {
  const script = bundles.get(request.url || '');
  response.setHeader('Content-Type', script ? 'text/javascript' : 'text/html');
  const variant = (request.url || '').split('/')[1];
  if (script) response.end(script);
  else if (variants.some((value) => value === variant))
    response.end(
      '<!doctype html><title>Context store</title><script src="/' +
        variant +
        '/fixture.js"></script>',
    );
  else {
    response.statusCode = 404;
    response.end();
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const origin = 'http://127.0.0.1:' + address.port;
const rows: object[] = [];
const provenance = await testProvenance(import.meta.url);
function call(page: Page, command: Command, worker = false): Promise<Outcome> {
  return page.evaluate(
    ({ command, worker }) =>
      worker
        ? window.contextStoreWorkerFixture(command)
        : window.contextStoreFixture(command),
    { command, worker },
  );
}
try {
  for (const engine of [chromium, firefox]) {
    const browser = await launch(engine);
    try {
      for (const variant of variants) {
        const context = await browser.newContext();
        try {
          const left = await context.newPage(),
            right = await context.newPage();
          await Promise.all([
            left.goto(origin + '/' + variant + '/'),
            right.goto(origin + '/' + variant + '/'),
          ]);
          for (const worker of [false, true])
            for (const collision of ['client', 'context', 'same', 'independent']) {
              const namespace = variant + '-' + worker + '-' + collision;
              const first: Command = {
                namespace,
                operation: 'bind',
                client: 'left',
                context: 'left-context',
              };
              const second: Command = {
                namespace,
                operation: 'bind',
                client: collision === 'client' || collision === 'same' ? 'left' : 'right',
                context:
                  collision === 'context' || collision === 'same'
                    ? 'left-context'
                    : 'right-context',
              };
              const replies = await Promise.all([
                call(left, first),
                call(right, second, worker),
              ]);
              assert.notEqual(replies[0].instance, replies[1].instance);
              const expected =
                collision === 'independent' ||
                (variant === 'client-fault' &&
                  (collision === 'client' || collision === 'same')) ||
                (variant === 'context-fault' && collision === 'context')
                  ? 2
                  : 1;
              assert.equal(
                replies.filter((reply) => reply.ok).length,
                expected,
                engine.name() + ':' + namespace,
              );
              const identities = await Promise.all(
                ['left', 'right'].map((client) =>
                  call(left, { namespace, operation: 'get', client }),
                ),
              );
              rows.push({
                browser: engine.name(),
                version: browser.version(),
                variant,
                worker,
                collision,
                replies,
                identities,
              });
            }
          if (variant === 'normal') {
            const namespace = 'normal-lifecycle';
            const command: Command = { namespace, operation: 'bind' };
            assert.equal(
              (await call(left, { ...command, operation: 'close' })).value,
              true,
            );
            assert.equal((await call(right, command, true)).ok, false);
            assert.equal(
              (await call(right, { ...command, parent: 'other-parent' }, true)).ok,
              true,
            );
            assert.equal(
              (await call(left, { ...command, operation: 'close' })).value,
              false,
            );
            assert.equal(
              (
                await call(left, {
                  ...command,
                  operation: 'close',
                  parent: 'other-parent',
                })
              ).value,
              true,
            );
            assert.equal((await call(right, command, true)).ok, false);
            const before = await call(right, { ...command, operation: 'get' }, true);
            await right.evaluate(() => window.restartContextStoreWorker());
            const after = await call(right, { ...command, operation: 'get' }, true);
            assert.notEqual(before.instance, after.instance);
            assert.deepEqual(after.value, before.value);
            assert(
              after.value && typeof after.value === 'object' && 'state' in after.value,
            );
            assert.equal(after.value.state, 'closed');
            const aborted = await call(left, {
              namespace: 'rollback',
              operation: 'abort-bind',
            });
            assert.equal(aborted.ok, false);
            assert.equal(
              (await call(right, { namespace: 'rollback', operation: 'get' }, true))
                .value,
              undefined,
            );
            assert.equal(
              (await call(right, { namespace: 'rollback', operation: 'lookup' }, true))
                .value,
              undefined,
            );
            assert.equal(
              (await call(right, { namespace: 'rollback', operation: 'bind' }, true)).ok,
              true,
            );
            for (let round = 0; round < 12; round++) {
              const namespace = 'close-bind-' + round;
              const replies = await Promise.all([
                call(left, { namespace, operation: 'bind' }),
                call(right, { namespace, operation: 'close' }, true),
              ]);
              assert.equal(replies[1].value, true);
              const result = await call(left, { namespace, operation: 'get' });
              if (result.value !== undefined) {
                assert(
                  result.value &&
                    typeof result.value === 'object' &&
                    'state' in result.value,
                );
                assert.equal(result.value.state, 'closed');
              }
              rows.push({
                browser: engine.name(),
                version: browser.version(),
                variant,
                closeBindRound: round,
                replies,
                result,
              });
            }
            rows.push({
              browser: engine.name(),
              version: browser.version(),
              variant,
              lifecycle: { before, after, aborted },
            });
          }
          console.log(
            engine.name() + ': ' + variant + ' native context-store constraints checked',
          );
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    'results/contexts/controller-storage.json',
    JSON.stringify(
      {
        provenance,
        scope:
          'Actual registry and IndexedDB store in independent native Windows/workers; simulated actor identifiers, not browser identity authentication or full confinement',
        sourceHashes,
        bundleHashes: Object.fromEntries(
          [...bundles].map(([path, bytes]) => [path, hash(bytes)]),
        ),
        rows,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
