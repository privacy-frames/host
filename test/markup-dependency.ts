import { SCRIPT_URL_CSP } from '../src/shared/script-url-policy.ts';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';
import { testProvenance } from './provenance.ts';

const cases = [
  { name: 'ordinary HTML', text: '<p class="message"><b>hello</b></p>' },
  {
    name: 'inline CSS',
    text: '<p style="color:red">hello</p><style>p{color:red}</style>',
  },
  { name: 'template', text: '<template><span data-id="x">hello</span></template>' },
  {
    name: 'custom element',
    text: '<custom-editor data-model="one" mode="edit"></custom-editor>',
  },
  { name: 'self target', text: '<a href="#local" target="_self">hello</a>' },
  { name: 'blob image', text: '<img src="blob:https://runtime.example/fixture">' },
  {
    name: 'blob audio',
    text: '<audio src="blob:https://runtime.example/fixture" controls></audio>',
  },
  { name: 'SVG geometry', text: '<svg><rect width="10" height="20" fill="red"/></svg>' },
  {
    name: 'SVG foreign content',
    text: '<svg><foreignObject width="10" height="20"><p>text</p></foreignObject></svg>',
  },
  {
    name: 'SVG animation',
    text: '<svg><rect width="10"><animate attributeName="width" from="10" to="20" dur="1s"/></rect></svg>',
  },
  { name: 'table fragment', context: 'tbody', text: '<tr><td>cell</td></tr>' },
  {
    name: 'select fragment',
    context: 'select',
    text: '<option value="one">One</option>',
  },
  {
    name: 'event attribute',
    unsafe: true,
    text: '<img src="x" onerror="globalThis.executed=true">',
  },
  { name: 'executable URL', unsafe: true, text: '<a href="javascript:alert(1)">bad</a>' },
  {
    name: 'popup target',
    unsafe: true,
    text: '<a href="https://receiver.example/" target="_blank">bad</a>',
  },
  {
    name: 'declarative target',
    unsafe: true,
    text: '<svg><set attributeName="target" to="_blank"/></svg>',
  },
  {
    name: 'nested context',
    unsafe: true,
    text: '<iframe srcdoc="<script>bad()</script>"></iframe>',
  },
  {
    name: 'resource hint',
    unsafe: true,
    text: '<link rel="dns-prefetch" href="https://receiver.example/">',
  },
  {
    name: 'policy metadata',
    unsafe: true,
    text: '<meta http-equiv="refresh" content="0;url=https://receiver.example/">',
  },
  {
    name: 'namespace mutation',
    unsafe: true,
    text: '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
  },
];
const candidate = await build({
  stdin: {
    contents: `import {sanitize,sanitizeContext} from './test/dependency/markup-policy.ts';
      globalThis.candidate=(operation,input)=>{
        try {
        if(operation==='context'){const p=JSON.parse(input);return JSON.stringify(sanitizeContext(p.text,p.localName,p.namespace));}
        return JSON.stringify(sanitize(input,operation==='host'));
        } catch(error) { return JSON.stringify({fixtureFailure:String(error),stack:error.stack}); }
      };`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
});
const fixture = await build({
  stdin: {
    contents: `import {createTrustedContext} from './src/runtime/trusted/context.ts';
      import {prepareScriptURLs} from './src/runtime/enforcement/script-urls.ts';
      prepareScriptURLs();
      import {validateMarkup} from './src/shared/markup.ts';
      const source=${JSON.stringify(candidate.outputFiles[0].text)};
      const call=createTrustedContext('(()=>{'+source+';return globalThis.candidate})()');
      globalThis.poisonCandidate=()=>{
        const baseline=call('host','<p>safe</p>');
        const saved=[Array.prototype,Map.prototype,String.prototype].map((owner,index)=>[owner,['map','get','toLowerCase'][index],Object.getOwnPropertyDescriptor(owner,['map','get','toLowerCase'][index])]);
        const define=Object.defineProperty;
        try{for(const [owner,key] of saved)define(owner,key,{configurable:true,value:()=>{throw Error('App prototype callback')}});
          return call('host','<p>safe</p>')===baseline;
        }finally{for(const [owner,key,desc] of saved)define(owner,key,desc)}
      };
      globalThis.probe=(item)=>{
        let oldAccepted=true,oldError;
        try{validateMarkup(item.text)}catch(error){oldAccepted=false;oldError=error.message}
        function snapshot(text){const root=document.createElement(item.context||'div');root.innerHTML=text;return root.innerHTML}
        const original=snapshot(item.text),defaults=JSON.parse(call('default',item.text)),host=JSON.parse(call('host',item.text));
        const contextual=JSON.parse(call('context',JSON.stringify({text:item.text,localName:item.context||'div',namespace:'http://www.w3.org/1999/xhtml'})));
        function passive(text){
          const root=document.createElement(item.context||'div');root.innerHTML=text;
          let active=false;
          function inspect(node){for(const element of node.children){
            if(['script','iframe','object','embed','link','meta','base'].includes(element.localName))active=true;
            for(const attr of element.attributes)if(/^on/i.test(attr.name)||/^javascript:/i.test(attr.value))active=true;
            if(element.getAttribute('target')==='_blank'||element.getAttribute('formtarget')==='_blank')active=true;
            if(/^(?:target|formtarget)$/i.test(element.getAttribute('attributeName')||''))active=true;
            inspect(element);if(element.localName==='template')inspect(element.content);
          }}inspect(root);return !active;
        }
        return {...item,oldAccepted,oldError,original,defaults,host,contextual,
          contextualPreserves:snapshot(contextual.html)===original,
          defaultPreserves:snapshot(defaults.html)===original,
          hostPreserves:snapshot(host.html)===original,
          candidatePassive:passive(host.html),contextualPassive:passive(contextual.html),frameRemoved:window.length===0};
      };`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
});
const server = http.createServer((request, response) => {
  response.setHeader(
    'Content-Type',
    request.url === '/fixture.js' ? 'text/javascript' : 'text/html',
  );
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self' 'unsafe-eval'; frame-src 'self'; style-src 'unsafe-inline'; " +
      SCRIPT_URL_CSP,
  );
  response.end(
    request.url === '/fixture.js'
      ? fixture.outputFiles[0].text
      : '<!doctype html><body><script src="/fixture.js"></script>',
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Missing fixture address');
const receipt = {
  provenance: await testProvenance(import.meta.url),
  dependency: 'dompurify@3.4.17',
  scope:
    'Candidate sanitized output in the actual detached private context; default vs host-specific adapter. Removed entries are diagnostics only. Old acceptance describes only the shared parse5 gate, not the complete current runtime. No adoption or network confinement claim.',
  browsers: [] as unknown[],
};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      const page = await browser.newPage();
      await page.goto('http://127.0.0.1:' + address.port);
      const rows = [];
      for (const item of cases) {
        const row = await page.evaluate(
          (item) => Reflect.get(window, 'probe')(item),
          item,
        );
        assert(
          row.frameRemoved &&
            row.host.supported &&
            row.defaults.supported &&
            row.contextual.supported,
          JSON.stringify(row),
        );
        if (item.unsafe) assert(row.candidatePassive && row.contextualPassive, item.name);
        rows.push(row);
      }
      const poisonUnaffected = await page.evaluate(() =>
        Reflect.get(window, 'poisonCandidate')(),
      );
      assert(poisonUnaffected);
      receipt.browsers.push({ name, version: browser.version(), poisonUnaffected, rows });
      console.log(
        name,
        'candidate unsafe fixtures passive; accepted-markup changes:',
        rows
          .filter((row) => !row.unsafe && row.oldAccepted && !row.contextualPreserves)
          .map((row) => row.name),
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await mkdir('results/dependency-reduction', { recursive: true });
  await writeFile(
    'results/dependency-reduction/markup-candidate.json',
    JSON.stringify(receipt, null, 2) + '\n',
  );
}
