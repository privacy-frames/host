import {chromium,firefox} from 'playwright';
import {writeFile} from 'node:fs/promises';
const results=[];
for(const [name,type] of [['chromium',chromium],['firefox',firefox]]){
 const browser=await type.launch({headless:true});
 try{
 const page=await browser.newPage();
 const result=await page.evaluate(()=>{
  const results=[];
  const sources={global:addEventListener,prototype:EventTarget.prototype.addEventListener};
  for(const [source,method] of Object.entries(sources))for(const [receiver,value] of [['undefined',undefined],['null',null],['object',{}],['window',window],['localTarget',new EventTarget()]]){
   let delivered=0,error,removed=false; const callback=()=>delivered++;
   try{
    Reflect.apply(method,value,['receiver-test',callback]);
    window.dispatchEvent(new Event('receiver-test'));if(value instanceof EventTarget&&value!==window)value.dispatchEvent(new Event('receiver-test'));
    Reflect.apply(removeEventListener,value,['receiver-test',callback]);
    window.dispatchEvent(new Event('receiver-test'));if(value instanceof EventTarget&&value!==window)value.dispatchEvent(new Event('receiver-test'));
    removed=delivered===1;
   }catch(e){error=e.name+': '+e.message;window.removeEventListener('receiver-test',callback);}
   results.push({source,receiver,delivered,removed,error});
  }
  for(const [source,method]of Object.entries({global:dispatchEvent,prototype:EventTarget.prototype.dispatchEvent}))for(const [receiver,value]of [['undefined',undefined],['null',null],['object',{}]]){
   let delivered=0,error,result;const callback=e=>{delivered++;e.preventDefault()};window.addEventListener('receiver-dispatch',callback);
   try{result=Reflect.apply(method,value,[new Event('receiver-dispatch',{cancelable:true})]);}catch(e){error=e.name+': '+e.message;}
   finally{window.removeEventListener('receiver-dispatch',callback)}results.push({source,receiver,operation:'dispatch',delivered,result,error});
  }
  return {sameGlobalPrototype:addEventListener===EventTarget.prototype.addEventListener,results};
 });results.push({browser:name,version:browser.version(),result});console.log(name,JSON.stringify(result));
 }finally{await browser.close();}
}
await writeFile('results/quickjs-confinement/global-event-receiver/native.json',JSON.stringify(results,null,2)+'\n');
