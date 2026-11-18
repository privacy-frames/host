import { GuestResources } from '../../src/guest/resources.ts';
import {
  createGuestWebServices,
  type GuestXMLHttpRequestConstructor,
} from '../../src/guest/web-services.ts';

const bytes = (text: string) => new TextEncoder().encode(text).buffer;
const resources = new GuestResources({
  application: 'fixture',
  generation: 'fixture',
  sourceURL: 'https://publisher.invalid/app/',
  documentBase: 'https://publisher.invalid/app/',
  runtimeURL: location.origin + '/',
  applicationURL: location.origin + '/fixture/',
  engineWasm: new ArrayBuffer(0),
  resources: [
    {
      url: 'https://publisher.invalid/app/value.txt',
      path: 'value.txt',
      contentType: 'text/plain',
      bytes: bytes('local text'),
    },
    {
      url: 'https://publisher.invalid/app/value.xml',
      path: 'value.xml',
      contentType: 'application/xml',
      bytes: bytes('<root><value>local</value></root>'),
    },
    {
      url: 'https://publisher.invalid/app/value.html',
      path: 'value.html',
      contentType: 'text/html',
      bytes: bytes('<p>local</p><script>globalThis.unexpectedScript=true</script>'),
    },
  ],
});
const services = createGuestWebServices({
  resources,
  nativeGlobal: window,
  application: 'fixture',
});

async function read(
  Constructor: typeof XMLHttpRequest | GuestXMLHttpRequestConstructor,
  url: string,
  async: boolean,
) {
  const xhr = new Constructor();
  const states: number[] = [];
  const events: string[] = [];
  xhr.onreadystatechange = () => states.push(xhr.readyState);
  for (const type of ['loadstart', 'progress', 'load', 'loadend'])
    xhr.addEventListener(type, () => events.push(type));
  const complete = new Promise<void>((resolve) =>
    xhr.addEventListener('loadend', () => resolve()),
  );
  xhr.open('GET', url, async);
  xhr.send();
  await complete;
  return {
    states,
    events,
    text: xhr.responseText,
    status: xhr.status,
    statusText: xhr.statusText,
    url: xhr.responseURL,
  };
}

async function documentResponse(type: 'document' | '', url: string) {
  const xhr = new services.XMLHttpRequest();
  xhr.open('GET', url);
  xhr.responseType = type;
  const complete = new Promise<void>((resolve) => (xhr.onloadend = () => resolve()));
  xhr.send();
  await complete;
  return xhr.responseXML;
}

try {
  const localAsync = await read(services.XMLHttpRequest, 'value.txt', true);
  const nativeAsync = await read(XMLHttpRequest, '/native.txt', true);
  const localSync = await read(services.XMLHttpRequest, 'value.txt', false);
  const nativeSync = await read(XMLHttpRequest, '/native.txt', false);
  const xml = await documentResponse('', 'value.xml');
  const html = await documentResponse('document', 'value.html');
  const binary = new services.XMLHttpRequest();
  binary.open('GET', 'value.txt');
  binary.responseType = 'arraybuffer';
  const binaryDone = new Promise<void>((resolve) => (binary.onloadend = () => resolve()));
  binary.send();
  await binaryDone;
  const synchronous = new services.XMLHttpRequest();
  synchronous.open('GET', 'value.txt', false);
  let syncResponseTypeError = '';
  try {
    synchronous.responseType = 'arraybuffer';
  } catch (error) {
    syncResponseTypeError = error instanceof DOMException ? error.name : String(error);
  }
  let cameraError = '';
  try {
    await services.navigator.mediaDevices?.getUserMedia({ video: true });
  } catch (error) {
    cameraError = error instanceof DOMException ? error.name : String(error);
  }
  const permission = await services.navigator.permissions.query({ name: 'camera' });
  let deniedRead = false;
  try {
    await services.fetch('https://not-admitted.invalid/private');
  } catch {
    deniedRead = true;
  }
  Reflect.set(globalThis, 'webServicesResult', {
    localAsync,
    nativeAsync,
    localSync,
    nativeSync,
    xml: xml?.documentElement.nodeName,
    html: html?.documentElement.nodeName,
    inertScript: !Reflect.has(globalThis, 'unexpectedScript'),
    binary:
      binary.response instanceof ArrayBuffer
        ? new TextDecoder().decode(binary.response)
        : 'wrong type',
    syncResponseTypeError,
    cameraError,
    cameraPermission: permission.state,
    serviceWorkerAbsent: !('serviceWorker' in services.navigator),
    beaconBlocked:
      services.navigator.sendBeacon('https://not-admitted.invalid/private', 'local') ===
      false,
    deniedRead,
  });
} catch (error) {
  Reflect.set(globalThis, 'webServicesResult', {
    error: String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
} finally {
  services.dispose();
}
