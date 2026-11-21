import { readFile } from 'node:fs/promises';
import { GuestEngine } from "/home/damen/Projects/privacy-frames-browser-policy/.tools/browser-policy-node-baseline/src/guest/engine.ts";
import { installGuestRuntime } from "/home/damen/Projects/privacy-frames-browser-policy/.tools/browser-policy-node-baseline/src/guest/guest-runtime.ts";
import { installGuestRegExpLegacy } from "/home/damen/Projects/privacy-frames-browser-policy/.tools/browser-policy-node-baseline/src/guest/legacy-regexp.ts";
let engine;
let stage = 'create';
let failed = false;
console.log(JSON.stringify({stage:'embedded-source-observation',runtimeContainsNameHelper:installGuestRuntime.toString().includes('__name'),legacyContainsNameHelper:installGuestRegExpLegacy.toString().includes('__name')}));
const unavailable = () => { throw new Error('This minimal host exposes no native operation'); };
const host = { get:()=>undefined, set:()=>false, call:unavailable, construct:unavailable, ownKeys:()=>[], descriptor:()=>undefined, prototype:()=>null };
try {
 engine = await GuestEngine.create({ host, wasmModule:await WebAssembly.compile(await readFile("/home/damen/Projects/privacy-frames-browser-policy/.tools/browser-policy-node-baseline/vendor/quickjs/generated/engine.wasm")) });
 stage='evaluate';
 const result=await engine.evaluate('1+2');
 console.log(JSON.stringify({stage,result}));
 if(result!==3) throw new Error('Minimal evaluation result differs');
}catch(error){failed=true;console.error(JSON.stringify({stage,error:String(error),stack:error?.stack}));}
finally{ if(engine){try{engine.dispose();console.log(JSON.stringify({stage:'dispose',passed:true}));}catch(error){failed=true;console.error(JSON.stringify({stage:'dispose',error:String(error),stack:error?.stack}));}} }
if(failed)process.exitCode=1;
