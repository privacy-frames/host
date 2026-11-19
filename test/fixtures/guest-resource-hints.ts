import { GuestDOM } from '../../src/guest/dom.ts';
import { GuestResources } from '../../src/guest/resources.ts';

try {
  const remote = decodeURIComponent(location.hash.slice(1));
  const control = document.createElement('link');
  control.rel = 'preload';
  control.as = 'script';
  control.href = remote + '/native-control.js';
  await new Promise<void>((resolve, reject) => {
    control.onload = () => resolve();
    control.onerror = () => reject(new Error('Native preload control failed'));
    document.head.append(control);
  });
  control.remove();
  const sourceURL = remote + '/app/';
  const evaluated: string[] = [];
  const errors: string[] = [];
  const resources = new GuestResources({
    application: 'hints',
    generation: 'one',
    sourceURL,
    documentBase: sourceURL,
    runtimeURL: location.origin + '/',
    applicationURL: location.origin + '/installed/',
    engineWasm: new ArrayBuffer(0),
    workerBootstrap: {
      dedicated: new ArrayBuffer(0),
      shared: new ArrayBuffer(0),
      worklet: new ArrayBuffer(0),
    },
    resources: ['a', 'b'].map((name) => ({
      url: sourceURL + name + '.js',
      path: name + '.js',
      contentType: 'text/javascript',
      bytes: new TextEncoder().encode(name).buffer,
    })),
  });
  const dom = new GuestDOM({
    document,
    resources,
    evaluate(code) {
      evaluated.push(code);
    },
    error(error) {
      errors.push(String(error));
    },
  });
  await dom.render('<title>Catalog resource hints</title>');
  const events: string[] = [];
  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 25));
  const hint = document.createElement('link');
  let synchronous = true;
  hint.onload = () => events.push(synchronous ? 'synchronous' : 'load');
  hint.onerror = () => events.push('error');
  dom.attribute(hint, 'href', 'a.js');
  dom.attribute(hint, 'rel', 'preload');
  hint.as = 'script';
  document.head.append(hint);
  dom.connected(hint);
  synchronous = false;
  await pause();
  const first = [...events];
  const noNativeHref = !hint.hasAttribute('href');
  const noPreloadExecution = evaluated.length === 0;
  dom.connected(hint);
  await pause();
  const deduplicated = events.length === 1;
  dom.attribute(hint, 'href', 'b.js');
  await pause();
  dom.attribute(hint, 'href', 'missing.js');
  await pause();
  const changed = [...events];
  dom.attribute(hint, 'href', 'a.js');
  dom.forgetAttribute(hint, 'href');
  hint.removeAttribute('href');
  await pause();
  const cancelled = events.length === 3;
  const deferred = document.createElement('link');
  dom.attribute(deferred, 'rel', 'modulepreload');
  dom.attribute(deferred, 'href', 'a.js');
  const detachedEvents: string[] = [];
  deferred.onload = () => detachedEvents.push('load');
  await pause();
  const detached = detachedEvents.length === 0;
  document.head.append(deferred);
  dom.connected(deferred);
  await pause();
  const chain = document.createElement('link');
  document.head.append(chain);
  dom.connected(chain);
  dom.attribute(chain, 'rel', 'preload');
  chain.as = 'script';
  chain.onload = () => {
    const script = document.createElement('script');
    dom.attribute(script, 'src', 'b.js');
    dom.prepare(script);
    document.head.append(script);
    dom.connected(script);
  };
  dom.attribute(chain, 'href', 'b.js');
  await pause();
  Reflect.set(globalThis, 'resourceHintResult', {
    first,
    noNativeHref,
    noPreloadExecution,
    deduplicated,
    changed,
    cancelled,
    detached,
    detachedEvents,
    evaluated,
    errors,
    nativeExecution: Reflect.get(globalThis, 'unexpectedNativeExecution'),
  });
  dom.dispose();
  resources.dispose();
} catch (error) {
  Reflect.set(globalThis, 'resourceHintResult', { error: String(error) });
}
