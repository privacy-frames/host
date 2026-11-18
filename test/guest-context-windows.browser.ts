import { createGuestWindow } from '../src/guest/session.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';
import {
  isNode,
  isElement,
  isAttr,
  isDocument,
  isHTMLIFrameElement,
  isHTMLTemplateElement,
  isBlob,
  isWindow,
  isMessagePort,
  isBaseAudioContext,
  isCache,
} from '../src/guest/contexts/brands.ts';

declare global {
  var guestWindowResults:
    { result?: Record<string, unknown>; error?: string } | undefined;
}

const child = `<button id="child" onclick="globalThis.attributeFlag=1;event.preventDefault()">child</button>
<img src="https://remote.invalid/not-admitted.png">
<script>
globalThis.childValue=parent.parentCallback(3)+1;
globalThis.childCallback=value=>parent.parentCallback(value)+childValue;
const script=document.createElement('script');script.textContent='globalThis.dynamicFlag=1';
document.body.appendChild(script);
</script>`;

function constructor(window: Window, name: string): Function {
  const value: unknown = Reflect.get(window, name);
  if (typeof value !== 'function')
    throw new TypeError('Missing native constructor ' + name);
  return value;
}

async function run() {
  const engineWasm = await (await fetch('/quickjs.wasm')).arrayBuffer();
  const sourceURL = 'https://fixture.invalid/index.html';
  const catalog: GuestContextCatalog = {
    application: 'window-fixture',
    generation: 'window-generation',
    sourceURL,
    documentBase: sourceURL,
    applicationURL: new URL('/app/', location.href).href,
    runtimeURL: new URL('/', location.href).href,
    engineWasm,
    resources: [],
  };
  const escaped = child.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const html = `<iframe id="embedded" srcdoc="${escaped}"></iframe><script>
globalThis.parentCallback=value=>value+5;
globalThis.finished=new Promise(resolve=>{
 const frame=document.getElementById('embedded');
 frame.addEventListener('load',()=>{
  try{
   const value=frame.contentWindow.childCallback(7);
   const event=new Event('click',{cancelable:true});
   const returned=frame.contentDocument.getElementById('child').dispatchEvent(event);
   frame.contentWindow.eval('globalThis.evalFlag=1');
   resolve({value,returned,cancelled:event.defaultPrevented,
    dynamicFlag:frame.contentWindow.dynamicFlag,attributeFlag:frame.contentWindow.attributeFlag,
    evalFlag:frame.contentWindow.evalFlag,srcdoc:frame.srcdoc.includes('childCallback')});
  }catch(error){resolve({error:String(error)})}
 });
});
</script>`;
  const session = await createGuestWindow(catalog, window);
  session.render(html);
  const finished = await session.engine.get('finished');
  const frame = document.querySelector<HTMLIFrameElement>('#embedded');
  if (!frame?.contentWindow || !frame.contentDocument)
    throw new Error('Child window was not created');
  const foreign = frame.contentDocument;
  const button = foreign.querySelector('button');
  const template = foreign.createElement('template');
  const attribute = foreign.createAttribute('title');
  const foreignBlob = Reflect.construct(constructor(frame.contentWindow, 'Blob'), [
    ['text'],
  ]);
  const foreignAudio = Reflect.construct(
    constructor(frame.contentWindow, 'OfflineAudioContext'),
    [1, 128, 48000],
  );
  const foreignChannel = Reflect.construct(
    constructor(frame.contentWindow, 'MessageChannel'),
    [],
  );
  if (
    typeof foreignChannel !== 'object' ||
    foreignChannel === null ||
    !('port1' in foreignChannel) ||
    !('port2' in foreignChannel) ||
    !isMessagePort(foreignChannel.port1) ||
    !isMessagePort(foreignChannel.port2)
  )
    throw new Error('Foreign message channel is unavailable');
  const foreignCache = await frame.contentWindow.caches.open(
    'guest-window-brand-fixture',
  );
  const brands = {
    node: isNode(button),
    element: isElement(button),
    document: isDocument(foreign),
    frame: isHTMLIFrameElement(frame),
    template: isHTMLTemplateElement(template),
    attr: isAttr(attribute),
    blob: isBlob(foreignBlob),
    window: isWindow(frame.contentWindow),
    port: isMessagePort(foreignChannel.port1),
    audio: isBaseAudioContext(foreignAudio),
    cache: isCache(foreignCache),
    fakeNode: isNode({ nodeType: 1 }),
    fakeElement: isElement({ localName: 'button' }),
  };
  const nativeMarkers = {
    dynamic: Reflect.get(frame.contentWindow, 'dynamicFlag') === undefined,
    attribute: Reflect.get(frame.contentWindow, 'attributeFlag') === undefined,
    eval: Reflect.get(frame.contentWindow, 'evalFlag') === undefined,
  };
  foreignChannel.port1.close();
  foreignChannel.port2.close();
  await frame.contentWindow.caches.delete('guest-window-brand-fixture');
  session.close();
  return { finished, brands, nativeMarkers };
}
run()
  .then((result) => (globalThis.guestWindowResults = { result }))
  .catch((error) => {
    globalThis.guestWindowResults = { error: String(error) };
    console.error(error);
  });
