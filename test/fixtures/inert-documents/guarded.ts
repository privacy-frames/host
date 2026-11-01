import { prepareWindowRealm } from '../../../src/runtime/contexts/window-realm.ts';

interface ProbeResult {
  checks: number;
  insertions: number;
  workerLog: unknown;
  nativeProcessingInstruction: boolean;
  nativeXSLT: boolean;
}
declare global {
  interface Window {
    runInertProbe(receiver: string): Promise<ProbeResult>;
  }
}
let checks = 0;
function check(value: unknown, message: string): asserts value {
  checks++;
  if (!value) throw new Error(message);
}
function denied(operation: () => unknown): boolean {
  try {
    operation();
    return false;
  } catch {
    return true;
  }
}
window.runInertProbe = async (receiver: string): Promise<ProbeResult> => {
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller)
    await new Promise<void>((resolve) =>
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
        once: true,
      }),
    );
  const controller = navigator.serviceWorker.controller;
  const post = ServiceWorker.prototype.postMessage;
  const nativeInstruction = document.createProcessingInstruction(
    'inert-control',
    'native-construction',
  );
  const nativeXSLT = typeof Reflect.get(globalThis, 'XSLTProcessor') === 'function';
  prepareWindowRealm({
    application: 'inert-fixture',
    applicationURL: location.origin + '/app/',
    scriptNonce: 'inert-guard',
    enableDocumentContexts: true,
  }).admitContent({
    scripts: [],
    source: location.origin + '/app/',
    installationGeneration: 'generation-a',
    aliases: [[location.origin + '/local.svg', location.origin + '/local.svg']],
  });
  check(
    nativeInstruction.nodeType === 7,
    'Native processing-instruction control unavailable',
  );
  check(
    denied(() =>
      document.createProcessingInstruction(
        'xml-stylesheet',
        'href="' + receiver + '/dummy.css"',
      ),
    ),
    'Processing instruction constructor available',
  );
  check(
    denied(() => document.body.append(nativeInstruction)),
    'Active insertion admitted processing instruction',
  );
  check(
    denied(() => document.importNode(nativeInstruction, true)),
    'Import admitted processing instruction',
  );
  check(
    denied(() => document.adoptNode(nativeInstruction)),
    'Adopt admitted processing instruction',
  );
  if (nativeXSLT)
    check(
      denied(() => Reflect.construct(Reflect.get(globalThis, 'XSLTProcessor'), [])),
      'XSLTProcessor remains available',
    );
  const xml = document.implementation.createDocument(null, 'model', null);
  check(
    xml.defaultView === null && xml instanceof XMLDocument,
    'XML constructor supplied a realm',
  );
  const cell = xml.createElement('cell');
  cell.setAttribute('id', 'one');
  xml.documentElement.appendChild(cell);
  check(
    xml.documentElement.firstElementChild === cell && cell.namespaceURI === null,
    'No-namespace XML construction failed',
  );
  const foreign = xml.createElementNS('urn:fixture:data', 'item');
  xml.documentElement.appendChild(foreign);
  check(
    foreign.namespaceURI === 'urn:fixture:data',
    'Data namespace construction failed',
  );
  check(
    new XMLSerializer().serializeToString(xml).includes('id="one"'),
    'XML serialization failed',
  );
  check(
    denied(() =>
      document.implementation.createDocument(
        'http://www.w3.org/1999/xhtml',
        'iframe',
        null,
      ),
    ),
    'XML root created a browsing context',
  );
  check(
    denied(() => xml.createElement('script')),
    'XML construction admitted script',
  );
  check(
    denied(() => xml.createElement('iframe')),
    'XML construction admitted context',
  );
  check(
    denied(() =>
      document.implementation.createDocumentType('model', '', receiver + '/document.dtd'),
    ),
    'XML doctype constructor admitted external identifier',
  );
  const inert = document.implementation.createHTMLDocument('');
  check(
    inert.defaultView === null && inert instanceof HTMLDocument,
    'Native viewless identity lost',
  );
  inert.body.innerHTML = '<form></form><form></form>';
  check(inert.body.childNodes.length === 2, 'Adjacent native form construction failed');
  const base = inert.createElement('base');
  base.href = location.href;
  inert.head.append(base);
  check(inert.baseURI === location.href, 'Native inert base resolution failed');
  check(inert.body.ownerDocument.defaultView === null, 'Inert owner supplied Window');
  const nativeView = Object.getOwnPropertyDescriptor(
    Document.prototype,
    'defaultView',
  )!.get!;
  check(
    Reflect.apply(nativeView, inert, []) === null,
    'Native prototype view exposed Window',
  );
  check(
    denied(() =>
      new DOMParser().parseFromString(
        '<!DOCTYPE svg SYSTEM "https://example.invalid/document.dtd"><svg/>',
        'image/svg+xml',
      ),
    ),
    'Parser admitted external XML declaration',
  );
  check(
    denied(() =>
      new DOMParser().parseFromString(
        '<?xml-stylesheet href="https://example.invalid/style.css"?><svg/>',
        'image/svg+xml',
      ),
    ),
    'Parser admitted XML resource instruction',
  );
  const parsed = new DOMParser().parseFromString(
    '<section><b>Parsed</b></section>',
    'text/html',
  );
  check(
    parsed.defaultView === null && parsed.body.firstElementChild?.localName === 'section',
    'Native parser changed',
  );
  check(
    denied(() => new DOMParser().parseFromString('<iframe></iframe>', 'text/html')),
    'Parser admitted context markup',
  );
  check(
    denied(() => new DOMParser().parseFromString('<script>void 0</script>', 'text/html')),
    'Parser admitted executable markup',
  );
  check(
    denied(() => inert.createElement('iframe')),
    'Inert document created active context facade',
  );
  check(
    denied(() => inert.createElement('script')),
    'Inert construction admitted script',
  );
  const template = document.createElement('template');
  check(template.content.ownerDocument.defaultView === null, 'Template owner has Window');
  template.content.ownerDocument.createElement('base');
  check(true, 'Template owner supports passive native construction');
  const source = inert.createElement('article');
  source.innerHTML = '<p>Adopted passive content</p>';
  document.body.append(source);
  check(
    source.ownerDocument === document && source.textContent === 'Adopted passive content',
    'Passive live adoption failed',
  );
  const imported = document.importNode(parsed.body.firstElementChild!, true);
  document.body.append(imported);
  check(imported.ownerDocument === document, 'Passive native import failed');
  const adopted = document.adoptNode(inert.createElement('span'));
  document.body.append(adopted);
  check(adopted.ownerDocument === document, 'Passive native adopt failed');
  check(
    denied(() => document.adoptNode(base)),
    'Active adopt admitted base',
  );
  check(
    denied(() => document.importNode(base, true)),
    'Active import admitted base',
  );
  const beforeBase = document.baseURI;
  const operations: ((target: HTMLDivElement, base: HTMLBaseElement) => void)[] = [
    (target, node) => target.appendChild(node),
    (target, node) => target.insertBefore(node, null),
    (target, node) => target.replaceChild(node, target.firstChild!),
    (target, node) => target.append(node),
    (target, node) => target.prepend(node),
    (target, node) => target.replaceChildren(node),
    (target, node) => target.before(node),
    (target, node) => target.after(node),
    (target, node) => target.replaceWith(node),
    (target, node) => target.insertAdjacentElement('beforeend', node),
    (target, node) => {
      const range = document.createRange();
      range.selectNodeContents(target);
      range.insertNode(node);
    },
    (target, node) => {
      const range = document.createRange();
      range.selectNodeContents(target);
      range.surroundContents(node);
    },
  ];
  for (const operation of operations) {
    const target = document.createElement('div');
    target.append(document.createElement('span'));
    document.body.append(target);
    const node = inert.createElement('base');
    node.href = location.origin + '/changed/';
    check(
      denied(() => operation(target, node)),
      'Live insertion admitted base',
    );
    check(document.baseURI === beforeBase, 'Live base changed');
    target.remove();
  }
  const moving = inert.createElement('div');
  inert.body.append(moving);
  const movingBase = inert.createElement('base');
  movingBase.href = location.origin + '/changed/';
  check(
    denied(() =>
      Reflect.apply(moving.append, moving, [
        {
          toString() {
            document.body.append(moving);
            return '';
          },
        },
        movingBase,
      ]),
    ),
    'Conversion moved destination past base guard',
  );
  check(document.baseURI === beforeBase, 'Conversion changed active base');
  moving.remove();
  const images = document.implementation.createHTMLDocument('');
  images.body.innerHTML =
    '<img src="' +
    receiver +
    '/dummy-inert"><img src="' +
    location.origin +
    '/local.svg">';
  await new Promise((resolve) => setTimeout(resolve, 80));
  document.body.append(...Array.from(images.body.childNodes));
  await new Promise((resolve) => setTimeout(resolve, 120));
  const workerLog = await new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => resolve(event.data);
    Reflect.apply(post, controller, [{}, [channel.port2]]);
  });
  return {
    checks,
    insertions: operations.length,
    workerLog,
    nativeProcessingInstruction: nativeInstruction.nodeType === 7,
    nativeXSLT,
  };
};
