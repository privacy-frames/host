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
addEventListener('message',event=>{
 if(event.data.kind!=='probe')return;
 const buffer=event.data.buffer;new Uint8Array(buffer)[0]+=1;
 const port=event.ports[0];port.postMessage({same:event.data.port===port});port.close();
 event.source.postMessage({kind:'reply',buffer},event.origin,[buffer]);
});
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
    resources: [
      {
        url: 'https://fixture.invalid/popup.html',
        path: 'popup.html',
        contentType: 'text/html',
        bytes: new TextEncoder().encode(
          '<p id="popup">popup</p><script>globalThis.popupMarker=opener.parentCallback(2)</script>',
        ).buffer,
      },
    ],
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
  const nativeTrust: boolean[] = [];
  const observeTrust = (event: MessageEvent) => nativeTrust.push(event.isTrusted);
  addEventListener('message', observeTrust);
  session.render(html);
  const finished = await session.engine.get('finished');
  const embeddedWindow =
    document.querySelector<HTMLIFrameElement>('#embedded')?.contentWindow;
  if (!embeddedWindow) throw new Error('Child window is unavailable');
  const receiverRealm: Record<string, boolean> = {};
  embeddedWindow.addEventListener('message', (event: MessageEvent) => {
    receiverRealm.event = constructor(embeddedWindow, 'MessageEvent')[Symbol.hasInstance](
      event,
    );
    receiverRealm.buffer = constructor(embeddedWindow, 'ArrayBuffer')[Symbol.hasInstance](
      event.data.buffer,
    );
    receiverRealm.port = constructor(embeddedWindow, 'MessagePort')[Symbol.hasInstance](
      event.ports[0],
    );
  });
  const messages = await session.engine.evaluate(`(()=>{
    const child=document.getElementById('embedded').contentWindow;
    const buffer=new Uint8Array([9,7]).buffer;
    const channel=new MessageChannel();
    const portReady=new Promise(resolve=>channel.port1.onmessage=event=>{
      channel.port1.close();resolve(event.data.same);
    });
    const reply=new Promise(resolve=>{
      const receive=event=>{
        if(event.data.kind!=='reply')return;
        removeEventListener('message',receive);
        resolve({bytes:Array.from(new Uint8Array(event.data.buffer)),source:event.source===child,
          origin:event.origin===location.origin,trusted:event.isTrusted});
      };
      addEventListener('message',receive);
    });
    child.postMessage({kind:'probe',buffer,port:channel.port2},'*',[buffer,channel.port2]);
    const detached=buffer.byteLength===0;
    return Promise.all([reply,portReady]).then(([reply,port])=>({reply,port,detached}));
  })()`);
  const pendingWindow = session.engine.evaluate(`(()=>{
    const frame=document.createElement('iframe');document.body.appendChild(frame);
    const hidden=typeof frame.contentWindow.eval==='undefined'&&typeof frame.contentWindow.fetch==='undefined';
    frame.remove();return hidden;
  })()`);
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
  session.engine.evaluate(
    "globalThis.popup = open('https://fixture.invalid/popup.html','fixture-popup')",
  );
  const opened = session.engine.get('popup');
  if (!isWindow(opened)) throw new Error('Application popup was blocked');
  for (
    let attempt = 0;
    attempt < 200 && session.engine.evaluate('typeof popup.popupMarker') !== 'number';
    attempt++
  )
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  const popup = {
    guest: session.engine.evaluate('popup.popupMarker'),
    native: Reflect.get(opened, 'popupMarker') === undefined,
    trustedURL: opened.location.pathname === '/app/__guest_document__.html',
    nativeContent: opened.document.getElementById('popup')?.textContent,
  };
  foreignChannel.port1.close();
  foreignChannel.port2.close();
  await frame.contentWindow.caches.delete('guest-window-brand-fixture');
  session.engine.set('removedWindow', frame.contentWindow);
  session.engine.evaluate(
    "globalThis.savedCallback = document.getElementById('embedded').contentWindow.childCallback",
  );
  frame.remove();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const removed = {
    hidden: session.engine.evaluate('typeof removedWindow.childCallback') === 'undefined',
    callbackClosed: session.engine.evaluate(
      '(()=>{try{savedCallback(1);return false}catch{return true}})()',
    ),
  };
  removeEventListener('message', observeTrust);
  session.close();
  return {
    finished,
    messages,
    receiverRealm,
    nativeTrust,
    pendingWindow,
    brands,
    nativeMarkers,
    popup,
    removed,
  };
}
run()
  .then((result) => (globalThis.guestWindowResults = { result }))
  .catch((error) => {
    globalThis.guestWindowResults = { error: String(error) };
    console.error(error);
  });
