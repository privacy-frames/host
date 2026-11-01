import { prepareScriptURLs } from '../../../src/runtime/enforcement/script-urls.ts';
import { createTrustedPolicy } from '../../../src/runtime/trusted/client.ts';
import { createPolicyTools } from '../../../src/runtime/enforcement/native.ts';
import {
  installDOMPolicy,
  installResourceAttributePolicy,
} from '../../../src/runtime/enforcement/dom.ts';

prepareScriptURLs();
const tools = createPolicyTools();
const mapURL = (input: unknown): string =>
  String(input) === 'https://publisher.test/theme.css'
    ? '/admitted.css'
    : String(input) === 'https://publisher.test/preloaded.js'
      ? '/admitted.js'
      : String(input);
installDOMPolicy(
  tools,
  Element.prototype.getAttribute,
  createTrustedPolicy(location.href),
  undefined,
  undefined,
  mapURL,
);
installResourceAttributePolicy(tools, mapURL);

declare global {
  interface Window {
    probeResourceElements(receiver: string): Promise<{
      denied: number;
      styled: boolean;
      preloaded: boolean;
      preloadExecuted: boolean;
    }>;
  }
}
window.probeResourceElements = async (receiver: string) => {
  let denied = 0;
  const reject = (operation: () => void) => {
    try {
      operation();
    } catch {
      denied++;
      return;
    }
    throw new Error('Forbidden resource operation succeeded');
  };
  for (const rel of [
    'preconnect',
    'dns-prefetch',
    'prefetch',
    'prerender',
    'modulepreload',
    'stylesheet preconnect',
  ]) {
    const attribute = document.createElement('link');
    attribute.href = receiver + '/attribute-' + rel;
    reject(() => attribute.setAttribute('rel', rel));
    const property = document.createElement('link');
    property.href = receiver + '/property-' + rel;
    reject(() => {
      property.rel = rel;
    });
  }
  const preload = document.createElement('link');
  preload.rel = 'preload';
  reject(() => {
    preload.as = 'document';
  });
  reject(() => preload.setAttribute('as', 'fetch'));
  reject(() => preload.setAttributeNS('urn:foreign', 'rel', 'preconnect'));
  reject(() => preload.setAttribute('imagesrcset', receiver + '/image 1x'));
  reject(() => preload.setAttribute('onload', 'leak()'));
  reject(() => {
    preload.relList.value = 'preconnect';
  });
  reject(() => preload.relList.add('preconnect'));
  const rel = preload.getAttributeNode('rel');
  if (!rel) throw new Error('Missing rel attribute');
  reject(() => {
    rel.value = 'preconnect';
  });
  const hint = document.createAttribute('rel');
  hint.value = 'preconnect';
  reject(() => preload.attributes.setNamedItem(hint));
  reject(() => document.createElement('meta'));
  reject(() => document.createElement('base'));
  const policy = document.querySelector('meta[http-equiv]');
  if (!policy) throw new Error('Host policy fixture missing');
  reject(() => policy.setAttribute('content', '0;url=' + receiver + '/refresh'));
  const style = document.createElement('link');
  style.setAttribute('rel', 'stylesheet');
  style.setAttribute('href', 'https://publisher.test/theme.css');
  style.setAttribute('charset', 'UTF-8');
  style.setAttribute('type', 'text/css');
  await new Promise<void>((resolve, reject) => {
    style.onload = () => resolve();
    style.onerror = () => reject(new Error('Admitted stylesheet failed'));
    document.head.appendChild(style);
  });
  const styled =
    getComputedStyle(document.body).getPropertyValue('--resource-proof').trim() ===
    'admitted';
  const script = document.createElement('link');
  script.rel = 'preload';
  script.as = 'script';
  script.href = 'https://publisher.test/preloaded.js';
  await new Promise<void>((resolve, reject) => {
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Admitted script preload failed'));
    document.head.append(script);
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  return {
    denied,
    styled,
    preloaded: true,
    preloadExecuted: Reflect.get(window, 'preloadExecuted') === true,
  };
};
