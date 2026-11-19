export interface GuestPolicyCase {
  name: string;
  code(receiver: string): string;
  control:
    'navigation' | 'request' | 'script' | 'spellcheck' | 'worker' | 'reload' | 'worklet';
}

export const guestPolicyCases: GuestPolicyCase[] = [
  {
    name: 'paint-worklet-module',
    control: 'worklet',
    code: (receiver) => `(async () => {
      const worklet = globalThis.CSS?.paintWorklet;
      if (!worklet) return { available: false };
      try { await worklet.addModule(${JSON.stringify(receiver)}); return {available: true}; }
      catch (error) { return {available: true, error: error.name}; }
    })()`,
  },
  {
    name: 'location-reload',
    control: 'reload',
    code: () => `(() => {
      if (sessionStorage.getItem('policy-reloaded')) return { reloaded: true };
      sessionStorage.setItem('policy-reloaded', 'true');
      try { location.reload(); return new Promise(() => {}); }
      catch (error) { return { blocked: error.name }; }
    })()`,
  },
  {
    name: 'anchor-noncancelable',
    control: 'navigation',
    code: (receiver) =>
      `(() => { const a=document.createElement('a'); a.id='policy-target'; a.href=${JSON.stringify(receiver)}; document.body.appendChild(a); a.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:false})); return { href:a.href }; })()`,
  },
  {
    name: 'anchor-components',
    control: 'navigation',
    code: (receiver) =>
      `(() => { const a=document.createElement('a'); a.id='policy-target'; a.href=location.href; const u=new URL(${JSON.stringify(receiver)}); a.protocol=u.protocol; a.host=u.host; a.pathname=u.pathname; a.search=u.search; document.body.appendChild(a); a.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:false})); return { href:a.href }; })()`,
  },
  {
    name: 'meta-properties',
    control: 'navigation',
    code: (receiver) =>
      `(() => { const m=document.createElement('meta'); m.id='policy-target'; document.head.appendChild(m); m.httpEquiv='refresh'; m.content='0;url='+${JSON.stringify(receiver)}; return {equiv:m.httpEquiv}; })()`,
  },
  {
    name: 'meta-attribute-node',
    control: 'navigation',
    code: (receiver) =>
      `(() => { const m=document.createElement('meta'); m.id='policy-target'; m.content='0;url='+${JSON.stringify(receiver)}; document.head.appendChild(m); const a=document.createAttribute('http-equiv'); a.value='refresh'; m.setAttributeNode(a); return {equiv:m.httpEquiv}; })()`,
  },
  {
    name: 'meta-named-map',
    control: 'navigation',
    code: (receiver) =>
      `(() => { const m=document.createElement('meta'); m.id='policy-target'; m.content='0;url='+${JSON.stringify(receiver)}; document.head.appendChild(m); const a=document.createAttribute('http-equiv'); a.value='refresh'; m.attributes.setNamedItem(a); return {equiv:m.httpEquiv}; })()`,
  },
  {
    name: 'meta-attr-value',
    control: 'navigation',
    code: (receiver) =>
      `(() => { const m=document.createElement('meta'); m.id='policy-target'; m.setAttribute('http-equiv','x-inert'); m.content='0;url='+${JSON.stringify(receiver)}; document.head.appendChild(m); const a=m.getAttributeNode('http-equiv'); if(a)a.value='refresh'; return {equiv:m.httpEquiv}; })()`,
  },
  {
    name: 'script-text',
    control: 'script',
    code: () =>
      `(() => { const s=document.createElement('script'); s.id='policy-target'; s.text="globalThis.__nativePolicyMarker='script-text'"; document.body.appendChild(s); return {type:s.type}; })()`,
  },
  {
    name: 'inline-handler',
    control: 'script',
    code: () =>
      `(() => { const b=document.createElement('button'); b.id='policy-target'; b.setAttribute('onclick',"globalThis.__nativePolicyMarker='inline-handler'"); document.body.appendChild(b); b.click(); return {}; })()`,
  },
  {
    name: 'borrowed-innerhtml-setter',
    control: 'request',
    code: (receiver) =>
      `(() => { const d=document.createElement('div'); d.id='policy-target'; document.body.appendChild(d); const setter=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML').set; setter.call(d,'<img src="'+${JSON.stringify(receiver)}+'">'); return {}; })()`,
  },
  {
    name: 'document-location',
    control: 'navigation',
    code: (receiver) =>
      `(() => { try { document.location.href=${JSON.stringify(receiver)}; } catch(e) { return {blocked:e.name}; } return {}; })()`,
  },
  {
    name: 'window-navigation',
    control: 'navigation',
    code: (receiver) =>
      `(() => { if(!globalThis.navigation)return {available:false}; try { navigation.navigate(${JSON.stringify(receiver)}); return {available:true}; } catch(error) { return {available:true,error:String(error)}; } })()`,
  },
  {
    name: 'foreign-window-source',
    control: 'request',
    code: () =>
      `new Promise(resolve => { addEventListener('message', event => { if(event.data!=='policy-event-source')return; try { event.source.postMessage('diagnostic-reply','*'); resolve({blocked:false}); } catch(error) { resolve({blocked:true,error:String(error)}); } },{once:true}); })`,
  },
  {
    name: 'client-information',
    control: 'request',
    code: (receiver) =>
      `(() => { const value={beacon:typeof clientInformation.sendBeacon,serviceWorker:typeof clientInformation.serviceWorker}; if(typeof clientInformation.sendBeacon==='function')clientInformation.sendBeacon(${JSON.stringify(receiver)},'diagnostic'); return value; })()`,
  },
  {
    name: 'spellcheck-property',
    control: 'spellcheck',
    code: () =>
      `(() => { const t=document.createElement('textarea'); t.id='policy-target'; document.body.appendChild(t); t.spellcheck=true; t.setAttribute('spellcheck','true'); return {}; })()`,
  },
  {
    name: 'writing-suggestions',
    control: 'spellcheck',
    code: () =>
      `(() => { const t=document.createElement('textarea'); t.id='policy-target'; document.body.appendChild(t); t.setAttribute('writingsuggestions','true'); if('writingSuggestions'in t)t.writingSuggestions='true'; return {}; })()`,
  },
  {
    name: 'svg-href',
    control: 'navigation',
    code: (receiver) =>
      `(() => { const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); const a=document.createElementNS('http://www.w3.org/2000/svg','a'); a.id='policy-target'; a.href.baseVal=${JSON.stringify(receiver)}; const text=document.createElementNS('http://www.w3.org/2000/svg','text'); text.textContent='diagnostic'; a.appendChild(text); svg.appendChild(a); document.body.appendChild(svg); a.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:false})); return {}; })()`,
  },
  {
    name: 'smil-href',
    control: 'navigation',
    code: (receiver) =>
      `new Promise(resolve => { const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); const a=document.createElementNS('http://www.w3.org/2000/svg','a'); a.id='policy-target'; const text=document.createElementNS('http://www.w3.org/2000/svg','text'); text.textContent='diagnostic'; a.appendChild(text); const set=document.createElementNS('http://www.w3.org/2000/svg','set'); set.setAttribute('attributeName','href'); set.setAttribute('to',${JSON.stringify(receiver)}); set.setAttribute('begin','0s'); a.appendChild(set); svg.appendChild(a); document.body.appendChild(svg); setTimeout(() => { a.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:false})); resolve({}); },150); })`,
  },
  {
    name: 'worker-borrowed-import',
    control: 'worker',
    code: () =>
      `new Promise((resolve,reject)=>{ const worker=new Worker('/app/policy-worker.js'); worker.onmessage=event=>{worker.terminate();resolve(event.data);}; worker.onerror=event=>{worker.terminate();reject(new Error(event.message));}; })`,
  },
];

export const borrowedWorkerSource = `
try {
  const importer=WorkerGlobalScope.prototype.importScripts;
  if(typeof importer!=='function')postMessage({available:false});
  else importer.call(self,'/app/policy-import.js');
} catch(error) { postMessage({available:true,error:String(error)}); }
`;

export const borrowedWorkerImport = `postMessage({available:true,wasm:typeof WebAssembly,nativeMarker:typeof __privacyNativePolicyWorker});`;
