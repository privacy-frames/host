import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';
import { testProvenance } from './provenance.ts';

interface Outcome {
  ok: boolean;
  value?: unknown;
  error?: string;
}
declare global {
  interface Window {
    configureChannel(frame: string, key: string): void;
    configureDocumentChannel(): void;
    channelAttempt(key: string, parentOrigin: string): Promise<Outcome>;
    channelRead(message: object): Promise<Outcome>;
    captureProbe(): Promise<unknown>;
    syntheticChannel(key: string): void;
    connectionState(): { handled: number; held: boolean };
    changeGeneration(): void;
    closeConnection(): void;
    releaseConnection(): void;
    pendingChannel?: Promise<Outcome>;
    watchEarlyChannelMessages(): void;
    earlyChannelExposures(): number;
  }
}
const lateReceiver = process.env.PARENT_CHANNEL_LATE_RECEIVER === '1';
const sourcePath = 'src/runtime/contexts/parent-channel.ts';
const original = await readFile(sourcePath, 'utf8');
const early = "apply(add, nativeWindow, ['message', receiveChildChannel, true]);";
const accept =
  'export function acceptChildChannel(options: ParentChannelOptions): { close(): void } {';
assert.equal(original.split(early).length, 2);
assert.equal(original.split(accept).length, 2);
const altered = original.replace(early, '').replace(accept, accept + '\n  ' + early);
let mutations = 0;
const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'ts',
    contents: `
      import { acceptChildChannel, connectParentChannel } from './src/runtime/contexts/parent-channel.ts';
      import { serveDocumentParent } from './src/runtime/contexts/document-parent.ts';
      import { internalRecord,ownDescriptor } from './src/shared/primordials.ts';
      const apply=Reflect.apply,define=Object.defineProperty;
      const frameWindow=ownDescriptor(HTMLIFrameElement.prototype,'contentWindow').get;
      const nativeChannel=MessageChannel;
      const first=ownDescriptor(MessageChannel.prototype,'port1').get;
      const second=ownDescriptor(MessageChannel.prototype,'port2').get;
      const closePort=MessagePort.prototype.close;
      let connection;
      let client;
      let earlyExposures=0;
      const eventData=ownDescriptor(MessageEvent.prototype,'data').get;
      const eventPorts=ownDescriptor(MessageEvent.prototype,'ports').get;
      const nativeAdd=EventTarget.prototype.addEventListener;
      const nativeStop=Event.prototype.stopImmediatePropagation;
      const nativePost=MessagePort.prototype.postMessage;
      const nativeStart=MessagePort.prototype.start;
      window.watchEarlyChannelMessages=()=>addEventListener('message',event=>{
        if(event.isTrusted && event.data?.type==='privacy-private-parent-channel' &&
          event.data.key==='owned-context' &&
          event.source===apply(frameWindow,document.getElementById('victim'),[])){
          earlyExposures+=event.ports.length;
          const stolen=event.ports[0];
          apply(nativeAdd,stolen,['message',message=>{
            if(apply(eventData,message,[])?.kind!=='forge-probe') return;
            apply(nativeStop,message,[]);
            const reply=apply(eventPorts,message,[])[0];
            apply(nativePost,reply,[{ok:true,value:{value:99}}]);
            apply(closePort,reply,[]);
          },true]);
          apply(nativeStart,stolen,[]);
        }
      },true);
      window.earlyChannelExposures=()=>earlyExposures;

      window.configureChannel=(id,key)=>{
        if(connection){connection.current=false;connection.server.close();}
        const frame=document.getElementById(id);
        const state=internalRecord({current:true,handled:0,held:false,release:undefined});
        state.child=()=>apply(frameWindow,frame,[]);
        state.server=acceptChildChannel({child:state.child,origin:location.origin,key,
          isCurrent:()=>state.current,
          handle:async message=>{
            state.handled++;
            if(message.kind==='hold'){
              state.held=true;
              await new Promise(resolve=>{state.release=resolve;});
            }
            return internalRecord({value:42});
          }});
        connection=state;
      };
      window.configureDocumentChannel=()=>{
        if(connection){connection.current=false;connection.server.close();}
        const frame=document.getElementById('victim');
        const state=internalRecord({current:true,handled:0,held:false});
        state.child=()=>apply(frameWindow,frame,[]);
        state.server=serveDocumentParent({child:state.child,origin:location.origin,
          registration:{id:'document-grant',parentToken:'fixed-parent-token'},
          isCurrent:()=>state.current,
          documentControl:async(operation,payload)=>{
            state.handled++;
            return {operation,payload};
          }});
        connection=state;
      };
      window.channelAttempt=async(key,parentOrigin)=>{
        try{
          const next=await connectParentChannel(parent,parentOrigin,key,700);
          client?.close();client=next;
          return {ok:true};
        }catch(error){return {ok:false,error:String(error)};}
      };
      window.channelRead=async message=>{
        try{return {ok:true,value:await client.request(message)};}
        catch(error){return {ok:false,error:String(error)};}
      };
      window.syntheticChannel=key=>{
        const channel=new nativeChannel();
        const remote=apply(second,channel,[]),local=apply(first,channel,[]);
        dispatchEvent(new MessageEvent('message',{origin:location.origin,source:connection.child(),
          data:{type:'privacy-private-parent-channel',key},ports:[remote]}));
        apply(closePort,remote,[]);apply(closePort,local,[]);
      };
      window.connectionState=()=>({handled:connection.handled,held:connection.held});
      window.changeGeneration=()=>{connection.current=false;};
      window.closeConnection=()=>{connection.current=false;connection.server.close();};
      window.releaseConnection=()=>connection.release?.();
      window.captureProbe=async()=>{
        let observed=0;
        const fields=[
          [MessageChannel.prototype,'port1'],[MessageChannel.prototype,'port2'],
          [MessageEvent.prototype,'data'],[MessageEvent.prototype,'ports'],
          [MessageEvent.prototype,'source'],[MessageEvent.prototype,'origin'],
          [HTMLIFrameElement.prototype,'contentWindow'],
          [MessagePort.prototype,'postMessage'],[MessagePort.prototype,'start'],[MessagePort.prototype,'close'],
          [EventTarget.prototype,'addEventListener'],[EventTarget.prototype,'removeEventListener'],
          [Array.prototype,Symbol.iterator],[Set.prototype,Symbol.iterator],
        ];
        const saved=fields.map(([target,key])=>ownDescriptor(target,key));
        const bad=()=>{observed++;throw new Error('Application operation');};
        const raw=new nativeChannel();
        try{
          for(let i=0;i<fields.length;i++){
            const target=fields[i][0],key=fields[i][1],old=saved[i];
            define(target,key,'value'in old ? {value:bad,configurable:true,writable:true}
              :{get:bad,configurable:true});
          }
          let rawDenied=false;
          try{raw.port1;}catch{rawDenied=true;}
          const nativeControlCalls=observed;
          observed=0;
          const value=client ? await client.request({kind:'read'})
            :await connection.child().channelRead({kind:'read'});
          return {rawDenied,nativeControlCalls,observed,value};
        }finally{
          for(let i=0;i<fields.length;i++)define(fields[i][0],fields[i][1],saved[i]);
          apply(closePort,apply(first,raw,[]),[]);apply(closePort,apply(second,raw,[]),[]);
        }
      };
    `,
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  plugins: lateReceiver
    ? [
        {
          name: 'test-only-late-parent-receiver',
          setup(builder) {
            builder.onLoad(
              { filter: /[/\\]contexts[/\\]parent-channel\.ts$/ },
              async ({ path }) => {
                assert.equal(await readFile(path, 'utf8'), original);
                mutations++;
                return { contents: altered, loader: 'ts' };
              },
            );
          },
        },
      ]
    : [],
});
assert.equal(mutations, lateReceiver ? 1 : 0);
const script = bundle.outputFiles[0].contents;
const traffic: { url: string; port: number }[] = [];
const listeners: http.Server[] = [];
async function server() {
  const instance = http.createServer((request, response) => {
    const address = instance.address();
    assert(address && typeof address !== 'string');
    traffic.push({ url: request.url || '/', port: address.port });
    response.setHeader(
      'Content-Type',
      request.url === '/fixture.js' ? 'text/javascript' : 'text/html',
    );
    response.end(
      request.url === '/fixture.js'
        ? script
        : '<!doctype html><title>Parent channel fixture</title><script src="/fixture.js"></script><body>',
    );
  });
  listeners.push(instance);
  await new Promise<void>((resolve) => instance.listen(0, '127.0.0.1', resolve));
  const address = instance.address();
  assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}
const origin = await server(),
  foreign = await server();
const provenance = await testProvenance(import.meta.url);
const rows: object[] = [];
try {
  for (const engine of [chromium, firefox]) {
    const browser = await launch(engine);
    try {
      const page = await browser.newPage();
      await page.goto(origin);
      await page.evaluate(
        ({ origin, foreign }) => {
          for (const [id, base] of [
            ['victim', origin],
            ['sibling', origin],
            ['foreign', foreign],
          ]) {
            const frame = document.createElement('iframe');
            frame.id = id;
            frame.name = id;
            frame.src = base + '/child';
            document.body.append(frame);
          }
        },
        { origin, foreign },
      );
      for (const id of ['victim', 'sibling', 'foreign'])
        await page
          .frameLocator('#' + id)
          .locator('title')
          .waitFor({ state: 'attached' });
      const victim = page.frame({ name: 'victim' });
      const sibling = page.frame({ name: 'sibling' });
      const outsider = page.frame({ name: 'foreign' });
      assert(victim && sibling && outsider);
      await victim.waitForFunction(() => typeof window.channelAttempt === 'function');
      await sibling.waitForFunction(() => typeof window.channelAttempt === 'function');
      await outsider.waitForFunction(() => typeof window.channelAttempt === 'function');
      await page.evaluate(() => {
        window.watchEarlyChannelMessages();
        window.configureChannel('victim', 'owned-context');
      });
      assert.equal(
        (
          await sibling.evaluate(
            (origin) => window.channelAttempt('owned-context', origin),
            origin,
          )
        ).ok,
        false,
      );
      assert.equal(
        (
          await victim.evaluate(
            (origin) => window.channelAttempt('wrong-key', origin),
            origin,
          )
        ).ok,
        false,
      );
      await page.evaluate(() => window.configureChannel('foreign', 'origin-check'));
      assert.equal(
        (
          await outsider.evaluate(
            (origin) => window.channelAttempt('origin-check', origin),
            origin,
          )
        ).ok,
        false,
      );
      await page.evaluate(() => {
        window.configureChannel('victim', 'owned-context');
        window.syntheticChannel('owned-context');
      });
      assert.equal(
        (
          await victim.evaluate(
            (origin) => window.channelAttempt('owned-context', origin),
            origin,
          )
        ).ok,
        true,
      );
      assert.deepEqual(
        await victim.evaluate(() => window.channelRead({ kind: 'read' })),
        { ok: true, value: { value: 42 } },
      );
      assert.equal(
        (
          await victim.evaluate(
            (origin) => window.channelAttempt('owned-context', origin),
            origin,
          )
        ).ok,
        false,
      );
      assert.deepEqual(
        await victim.evaluate(() => window.channelRead({ kind: 'read' })),
        { ok: true, value: { value: 42 } },
      );
      const earlyExposures = await page.evaluate(() => window.earlyChannelExposures());
      if (lateReceiver)
        assert(earlyExposures > 0, 'Late receiver fault did not expose a bootstrap port');
      else
        assert.equal(
          earlyExposures,
          0,
          'Application listener observed a private bootstrap endpoint',
        );
      const forgeProbe = await victim.evaluate(() =>
        window.channelRead({ kind: 'forge-probe' }),
      );
      assert.deepEqual(forgeProbe, {
        ok: true,
        value: { value: lateReceiver ? 99 : 42 },
      });
      const childCapture = await victim.evaluate(() => window.captureProbe());
      const parentCapture = await page.evaluate(() => window.captureProbe());
      for (const value of [childCapture, parentCapture]) {
        assert(value && typeof value === 'object');
        assert('rawDenied' in value && value.rawDenied === true);
        assert('nativeControlCalls' in value && value.nativeControlCalls === 1);
        assert('observed' in value && value.observed === 0);
        assert('value' in value);
        assert.deepEqual(
          value.value,
          value === childCapture ? { value: 42 } : { ok: true, value: { value: 42 } },
        );
      }
      for (const mode of ['close', 'generation']) {
        if (mode === 'generation') {
          await page.evaluate(() => window.configureChannel('victim', 'next-context'));
          assert.equal(
            (
              await victim.evaluate(
                (origin) => window.channelAttempt('owned-context', origin),
                origin,
              )
            ).ok,
            false,
          );
          assert.equal(
            (
              await victim.evaluate(
                (origin) => window.channelAttempt('next-context', origin),
                origin,
              )
            ).ok,
            true,
          );
        }
        await victim.evaluate(() => {
          window.pendingChannel = window.channelRead({ kind: 'hold' });
        });
        await page.waitForFunction(() => window.connectionState().held);
        const start = traffic.length;
        await page.evaluate((mode) => {
          if (mode === 'close') window.closeConnection();
          else window.changeGeneration();
          window.releaseConnection();
        }, mode);
        const outcome: unknown = await victim.evaluate(() => window.pendingChannel);
        assert(
          outcome &&
            typeof outcome === 'object' &&
            'ok' in outcome &&
            outcome.ok === false,
        );
        assert.equal(
          (await victim.evaluate(() => window.channelRead({ kind: 'read' }))).ok,
          false,
        );
        assert.deepEqual(traffic.slice(start), []);
      }
      await page.evaluate(() => window.configureDocumentChannel());
      assert.equal(
        (
          await victim.evaluate(
            (origin) => window.channelAttempt('document-grant', origin),
            origin,
          )
        ).ok,
        true,
      );
      for (const packet of [
        { type: 'other', operation: 'content' },
        { type: 'privacy-document-control', operation: 'create' },
        { type: 'privacy-document-control', operation: 'child-content' },
      ])
        assert.equal(
          (await victim.evaluate((packet) => window.channelRead(packet), packet)).ok,
          false,
        );
      for (const operation of ['configuration', 'content']) {
        assert.deepEqual(
          await victim.evaluate(
            (operation) =>
              window.channelRead({
                type: 'privacy-document-control',
                operation,
                payload: JSON.stringify({ id: 'different-child', parentToken: 'forged' }),
                clientId: 'different-client',
                application: 'different-installation',
              }),
            operation,
          ),
          {
            ok: true,
            value: {
              operation: 'child-' + operation,
              payload: { id: 'document-grant', parentToken: 'fixed-parent-token' },
            },
          },
        );
      }
      assert.equal((await page.evaluate(() => window.connectionState())).handled, 2);
      await page.evaluate(() => window.closeConnection());
      rows.push({
        browser: engine.name(),
        version: browser.version(),
        childCapture,
        parentCapture,
        earlyExposures,
        forgeProbe,
        checks: [
          'earlier-application-listener',
          'wrong-window',
          'wrong-key',
          'wrong-origin',
          'synthetic-event',
          'replay',
          'old-generation-key',
          'pending-close',
          'pending-generation-change',
          'closed-read',
          'message-only-no-http',
          'document-parent-operation-restriction',
          'document-parent-fixed-grant',
        ],
      });
      console.log(
        `${engine.name()}: native Window authentication, captured operations and pending revocation passed (${lateReceiver ? 'late receiver fault' : 'normal'})`,
      );
    } finally {
      await browser.close();
    }
  }
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    lateReceiver
      ? 'results/contexts/parent-channel-late-receiver.json'
      : 'results/contexts/parent-channel.json',
    JSON.stringify(
      {
        provenance,
        lateReceiver,
        sourceSHA256: createHash('sha256').update(original).digest('hex'),
        alteredSourceSHA256: lateReceiver
          ? createHash('sha256').update(altered).digest('hex')
          : null,
        fixtureSHA256: createHash('sha256').update(script).digest('hex'),
        scope:
          'Actual private parent channel and native browser windows/ports; test-only public hooks and fixed-data handler, not production installation/admission or full confinement',
        rows,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  for (const instance of listeners) {
    instance.closeAllConnections();
    await new Promise<void>((resolve) => instance.close(() => resolve()));
  }
}
