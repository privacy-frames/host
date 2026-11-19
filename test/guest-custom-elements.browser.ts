import { createGuestWindow } from '../src/guest/session.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';

declare global {
  var customElementResults: { result?: unknown; error?: string } | undefined;
  var nativeCustomCallback: boolean;
  var nativeCustomControl: boolean;
}

globalThis.nativeCustomCallback = false;
class NativeControl extends HTMLElement {
  connectedCallback() {
    this.addEventListener('click', (event) => event.preventDefault());
  }
}
customElements.define('x-native-control', NativeControl);
const control = document.createElement('x-native-control');
document.body.append(control);
const controlEvent = new MouseEvent('click', { cancelable: true });
globalThis.nativeCustomControl =
  control instanceof NativeControl &&
  !control.dispatchEvent(controlEvent) &&
  controlEvent.defaultPrevented;
control.remove();
const engineWasm = await (await fetch('/engine.wasm')).arrayBuffer();
const catalog: GuestContextCatalog = {
  application: 'custom-elements',
  generation: 'fixture',
  applicationURL: new URL('/app/', location.href).href,
  sourceURL: new URL('/publisher/', location.href).href,
  documentBase: new URL('/publisher/', location.href).href,
  runtimeURL: new URL('/', location.href).href,
  engineWasm,
  workerBootstrap: {
    dedicated: new ArrayBuffer(0),
    shared: new ArrayBuffer(0),
    worklet: new ArrayBuffer(0),
  },
  resources: [],
};
try {
  const session = await createGuestWindow(catalog, window);
  await session.render(`<!doctype html><x-before></x-before><output id="result"></output><script>
(async () => {
  const events = [];
  let observations = 0;
  class Before extends HTMLElement {
    static get observedAttributes() { observations++; return ['title']; }
    constructor() { super(); this.guestField = 42; events.push('construct'); }
    connectedCallback() {
      globalThis.nativeCustomCallback = true;
      events.push('connected');
      this.addEventListener('click', event => { event.preventDefault(); events.push('cancel'); });
    }
    disconnectedCallback() { events.push('disconnected'); }
    attributeChangedCallback(name, oldValue, newValue) { events.push([name, oldValue, newValue]); }
    describe() { return this.localName + ':' + this.guestField; }
  }
  const waiting = customElements.whenDefined('x-before');
  customElements.define('x-before', Before);
  const resolved = await waiting;
  const upgraded = document.querySelector('x-before');
  const created = document.createElement('x-before');
  const constructed = new Before();
  document.body.append(created, constructed);
  created.setAttribute('title', 'private');
  const click = new MouseEvent('click', { cancelable: true, bubbles: true });
  const dispatched = created.dispatchEvent(click);
  created.remove();
  const fragment = document.createDocumentFragment();
  const late = document.createElement('x-late');
  fragment.append(late);
  class Late extends HTMLElement { constructor() { super(); this.upgraded = true; } }
  customElements.define('x-late', Late);
  customElements.upgrade(fragment);
  class Button extends HTMLButtonElement { constructor() { super(); this.buttonField = 7; } }
  customElements.define('x-button', Button, { extends: 'button' });
  const button = document.createElement('button', { is: 'x-button' });
  const buttonNew = new Button();
  let invalid = '';
  try { customElements.define('invalid', class extends HTMLElement {}); } catch(error) { invalid = error.name; }
  document.getElementById('result').textContent = JSON.stringify({
    events, observations, resolved: resolved === Before, registered: customElements.get('x-before') === Before,
    prototypes: [upgraded, created, constructed].map(element => element instanceof Before && element instanceof HTMLElement && element.describe() === 'x-before:42'),
    synchronousCancellation: !dispatched && click.defaultPrevented,
    late: late instanceof Late && late.upgraded,
    customized: button instanceof Button && buttonNew instanceof Button && button.buttonField === 7 && buttonNew.buttonField === 7,
    invalid
  });
})().catch(error => document.getElementById('result').textContent = JSON.stringify({error: error.stack}));
</script>`);
  const output = document.querySelector('#result')!;
  const start = performance.now();
  while (!output.textContent && performance.now() - start < 15000)
    await new Promise((resolve) => setTimeout(resolve, 10));
  globalThis.customElementResults = {
    result: JSON.parse(output.textContent || '{"error":"Timed out"}'),
  };
} catch (error) {
  globalThis.customElementResults = {
    error: String(error instanceof Error ? error.stack : error),
  };
}
