import {readFile} from 'node:fs/promises';
import {GuestEngine} from './src/guest/engine.ts';
import {createBrowserPolicy} from './src/guest/browser-policy.ts';
let engine;
const errors=[];
const policy=createBrowserPolicy({global:globalThis,isGuestValue:value=>engine?.ownsGuestValue(value)??false,isTargetReceiver:()=>false,addCleanup:()=>{},dispatch:(fn,receiver,args)=>Reflect.apply(fn,receiver,args),isWindowMessage:()=>false});
engine=await GuestEngine.create({host:policy.host,wasmModule:await WebAssembly.compile(await readFile('vendor/quickjs/generated/engine.wasm')),globalObject:globalThis,onError:error=>errors.push(String(error))});
try {
for(const name of ['Event','EventTarget','CustomEvent','MessageEvent']) engine.set(name,globalThis[name]);
const result=await engine.evaluate(`(() => { const target=new EventTarget(); let called=0; target.addEventListener('local', event=>{called++;event.preventDefault();});const event=new Event('local',{cancelable:true});const canceled=target.dispatchEvent(event);return JSON.stringify({called,canceled,prevented:event.defaultPrevented,canonical:target.addEventListener===EventTarget.prototype.addEventListener,custom:new CustomEvent('x') instanceof Event});})()`);
console.log(result,errors);
}finally{engine.dispose();}
