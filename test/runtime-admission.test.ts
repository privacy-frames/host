import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';

test('runtime admission requires explicit captured resources and separates new metadata from private app data', async () => {
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'ts',
      contents: `
import {admitInstallation} from './src/runtime/admission.ts';
import {getApp,listApps,putApp,getResource} from './src/runtime/storage.ts';
import {digest} from './src/shared/policy.ts';
globalThis.runAdmission = async () => {
  const source='https://publisher.test/index.html';
  const runtime=new URL('https://runtime.test/');
  const resource=async(path,text,contentType)=>{const bytes=new TextEncoder().encode(text).buffer;return{path,url:new URL(path,source).href,bytes,contentType,sha256:await digest(bytes)};};
  const resources=await Promise.all([
    resource('index.html','<!doctype html><title>Fixture</title><script src="./extra.js"></script>','text/html'),
    resource('extra.js','globalThis.publisherExecuted=true;','application/javascript'),
  ]);
  const id='fixture-'+await digest(new TextEncoder().encode(source));
  const input={format:'offline-resources-v1',id,source,manifest:{id:'fixture',name:'Fixture',entry:'index.html'},resources,
    capture:{additionalResources:[resources[1].url],unavailableResources:[{url:'https://publisher.test/optional.png',reason:'http',status:404}]}};
  const legacy=await new Promise((resolve,reject)=>{const request=indexedDB.open('privacy-frames-installations',1);request.onupgradeneeded=()=>request.result.createObjectStore('installations',{keyPath:'id'});request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);});
  await new Promise((resolve,reject)=>{const tx=legacy.transaction('installations','readwrite');tx.objectStore('installations').put({id:'legacy',preparation:{ended:true}});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});legacy.close();
  const checks={legacyMetadataIgnored:(await getApp('legacy'))===undefined&&(await listApps()).length===0};
  const admitted=await admitInstallation(input,runtime);
  const withPaths=async(paths, entry='index.html')=>{
    const variantResources=await Promise.all(paths.map((path,i)=>resource(path,i===0?'<title>Fixture</title>':'data',i===0?'text/html':'text/plain')));
    // URLs remain distinct even when the paths canonicalize to the same URL.
    variantResources.forEach((item,i)=>item.url='https://publisher.test/resource-'+i);
    return {...input,manifest:{...input.manifest,entry},resources:variantResources,capture:{additionalResources:[],unavailableResources:[]}};
  };
  const accept=async(paths,entry)=>{try{await admitInstallation(await withPaths(paths,entry),runtime);return true;}catch{return false;}};
  const rejectWith=async(paths,reason)=>{try{await admitInstallation(await withPaths(paths),runtime);return false;}catch(error){return error.message===reason;}};
  checks.relativeSchemeNames=await accept(['index.html','http:example.test','https:example.test','nested/file.js']);
  checks.schemeNamedEntry=await accept(['https:entry.html'],'https:entry.html');
  checks.normalizedCollision=await rejectWith(['index.html','a\\nb.js','ab.js'],'Duplicate resolved resource path');
  checks.normalizedEscape=await rejectWith(['index.html','x/.\\n./.\\n./escape.js'],'Resource path leaves its application');
  checks.normalizedAppRoot=await rejectWith(['index.html','x/.\\n.'],'Resource path leaves its application');
  checks.format=admitted.format==='offline-resources-v1';
  checks.capture=admitted.capture.additionalResources[0]===resources[1].url&&admitted.capture.unavailableResources[0].status===404;
  checks.noLegacyAuthority=!Object.hasOwn(admitted,'preparation')&&!Object.hasOwn(admitted,'serviceWorker');
  checks.noCodeExecution=globalThis.publisherExecuted===undefined;
  const rejected=[];
  const cases=[
    {...input,format:undefined,preparation:{ended:true}},
    {...input,format:'website-v1'},
    {...input,capture:undefined},
    {...input,capture:{additionalResources:['https://publisher.test/missing.js'],unavailableResources:[]}},
    {...input,capture:{additionalResources:[resources[1].url,resources[1].url],unavailableResources:[]}},
    {...input,capture:{additionalResources:[],unavailableResources:[{url:resources[1].url,reason:'network'}]}},
    {...input,capture:{additionalResources:[],unavailableResources:[{url:'https://publisher.test/no.png',reason:'http',status:200}]}},
    {...input,capture:{additionalResources:[],unavailableResources:[{url:'https://publisher.test/no.png',reason:'body',status:404}]}},
    {...input,capture:{additionalResources:['https://publisher.test/extra.js?other=1'],unavailableResources:[]}},
    {...input,resources:[{...resources[0],sha256:'0'.repeat(64)},resources[1]]},
  ];
  for(const value of cases){try{await admitInstallation(value,runtime);rejected.push(false);}catch{rejected.push(true);}}
  checks.rejected=rejected.every(Boolean)&&rejected.length===10;
  localStorage.setItem('pf:'+id+':private','kept');
  const cache=await caches.open('pf:'+id+':private');await cache.put('https://private.test/value',new Response('kept'));
  await putApp(admitted);
  const stored=await getApp(id);
  checks.metadata=stored.format==='offline-resources-v1'&&stored.capture.additionalResources.length===1;
  checks.body=(await getResource(id,'extra.js',stored.generation)).byteLength===resources[1].bytes.byteLength;
  await putApp(admitted);
  const replaced=await getApp(id);
  checks.freshGeneration=replaced.generation!==stored.generation;
  try{await getResource(id,'extra.js',stored.generation);checks.oldGeneration=false;}catch{checks.oldGeneration=true;}
  checks.privateDataPreserved=localStorage.getItem('pf:'+id+':private')==='kept'&&(await(await cache.match('https://private.test/value')).text())==='kept';
  return checks;
};`,
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
    response.end(
      request.url === '/fixture.js'
        ? bundle.outputFiles[0].text
        : '<!doctype html><script src="/fixture.js"></script>',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  try {
    for (const engine of [chromium, firefox]) {
      const browser = await launch(engine);
      try {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${address.port}/`);
        const checks = await page.evaluate(() =>
          Reflect.get(globalThis, 'runAdmission')(),
        );
        for (const [name, value] of Object.entries(checks))
          assert.equal(value, true, engine.name() + ': ' + name);
      } finally {
        await browser.close();
      }
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
