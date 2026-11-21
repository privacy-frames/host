import { chromium, firefox } from 'playwright';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const receipts=[];
for (const type of [chromium,firefox]) {
 const browser=await type.launch();
 try {const page=await browser.newPage();
 const observations=await page.evaluate(()=>{
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.innerHTML='<rect x="3" y="4" width="5" height="6" transform="translate(2,3)"/><polyline points="1,2 3,4"/>';
 document.body.append(svg);const rect=svg.firstElementChild; const line=svg.lastElementChild;
 const identify=value=>({prototype:Object.getPrototypeOf(value)?.constructor?.name,tag:Object.prototype.toString.call(value),sameDOMPoint:Object.getPrototypeOf(value)===DOMPoint.prototype,sameDOMRect:Object.getPrototypeOf(value)===DOMRect.prototype,sameDOMMatrix:Object.getPrototypeOf(value)===DOMMatrix.prototype});
 const supplied={currentTranslate:svg.currentTranslate,viewBoxBase:svg.viewBox.baseVal,viewBoxAnim:svg.viewBox.animVal,transformMatrix:rect.transform.baseVal.getItem(0).matrix,svgPoint:svg.createSVGPoint(),pointList:line.points.getItem(0),bbox:rect.getBBox(),ctm:rect.getCTM()};
 const values=Object.fromEntries(Object.entries(supplied).map(([key,value])=>[key,identify(value)]));
 const brands=[];
 for(const name of ['DOMPoint','DOMPointReadOnly','DOMRect','DOMRectReadOnly','DOMMatrix','DOMMatrixReadOnly']){
 const ctor=globalThis[name]; const key=name.includes('Matrix')?'a':'x';const getter=Object.getOwnPropertyDescriptor(ctor.prototype,key)?.get;
 const receivers=name.includes('Point')?[new DOMPoint(),new DOMPointReadOnly(),svg.currentTranslate]:name.includes('Rect')?[new DOMRect(),new DOMRectReadOnly(),svg.viewBox.animVal]:[new DOMMatrix(),new DOMMatrixReadOnly(),rect.transform.baseVal.getItem(0).matrix];
 brands.push({name,ownGetter:!!getter,accepts:receivers.map(value=>{try{return {ok:true,value:Reflect.apply(getter,value,[])}}catch(error){return {ok:false,name:error.name}}})});}
 const list=rect.getClientRects();const iterator=Object.getOwnPropertyDescriptor(DOMRectList.prototype,Symbol.iterator)?.value;
 const result={values,brands,list:{...identify(list),keys:Reflect.ownKeys(DOMRectList.prototype).map(String),iterator:iterator?.name,arrayValuesAlias:iterator===Array.prototype.values,firstPrototype:list.item(0)&&identify(list.item(0))}};
 svg.remove();return result;});
 const executablePath=type.executablePath();receipts.push({browser:type.name(),version:browser.version(),executablePath,executableSHA256:createHash('sha256').update(await readFile(executablePath)).digest('hex'),observations});
 } finally {await browser.close();}
}
await mkdir('results/quickjs-confinement/geometry',{recursive:true});
await writeFile('results/quickjs-confinement/geometry/native-probe.json',JSON.stringify({scope:'Native-only local SVG/geometry brand, prototype and iterable characterization, not implementation qualification.',receipts},null,2)+'\n');
console.log(receipts.map(r=>({browser:r.browser,values:r.observations.values,brands:r.observations.brands,list:r.observations.list})));
