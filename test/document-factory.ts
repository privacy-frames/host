import http from 'node:http';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from './build.ts';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';
import { testProvenance } from './provenance.ts';

// This fixture implements the trusted registration/guard/port protocol, not the
// controller's admission or full common realm enforcement.
const fixture = await build({
  stdin: {
    resolveDir: process.cwd(),
    sourcefile: 'document-factory-fixture.js',
    contents: `
import { createPolicyTools } from './src/runtime/enforcement/native.ts';
import {createTrustedPolicy} from './src/runtime/trusted/client.ts';
import { createDocumentFactory } from './src/runtime/contexts/document-factory.ts';
import { installDOMPolicy, installResourceAttributePolicy } from './src/runtime/enforcement/dom.ts';
import { installScriptPolicy } from './src/runtime/enforcement/scripts.ts';
const config = globalThis.fixtureRegistration;
const rawGet = Element.prototype.getAttribute;
globalThis.readPhysicalSandbox = frame => Reflect.apply(rawGet, frame, ['sandbox']);
const add = EventTarget.prototype.addEventListener;
// Explicit fixture transport; production uses the private controller channel.
const fixtureFetch = fetch;
const documentControl = async (operation, payload) => {
  const response = await fixtureFetch('/fixture/' + operation, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Fixture command refused');
  return response.json();
};
const nativePost = window.postMessage;
const nativeParent = parent;
const policy = createTrustedPolicy(location.origin + '/app/');
const tools = createPolicyTools();
const resources = { mapURL: value => String(value), isInstalledURL: () => false };
const scripts = installScriptPolicy(tools, { nonce: 'fixture_nonce', ...resources });
const documents = createDocumentFactory(tools, { applicationURL: location.origin + '/app/', baseURL: () => location.href, policy, documentControl });
installDOMPolicy(tools, rawGet, policy, scripts, documents);
installResourceAttributePolicy(tools, resources.mapURL, scripts, documents);
globalThis.waitForOwnedDocuments = () => documents.whenLoaded();
if (config) {
  globalThis.documentGuardFixture = true;
  globalThis.WebSocket = undefined;
  Reflect.apply(add, window, ['message', event => {
    const value = event.data;
    if (event.source !== nativeParent || event.origin !== location.origin || value?.type !== 'privacy-document-port' || value.id !== config.id || value.parentToken !== config.parentToken) return;
    event.stopImmediatePropagation();
    const port = event.ports[0];
    port.onmessage = message => {
      if (message.data?.type !== 'published') return;
      document.documentElement.setAttribute('data-application-ready', 'true');
      port.postMessage({ type: config.failure ? 'failed' : 'loaded' });
    };
    port.start();
  }, true]);
  setTimeout(() => Reflect.apply(nativePost, nativeParent, [{ type: config.failureBefore ? 'privacy-document-failed' : 'privacy-document-guarded', id: config.id, parentToken: config.parentToken }, location.origin]), 80);
}
`,
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
});
const script = fixture.outputFiles[0].text;
interface Registration {
  id: string;
  nonce: string;
  parentToken: string;
  kind: 'html' | 'svg';
  carrier: 'frame';
  url: string;
  closed?: boolean;
  failure?: boolean;
  failureBefore?: boolean;
}
const registrations = new Map<string, Registration>();
const inputs: unknown[] = [];
let origin = '';
const server = http.createServer(async (request, target) => {
  const url = new URL(request.url || '/', origin);
  if (url.pathname === '/fixture.js') {
    target.writeHead(200, { 'Content-Type': 'text/javascript' });
    target.end(script);
    return;
  }
  if (url.pathname === '/fixture/close') {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const registration = registrations.get(body.id);
    assert(registration);
    assert.equal(body.parentToken, registration.parentToken);
    registration.closed = true;
    target.writeHead(200, { 'Content-Type': 'application/json' });
    target.end(JSON.stringify({ closed: true }));
    return;
  }
  if (url.pathname === '/fixture/create') {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = JSON.parse(Buffer.concat(chunks).toString());
    inputs.push(input);
    const id = randomUUID();
    const kind =
      (input.source?.kind === 'data' &&
        input.source.url.startsWith('data:image/svg+xml')) ||
      input.blobContent?.contentType?.startsWith('image/svg+xml')
        ? 'svg'
        : 'html';
    const registration: Registration = {
      id,
      nonce: randomUUID(),
      parentToken: randomUUID(),
      carrier: 'frame',
      kind,
      url: `${origin}/app/__contexts/${id}/document.${kind}`,
      failure: input.source?.kind === 'srcdoc' && input.source.text === 'fail-port',
      failureBefore:
        input.source?.kind === 'srcdoc' && input.source.text === 'fail-before-port',
    };
    registrations.set(id, registration);
    target.writeHead(200, { 'Content-Type': 'application/json' });
    target.end(JSON.stringify(registration));
    return;
  }
  const context = url.pathname.match(
    /^\/app\/__contexts\/([^/]+)\/(document\.(html|svg))$/,
  );
  if (context) {
    const registration = registrations.get(context[1]);
    if (!registration) {
      target.writeHead(404);
      target.end();
      return;
    }
    const config = JSON.stringify(registration);
    if (registration.kind === 'svg') {
      target.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      target.end(
        `<svg xmlns="http://www.w3.org/2000/svg"><script>globalThis.fixtureRegistration=${config};</script><script href="/fixture.js"></script></svg>`,
      );
    } else {
      target.writeHead(200, { 'Content-Type': 'text/html' });
      target.end(
        `<!doctype html><script>globalThis.fixtureRegistration=${config};</script><script src="/fixture.js"></script><body>Trusted shell</body>`,
      );
    }
    return;
  }
  target.writeHead(200, { 'Content-Type': 'text/html' });
  target.end(
    '<!doctype html><script src="/fixture.js"></script><body>Parent fixture</body>',
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Factory server missing');
origin = `http://127.0.0.1:${address.port}`;
const evidence = {
  provenance: await testProvenance(import.meta.url),
  fixtureSHA256: createHash('sha256').update(script).digest('hex'),
  scope:
    'Native document factory/hooks with trusted protocol fixture; not full confinement or controller admission',
  browsers: [] as { name: string; version: string; result: unknown }[],
};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      const page = await browser.newPage();
      await page.goto(origin + '/parent/');
      const previousInputs = inputs.length;
      const result = await page.evaluate(async () => {
        const wait = (node: Element) =>
          new Promise<void>((resolve, reject) => {
            node.addEventListener('load', () => resolve(), { once: true });
            node.addEventListener('error', () => reject(new Error('Factory error')), {
              once: true,
            });
            setTimeout(() => reject(new Error('Factory timeout')), 5000);
          });
        const pause = () => new Promise((resolve) => setTimeout(resolve, 5));
        const frame = document.createElement('iframe');
        const unsupported = document.createElement('iframe');
        unsupported.sandbox.value = 'allow-scripts';
        let rejectedInitialSandbox = false;
        try {
          document.body.appendChild(unsupported);
        } catch (error) {
          rejectedInitialSandbox =
            error instanceof DOMException && error.name === 'SecurityError';
        }
        frame.name = 'requested-frame';
        frame.sandbox.add('allow-scripts', 'allow-same-origin');
        frame.srcdoc = '<p>First source</p>';
        const loaded = wait(frame);
        const appendReturnsOriginal = document.body.appendChild(frame) === frame;
        let ticketResolved = false;
        const ticket = Reflect.get(window, 'waitForOwnedDocuments')().then(() => {
          ticketResolved = true;
        });
        const initialReference = frame.contentWindow;
        for (let i = 0; i < 100 && !(frame.getRootNode() instanceof ShadowRoot); i++)
          await pause();
        const privateRoot = frame.getRootNode();
        const knownRootReference =
          privateRoot instanceof ShadowRoot
            ? privateRoot.querySelector('iframe')?.contentWindow
            : 'no-private-root';
        const pendingFrames = window.frames.length;
        const pendingTicket = ticketResolved;
        const target = document.createElement('section');
        document.body.appendChild(target);
        target.append(frame);
        const afterPendingMove = frame.contentWindow;
        await loaded;
        await ticket;
        const child = frame.contentWindow!;
        const blank = document.createElement('iframe');
        blank.src = 'about:blank#local';
        const blankLoaded = wait(blank);
        document.body.appendChild(blank);
        await blankLoaded;
        const explicitBlankGuarded =
          Reflect.get(blank.contentWindow!, 'documentGuardFixture') === true;
        const guarded =
          Reflect.get(child, 'documentGuardFixture') === true &&
          Reflect.get(child, 'WebSocket') === undefined;
        const ready = frame.contentDocument?.documentElement.getAttribute(
          'data-application-ready',
        );
        const beforeMove = frame.contentDocument;
        document.body.moveBefore(frame, null);
        const movePreservesDocument = frame.contentDocument === beforeMove;
        const physicalSandbox = Reflect.get(window, 'readPhysicalSandbox')(frame);
        let rejectedSandbox = false,
          rejectedCredentialless = false;
        try {
          frame.sandbox.value = 'allow-scripts';
        } catch (error) {
          rejectedSandbox =
            error instanceof DOMException && error.name === 'SecurityError';
        }
        try {
          frame.setAttribute('credentialless', '');
        } catch (error) {
          rejectedCredentialless =
            error instanceof DOMException && error.name === 'SecurityError';
        }
        const clone = frame.cloneNode(true) as HTMLIFrameElement;
        const cloneLoaded = wait(clone);
        document.body.appendChild(clone);
        await cloneLoaded;
        const cloneGuarded =
          Reflect.get(clone.contentWindow!, 'documentGuardFixture') === true;
        const cloneDistinct = clone.contentDocument !== frame.contentDocument;
        const deepContainer = document.createElement('section');
        const deepFrame = document.createElement('iframe');
        deepFrame.srcdoc = '<p>Deep clone source</p>';
        deepContainer.appendChild(deepFrame);
        const nativeMinimum = Math.min;
        let deepClone: Node;
        let applicationMathControl = false;
        try {
          Math.min = () => 0;
          applicationMathControl = Math.min(1, 2) === 0;
          deepClone = deepContainer.cloneNode(true);
        } finally {
          Math.min = nativeMinimum;
        }
        document.body.appendChild(deepClone);
        await Reflect.get(window, 'waitForOwnedDocuments')();
        const pending = document.createElement('iframe');
        pending.srcdoc = '<p>Other source</p>';
        const pendingLoaded = wait(pending);
        document.body.appendChild(pending);
        for (let i = 0; i < 100 && !(pending.getRootNode() instanceof ShadowRoot); i++)
          await pause();
        const foreignGetter = Object.getOwnPropertyDescriptor(
          Reflect.get(child, 'HTMLIFrameElement').prototype,
          'contentWindow',
        )!.get!;
        const crossRealmReference = Reflect.apply(foreignGetter, pending, []);
        await pendingLoaded;
        const object = document.createElement('object');
        object.data = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
        const objectLoaded = wait(object);
        document.body.appendChild(object);
        await objectLoaded;
        const nativeSVG =
          object.contentDocument?.documentElement.namespaceURI ===
            'http://www.w3.org/2000/svg' &&
          object.getSVGDocument() === object.contentDocument;
        const container = document.createElement('div');
        document.body.appendChild(container);
        container.innerHTML = '<iframe srcdoc="&lt;p&gt;Parsed&lt;/p&gt;"></iframe>';
        for (let i = 0; i < 200 && !container.querySelector('iframe')?.contentWindow; i++)
          await pause();
        const parsedGuarded =
          Reflect.get(
            container.querySelector('iframe')!.contentWindow!,
            'documentGuardFixture',
          ) === true;
        const restarted = document.createElement('iframe');
        restarted.srcdoc = 'old-pending-source';
        let restartLoads = 0;
        restarted.addEventListener('load', () => restartLoads++);
        const restartedLoaded = wait(restarted);
        document.body.appendChild(restarted);
        const restartTicket = Reflect.get(window, 'waitForOwnedDocuments')().then(
          () =>
            restarted.contentDocument?.documentElement.getAttribute(
              'data-application-ready',
            ) === 'true',
        );
        for (let i = 0; i < 100 && !(restarted.getRootNode() instanceof ShadowRoot); i++)
          await pause();
        restarted.srcdoc = 'new-pending-source';
        const restartedPending = restarted.contentWindow;
        await restartedLoaded;
        const replacementTicket = await restartTicket;
        const failure = document.createElement('iframe');
        failure.srcdoc = 'fail-port';
        const failed = new Promise<void>((resolve, reject) => {
          failure.addEventListener('error', () => resolve(), { once: true });
          failure.addEventListener(
            'load',
            () => reject(new Error('Failed child was reported loaded')),
            { once: true },
          );
          setTimeout(() => reject(new Error('No private failure signal')), 5000);
        });
        document.body.appendChild(failure);
        const failedTicket = Reflect.get(window, 'waitForOwnedDocuments')();
        await failed;
        await failedTicket;
        const failureReference = failure.contentWindow;
        const beforePort = document.createElement('iframe');
        beforePort.srcdoc = 'fail-before-port';
        const beforePortFailed = new Promise<void>((resolve, reject) => {
          beforePort.addEventListener('error', () => resolve(), { once: true });
          setTimeout(() => reject(new Error('No authenticated pre-port failure')), 5000);
        });
        document.body.appendChild(beforePort);
        const beforePortTicket = Reflect.get(window, 'waitForOwnedDocuments')();
        await beforePortFailed;
        await beforePortTicket;
        const beforePortReference = beforePort.contentWindow;
        frame.remove();
        const removedReference = frame.contentWindow;
        return {
          appendReturnsOriginal,
          initialReference,
          knownRootReference,
          pendingFrames,
          afterPendingMove,
          guarded,
          explicitBlankGuarded,
          ready,
          movePreservesDocument,
          physicalSandbox,
          rejectedSandbox,
          rejectedCredentialless,
          rejectedInitialSandbox,
          cloneGuarded,
          cloneDistinct,
          applicationMathControl,
          crossRealmReference,
          nativeSVG,
          parsedGuarded,
          restartedPending,
          restartLoads,
          failureReference,
          beforePortReference,
          pendingTicket,
          replacementTicket,
          removedReference,
        };
      });
      assert.equal(result.appendReturnsOriginal, true);
      for (const key of [
        'initialReference',
        'knownRootReference',
        'afterPendingMove',
        'crossRealmReference',
        'removedReference',
        'restartedPending',
        'failureReference',
        'beforePortReference',
      ] as const)
        assert.equal(result[key], null, key);
      assert.equal(result.pendingFrames, 0);
      assert.equal(result.applicationMathControl, true);
      assert.equal(
        inputs
          .slice(previousInputs)
          .filter((input) => JSON.stringify(input).includes('Deep clone source')).length,
        1,
        'Deep clone lost its nested prepared source after application Math replacement',
      );
      assert.equal(result.ready, 'true');
      assert.equal(result.physicalSandbox, 'allow-scripts allow-same-origin');
      assert.equal(result.rejectedSandbox, true);
      assert.equal(result.rejectedCredentialless, true);
      assert.equal(result.rejectedInitialSandbox, true);
      assert.equal(result.restartLoads, 1);
      assert.equal(result.pendingTicket, false);
      assert.equal(result.replacementTicket, true);
      for (const key of [
        'guarded',
        'explicitBlankGuarded',
        'movePreservesDocument',
        'cloneGuarded',
        'cloneDistinct',
        'nativeSVG',
        'parsedGuarded',
      ] as const)
        assert.equal(result[key], true, key);
      evidence.browsers.push({ name, version: browser.version(), result });
      console.log(
        `${name}: private initialization, guarded references, move/clone/parser/nativeSVG controls passed`,
      );
    } finally {
      await browser.close();
    }
  }
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    'results/contexts/document-factory.json',
    JSON.stringify({ ...evidence, registrationCount: inputs.length }, null, 2) + '\n',
  );
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
