import { SCRIPT_URL_CSP } from '../src/shared/script-url-policy.ts';
import assert from 'node:assert/strict';
import http from 'node:http';
import { build } from './build.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';
import { testProvenance } from './provenance.ts';

const traffic: string[] = [];
const receiver = http.createServer((request, response) => {
  traffic.push(request.url || '/');
  response.setHeader('Content-Type', 'text/html');
  response.end(
    '<!doctype html><link rel="icon" href="data:,"><title>Native context receiver</title>',
  );
});
await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
const receiverAddress = receiver.address();
if (!receiverAddress || typeof receiverAddress === 'string')
  throw new Error('Missing receiver address');
const outside = 'http://127.0.0.1:' + receiverAddress.port;
const bundles = new Map<string, string>();
for (const guarded of [false, true]) {
  const built = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
import {prepareScriptURLs} from './src/runtime/enforcement/script-urls.ts';
import {prepareRuntimeIntrinsics} from './src/runtime/intrinsics.ts';
import {createPolicyTools} from './src/runtime/enforcement/native.ts';import {createTrustedPolicy} from './src/runtime/trusted/client.ts';
import {installDOMPolicy} from './src/runtime/enforcement/dom.ts';
import {validateMarkup} from './src/shared/markup.ts';
const rawCreate=Document.prototype.createElementNS,rawInner=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML').set,rawAppend=Node.prototype.appendChild,apply=Reflect.apply,define=Object.defineProperty,remove=Reflect.deleteProperty,originalLower=String.prototype.toLowerCase,originalTrim=String.prototype.trim;
const capturedString=JSON.stringify;
if(${guarded}){prepareScriptURLs();const policy=createTrustedPolicy(location.href);prepareRuntimeIntrinsics();const tools=createPolicyTools();installDOMPolicy(tools,Element.prototype.getAttribute,policy);}
window.probeNativeMarkup=()=>{
  const xml=document.contentType==='image/svg+xml';
  const holder=xml?document.getElementById('holder'):apply(rawCreate,document,['http://www.w3.org/1999/xhtml','div']);
  if(!xml)apply(rawAppend,document.body,[holder]);
  const target='<a target="_blank" href="${outside}/target-control">Link</a>';
  const context='<foreignObject><h:iframe src="${outside}/context-control"></h:iframe></foreignObject>';
  if(!${guarded}){apply(rawInner,holder,[xml?context:target]);if(!xml)holder.querySelector('a').click();return capturedString({control:true});}
  let hooks=0,domReferences=0,astBypasses=0,denied=0;
  define(Array.prototype,'0',{configurable:true,set(value){hooks++;if(value instanceof Node)domReferences++;else if(value&&typeof value==='object'){
    if(value.name==='target'||value.name==='formtarget'||value.name==='srcdoc')value.name='data-disabled';
    if(typeof value.tagName==='string'&&value.tagName.indexOf(':')>=0){value.tagName='g';value.nodeName='g';}
  }define(this,'0',{value,writable:true,enumerable:true,configurable:true});}});
  const rejected=source=>{try{validateMarkup(source);astBypasses++;}catch{}try{holder.innerHTML=source;}catch{denied++;}};
  try{
    rejected(target);
    if(xml)rejected(context);
    rejected('<svg><a target="_blank"></a></svg>');
    rejected('<svg><set attributeName="target" to="_blank"></set></svg>');
    rejected('<template><a target="_blank"></a></template>');
  }finally{remove(Array.prototype,'0');}
  String.prototype.toLowerCase=()=> 'safe';String.prototype.trim=()=> '';
  let stringDenied=false;
  try{try{holder.innerHTML='<a target="_blank">Unsafe</a>';}catch{stringDenied=true;}
    holder.innerHTML=xml?'<rect width="12" height="8" fill="red" />':'<p data-proof="ordinary"><b>Safe content</b></p><style>p{color:rgb(12,34,56)}</style>';
  }finally{String.prototype.toLowerCase=originalLower;String.prototype.trim=originalTrim;}
  const positive=xml?holder.querySelector('rect')?.getAttribute('width')==='12':holder.querySelector('p')?.textContent==='Safe content';
  return capturedString({hooks,domReferences,astBypasses,denied,stringDenied,positive,rawFrames:holder.querySelectorAll('iframe').length});
};
`,
    },
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
  });
  bundles.set(guarded ? 'guarded' : 'native', built.outputFiles[0].text);
}
const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://fixture.invalid');
  const mode = url.searchParams.get('mode') || 'guarded';
  if (url.pathname === '/fixture.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(bundles.get(mode));
    return;
  }
  const svg = url.pathname.endsWith('.svg');
  response.setHeader('Content-Type', svg ? 'image/svg+xml' : 'text/html');
  response.setHeader(
    'Content-Security-Policy',
    "default-src * data: blob:;script-src 'self' 'unsafe-eval' 'unsafe-inline';style-src 'unsafe-inline';frame-src *;connect-src *;" +
      (mode === 'guarded' ? SCRIPT_URL_CSP : ''),
  );
  response.end(
    svg
      ? `<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml"><script href="/fixture.js?mode=${mode}"/><g id="holder"/></svg>`
      : `<!doctype html><body><script src="/fixture.js?mode=${mode}"></script></body>`,
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Missing fixture address');
const origin = 'http://127.0.0.1:' + address.port;
const evidence = {
  provenance: await testProvenance(import.meta.url),
  browsers: [] as unknown[],
};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.on('pageerror', (error) => console.error(`${name}: ${error.message}`));
      const rows = [];
      for (const xml of [false, true]) {
        const route = xml ? '/fixture.svg' : '/fixture.html';
        const start = traffic.length;
        await page.goto(origin + route + '?mode=native');
        await page.evaluate(() => Reflect.get(window, 'probeNativeMarkup')());
        await expectTraffic(xml ? '/context-control' : '/target-control', start);
        for (const popup of context.pages()) if (popup !== page) await popup.close();
        const guardedStart = traffic.length;
        await page.goto(origin + route + '?mode=guarded');
        const result = JSON.parse(
          await page.evaluate(() => Reflect.get(window, 'probeNativeMarkup')()),
        );
        assert(result.hooks > 0, 'Hostile array accessor must run inside the parser');
        assert(
          result.astBypasses > 0,
          'The parser-only validation control must be bypassed',
        );
        assert.equal(
          result.domReferences,
          0,
          'Parser callback exposed a native DOM reference',
        );
        assert.equal(result.denied, xml ? 5 : 4);
        assert.equal(result.stringDenied, true);
        assert.equal(result.positive, true);
        assert.equal(result.rawFrames, 0);
        await page.waitForTimeout(150);
        assert.deepEqual(traffic.slice(guardedStart), []);
        rows.push({ xml, ...result, nativeRequests: traffic.slice(start, guardedStart) });
      }
      evidence.browsers.push({ name, version: browser.version(), rows });
      console.log(name, 'native HTML/XML validation rejects parser-hook mutations');
      await context.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  receiver.closeAllConnections();
  await Promise.all([
    new Promise<void>((resolve) => server.close(() => resolve())),
    new Promise<void>((resolve) => receiver.close(() => resolve())),
  ]);
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    'results/contexts/native-markup.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
}
async function expectTraffic(path: string, start: number) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if (traffic.slice(start).includes(path)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('Native context failed to reach receiver: ' + path);
}
