import { createGuestWindow } from '../src/guest/session.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';
import {
  borrowedWorkerImport,
  borrowedWorkerSource,
  guestPolicyCases,
} from './guest-policy-cases.ts';

declare const __GUEST_ENGINE_BASE64__: string;
declare global {
  var guestPolicyResult: Record<string, unknown> | undefined;
}

const parameters = new URL(location.href).searchParams;
const name = parameters.get('case');
const mode = parameters.get('mode');
const receiver = parameters.get('receiver') || '';
const selected = guestPolicyCases.find((candidate) => candidate.name === name);
if (!selected) throw new Error('Unknown policy fixture');

const decode = (value: string): ArrayBuffer =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0)).buffer;

async function run() {
  const source = selected!.code(receiver);
  let returned: unknown;
  let guestMarker: unknown;
  let failure: string | undefined;
  let foreign: Window | null = null;
  const closeForeign = () => foreign?.close();
  const prepareForeignEvent = () => {
    if (name !== 'foreign-window-source') return;
    foreign = window.open('about:blank');
    if (!foreign) throw new Error('Diagnostic popup was blocked');
    foreign.addEventListener('message', (event) => {
      if (event.data === 'diagnostic-reply') void fetch(receiver, { mode: 'no-cors' });
    });
    setTimeout(
      () =>
        window.dispatchEvent(
          new MessageEvent('message', { data: 'policy-event-source', source: foreign }),
        ),
      25,
    );
  };
  if (mode === 'control') {
    // This is an unrestricted control made exclusively from retained diagnostic
    // fixture source. Application source is never evaluated natively by the host.
    prepareForeignEvent();
    returned = await Function('return (' + source + ')')();
  } else {
    const documentBase = new URL('/app/', location.href).href;
    const text = (value: string) => new TextEncoder().encode(value).buffer;
    const catalog: GuestContextCatalog = {
      application: 'policy-' + 'a'.repeat(64),
      generation: 'policy-fixture',
      sourceURL: documentBase,
      documentBase,
      runtimeURL: new URL('/', location.href).href,
      applicationURL: new URL('/installed/policy/', location.href).href,
      engineWasm: decode(__GUEST_ENGINE_BASE64__),
      resources: [
        {
          url: documentBase,
          path: 'index.html',
          contentType: 'text/html',
          bytes: text('<!doctype html><html><head></head><body></body></html>'),
        },
        {
          url: new URL('policy-worker.js', documentBase).href,
          path: 'policy-worker.js',
          contentType: 'text/javascript',
          bytes: text(borrowedWorkerSource),
        },
        {
          url: new URL('policy-import.js', documentBase).href,
          path: 'policy-import.js',
          contentType: 'text/javascript',
          bytes: text(borrowedWorkerImport),
        },
      ],
    };
    const session = await createGuestWindow(catalog, window);
    await session.render('<!doctype html><html><head></head><body></body></html>');
    prepareForeignEvent();
    try {
      returned = await session.engine.evaluate(source, 'policy:' + name);
    } catch (error) {
      failure = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    guestMarker = session.engine.get('__nativePolicyMarker');
    // The native DOM is observed before disposal, independently of guest claims.
    const target = document.getElementById('policy-target');
    globalThis.guestPolicyResult = {
      returned,
      failure,
      guestMarker,
      nativeMarker: Reflect.get(globalThis, '__nativePolicyMarker'),
      native: target
        ? {
            tag: target.localName,
            href: target.getAttribute('href'),
            equiv: target.getAttribute('http-equiv'),
            src: target.querySelector('img')?.getAttribute('src'),
            spellcheck: Reflect.get(target, 'spellcheck'),
            writingSuggestions: Reflect.get(target, 'writingSuggestions'),
            writingAttribute: target.getAttribute('writingsuggestions'),
            animatedHref:
              'href' in target &&
              typeof target.href === 'object' &&
              target.href &&
              'animVal' in target.href
                ? target.href.animVal
                : undefined,
          }
        : null,
    };
    session.close();
    closeForeign();
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  const target = document.getElementById('policy-target');
  globalThis.guestPolicyResult = {
    returned,
    nativeMarker: Reflect.get(globalThis, '__nativePolicyMarker'),
    native: target
      ? {
          tag: target.localName,
          href: target.getAttribute('href'),
          equiv: target.getAttribute('http-equiv'),
          spellcheck: Reflect.get(target, 'spellcheck'),
          writingSuggestions: Reflect.get(target, 'writingSuggestions'),
          writingAttribute: target.getAttribute('writingsuggestions'),
        }
      : null,
  };
  closeForeign();
}

void run().catch((error: unknown) => {
  globalThis.guestPolicyResult = {
    error: String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
});
