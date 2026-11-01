import { SCRIPT_URL_CSP } from '../src/shared/script-url-policy.ts';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from './build.ts';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';
import { compileDocumentContent } from '../src/runtime/contexts/document-content.ts';
import { testProvenance } from './provenance.ts';

const nonce = 'document-renderer-test-nonce';
const publisher = 'https://publisher.invalid/app/';
const html = `<!doctype html><html lang="en"><head><title>Rendered app</title></head><body class="rendered" onload="window.bodyLoadThis=this===window;window.bodyLoadAliases=event===evt;window.events.push('body-load')">
<button id="action" onclick="window.handlerAliases=event===evt;window.handlerThis=this.id;return false">Action</button>
<script>window.events=['classic'];window.appGlobal=42;window.syntheticLoadProbes=0;new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&node.localName==='script'&&node.src.endsWith('/async.js')){window.syntheticLoadProbes++;node.dispatchEvent(new Event('load'));}}).observe(document,{childList:true,subtree:true});window.privateConstructorCalls=0;window.privateReflectCalls=0;window.privateQueryCalls=0;window.rendererNatives={Map,Promise,Reflect,query:Document.prototype.querySelectorAll};window.bindingReplacementsDenied={};window.bindingReplacementsAccepted={};function replaceGlobal(name,replacement){try{window[name]=replacement;window.bindingReplacementsDenied[name]=false}catch{window.bindingReplacementsDenied[name]=true}window.bindingReplacementsAccepted[name]=window[name]===replacement};replaceGlobal('Map',new Proxy(Map,{construct(){window.privateConstructorCalls++;throw new Error('Mutable Map used')}}));if(window.bindingReplacementsAccepted.Map){try{new window.Map()}catch{}}replaceGlobal('Promise',new Proxy(Promise,{construct(){window.privateConstructorCalls++;throw new Error('Mutable Promise used')}}));const replacementReflect=Object.create(Reflect);Object.defineProperty(replacementReflect,'apply',{value(...args){window.privateReflectCalls++;return rendererNatives.Reflect.apply(...args)}});replaceGlobal('Reflect',replacementReflect);Document.prototype.querySelectorAll=function(){window.privateQueryCalls++;throw new Error('Mutable query used')};function sharedGlobal(){return appGlobal};document.addEventListener('DOMContentLoaded',()=>events.push('DOMContentLoaded'));window.addEventListener('load',()=>events.push('window-load'));</script>
<script defer>window.events.push("inline-defer");</script><script async>window.events.push("inline-async");</script><script nomodule>window.noModuleExecuted=true;</script><script src="classic.js"></script><script defer src="defer.js"></script><script async src="async.js"></script>
<script type="module">import value from './helper.js';window.moduleValue=value;window.moduleURL=import.meta.url;if(window.Map!==rendererNatives.Map)window.Map=rendererNatives.Map;if(window.Promise!==rendererNatives.Promise)window.Promise=rendererNatives.Promise;if(window.Reflect!==rendererNatives.Reflect)window.Reflect=rendererNatives.Reflect;Document.prototype.querySelectorAll=rendererNatives.query;window.events.push('module');</script>
<use id="linked-shape" xlink:href="#box" x="50"/><script type="application/json" id="json">{"value":42}</script>
<template id="dormant"><button id="template-action" onclick="window.templateClick=event===evt">Template</button><script>window.templateRuns=(window.templateRuns||0)+1;</script></template>
<template id="context-template"><iframe id="dormant-context" srcdoc="<p>Never initialized automatically</p>"></iframe></template>
</body></html>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="320" height="180" viewBox="0 0 320 180" onload="window.svgInlineThis=this===document.documentElement;setup(evt)">
<style>rect{fill:rgb(34,102,170)}</style><a href="#box"><text x="0" y="120">Geometry</text></a><rect id="box" x="7" y="9" width="40" height="20"><animate attributeName="x" values="7;27;7" dur="0.4s" repeatCount="indefinite" /></rect>
<script><![CDATA[window.events=[];function setup(evt){window.svgHandler={target:evt.target===document.documentElement,self:this===window,alias:event===evt};window.svgLoadGeometry=evt.currentTarget.querySelector('rect').getBBox().width;window.events.push('svg-load')};document.addEventListener('DOMContentLoaded',()=>events.push('DOMContentLoaded'));window.addEventListener('load',()=>events.push('window-load'));window.geometry=document.getElementById('box').getBBox().width;]]></script>
<foreignObject x="0" y="40" width="100" height="40"><button xmlns="http://www.w3.org/1999/xhtml" id="svg-action" onclick="window.svgClick=event===evt">Action</button></foreignObject>
<use id="linked-shape" xlink:href="#box" x="50"/><script type="application/json" id="json">{"value":42}</script></svg>`;
const contexts =
  '<html><body><iframe id="context" onload="window.contextFacadeLoad=event===evt" srcdoc="<p>Inert descriptor</p>"></iframe><script>window.contextAppRan=true;</script></body></html>';
const contextTicket = contexts.replace(
  'window.contextAppRan=true;',
  "window.contextAppRan=true;window.parentGlobal=42;window.events=['parent-code'];document.addEventListener('DOMContentLoaded',()=>events.push('DOMContentLoaded'));window.addEventListener('load',()=>events.push('window-load'));",
);
const contextClassicBarrier = `<!doctype html><iframe id="context" srcdoc="<p>Prepared shell</p>" onload="parentFrameLoaded()"></iframe><script>
window.events=['parent-classic'];window.parentGlobal=42;
window.childStartup=new Promise(resolve=>window.completeChildStartup=resolve);
function parentFrameLoaded(){window.events.push('child-load');window.completeChildStartup();}
</script><script type="module">window.events.push('module-start');await window.childStartup;window.events.push('module-complete');</script>`;
const tlaModes = [
  'tla-inline-dcl',
  'tla-external-dcl',
  'tla-inline-load',
  'tla-external-load',
];
function tlaSource(mode: string) {
  const dcl = mode.endsWith('dcl');
  return `window.events.push('module-start');await new Promise(resolve=>${dcl ? 'document' : 'window'}.addEventListener('${dcl ? 'DOMContentLoaded' : 'load'}',()=>{window.events.push('awaited-event');resolve()},{once:true}));window.events.push('module-resumed');window.tlaDone=true;`;
}
function tlaMarkup(mode: string, native = false) {
  const external = mode.includes('external');
  return `<!doctype html><html><head></head><body><script>window.events=[];document.addEventListener('DOMContentLoaded',()=>events.push('DOMContentLoaded'));window.addEventListener('load',()=>events.push('window-load'));</script><script type="module" onload="window.events.push('module-load')" ${external ? 'src="' + (native ? '/installed/' : '') + mode + '.js"' : ''}>${external ? '' : tlaSource(mode)}</script></body></html>`;
}
let origin = '';
let unavailableRequests = 0;
const unavailableMarkup = `<!doctype html><script>window.events=[];</script><script src="/unavailable.js" onerror="events.push('classic-error')" onload="events.push('unexpected-load')"></script><script>events.push('after-classic');</script><script async src="/unavailable.js" onerror="events.push('async-error')"></script><script defer src="/unavailable.js" onerror="events.push('defer-error')"></script><script type="module" src="/unavailable.js" onerror="events.push('module-error')"></script><script nomodule src="/unavailable.js" onerror="events.push('unexpected-nomodule')"></script><script>document.addEventListener('DOMContentLoaded',()=>events.push('DOMContentLoaded'));</script>`;
const bundles = new Map<string, string>();
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url || '/', origin);
  if (url.pathname === '/unavailable.js') {
    unavailableRequests++;
    res.writeHead(404, { 'Content-Type': 'text/javascript' });
    res.end('Not available');
    return;
  }
  if (url.pathname === '/native-unavailable.html') {
    res.setHeader('Content-Type', 'text/html');
    res.end(unavailableMarkup);
    return;
  }
  if (url.pathname === '/service-worker.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(
      "addEventListener('install',e=>e.waitUntil(skipWaiting()));addEventListener('activate',e=>e.waitUntil(clients.claim()));addEventListener('fetch',e=>e.respondWith(fetch(e.request)));",
    );
    return;
  }
  if (url.pathname === '/registration/' || url.pathname === '/publication/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><title>Trusted test controller</title>');
    return;
  }
  if (url.pathname === '/manifest.webmanifest') {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.end(JSON.stringify({ id: '/app/', name: 'Renderer fixture', start_url: '/' }));
    return;
  }
  if (url.pathname === '/bootstrap.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(bundles.get(url.searchParams.get('mode') || 'html'));
    return;
  }
  if (url.pathname.startsWith('/installed/')) {
    res.setHeader('Content-Type', 'text/javascript');
    const sources: Record<string, string> = {
      '/installed/classic.js': `window.externalGlobal=sharedGlobal();window.events.push('external');`,
      '/installed/defer.js': `window.events.push('defer');`,
      '/installed/async.js': `window.events.push('async');`,
      '/installed/helper.js': `export default 13;`,
    };
    if (tlaModes.some((mode) => url.pathname === '/installed/' + mode + '.js')) {
      res.end(tlaSource(url.pathname.split('/').at(-1)!.slice(0, -3)));
      return;
    }
    if (url.pathname.endsWith('async.js'))
      setTimeout(() => res.end(sources[url.pathname]), 100);
    else res.end(sources[url.pathname] || '');
    return;
  }
  if (url.pathname === '/native-ticket.html') {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      '<!doctype html><iframe src="/delayed-child.html"></iframe><script>window.parentGlobal=42;window.events=["parent-code"];document.addEventListener("DOMContentLoaded",()=>events.push("DOMContentLoaded"));window.addEventListener("load",()=>events.push("window-load"));</script>',
    );
    return;
  }
  if (url.pathname === '/delayed-child.html') {
    res.setHeader('Content-Type', 'text/html');
    setTimeout(
      () =>
        res.end(
          '<!doctype html><script>parent.events.push("children-loaded");parent.ticketSawGlobal=parent.parentGlobal;</script>',
        ),
      100,
    );
    return;
  }
  if (url.pathname === '/native-tla.html') {
    res.setHeader('Content-Type', 'text/html');
    res.end(tlaMarkup(url.searchParams.get('case')!, true));
    return;
  }
  if (url.pathname === '/native.html' || url.pathname === '/native.svg') {
    const vector = url.pathname.endsWith('.svg');
    res.setHeader('Content-Type', vector ? 'image/svg+xml' : 'text/html');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self';script-src 'self' 'unsafe-inline';style-src 'unsafe-inline';object-src 'none';frame-src 'none'",
    );
    res.end(
      vector
        ? svg
        : html
            .replace('<head>', '<head><base href="/installed/">')
            .replaceAll('event===evt', 'event===event'),
    );
    return;
  }
  const mode = url.searchParams.get('mode') || 'html';
  const isSVG = mode.startsWith('svg');
  res.setHeader('Content-Type', isSVG ? 'image/svg+xml' : 'text/html');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'none';script-src 'self' blob: 'unsafe-eval' 'nonce-${nonce}';style-src 'unsafe-inline';connect-src 'none';img-src data:;worker-src ${origin}/service-worker.js;manifest-src 'self';object-src 'none';frame-src 'none'; ${SCRIPT_URL_CSP}`,
  );
  res.end(
    isSVG
      ? `<svg xmlns="http://www.w3.org/2000/svg"><script href="/bootstrap.js?mode=${mode}" /></svg>`
      : `<!doctype html><html><head><link id="trusted-manifest" rel="manifest" href="/manifest.webmanifest"><script src="/bootstrap.js?mode=${mode}"></script></head><body></body></html>`,
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Missing renderer port');
origin = 'http://127.0.0.1:' + address.port;
const aliases = [
  'classic.js',
  'defer.js',
  'async.js',
  'helper.js',
  ...tlaModes.filter((mode) => mode.includes('external')).map((mode) => mode + '.js'),
].map((name) => [publisher + name, origin + '/installed/' + name] as [string, string]);
for (const mode of [
  'html',
  'svg',
  'svg-captures',
  'svg-publication',
  'context',
  'context-ticket',
  'context-classic-barrier',
  'missing-adapter',
  'malformed',
  'raw-script',
  'raw-frame',
  'executable-url',
  'unavailable',
  ...tlaModes,
]) {
  const compiled = compileDocumentContent({
    kind: mode.startsWith('svg') ? 'svg' : 'html',
    text: mode.startsWith('svg')
      ? svg
      : mode === 'unavailable'
        ? unavailableMarkup.replaceAll(
            'src="/unavailable.js"',
            `src="${origin}/unavailable.js"`,
          )
        : mode === 'html'
          ? html
          : tlaModes.includes(mode)
            ? tlaMarkup(mode)
            : mode === 'context-classic-barrier'
              ? contextClassicBarrier
              : mode === 'context-ticket'
                ? contextTicket
                : contexts,
    sourceURL: publisher + (mode.startsWith('svg') ? 'drawing.svg' : 'index.html'),
    aliases,
    ...(mode === 'unavailable' ? { unavailableURLs: [origin + '/unavailable.js'] } : {}),
  });
  if (mode === 'malformed')
    Reflect.set(compiled.contexts[0], 'source', {
      kind: 'url',
      url: 'javascript:alert(1)',
    });
  if (compiled.kind === 'html') {
    if (mode === 'raw-script')
      compiled.html.body += '<script>window.rawExecuted=true;</script>';
    if (mode === 'raw-frame')
      compiled.html.body += '<template><iframe src="about:blank"></iframe></template>';
    if (mode === 'executable-url')
      compiled.html.body += '<a href="java&#x09;script:alert(1)">Invalid</a>';
  }
  const built = await build({
    stdin: {
      contents: `
import {createDocumentRenderer} from './src/runtime/contexts/document-renderer.ts';
import {prepareWindowRealm} from './src/runtime/contexts/window-realm.ts';
const nativeCreate=Document.prototype.createElementNS,nativeReplace=Node.prototype.replaceChild,apply=Reflect.apply,NativePromise=Promise,nativeSetTimeout=setTimeout,nativeDispatch=EventTarget.prototype.dispatchEvent,NativeEvent=Event;
const nativeParent=parent,nativePost=window.postMessage,nativeAdd=EventTarget.prototype.addEventListener;
const retainedManifest=document.getElementById('trusted-manifest');let manifestRemovals=0;if(retainedManifest)new MutationObserver(records=>{for(const record of records)for(const node of record.removedNodes)if(node===retainedManifest)manifestRemovals++}).observe(document.head,{childList:true});
const initialDocument=document,initialWindow=window,initialAddress=location.href,container=navigator.serviceWorker,readController=Object.getOwnPropertyDescriptor(ServiceWorkerContainer.prototype,'controller').get,initialController=apply(readController,container,[]);
const committed=document.readyState==='complete'?Promise.resolve():new Promise(resolve=>addEventListener('load',event=>{if([window,document,document.documentElement].includes(event.target))resolve()},true));
const realm=prepareWindowRealm({application:'renderer-fixture',applicationURL:${JSON.stringify(origin + '/app/')},documentURL:location.href,scriptNonce:${JSON.stringify(nonce)}});
realm.admitContent({scripts: ${JSON.stringify(aliases.map(([, target]) => target))},installationGeneration:'fixture-generation',aliases:${JSON.stringify(aliases)},source:${JSON.stringify(compiled.sourceURL)},documentBase:${JSON.stringify(compiled.baseURL)}});
const rendered=${JSON.stringify(compiled)};
let callbackCount=0;
let childStartup,childStartupHeld=false;
const renderer=createDocumentRenderer({retainedHeadNodes:retainedManifest?[retainedManifest]:[],nonce:${JSON.stringify(nonce)},scripts:realm.scripts,resources:realm.resources,...(${JSON.stringify(mode)}==='context-classic-barrier'?{deferChildStartup:()=>{childStartupHeld=true;return()=>{childStartupHeld=false;childStartup?.();}}}:{}),...(${JSON.stringify(mode)}==='context-ticket'?{contextsLoaded:()=>new NativePromise(resolve=>apply(nativeSetTimeout,initialWindow,[()=>{window.events.push('children-loaded');window.ticketSawGlobal=window.parentGlobal;resolve()},50]))}:{}),...(['context','context-ticket','context-classic-barrier'].includes(${JSON.stringify(mode)})?{prepareContext:(placeholder,descriptor)=>{callbackCount++;const facade=apply(nativeCreate,document,['http://www.w3.org/1999/xhtml','span']);facade.id='context-facade';apply(nativeReplace,placeholder.parentNode,[facade,placeholder]);if(${JSON.stringify(mode)}==='context-classic-barrier'){window.barrierBeforePrepare=childStartupHeld;childStartup=()=>{window.childSawGlobal=window.parentGlobal;window.events.push('child-start');apply(nativeDispatch,facade,[new NativeEvent('load')]);};if(!childStartupHeld)childStartup();}return facade;}}:{})});
renderer.prepare(rendered);
let captureChecks={privateDocuments:0,publicDocuments:0,urlReads:0,arrayCalls:0,arrayReplacementDenied:false,urlControl:0};
function tamperAfterPublication() {
  if(${JSON.stringify(mode)}!=='svg-captures')return ()=>{};
  const object=Object,reflect=Reflect,originalArray=Array,originalIsArray=Array.isArray;
  const rootProperty=object.getOwnPropertyDescriptor(Document.prototype,'documentElement');
  const protocol=object.getOwnPropertyDescriptor(URL.prototype,'protocol');
  object.defineProperty(Document.prototype,'documentElement',{...rootProperty,get(){if(this===initialDocument)captureChecks.publicDocuments++;else captureChecks.privateDocuments++;return apply(rootProperty.get,this,[])}});
  object.defineProperty(URL.prototype,'protocol',{...protocol,get(){captureChecks.urlReads++;return apply(protocol.get,this,[])}});
  new URL('https://control.invalid/').protocol;captureChecks.urlControl=captureChecks.urlReads;captureChecks.urlReads=0;
  try{reflect.set(window,'Array',new Proxy(originalArray,{get(target,key,receiver){if(key==='isArray')return value=>{captureChecks.arrayCalls++;return originalIsArray(value)};return reflect.get(target,key,receiver)}}));}catch{captureChecks.arrayReplacementDenied=true;}
  return ()=>{object.defineProperty(Document.prototype,'documentElement',rootProperty);object.defineProperty(URL.prototype,'protocol',protocol);reflect.set(window,'Array',originalArray);};
}
Object.defineProperty(window,'__activateTemplate',{value:(template,root)=>renderer.activateTemplate(template,root)});
committed.then(async()=>{if(${JSON.stringify(mode)}==='svg-publication'){const published=new NativePromise(resolve=>apply(nativeAdd,window,['message',event=>{if(event.source===nativeParent&&event.data==='published')resolve()}]));apply(nativePost,nativeParent,[{type:'renderer-guarded'},${JSON.stringify(origin)}]);await published;}const restore=tamperAfterPublication();try{await renderer.render(rendered);restore();window.__renderResult={done:true,callbackCount,sameDocument:document===initialDocument,sameWindow:window===initialWindow,sameAddress:location.href===initialAddress,sameController:apply(readController,container,[])===initialController,controlled:initialController!==null,captureChecks,manifestRetained:!retainedManifest||(retainedManifest.isConnected&&retainedManifest.parentNode===document.head),manifestRemovals};if(${JSON.stringify(mode)}==='svg-publication')apply(nativePost,nativeParent,[{type:'renderer-loaded'},${JSON.stringify(origin)}]);}catch(error){restore();window.__renderResult={done:false,error:error.message,callbackCount};}});
`,
      resolveDir: new URL('../', import.meta.url).pathname,
    },
    banner: { js: '"use strict";' },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
  });
  bundles.set(mode, built.outputFiles[0].text);
}
const results = {
  provenance: await testProvenance(import.meta.url),
  browsers: [] as object[],
};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.on('pageerror', (error) =>
        console.error(name, 'renderer pageerror', error.message),
      );
      await page.goto(origin + '/registration/');
      await page.evaluate(async () => {
        await navigator.serviceWorker.register('/service-worker.js');
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller)
          await new Promise<void>((resolve) =>
            navigator.serviceWorker.addEventListener(
              'controllerchange',
              () => resolve(),
              { once: true },
            ),
          );
      });
      await page.goto(origin + '/publication/');
      const publication = await page.evaluate(async (origin) => {
        const frame = document.createElement('iframe');
        frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
        const host = document.createElement('div');
        host.style.display = 'none';
        const hidden = host.attachShadow({ mode: 'closed' });
        document.body.append(host);
        const object = document.createElement('object');
        object.style.cssText = 'width:180px;height:140px';
        frame.src = origin + '/shell.svg?mode=svg-publication';
        return await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Object publication timeout')),
            8000,
          );
          addEventListener('message', (event) => {
            if (event.source !== frame.contentWindow) return;
            if (event.data?.type === 'renderer-guarded') {
              document.body.append(object);
              object.moveBefore(frame, null);
              host.remove();
              frame.contentWindow!.postMessage('published', origin);
            } else if (event.data?.type === 'renderer-loaded') {
              clearTimeout(timeout);
              const win = frame.contentWindow!;
              resolve({
                initial: Reflect.get(win, 'geometry'),
                loaded: Reflect.get(win, 'svgLoadGeometry'),
                later: (
                  frame.contentDocument!.getElementById(
                    'box',
                  ) as unknown as SVGRectElement
                ).getBBox().width,
                root: frame.contentDocument!.contentType,
              });
            }
          });
          hidden.append(frame);
        });
      }, origin);
      assert.deepEqual(publication, {
        initial: 40,
        loaded: 40,
        later: 40,
        root: 'image/svg+xml',
      });
      await page.goto(origin + '/?mode=html', { waitUntil: 'commit' });
      await page.waitForFunction(() => Reflect.get(window, '__renderResult'));
      const initial = await page.evaluate(() => ({
        result: Reflect.get(window, '__renderResult'),
        events: Reflect.get(window, 'events'),
        global: Reflect.get(window, 'externalGlobal'),
        module: Reflect.get(window, 'moduleValue'),
        moduleURL: Reflect.get(window, 'moduleURL'),
        bodyThis: Reflect.get(window, 'bodyLoadThis'),
        bodyAliases: Reflect.get(window, 'bodyLoadAliases'),
        json: JSON.parse(document.getElementById('json')?.textContent || 'null'),
        linkedShape: document
          .getElementById('linked-shape')
          ?.getAttributeNS('http://www.w3.org/1999/xlink', 'href'),
        templateRuns: Reflect.get(window, 'templateRuns'),
        noModuleExecuted: Reflect.get(window, 'noModuleExecuted'),
        syntheticLoadProbes: Reflect.get(window, 'syntheticLoadProbes'),
        contexts: document.querySelectorAll('iframe,object').length,
        privateConstructorCalls: Reflect.get(window, 'privateConstructorCalls'),
        bindingReplacementsDenied: Reflect.get(window, 'bindingReplacementsDenied'),
        bindingReplacementsAccepted: Reflect.get(window, 'bindingReplacementsAccepted'),
        privateReflectCalls: Reflect.get(window, 'privateReflectCalls'),
        privateQueryCalls: Reflect.get(window, 'privateQueryCalls'),
      }));
      assert.equal(initial.result.done, true);
      assert.equal(initial.result.manifestRetained, true);
      assert.equal(initial.result.manifestRemovals, 0);
      for (const key of [
        'sameDocument',
        'sameWindow',
        'sameAddress',
        'sameController',
        'controlled',
      ])
        assert.equal(initial.result[key], true, key);
      assert.equal(initial.global, 42);
      assert.equal(initial.module, 13);
      assert.equal(initial.moduleURL, publisher + 'index.html');
      assert.equal(initial.bodyThis, true);
      assert.equal(initial.bodyAliases, true);
      assert.equal(initial.templateRuns, undefined);
      assert.equal(initial.noModuleExecuted, undefined);
      assert(initial.syntheticLoadProbes >= 1);
      assert.equal(initial.contexts, 0);
      assert.equal(initial.privateConstructorCalls, 0);
      assert.deepEqual(initial.bindingReplacementsDenied, {
        Map: true,
        Promise: true,
        Reflect: true,
      });
      assert.deepEqual(initial.bindingReplacementsAccepted, {
        Map: false,
        Promise: false,
        Reflect: false,
      });
      assert.equal(initial.privateReflectCalls, 0);
      assert.equal(initial.privateQueryCalls, 0);
      assert.deepEqual(initial.json, { value: 42 });
      assert(initial.events.indexOf('external') < initial.events.indexOf('defer'));
      assert(initial.events.indexOf('defer') < initial.events.indexOf('module'));
      assert(
        initial.events.indexOf('module') < initial.events.indexOf('DOMContentLoaded'),
      );
      assert(
        initial.events.indexOf('DOMContentLoaded') < initial.events.indexOf('body-load'),
      );
      assert(initial.events.indexOf('async') < initial.events.indexOf('body-load'));
      assert.equal(
        initial.events.filter((value) => value === 'DOMContentLoaded').length,
        1,
      );
      assert.equal(initial.events.filter((value) => value === 'window-load').length, 1);
      await page.locator('#action').click();
      assert.deepEqual(
        await page.evaluate(() => ({
          alias: Reflect.get(window, 'handlerAliases'),
          self: Reflect.get(window, 'handlerThis'),
        })),
        { alias: true, self: 'action' },
      );
      const activated = await page.evaluate(async () => {
        const template = document.getElementById('dormant') as HTMLTemplateElement;
        const target = document.createElement('section');
        target.appendChild(template.content.cloneNode(true));
        document.body.append(target);
        await Reflect.get(window, '__activateTemplate')(template, target);
        (target.querySelector('button') as HTMLButtonElement).click();
        let denied = false;
        const pending = document.getElementById(
          'context-template',
        ) as HTMLTemplateElement;
        const holder = document.createElement('section');
        holder.append(pending.content.cloneNode(true));
        document.body.append(holder);
        try {
          await Reflect.get(window, '__activateTemplate')(pending, holder);
        } catch {
          denied = true;
        }
        return {
          runs: Reflect.get(window, 'templateRuns'),
          click: Reflect.get(window, 'templateClick'),
          contextDenied: denied,
          rawContexts: document.querySelectorAll('iframe,object').length,
        };
      });
      assert.deepEqual(activated, {
        runs: 1,
        click: true,
        contextDenied: true,
        rawContexts: 0,
      });
      await page.goto(origin + '/shell.svg?mode=svg', { waitUntil: 'commit' });
      await page.waitForFunction(() => Reflect.get(window, '__renderResult'));
      const vector = await page.evaluate(() => ({
        result: Reflect.get(window, '__renderResult'),
        type: document.contentType,
        namespace: document.documentElement.namespaceURI,
        root: document.documentElement instanceof SVGSVGElement,
        geometry: Reflect.get(window, 'geometry'),
        handler: Reflect.get(window, 'svgHandler'),
        inlineThis: Reflect.get(window, 'svgInlineThis'),
        events: Reflect.get(window, 'events'),
        x: (document.getElementById('box') as unknown as SVGRectElement).x.animVal.value,
        json: JSON.parse(document.getElementById('json')?.textContent || 'null'),
        linkedShape: document
          .getElementById('linked-shape')
          ?.getAttributeNS('http://www.w3.org/1999/xlink', 'href'),
      }));

      assert.equal(vector.result.done, true);
      assert.equal(vector.type, 'image/svg+xml');
      assert.equal(vector.root, true);
      assert.equal(vector.linkedShape, '#box');
      assert.equal(vector.geometry, 40);
      assert.equal(vector.inlineThis, true);
      assert.deepEqual(vector.handler, { target: true, self: true, alias: true });
      assert.equal(vector.events.filter((value) => value === 'svg-load').length, 1);
      assert.equal(vector.events.at(-1), 'window-load');
      await page.locator('#svg-action').click();
      assert.equal(await page.evaluate(() => Reflect.get(window, 'svgClick')), true);
      await page.waitForTimeout(100);
      const animated = await page.evaluate(
        () =>
          (document.getElementById('box') as unknown as SVGRectElement).x.animVal.value,
      );
      assert.notEqual(animated, vector.x);
      await page.goto(origin + '/shell.svg?mode=svg-captures', { waitUntil: 'commit' });
      await page.waitForFunction(() => Reflect.get(window, '__renderResult'));
      const afterPublicationCaptures = await page.evaluate(() =>
        Reflect.get(window, '__renderResult'),
      );
      assert.equal(afterPublicationCaptures.done, true);
      assert.equal(afterPublicationCaptures.captureChecks.privateDocuments, 0);
      assert(afterPublicationCaptures.captureChecks.publicDocuments > 0);
      assert.equal(afterPublicationCaptures.captureChecks.urlControl, 1);
      assert.equal(afterPublicationCaptures.captureChecks.urlReads, 0);
      assert.equal(afterPublicationCaptures.captureChecks.arrayCalls, 0);
      assert.equal(afterPublicationCaptures.captureChecks.arrayReplacementDenied, true);
      const controls = [];
      const beforeUnavailable = unavailableRequests;
      await page.goto(origin + '/?mode=unavailable', { waitUntil: 'commit' });
      await page.waitForFunction(() => Reflect.get(window, '__renderResult'));
      const unavailable = await page.evaluate(() => ({
        result: Reflect.get(window, '__renderResult'),
        events: Reflect.get(window, 'events') as string[],
      }));
      assert.equal(unavailable.result.done, true);
      assert.equal(unavailableRequests, beforeUnavailable);
      for (const name of ['classic-error', 'async-error', 'defer-error', 'module-error'])
        assert.equal(unavailable.events.filter((event) => event === name).length, 1);
      assert(!unavailable.events.some((event) => event.startsWith('unexpected')));
      assert(
        unavailable.events.indexOf('classic-error') <
          unavailable.events.indexOf('after-classic'),
      );
      assert(
        unavailable.events.indexOf('defer-error') <
          unavailable.events.indexOf('DOMContentLoaded'),
      );
      assert(
        unavailable.events.indexOf('module-error') <
          unavailable.events.indexOf('DOMContentLoaded'),
      );
      await page.goto(origin + '/native-unavailable.html');
      await page.waitForFunction(() =>
        ['classic-error', 'async-error', 'defer-error', 'module-error'].every((name) =>
          Reflect.get(window, 'events')?.includes(name),
        ),
      );
      assert(
        unavailableRequests > beforeUnavailable,
        'Native missing scripts must reach the receiver',
      );
      controls.push({
        mode: 'unavailable',
        ...unavailable,
        nativeRequests: unavailableRequests - beforeUnavailable,
      });
      for (const mode of [
        'context',
        'missing-adapter',
        'malformed',
        'raw-script',
        'raw-frame',
        'executable-url',
      ]) {
        await page.goto(origin + '/?mode=' + mode, { waitUntil: 'commit' });
        await page.waitForFunction(() => Reflect.get(window, '__renderResult'));
        if (mode === 'context')
          await page.evaluate(() =>
            document.getElementById('context-facade')!.dispatchEvent(new Event('load')),
          );
        const result = await page.evaluate(() => ({
          result: Reflect.get(window, '__renderResult'),
          ran: Reflect.get(window, 'contextAppRan'),
          rawContexts: document.querySelectorAll('iframe,object').length,
          facade: !!document.getElementById('context-facade'),
          facadeHandler: Reflect.get(window, 'contextFacadeLoad'),
        }));
        assert.equal(result.rawContexts, 0);
        if (mode === 'raw-script' || mode === 'raw-frame')
          assert.match(result.result.error, /not passive/);
        if (mode === 'executable-url')
          assert.match(result.result.error, /Executable content URL/);
        assert.equal(result.result.done, mode === 'context');
        assert.equal(result.ran, mode === 'context' ? true : undefined);
        assert.equal(result.facadeHandler, mode === 'context' ? true : undefined);
        controls.push({ mode, ...result });
      }
      await page.goto(origin + '/native.html');
      const nativeHTML = await page.evaluate(() => ({
        bindingReplacementsAccepted: Reflect.get(window, 'bindingReplacementsAccepted'),
        bindingReplacementsDenied: Reflect.get(window, 'bindingReplacementsDenied'),
        privateConstructorCalls: Reflect.get(window, 'privateConstructorCalls'),
        events: Reflect.get(window, 'events'),
        global: Reflect.get(window, 'externalGlobal'),
        module: Reflect.get(window, 'moduleValue'),
        bodyThis: Reflect.get(window, 'bodyLoadThis'),
      }));
      assert.deepEqual(initial.events, nativeHTML.events);
      assert.equal(nativeHTML.global, 42);
      assert.equal(nativeHTML.module, 13);
      assert.equal(nativeHTML.bodyThis, true);
      assert.deepEqual(nativeHTML.bindingReplacementsAccepted, {
        Map: true,
        Promise: true,
        Reflect: true,
      });
      assert.deepEqual(nativeHTML.bindingReplacementsDenied, {
        Map: false,
        Promise: false,
        Reflect: false,
      });
      assert.equal(
        nativeHTML.privateConstructorCalls,
        1,
        'Native Map replacement trap was inactive',
      );
      await page.goto(origin + '/native.svg');
      const nativeSVG = await page.evaluate(() => ({
        type: document.contentType,
        geometry: Reflect.get(window, 'geometry'),
        handler: Reflect.get(window, 'svgHandler'),
        inlineThis: Reflect.get(window, 'svgInlineThis'),
        events: Reflect.get(window, 'events'),
      }));
      assert.equal(nativeSVG.geometry, 40);
      assert.equal(nativeSVG.inlineThis, true);
      assert.deepEqual([...nativeSVG.events].sort(), [...vector.events].sort());
      assert.deepEqual(nativeSVG.handler, vector.handler);
      await page.goto(origin + '/?mode=context-ticket', { waitUntil: 'commit' });
      await page.waitForFunction(() => Reflect.get(window, '__renderResult'));
      const childTicket = await page.evaluate(() => ({
        result: Reflect.get(window, '__renderResult'),
        events: Reflect.get(window, 'events'),
        parentGlobal: Reflect.get(window, 'ticketSawGlobal'),
      }));
      assert.equal(childTicket.result.done, true);
      assert.equal(childTicket.parentGlobal, 42);
      assert.deepEqual(childTicket.events, [
        'parent-code',
        'DOMContentLoaded',
        'children-loaded',
        'window-load',
      ]);
      await page.goto(origin + '/native-ticket.html');
      const nativeChildTicket = await page.evaluate(() => ({
        events: Reflect.get(window, 'events'),
        parentGlobal: Reflect.get(window, 'ticketSawGlobal'),
      }));
      assert.deepEqual(nativeChildTicket.events, childTicket.events);
      assert.equal(nativeChildTicket.parentGlobal, 42);
      await page.goto(origin + '/?mode=context-classic-barrier', { waitUntil: 'commit' });
      await page.waitForFunction(
        () => Reflect.get(window, '__renderResult'),
        {},
        { timeout: 8000 },
      );
      const classicBarrier = await page.evaluate(() => ({
        result: Reflect.get(window, '__renderResult'),
        beforePreparation: Reflect.get(window, 'barrierBeforePrepare'),
        childGlobal: Reflect.get(window, 'childSawGlobal'),
        events: Reflect.get(window, 'events'),
      }));
      assert.equal(classicBarrier.result.done, true);
      assert.equal(classicBarrier.beforePreparation, true);
      assert.equal(classicBarrier.childGlobal, 42);
      assert.deepEqual(classicBarrier.events, [
        'parent-classic',
        'child-start',
        'child-load',
        'module-start',
        'module-complete',
      ]);
      const topLevelAwait = [];
      for (const mode of tlaModes) {
        await page.goto(origin + '/?mode=' + mode, { waitUntil: 'commit' });
        await page.waitForFunction(
          () => Reflect.get(window, '__renderResult') && Reflect.get(window, 'tlaDone'),
          {},
          { timeout: 8000 },
        );
        const mediated = await page.evaluate(() => ({
          result: Reflect.get(window, '__renderResult'),
          events: Reflect.get(window, 'events'),
        }));
        assert.equal(mediated.result.done, true);
        await page.goto(origin + '/native-tla.html?case=' + mode, {
          waitUntil: 'commit',
        });
        await page.waitForFunction(
          () => Reflect.get(window, 'tlaDone'),
          {},
          { timeout: 8000 },
        );
        const native = await page.evaluate(() => Reflect.get(window, 'events'));
        assert.deepEqual(mediated.events, native, mode);
        assert.equal(native.includes('module-load'), mode.includes('external'));
        topLevelAwait.push({ mode, mediated, native });
      }
      results.browsers.push({
        name,
        version: browser.version(),
        initial,
        publication,
        activated,
        vector,
        animated,
        controls,
        nativeHTML,
        nativeSVG,
        afterPublicationCaptures,
        topLevelAwait,
        childTicket,
        nativeChildTicket,
        classicBarrier,
      });
      await context.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    'results/contexts/document-renderer.json',
    JSON.stringify(results, null, 2) + '\n',
  );
}
console.log('Committed HTML/native SVG document rendering passed both browsers.');
