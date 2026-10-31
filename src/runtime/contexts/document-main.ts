import { createControllerClient } from '../controller-client.ts';
import { createDocumentControl } from './document-client.ts';
import {
  internalArray,
  ownDescriptor,
  internalRecord,
} from '../../shared/primordials.ts';
import { createDocumentRenderer } from './document-renderer.ts';
import { prepareWindowRealm } from './window-realm.ts';
import {
  documentIdentifier,
  parseDocumentBootstrap,
  parseDocumentContentInput,
  type DocumentBootstrapConfiguration,
} from './document-protocol.ts';

// The empty native HTML/SVG shell contains no publisher markup. Capture every
// operation before common preparation and before publishing this Window.
const apply = Reflect.apply;
const descriptor = ownDescriptor;
const nativeDocument = document;
const nativeWindow = window;
const frameParent = window.parent;
const nativeOpener = window.opener;
const setOpener = descriptor(window, 'opener')?.set;
const setName = descriptor(window, 'name')?.set;
let nativeParent = frameParent;
const nativePost = window.postMessage;
const nativeStop = window.stop;
const add = EventTarget.prototype.addEventListener;
const remove = EventTarget.prototype.removeEventListener;
const eventData = descriptor(MessageEvent.prototype, 'data')!.get!;
const eventSource = descriptor(MessageEvent.prototype, 'source')!.get!;
const eventOrigin = descriptor(MessageEvent.prototype, 'origin')!.get!;
const eventPorts = descriptor(MessageEvent.prototype, 'ports')!.get!;
const eventTrusted = descriptor(new Event('message'), 'isTrusted')!.get!;
const stopEvent = Event.prototype.stopImmediatePropagation;
const portPost = MessagePort.prototype.postMessage;
const portStart = MessagePort.prototype.start;
const readyState = descriptor(Document.prototype, 'readyState')!.get!;
const nativeTimer = window.setTimeout;
const getAttribute = Element.prototype.getAttribute;
const textContent = descriptor(Node.prototype, 'textContent')!.set!;
const documentElement = descriptor(Document.prototype, 'documentElement')!.get!;
const nativeURL = URL;
const logError = console.error.bind(console);
const documentURL = new nativeURL(location.href);
documentURL.hash = '';
const expectedURL = documentURL.href;

async function waitForShell(): Promise<void> {
  // Lifecycle delivery can precede the asynchronous configuration response or
  // be suppressed by the renderer. Read native completion rather than waiting
  // for an event whose dispatch may already have passed.
  while (apply(readyState, nativeDocument, []) !== 'complete')
    await new Promise<void>((resolve) => apply(nativeTimer, nativeWindow, [resolve, 10]));
  if (nativeDocument !== document) throw new Error('Document changed during preparation');
}

let configuration: DocumentBootstrapConfiguration | undefined;
let control: MessagePort | undefined;
let parentOrigin: string | undefined;

async function start(script: Element | null) {
  if (!script) throw new Error('Trusted document bootstrap is missing');
  const id = documentIdentifier(apply(getAttribute, script, ['data-privacy-context']));
  const scriptSource =
    apply(getAttribute, script, ['src']) || apply(getAttribute, script, ['href']);
  if (!scriptSource) throw new Error('Trusted document script address is missing');
  const runtime = new nativeURL('./', scriptSource);
  if (
    new nativeURL(scriptSource).href !==
    new nativeURL(`document-guard.js?context=${id}`, runtime).href
  )
    throw new Error('Unexpected document bootstrap script');
  const workerGetter = descriptor(Navigator.prototype, 'serviceWorker')?.get;
  const controllerGetter = descriptor(
    ServiceWorkerContainer.prototype,
    'controller',
  )?.get;
  const scriptGetter = descriptor(ServiceWorker.prototype, 'scriptURL')?.get;
  if (!workerGetter || !controllerGetter || !scriptGetter)
    throw new Error('Document controller APIs unavailable');
  // The initially blank navigator's container can remain stale in Chromium.
  const container = apply(workerGetter, navigator, []);
  const controller = apply(controllerGetter, container, []);
  if (
    !controller ||
    apply(scriptGetter, controller, []) !== new nativeURL('sw.js', runtime).href
  )
    throw new Error('Application document is not controlled by the host');

  const documentControl = createDocumentControl(createControllerClient().request);
  configuration = parseDocumentBootstrap(
    await documentControl('configuration', internalRecord({ id })),
    expectedURL,
  );
  const config = configuration;
  if (config.carrier === 'popup') {
    if (frameParent !== nativeWindow || !nativeOpener || !config.popup)
      throw new Error('Application popup requires its owning opener');
    nativeParent = nativeOpener;
    if (config.popup.noopener && !setOpener)
      throw new Error('Cannot remove the popup opener');
  } else if (frameParent === nativeWindow || nativeOpener !== null)
    throw new Error('Application document requires its owning frame');
  if (config.id !== id || config.runtimeURL !== runtime.href)
    throw new Error('Document bootstrap scope mismatch');
  const origin = runtime.origin;
  parentOrigin = origin;
  const realm = prepareWindowRealm(
    internalRecord({
      application: config.application,
      applicationURL: config.applicationURL,
      documentURL: expectedURL,
      scriptNonce: config.nonce,
      enableDocumentContexts: true,
    }),
  );
  realm.admitContent(config.content);
  const renderer = createDocumentRenderer(
    internalRecord({
      nonce: config.nonce,
      scripts: realm.scripts,
      resources: realm.resources,
      prepareContext: realm.documents?.prepareContext,
      contextsLoaded: realm.documents?.whenLoaded,
      contextsPrepared: realm.documents?.whenPrepared,
      deferChildStartup: realm.documents?.deferChildStartup,
    }),
  );
  // Compile while the parent still cannot access this Window's mutable DOM
  // prototypes. Publication happens before executing app code or measuring layout.

  const received = await documentControl('content', internalRecord({ id }));

  const input = parseDocumentContentInput(received, config);

  const compiled = realm.policy.compile(input);

  renderer.prepare(compiled);

  await waitForShell();

  await new Promise<void>((resolve) => {
    const receive = (event: MessageEvent) => {
      const data: unknown = protocolData(apply(eventData, event, []));
      if (
        !apply(eventTrusted, event, []) ||
        apply(eventSource, event, []) !== nativeParent ||
        apply(eventOrigin, event, []) !== origin ||
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data)
      )
        return;
      const field = (key: string) => descriptor(data, key)?.value;
      const ports = internalArray<MessagePort>(Array.from(apply(eventPorts, event, [])));
      if (
        field('type') !== 'privacy-document-port' ||
        field('id') !== id ||
        field('parentToken') !== config.parentToken ||
        ports.length !== 1
      )
        return;
      apply(stopEvent, event, []);
      apply(remove, nativeWindow, ['message', receive, true]);
      control = ports[0];
      apply(add, control, [
        'message',
        (message: MessageEvent) => {
          const value: unknown = protocolData(apply(eventData, message, []));
          if (
            value &&
            typeof value === 'object' &&
            descriptor(value, 'type')?.value === 'published'
          )
            resolve();
        },
      ]);
      apply(portStart, control, []);
    };
    apply(add, nativeWindow, ['message', receive, true]);

    apply(nativePost, nativeParent, [
      internalRecord({
        type: 'privacy-document-guarded',
        id,
        parentToken: config.parentToken,
      }),
      origin,
    ]);
  });
  if (config.carrier === 'popup' && config.popup) {
    if (setName) apply(setName, nativeWindow, [config.popup.name]);
    if (config.popup.noopener) apply(setOpener!, nativeWindow, [null]);
  }
  await renderer.render(compiled);
  realm.documents?.settle();
  if (!control) throw new Error('Document parent channel missing');
  apply(portPost, control, [internalRecord({ type: 'loaded' })]);
}

export function startDocumentGuard(script: Element | null) {
  void start(script).catch((error: unknown) => {
    try {
      apply(nativeStop, nativeWindow, []);
      if (control) apply(portPost, control, [internalRecord({ type: 'failed' })]);
      else if (configuration && parentOrigin)
        apply(nativePost, nativeParent, [
          internalRecord({
            type: 'privacy-document-failed',
            id: configuration.id,
            parentToken: configuration.parentToken,
          }),
          parentOrigin,
        ]);
      apply(textContent, apply(documentElement, nativeDocument, []), [
        'Application document could not start.',
      ]);
    } catch (notificationError) {
      logError('Document startup notification failed', notificationError);
    } finally {
      logError(error);
    }
  });
}

function protocolData(value: unknown): unknown {
  return value !== null && typeof value === 'object' ? internalRecord(value) : value;
}
