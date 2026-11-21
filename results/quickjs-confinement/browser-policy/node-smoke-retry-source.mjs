import { readFile } from 'node:fs/promises';
import { GuestEngine } from './src/guest/engine.ts';
import { createBrowserPolicy } from './src/guest/browser-policy.ts';
import { installGuestRuntime } from './src/guest/guest-runtime.ts';
import { installGuestRegExpLegacy } from './src/guest/legacy-regexp.ts';

let engine;
let stage = 'create';
let failed = false;
const errors = [];
const policy = createBrowserPolicy({
  global: globalThis,
  isGuestValue: value => engine?.ownsGuestValue(value) ?? false,
  recognizesCallable: value => engine?.recognizesCallable(value) ?? false,
  call: (callback, receiver, args) => engine.call(callback, [...args], receiver),
  property: (value, key) => engine.property(value, key),
  isTargetReceiver: () => false,
  addCleanup: () => {},
  dispatch: (fn, receiver, args) => Reflect.apply(fn, receiver, args),
  isWindowMessage: () => false,
});
console.log(JSON.stringify({
  stage: 'embedded-source-observation',
  runtimeContainsNameHelper: installGuestRuntime.toString().includes('__name'),
  legacyContainsNameHelper: installGuestRegExpLegacy.toString().includes('__name'),
}));
try {
  engine = await GuestEngine.create({
    host: policy.host,
    wasmModule: await WebAssembly.compile(await readFile('vendor/quickjs/generated/engine.wasm')),
    globalObject: globalThis,
    onError: error => errors.push(String(error)),
  });
  stage = 'bind';
  for (const name of ['Event', 'EventTarget', 'CustomEvent', 'MessageEvent'])
    engine.set(name, globalThis[name]);
  stage = 'evaluate';
  const result = await engine.evaluate(`(() => { const target=new EventTarget(); let called=0; target.addEventListener('local', event=>{called++;event.preventDefault();});const event=new Event('local',{cancelable:true});const canceled=target.dispatchEvent(event);return JSON.stringify({called,canceled,prevented:event.defaultPrevented,canonical:target.addEventListener===EventTarget.prototype.addEventListener,custom:new CustomEvent('x') instanceof Event});})()`);
  console.log(JSON.stringify({ stage, result, errors }));
} catch (error) {
  failed = true;
  console.error(JSON.stringify({ stage, error: String(error), stack: error?.stack, errors }));
} finally {
  if (engine) {
    try { engine.dispose(); } catch (error) {
      failed = true;
      console.error(JSON.stringify({ stage: 'dispose', error: String(error), stack: error?.stack }));
    }
  }
}
if (failed) process.exitCode = 1;
