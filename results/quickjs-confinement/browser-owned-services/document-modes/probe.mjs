import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {networkInterfaces} from 'node:os';
import {chromium} from '/work/node_modules/playwright/index.mjs';
assert(Object.values(networkInterfaces()).flat().every((entry) => entry.internal));
let count = 0;
const server = createServer((request, response) => {
 if (request.url.startsWith('/v1/pages')) {count++; request.resume(); response.writeHead(200, {'Content-Type':'application/x-protobuf'}).end();}
 else response.writeHead(200, {'Content-Type':'text/html'}).end('<!doctype html><html lang=en><title>Document mode control</title><body></body></html>');
});
await new Promise((resolve) => server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}/`;
const markup = '<form action=/submit method=post><label>Name<input name=fullname autocomplete=name></label><label>Address<input name=address autocomplete=street-address></label><label>City<input name=city autocomplete=address-level2></label><label>State<input name=state autocomplete=address-level1></label><label>Postal<input name=postal autocomplete=postal-code></label><label>Country<input name=country autocomplete=country-name></label><label>Email<input name=email type=email autocomplete=email></label><label>Password<input type=password name=password autocomplete=current-password></label></form>';
const rows=[];
try {
 for (const mode of ['http','http-child','blank','srcdoc','blob']) {
  count=0;
  const context=await chromium.launchPersistentContext('/tmp/mode-'+mode,{executablePath:'/browser/chrome',headless:true,ignoreDefaultArgs:['--disable-background-networking'],args:['--autofill-server-url='+origin]});
  try {
   const page=context.pages()[0];await page.goto(origin+'page');
   const documentURL=await page.evaluate(async ({mode,markup})=>{
    let doc=document;
    if(mode!=='http') {
     const frame=document.createElement('iframe');
     if(mode==='http-child')frame.src='/child';
     if(mode==='srcdoc')frame.srcdoc='<!doctype html><body></body>';
     if(mode==='blob')frame.src=URL.createObjectURL(new Blob(['<!doctype html><body></body>'],{type:'text/html'}));
     const loaded=new Promise((resolve)=>frame.onload=resolve);document.body.append(frame);
     if(mode!=='blank')await loaded;
     doc=frame.contentDocument;
    }
    doc.body.innerHTML=markup;
    return doc.URL;
   },{mode,markup});
   await page.waitForTimeout(5000);
   const rendered=count;
   const target=mode==='http'?page:page.frameLocator('iframe');
   await target.getByLabel('Name',{exact:true}).fill('Synthetic example');
   await target.getByLabel('Password',{exact:true}).focus();
   await page.waitForTimeout(5000);
   rows.push({mode,documentURL,rendered,afterFocus:count});
  } finally {await context.close();}
 }
 console.log(JSON.stringify({scope:'Native document-placement exploration only; no installed-runtime or complete-confinement claim',rows}));
} finally {server.closeAllConnections();await new Promise((resolve)=>server.close(resolve));}
