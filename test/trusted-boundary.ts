import { SCRIPT_URL_CSP } from '../src/shared/script-url-policy.ts';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { build } from './build.ts';
import { launch } from './browser-profile.ts';

// Bootstrap is bundled; the application below is served verbatim as a separate
// classic script. Nothing publishes the returned policy, frame or private call.
const bootstrap = await build({
  stdin: {
    loader: 'ts',
    resolveDir: process.cwd(),
    contents: `
      import {prepareWindowRealm} from './src/runtime/contexts/window-realm.ts';
      import {createTrustedContext} from './src/runtime/trusted/context.ts';
      const transport=createTrustedContext('(operation, serialized)=>{if(operation==="throw")throw new Error("private");if(operation==="object")return [];if(operation==="function")return ()=>1;return serialized}');
      const transportResult={primitive:transport('echo','text')==='text',foreignErrorLocal:false,objectRejected:false,functionRejected:false,nontextRejected:false,noCoercion:false};
      for(const operation of ['throw','object','function']){
        try{transport(operation,'')}catch(error){
          if(operation==='throw')transportResult.foreignErrorLocal=error instanceof Error && Object.getPrototypeOf(error)===Error.prototype && error.message==='Trusted computation failed';
          else transportResult[operation+'Rejected']=error instanceof TypeError;
        }
      }
      let coerced=0;
      try{Reflect.apply(transport,undefined,['echo',{toString(){coerced++;return 'text'}}])}catch(error){transportResult.nontextRejected=error instanceof TypeError}
      transportResult.noCoercion=coerced===0;
      document.getElementById('transport').textContent=JSON.stringify(transportResult);
      const applicationURL=new URL('/installed/',location.href).href;
      prepareWindowRealm({application:'boundary',applicationURL,scriptNonce:'fixture',enableDocumentContexts:true});
    `,
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
});
const application = String.raw`
let applicationLexical = 42;
var result = {
  nativeLexical:Function('return applicationLexical')()===42,
  windowIdentity:globalThis===window && window===self,
  coercions:0,callbackArguments:0,foreignObjects:0,foreignCallables:0,
  callbackWindows:0,denied:0,errorsLocal:true,stackHooksProtected:false,
  inspectedObjects:0,arrayHookHits:0,localArrayControl:false,
  noPrivateFrames:window.length===0 && document.querySelectorAll('iframe').length===0,
  unexpectedFrameInsertions:0
};
const inspect = value => {
  if(value===null || (typeof value!=='object' && typeof value!=='function'))return;
  result.inspectedObjects++;
  if(typeof value==='function') {
    if(!(value instanceof Function))result.foreignCallables++;
    return;
  }
  if(value instanceof Window){if(value!==window)result.callbackWindows++;return;}
  if(Array.isArray(value)) {
    if(!(value instanceof Array))result.foreignObjects++;
    return;
  }
  if(value instanceof Error || value instanceof DOMException)return;
  const prototype=Object.getPrototypeOf(value);
  if(prototype && !(value instanceof Object))result.foreignObjects++;
};
const observed = new MutationObserver(records=>{
  for(const record of records)for(const node of record.addedNodes)
    if(node.nodeType===1 && (node.localName==='iframe' || node.querySelector?.('iframe')))
      result.unexpectedFrameInsertions++;
});
observed.observe(document.documentElement,{subtree:true,childList:true});
const originalLower=String.prototype.toLowerCase;
const originalTrim=String.prototype.trim;
const define=Object.defineProperty;
const remove=Reflect.deleteProperty;
const stringify=JSON.stringify;
const rawArrayDescriptor=Object.getOwnPropertyDescriptor(Array.prototype,'0');
function callbackProbe(){
  result.coercions++;
  inspect(this);
  for(const argument of arguments){result.callbackArguments++;inspect(argument)}
  try{inspect(callbackProbe.caller)}catch{}
  return '<p data-result="safe">Ordinary <b>markup</b></p>';
}
const holder=document.createElement('section');document.body.appendChild(holder);
try {
  define(Array.prototype,'0',{configurable:true,set(value){
    result.arrayHookHits++;inspect(this);inspect(value);
    define(this,'0',{value,writable:true,enumerable:true,configurable:true});
  }});
  const array=[];array[0]={local:true};result.localArrayControl=result.arrayHookHits>0;
  String.prototype.toLowerCase=function(){inspect(this);return 'attacker-normalized'};
  String.prototype.trim=function(){inspect(this);return ''};
  holder.innerHTML={toString:callbackProbe};
  holder.insertAdjacentHTML('beforeend','<span>Second fragment</span>');
  const range=document.createRange();range.selectNodeContents(holder);
  try{range.createContextualFragment('<em>Range fragment</em>')}catch(error){result.rangeBlocked=error instanceof Error || error instanceof DOMException;inspect(error)}
  const extra=document.createElement('em');extra.textContent='Native node';holder.appendChild(extra);
  const inert=new DOMParser().parseFromString('<p>Inert document</p>','text/html');
  result.inertNative=inert instanceof Document && inert.querySelector('p').textContent==='Inert document';
  for(const markup of [
    '<p data-privacy-document="forged">Reserved marker</p>',
    '<img onerror="globalThis.unexpectedHandler=true">',
    '<meta http-equiv="refresh" content="0;url=https://example.invalid/">'
  ]) {
    try{holder.innerHTML=markup}
    catch(error){
      result.denied++;inspect(error);
      result.errorsLocal=result.errorsLocal && (error instanceof Error || error instanceof DOMException);
      // Inspect own data values only; an Error stack is text rather than foreign CallSites.
      for(const key of Reflect.ownKeys(error)){
        const property=Object.getOwnPropertyDescriptor(error,key);
        if(property && 'value' in property)inspect(property.value);
      }
      const stack=error.stack;
      result.errorsLocal=result.errorsLocal && (stack===undefined || typeof stack==='string');
    }
  }
  try{
    define(Error,'prepareStackTrace',{configurable:true,value(error,sites){inspect(error);inspect(sites);return sites;}});
  }catch{result.stackHooksProtected=true}
} finally {
  String.prototype.toLowerCase=originalLower;String.prototype.trim=originalTrim;
  if(rawArrayDescriptor)define(Array.prototype,'0',rawArrayDescriptor);else remove(Array.prototype,'0');
}
result.ordinaryMarkup=holder.querySelector('[data-result=safe]')?.textContent==='Ordinary markup' &&
  holder.querySelector('em')?.textContent==='Native node';
result.nativeWasm=new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]))) instanceof WebAssembly.Instance;
Array.prototype.applicationExtension=function(){return this.length};
result.nativePrototypeExtension=[1,2].applicationExtension()===2;
const field=document.createElement('input');field.type='checkbox';document.body.appendChild(field);
field.addEventListener('click',function(event){
  result.eventThis=this===field;result.eventTarget=event.target===field;
  result.eventNative=event instanceof MouseEvent;event.preventDefault();
});
field.click();result.cancelledSynchronously=!field.checked;
// This observer starts after bootstrap, as application code does in production.
Promise.resolve().then(()=>{
  observed.disconnect();
  for(const name of Object.getOwnPropertyNames(window)){
    const property=Object.getOwnPropertyDescriptor(window,name);
    if(property && 'value' in property)inspect(property.value);
  }
  result.noPrivateFrames=result.noPrivateFrames && window.length===0 && document.querySelectorAll('iframe').length===0;
  document.getElementById('receipt').textContent=stringify(result);
});
`;
// Native control deliberately exposes a foreign frame/error/array/function. This
// confirms the distinction used by the guarded probe instead of only counting 0.
const control = String.raw`
const f=document.createElement('iframe');document.body.appendChild(f);
const w=f.contentWindow;
const foreignArray=new w.Array();const foreignError=new w.Error('foreign');
const foreignFunction=w.Function('return globalThis');
document.getElementById('receipt').textContent=JSON.stringify({
  frameVisible:window.length===1 && document.querySelector('iframe')===f,
  foreignArray:Array.isArray(foreignArray) && !(foreignArray instanceof Array),
  foreignError:!(foreignError instanceof Error),
  foreignFunction:Object.getPrototypeOf(foreignFunction)!==Function.prototype,
  recoveredWindow:foreignFunction()===w
});
`;
const server = http.createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'text/html');
  if (request.url === '/bootstrap.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(bootstrap.outputFiles[0].text);
  } else if (request.url === '/application.js' || request.url === '/control.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(request.url === '/application.js' ? application : control);
  } else {
    const guarded = request.url !== '/control';
    response.setHeader(
      'Content-Security-Policy',
      "sandbox allow-scripts allow-same-origin; default-src 'none'; " +
        "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' 'nonce-fixture'; " +
        "style-src 'unsafe-inline'; connect-src 'none'; frame-src 'self'; " +
        (guarded ? SCRIPT_URL_CSP : ''),
    );
    response.end(
      '<!doctype html><body><pre id="transport"></pre><pre id="receipt"></pre>' +
        (guarded ? '<script nonce="fixture" src="/bootstrap.js"></script>' : '') +
        `<script nonce="fixture" src="/${guarded ? 'application' : 'control'}.js"></script>`,
    );
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const rows: unknown[] = [];
let failed = false;
try {
  for (const engine of [chromium, firefox]) {
    const browser = await launch(engine);
    const errors: string[] = [];
    try {
      const page = await browser.newPage();
      page.on('pageerror', (error) => {
        errors.push(error.message);
        console.error(engine.name(), error.message);
      });
      await page.goto(origin + '/control');
      const native = JSON.parse(await page.locator('#receipt').innerText());
      for (const value of Object.values(native)) assert.equal(value, true);
      await page.goto(origin + '/installed/');
      await page.waitForFunction(
        () => document.getElementById('receipt')?.textContent,
        undefined,
        { timeout: 15000 },
      );
      const result = JSON.parse(await page.locator('#receipt').innerText());
      const transport = JSON.parse(await page.locator('#transport').innerText());
      for (const [key, value] of Object.entries(transport))
        assert.equal(value, true, key);
      assert.deepEqual(errors, []);
      for (const key of [
        'rangeBlocked',
        'nativeLexical',
        'windowIdentity',
        'localArrayControl',
        'noPrivateFrames',
        'errorsLocal',
        'stackHooksProtected',
        'inertNative',
        'ordinaryMarkup',
        'nativeWasm',
        'nativePrototypeExtension',
        'eventThis',
        'eventTarget',
        'eventNative',
        'cancelledSynchronously',
      ])
        assert.equal(result[key], true, key);
      for (const key of [
        'foreignObjects',
        'foreignCallables',
        'callbackWindows',
        'unexpectedFrameInsertions',
      ])
        assert.equal(result[key], 0, key);
      assert(result.coercions > 0);
      assert(result.inspectedObjects > 0);
      assert.equal(result.denied, 3);
      rows.push({
        browser: engine.name(),
        version: browser.version(),
        passed: true,
        native,
        transport,
        result,
        errors,
      });
    } catch (error) {
      failed = true;
      rows.push({
        browser: engine.name(),
        version: browser.version(),
        passed: false,
        error: String(error),
        errors,
      });
    } finally {
      await browser.close();
    }
    console.log(JSON.stringify(rows.at(-1)));
  }
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const hashes: Record<string, string> = {};
  for (const path of [
    'test/trusted-boundary.ts',
    'src/runtime/trusted/context.ts',
    'src/runtime/trusted/client.ts',
    'src/runtime/trusted/entry.ts',
    'src/runtime/trusted/fragment.ts',
  ])
    hashes[path] = createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
  await mkdir('results/trusted-runtime', { recursive: true });
  await writeFile(
    'results/trusted-runtime/boundary.json',
    JSON.stringify(
      {
        revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        testedAt: new Date().toISOString(),
        hashes,
        scope:
          'Actual prepareWindowRealm with detached-frame private computation and separately served native application script. Tests callbacks, coercion, local/foreign errors, prototype hooks and frame visibility. No receiver or network-confinement claim; native ShadowRealm backend tested separately by computation fixture.',
        rows,
      },
      null,
      2,
    ) + '\n',
  );
}
if (failed) process.exitCode = 1;
