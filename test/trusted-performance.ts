import { SCRIPT_URL_CSP } from '../src/shared/script-url-policy.ts';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { build } from './build.ts';
import { launch } from './browser-profile.ts';

const probe = await build({
  stdin: {
    loader: 'ts',
    resolveDir: process.cwd(),
    contents: `
      import source from 'trusted:policy-source';
      import {createTrustedContext} from './src/runtime/trusted/context.ts';
      import {prepareScriptURLs} from './src/runtime/enforcement/script-urls.ts';
      prepareScriptURLs();
      import {createTrustedPolicy} from './src/runtime/trusted/client.ts';
      import {internalData} from './src/shared/primordials.ts';
      import {dispatch} from './src/runtime/trusted/entry.ts';
      import {compileDocumentContent} from './src/runtime/contexts/document-content.ts';
      import {parseDocumentContentInput} from './src/runtime/contexts/document-protocol.ts';
      import {prepareFragment} from './src/runtime/trusted/fragment.ts';

      globalThis.measureTrustedPerformance=()=>{
        const samples=7;
        const framesBefore=window.length;
        const utf8=value=>new TextEncoder().encode(value).byteLength;
        const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
        const setupMs=[];
        // Each sample creates, initializes, evaluates and detaches a fresh frame.
        for(let index=0;index<samples;index++){
          const start=performance.now();
          const call=createTrustedContext(source);
          setupMs.push(performance.now()-start);
          const result=JSON.parse(call('markup',JSON.stringify({text:'<p>Ready</p>',document:false})));
          if(result.ok!==true)throw new Error('Private context initialization failed');
        }
        const call=createTrustedContext(source);
        const policy=createTrustedPolicy(location.origin+'/installed/');
        const paragraph='<section><h2>Local document</h2><p><b>Bold</b> and ordinary text.</p></section>';
        const script='globalThis.__benchmarkScriptExecuted=true;/*'+'x'.repeat(1024*1024-45)+'*/';
        const cases=[
          {name:'small-document',operation:'document',input:{kind:'html',text:'<!doctype html><title>Example</title><main>'+paragraph.repeat(20)+'</main>',sourceURL:location.origin+'/publisher/index.html',applicationURL:location.origin+'/installed/',aliases:[]}},
          {name:'one-MiB-inline-script-data',operation:'document',input:{kind:'html',text:'<!doctype html><p>Script retained as data</p><script>'+script+'</script>',sourceURL:location.origin+'/publisher/index.html',applicationURL:location.origin+'/installed/',aliases:[]}},
          {name:'fragment',operation:'fragment',input:{text:paragraph.repeat(32)+'<iframe srcdoc="&lt;p&gt;Child data&lt;/p&gt;"></iframe>',localName:'article',namespace:'http://www.w3.org/1999/xhtml',markerPrefix:'benchmark'}},
        ];
        const workloads=[];
        const unpack=reply=>{
          const packet=JSON.parse(reply);
          if(packet.ok!==true)throw new Error('Unexpected policy rejection: '+packet.error);
          return packet.value;
        };
        for(const item of cases){
          const direct=()=>item.operation==='document'
            ?compileDocumentContent(parseDocumentContentInput(item.input,{kind:'html',applicationURL:item.input.applicationURL}))
            :prepareFragment(item.input);
          const localSerialized=()=>internalData(unpack(dispatch(item.operation,JSON.stringify(item.input))));
          const privateSerialized=()=>item.operation==='document'?policy.compile(item.input):policy.fragment(item.input);
          const expected=JSON.stringify(direct());
          const timings={directCompilerMs:[],localSerializedDispatchMs:[],privateTextBridgeMs:[]};
          const runners={directCompilerMs:direct,localSerializedDispatchMs:localSerialized,privateTextBridgeMs:privateSerialized};
          // One warm-up per path, then alternate order to reduce systematic bias.
          for(const run of Object.values(runners)){
            if(JSON.stringify(run())!==expected)throw new Error('Warm-up output mismatch');
          }
          for(let index=0;index<samples;index++){
            const names=Object.keys(runners);
            if(index%2)names.reverse();
            for(const name of names){
              const start=performance.now();const result=runners[name]();
              timings[name].push(performance.now()-start);
              if(JSON.stringify(result)!==expected)throw new Error('Measured output mismatch');
            }
          }
          const request=JSON.stringify(item.input);
          const reply=call(item.operation,request);
          workloads.push({name:item.name,operation:item.operation,samples,warmupsPerPath:1,includesLocalReplyNormalization:true,
            inputMarkupUTF8Bytes:utf8(item.input.text),requestUTF8Bytes:utf8(request),replyUTF8Bytes:utf8(reply),
            outputEquivalent:true,wire:{primitiveCallsPerOperation:1,stringDirections:2,jsonStringifyPasses:2,jsonParsePasses:2,physicalStringCopies:'Not observable; payload byte counts are logical serialization volume, not measured memory copies',arrayBufferTransfers:0},
            timings,medianMs:Object.fromEntries(Object.entries(timings).map(([name,values])=>[name,median(values)]))});
        }
        const nativeBuffer=new ArrayBuffer(16);const nativeView=new Uint8Array(nativeBuffer);nativeView[0]=201;
        return {timer:'performance.now; browser privacy precision may quantize short samples to zero',sourceUTF8Bytes:utf8(source),setup:{samples,includes:'iframe creation, trusted bundle evaluation and frame detachment; excludes first operation',timingsMs:setupMs,medianMs:median(setupMs)},workloads,
          framesRemoved:window.length===framesBefore,scriptDataNotExecuted:globalThis.__benchmarkScriptExecuted===undefined,
          nativeBufferControl:nativeView.buffer===nativeBuffer && nativeView[0]===201 && nativeBuffer instanceof ArrayBuffer};
      };
    `,
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
});
const server = http.createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/probe.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(probe.outputFiles[0].text);
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.setHeader(
      'Content-Security-Policy',
      "sandbox allow-scripts allow-same-origin; default-src 'none'; " +
        "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'none'; frame-src 'self'; " +
        SCRIPT_URL_CSP,
    );
    response.end('<!doctype html><body><script src="/probe.js"></script>');
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const rows: unknown[] = [];
let failed = false;
try {
  for (const engine of [chromium, firefox]) {
    const browser = await launch(engine);
    const errors: string[] = [];
    try {
      const page = await browser.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${address.port}/`);
      const result = await page.evaluate(() =>
        Reflect.get(window, 'measureTrustedPerformance')(),
      );
      assert(
        result.framesRemoved &&
          result.scriptDataNotExecuted &&
          result.nativeBufferControl,
      );
      assert.deepEqual(errors, []);
      assert.equal(result.workloads.length, 3);
      for (const workload of result.workloads) assert(workload.outputEquivalent);
      rows.push({
        browser: engine.name(),
        version: browser.version(),
        backend: 'detached iframe',
        passed: true,
        ...result,
        errors,
      });
      console.log(
        JSON.stringify({
          browser: engine.name(),
          setupMedianMs: result.setup.medianMs,
          workloads: result.workloads.map(
            (item: { name: string; medianMs: unknown }) => ({
              name: item.name,
              medianMs: item.medianMs,
            }),
          ),
        }),
      );
    } catch (error) {
      failed = true;
      rows.push({
        browser: engine.name(),
        version: browser.version(),
        passed: false,
        error: String(error),
        errors,
      });
      console.error(String(error));
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const hashes: Record<string, string> = {};
  for (const path of [
    'test/trusted-performance.ts',
    'src/runtime/trusted/context.ts',
    'src/runtime/trusted/client.ts',
    'src/runtime/trusted/entry.ts',
    'src/runtime/trusted/fragment.ts',
    'src/runtime/contexts/document-content.ts',
    'scripts/trusted-policy.ts',
  ])
    hashes[path] = createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
  await mkdir('results/trusted-runtime', { recursive: true });
  await writeFile(
    'results/trusted-runtime/performance.json',
    JSON.stringify(
      {
        revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        testedAt: new Date().toISOString(),
        hashes,
        scope:
          'Component timing on an ephemeral local fixture under sandbox CSP, using the production trusted-policy plugin. Direct compiler baseline, same-realm serialized dispatcher control and production private-policy client (both normalize local reply records) use the same current algorithms. No application startup or historical before/after claim; no timing pass threshold; script contents never execute. Logical UTF-8 wire volumes do not measure physical engine copies or peak memory.',
        rows,
      },
      null,
      2,
    ) + '\n',
  );
}
if (failed) process.exitCode = 1;
