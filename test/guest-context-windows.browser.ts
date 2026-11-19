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
globalThis.childEventRealms={};
document.addEventListener('DOMContentLoaded',event=>childEventRealms.dom=event instanceof Event);
globalThis.childValue=parent.parentCallback(3)+1;
globalThis.childCallback=value=>parent.parentCallback(value)+childValue;
addEventListener('message',event=>{
 if(event.data.kind!=='probe')return;
 const buffer=event.data.buffer;new Uint8Array(buffer)[0]+=1;
 const port=event.ports[0];port.postMessage({same:event.data.port===port});port.close();
 event.source.postMessage({kind:'reply',buffer},event.origin,[buffer]);
});
const script=document.createElement('script');script.textContent='globalThis.dynamicFlag=1';
script.addEventListener('load',event=>childEventRealms.script=event instanceof Event);
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
    workerBootstrap: {
      dedicated: new ArrayBuffer(0),
      shared: new ArrayBuffer(0),
      worklet: new ArrayBuffer(0),
    },
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
globalThis.childLoads=0;
globalThis.finished=new Promise(resolve=>{
 const frame=document.getElementById('embedded');
 frame.addEventListener('load',()=>{
  childLoads++;
  try{
   const value=frame.contentWindow.childCallback(7);
   const event=new Event('click',{cancelable:true});
   const returned=frame.contentDocument.getElementById('child').dispatchEvent(event);
   frame.contentWindow.eval('globalThis.evalFlag=1');
   resolve({value,returned,cancelled:event.defaultPrevented,
    dynamicFlag:frame.contentWindow.dynamicFlag,attributeFlag:frame.contentWindow.attributeFlag,
    evalFlag:frame.contentWindow.evalFlag,eventRealms:frame.contentWindow.childEventRealms,srcdoc:frame.srcdoc.includes('childCallback')});
  }catch(error){resolve({error:String(error)})}
 });
});
</script>`;
  const session = await createGuestWindow(catalog, window);
  const nativeTrust: boolean[] = [];
  const observeTrust = (event: MessageEvent) => nativeTrust.push(event.isTrusted);
  addEventListener('message', observeTrust);
  await session.render(html);
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
  session.engine.evaluate("popup.dispatchEvent(new Event('pagehide'))");
  const popup = {
    guest: session.engine.evaluate('popup.popupMarker'),
    syntheticPagehideSurvives: session.engine.evaluate('popup.popupMarker === 7'),
    native: Reflect.get(opened, 'popupMarker') === undefined,
    trustedURL: opened.location.href === 'about:blank',
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
  const conversions = session.engine.evaluate(`(()=>{
    const results=[];
    const changing=(first,second)=>{let count=0;return {value:{toString(){return ++count===1?first:second}},count:()=>count}};
    const blob=URL.createObjectURL(new Blob(['<p>Local document</p>'],{type:'text/html'}));
    for(const method of ['setAttribute','setAttributeNS']){
      const node=document.createElement('a');node.dataset.coercionCase=method;
      const name=changing('data-label','href'),value=changing(blob,blob);
      if(method==='setAttributeNS')node.setAttributeNS(null,name.value,value.value);
      else node.setAttribute(name.value,value.value);
      document.body.append(node);results.push({method,name:name.count(),value:value.count()});
    }
    for(const method of ['removeAttribute','removeAttributeNS','toggleAttribute','removeNamedItem','removeNamedItemNS']){
      const node=document.createElement('input');node.dataset.coercionCase=method;
      node.setAttribute('data-label','present');document.body.append(node);
      const name=changing('data-label','spellcheck');
      if(method==='removeAttributeNS')node.removeAttributeNS(null,name.value);
      else if(method==='toggleAttribute')node.toggleAttribute(name.value,false);
      else if(method==='removeNamedItemNS')node.attributes.removeNamedItemNS(null,name.value);
      else if(method==='removeNamedItem')node.attributes.removeNamedItem(name.value);
      else node.removeAttribute(name.value);
      results.push({method,name:name.count()});
    }
    return results;
  })()`);
  const conversionDOM = Array.from(
    document.querySelectorAll('[data-coercion-case]'),
    (node) => ({
      method: node.getAttribute('data-coercion-case'),
      href: node.getAttribute('href'),
      label: node.hasAttribute('data-label'),
      spellcheck: node.localName === 'input' ? node.getAttribute('spellcheck') : null,
    }),
  );
  const logicalAttributes = session.engine.evaluate(`(()=>{
    const anchor=document.createElement('a');anchor.href='#logical-link';
    anchor.removeAttribute('href');const removed=!anchor.hasAttribute('href')&&anchor.getAttribute('href')===null;
    const added=anchor.toggleAttribute('href');const empty=anchor.hasAttribute('href')&&anchor.getAttribute('href')==='';
    const toggled=anchor.toggleAttribute('href',false);const absent=!anchor.hasAttribute('href')&&anchor.getAttribute('href')===null;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','a');
    svg.setAttributeNS('http://www.w3.org/1999/xlink','alias:href','#logical-ns');svg.removeAttributeNS('http://www.w3.org/1999/xlink','href');
    const removedNS=!svg.hasAttributeNS('http://www.w3.org/1999/xlink','href')&&svg.getAttributeNS('http://www.w3.org/1999/xlink','href')===null;
    return {removed,added,empty,toggled,absent,removedNS};
  })()`);
  const namespaceAttempts = session.engine.evaluate(`(()=>{
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');document.body.append(svg);
    const blob=URL.createObjectURL(new Blob(['<p>Local SVG destination</p>'],{type:'text/html'}));
    const results=[];for(const method of ['setAttributeNS','setAttributeNodeNS','setNamedItemNS']){
      const anchor=document.createElementNS('http://www.w3.org/2000/svg','a');anchor.setAttribute('data-namespace-case',method);svg.append(anchor);
      try{
        if(method==='setAttributeNS')anchor.setAttributeNS('http://www.w3.org/1999/xlink','alias:href',blob);
        else{const attribute=document.createAttributeNS('http://www.w3.org/1999/xlink','alias:href');attribute.value=blob;if(method==='setAttributeNodeNS')anchor.setAttributeNodeNS(attribute);else anchor.attributes.setNamedItemNS(attribute)}
        results.push({method,result:'returned'});
      }catch(error){results.push({method,result:error.name})}
    }
    svg.setAttribute('data-namespace-base','');try{svg.setAttributeNS('http://www.w3.org/XML/1998/namespace','alias:base',new URL('/namespace-base-control/',location.href).href)}catch{}
    return results;
  })()`);
  const namespaceDOM = Array.from(
    document.querySelectorAll<SVGAElement>('[data-namespace-case]'),
    (node) => ({
      method: node.getAttribute('data-namespace-case'),
      localTarget: ['', '#'].includes(node.href.baseVal),
    }),
  );
  const namespaceBaseLocal =
    document.querySelector('[data-namespace-base]')?.baseURI === document.baseURI;
  const editing = session.engine.evaluate(`(()=>{
    const editor=document.createElement('div');editor.id='editing-fixture';editor.contentEditable='true';document.body.append(editor);editor.focus();
    const select=()=>{const range=document.createRange();range.selectNodeContents(editor);const selection=getSelection();selection.removeAllRanges();selection.addRange(range)};
    select();const inserted=document.execCommand('insertText',false,'Local editing');
    select();const formatted=document.execCommand('bold',false);
    const local={inserted,formatted,text:editor.textContent,markup:editor.innerHTML};
    const denied={};for(const command of ['insertHTML','createLink','insertImage','copy','cut','paste']){
      try{document.execCommand(command,false,'<span id="raw-command-node">Markup</span>');denied[command]='allowed'}catch(error){denied[command]=error.name}
    }
    editor.textContent='';select();let calls=0,valueCalls=0;
    const command={toString(){return ++calls===1?'insertText':'insertHTML'}};
    const value={toString(){valueCalls++;return '<span id="converted-command-node">Literal text</span>'}};
    document.execCommand(command,false,value);
    const converted={calls,valueCalls,text:editor.textContent,parsed:!!editor.querySelector('#converted-command-node')};
    editor.textContent='Block formatting';select();let blockCalls=0;
    const blockValue={toString(){return ++blockCalls===1?'<p>':'<iframe>'}};
    const blockResult=document.execCommand('formatBlock',false,blockValue);
    const block={calls:blockCalls,result:blockResult,paragraph:!!editor.querySelector('p'),frame:!!editor.querySelector('iframe'),text:editor.textContent};
    return {local,denied,converted,block};
  })()`);
  session.engine.evaluate(`(()=>{
    for (const [id,href] of [
      ['blob-anchor',URL.createObjectURL(new Blob(['<script>globalThis.anchorEscape=1</script>'],{type:'text/html'}))],
      ['data-anchor','data:text/html,'+encodeURIComponent('<script>globalThis.anchorEscape=1</script>')]
    ]) { const anchor=document.createElement('a');anchor.id=id;anchor.href=href;document.body.append(anchor); }
    const download=document.createElement('a');download.id='safe-download';
    download.href=URL.createObjectURL(new Blob(['unchanged guest download bytes'],{type:'text/plain'}));
    download.download='guest-download.txt';document.body.append(download);
  })()`);
  for (const id of ['blob-anchor', 'data-anchor'])
    document
      .getElementById(id)!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: false }));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const anchors = {
    stayedInDocument: document.getElementById('blob-anchor') !== null,
    nativeScriptAbsent: Reflect.get(window, 'anchorEscape') === undefined,
  };
  session.engine.evaluate(`(()=>{
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');document.body.append(svg);
    for(const kind of ['html','svg'])for(const modifier of ['ctrl','shift']){
      const anchor=kind==='svg'?document.createElementNS('http://www.w3.org/2000/svg','a'):document.createElement('a');
      anchor.id='modifier-'+kind+'-'+modifier;anchor.setAttribute('href','#modifier-'+kind+'-'+modifier);anchor.setAttribute('target','_blank');
      if(kind==='svg')anchor.target.baseVal='_blank';
      (kind==='svg'?svg:document.body).append(anchor);
    }
  })()`);
  const modifierTargets = [];
  for (const kind of ['html', 'svg'])
    for (const modifier of ['ctrl', 'shift']) {
      const anchor = document.getElementById('modifier-' + kind + '-' + modifier)!;
      modifierTargets.push({
        kind,
        modifier,
        physicalTarget: anchor.getAttribute('target'),
        physicalHref: anchor.getAttribute('href'),
        xlinkHref: anchor.getAttributeNS('http://www.w3.org/1999/xlink', 'href'),
      });
      anchor.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: false,
          ctrlKey: modifier === 'ctrl',
          shiftKey: modifier === 'shift',
        }),
      );
    }
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  session.engine.evaluate(
    `globalThis.detachedLink=document.createElement('a');detachedLink.href='#detached-link';detachedLink.click()`,
  );
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const detachedClick = location.hash === '#detached-link';
  session.engine.evaluate(
    `detachedLink.href='#cancelled-link';detachedLink.addEventListener('click',event=>event.preventDefault(),{once:true});detachedLink.click()`,
  );
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const detachedCancelled = location.hash === '#detached-link';
  session.engine.evaluate(
    `detachedLink.href='#detached-dispatch';detachedLink.dispatchEvent(new MouseEvent('click',{cancelable:false}))`,
  );
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const detachedDispatch = location.hash === '#detached-dispatch';
  const guestConfirmationUnavailable = session.engine.evaluate(
    'typeof confirm === "undefined"',
  );
  session.engine.evaluate(`(()=>{
    const anchor=document.createElement('a');
    const url=URL.createObjectURL(new Blob(['declined export must remain local'],{type:'text/plain'}));
    anchor.href=url;anchor.download='guest-declined-download.txt';anchor.click();URL.revokeObjectURL(url);
  })()`);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  session.engine.evaluate("document.getElementById('safe-download').click()");
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  session.engine.evaluate(`(()=>{
    const anchor=document.createElement('a');
    const url=URL.createObjectURL(new Blob(['unchanged detached download bytes'],{type:'text/plain'}));
    anchor.href=url;anchor.download='guest-detached-download.txt';anchor.click();URL.revokeObjectURL(url);
  })()`);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  const logicalLoadCount = session.engine.get('childLoads');
  session.close();
  return {
    finished,
    logicalLoadCount,
    anchors,
    conversions,
    conversionDOM,
    logicalAttributes,
    namespaceAttempts,
    namespaceDOM,
    namespaceBaseLocal,
    modifierTargets,
    guestConfirmationUnavailable,
    detached: {
      click: detachedClick,
      cancelled: detachedCancelled,
      dispatch: detachedDispatch,
    },
    editing,
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
if (location.hash.startsWith('#modifier-')) {
  document.body.textContent = 'Native modifier navigation control';
} else
  run()
    .then((result) => (globalThis.guestWindowResults = { result }))
    .catch((error) => {
      globalThis.guestWindowResults = { error: String(error) };
      console.error(error);
    });
