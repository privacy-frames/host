import { GuestResources } from '../../src/guest/resources.ts';
import { createGuestDOMParser, parsedElementSource } from '../../src/guest/parser.ts';

const resources = new GuestResources({
  application: 'parser',
  generation: 'parser',
  sourceURL: 'https://publisher.invalid/app/',
  documentBase: 'https://publisher.invalid/app/',
  runtimeURL: location.origin + '/',
  applicationURL: location.origin + '/installed/',
  engineWasm: new ArrayBuffer(0),
  resources: [
    {
      url: 'https://publisher.invalid/app/asset.png',
      path: 'asset.png',
      contentType: 'image/png',
      bytes: new Uint8Array([0]).buffer,
    },
  ],
});
const Parser = createGuestDOMParser(document, resources);
const parser = new Parser();
const external = location.hash
  ? decodeURIComponent(location.hash.slice(1))
  : location.origin;
const xmlNamespace = 'http://www.w3.org/XML/1998/namespace';
let constructors = 0;
customElements.define(
  'parser-probe',
  class extends HTMLElement {
    constructor() {
      super();
      constructors++;
    }
  },
);

try {
  const html = parser.parseFromString(
    `<!doctype html><html><head><base href="https://publisher.invalid/app/"><style>@\\69mport "${external}/outside.css?marker=style"; .probe{background:image-set("${external}/outside.png?marker=css" 1x)}</style></head><body>
    <parser-probe></parser-probe><img id="mapped" src="asset.png" srcset="asset.png 1x, ${external}/outside.png?marker=srcset 2x" onerror="globalThis.nativeHandlerMarker=true">
    <img id="unknown" src="${external}/outside.png?marker=img">
    <script id="code" src="${external}/outside.js?marker=script">globalThis.nativeScriptMarker=true</script>
    <script type="application/json" id="json">{"local":true}</script>
    <iframe src="${external}/outside.html?marker=frame" srcdoc="<script>globalThis.frameMarker=true<\/script>"></iframe>
    <object data="${external}/outside.html?marker=object"></object>
    <meta http-equiv="refresh" content="0;url=${external}/outside.html?marker=refresh">
    <template><p data-value="kept">Template value</p></template></body></html>`,
    'text/html',
  );
  const script = html.querySelector('#code');
  if (!script) throw new Error('Script node was lost');
  const scriptSource = parsedElementSource(script);
  const htmlResult = {
    defaultView: html.defaultView === null,
    contentType: html.contentType,
    doctype: html.doctype?.name,
    base: html.baseURI,
    mapped: html.querySelector('#mapped')?.getAttribute('src'),
    unknown: html.querySelector('#unknown')?.getAttribute('src'),
    sourceSet: html.querySelector('#mapped')?.getAttribute('srcset'),
    handlerAbsent: !html.querySelector('#mapped')?.hasAttribute('onerror'),
    handlerMetadata: parsedElementSource(html.querySelector('#mapped')!)?.handlers.get(
      'onerror',
    ),
    frameAbsent:
      !html.querySelector('iframe')?.hasAttribute('src') &&
      !html.querySelector('iframe')?.hasAttribute('srcdoc'),
    objectAbsent: !html.querySelector('object')?.hasAttribute('data'),
    refreshAbsent: !html.querySelector('meta')?.hasAttribute('http-equiv'),
    scriptType: script.getAttribute('type'),
    scriptMetadata: scriptSource?.script,
    jsonKept: html.querySelector('script[type="application/json"]')?.textContent,
    template: html
      .querySelector('template')
      ?.content.firstElementChild?.getAttribute('data-value'),
    style: html.querySelector('style')?.textContent,
    customConstructorsBeforeAttachment: constructors,
  };

  const xml = parser.parseFromString(
    '<!DOCTYPE mxGraphModel SYSTEM "https://outside.invalid/schema.dtd"><mxGraphModel Foo="Keep"><root><mxCell ID="1" label="&lt;img src=&quot;https://outside.invalid/secret&quot;&gt;" style="image=https://outside.invalid/data;" src="https://outside.invalid/data"/></root><![CDATA[a<b]]></mxGraphModel>',
    'application/xml',
  );
  const cell = xml.querySelector('mxCell');
  const xmlResult = {
    root: xml.documentElement.nodeName,
    attribute: xml.documentElement.getAttribute('Foo'),
    ID: cell?.getAttribute('ID'),
    label: cell?.getAttribute('label'),
    style: cell?.getAttribute('style'),
    src: cell?.getAttribute('src'),
    doctype: xml.doctype?.name,
    systemId: xml.doctype?.systemId,
    cdataType: xml.documentElement.lastChild?.nodeType,
    cdata: xml.documentElement.lastChild?.textContent,
  };
  const svg = parser.parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" xml:base="https://outside.invalid/private/"><defs><linearGradient id="Paint"/></defs><image id="svgImage" xlink:href="${external}/outside.png?marker=svg"/><rect id="painted" fill="url(${external}/outside.svg?marker=paint)"/><set id="animation" attributeName="href" to="${external}/outside.svg?marker=animation"/><set id="handlerAnimation" attributeName="onload" to="globalThis.nativeHandlerMarker=true"/></svg>`,
    'image/svg+xml',
  );
  const svgResult = {
    namespace: svg.documentElement.namespaceURI,
    viewBox: svg.documentElement.getAttribute('viewBox'),
    gradientName: svg.querySelector('linearGradient')?.nodeName,
    href: svg
      .querySelector('#svgImage')
      ?.getAttributeNS('http://www.w3.org/1999/xlink', 'href'),
    fill: svg.querySelector('#painted')?.getAttribute('fill'),
    animation: svg.querySelector('#animation')?.getAttribute('to'),
    dangerousAnimationWithheld: !svg
      .querySelector('#handlerAnimation')
      ?.hasAttribute('attributeName'),
    baseWithheld: !svg.documentElement.hasAttributeNS(xmlNamespace, 'base'),
  };
  const qualifiedAnimation = parser.parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:q="http://www.w3.org/1999/xlink"><set id="qualified" attributeName=" q:href " to="${external}/outside.svg?marker=qualified"/><set id="base" attributeName="xml:base" to="${external}/private/"/></svg>`,
    'image/svg+xml',
  );
  const stylesheet = parser.parseFromString(
    `<?xml-stylesheet href="${external}/outside.css?marker=pi"?><root/>`,
    'application/xml',
  );
  const malformed = parser.parseFromString('<root><bad></root>', 'text/xml');
  const entity = parser.parseFromString('<root>&undefined;</root>', 'application/xml');
  const subset = parser.parseFromString(
    '<!DOCTYPE root [<!ENTITY x "local">]><root/>',
    'application/xml',
  );
  let unsupported = false;
  try {
    parser.parseFromString('', 'text/plain' as DOMParserSupportedType);
  } catch (error) {
    unsupported = error instanceof TypeError;
  }

  // The native parser control is observed separately; it may also avoid requests.
  const nativeControl = new DOMParser().parseFromString(
    `<img src="${external}/outside.png?marker=native-control">`,
    'text/html',
  );
  const executableControl = document.createElement('script');
  executableControl.textContent = 'globalThis.scriptPositiveControl=true';
  document.body.appendChild(executableControl);
  const nativeScriptDocument = new DOMParser().parseFromString(
    '<script>globalThis.nativeParsedScriptMarker=true<\/script>',
    'text/html',
  );
  const nativeScript = nativeScriptDocument.querySelector('script');
  if (nativeScript) document.body.appendChild(nativeScript);
  document.body.appendChild(script);
  await fetch(external + '/outside.png?marker=positive-control');
  Reflect.set(globalThis, 'parserResult', {
    html: htmlResult,
    xml: xmlResult,
    svg: svgResult,
    qualifiedAnimation: qualifiedAnimation
      .querySelector('#qualified')
      ?.getAttribute('to'),
    baseAnimationWithheld: !qualifiedAnimation
      .querySelector('#base')
      ?.hasAttribute('attributeName'),
    stylesheetPI: stylesheet.firstChild?.nodeValue,
    dtdSubset: subset.documentElement.localName,
    malformed: malformed.documentElement.localName,
    unknownEntity: entity.documentElement.localName,
    unsupported,
    nativeControlInertDocument: nativeControl.defaultView === null,
    scriptPositiveControl: Reflect.get(globalThis, 'scriptPositiveControl') === true,
    nativeParsedScriptInertAfterInsertion: !Reflect.has(
      globalThis,
      'nativeParsedScriptMarker',
    ),
    nativeMarkersAbsent:
      !Reflect.has(globalThis, 'nativeScriptMarker') &&
      !Reflect.has(globalThis, 'nativeHandlerMarker'),
  });
} catch (error) {
  Reflect.set(globalThis, 'parserResult', {
    error: String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}
