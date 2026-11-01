import { SCRIPT_URL_CSP } from '../src/shared/script-url-policy.ts';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox, type Page } from 'playwright';
import { launch } from './browser-profile.ts';
import { servers } from './server.ts';
import { build } from './build.ts';
import { testProvenance } from './provenance.ts';

const policyOnly = process.env.DYNAMIC_SCRIPT_POLICY_ONLY === '1';
const nonce = 'dynamic-script-test-nonce';
let policyCode = '';
if (policyOnly) {
  const built = await build({
    stdin: {
      contents: `import 'ses';import {prepareScriptURLs} from './src/runtime/enforcement/script-urls.ts';const scriptURL=prepareScriptURLs();import {createPolicyTools} from './src/runtime/enforcement/native.ts';import {createTrustedPolicy} from './src/runtime/trusted/client.ts';import {installDOMPolicy,installResourceAttributePolicy} from './src/runtime/enforcement/dom.ts';import {installScriptPolicy} from './src/runtime/enforcement/scripts.ts';const policy=createTrustedPolicy(location.href);lockdown({evalTaming:'unsafe-eval',errorTaming:'safe',consoleTaming:'safe',overrideTaming:'severe'});const tools=createPolicyTools();const rawGet=Element.prototype.getAttribute;const admitted=new Set(['a.js','b.js','module.js'].map(name=>'http://127.0.0.1:4340/dynamic-scripts/'+name));const mapURL=input=>new URL(String(input),document.baseURI).href;const scripts=installScriptPolicy(tools,{nonce:'${nonce}',scriptURL,mapURL,isInstalledURL:input=>admitted.has(String(input))});installDOMPolicy(tools,rawGet,policy,scripts);installResourceAttributePolicy(tools,mapURL,scripts);document.documentElement.dataset.policyReady='true';`,
      resolveDir: new URL('../', import.meta.url).pathname,
    },
    banner: { js: '"use strict";' },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
  });
  policyCode = built.outputFiles[0].text;
}

const publisher = 'http://127.0.0.1:4340/dynamic-scripts/';
const receiver = 'http://127.0.0.1:4341/';
const receiverRequests: string[] = [];
const receiverConnections: number[] = [];
const documents: Record<string, [string, string]> = {
  '/dynamic-scripts/': [
    'text/html',
    '<!doctype html><title>Dynamic scripts</title><link rel="preload" as="script" href="a.js"><link rel="preload" as="script" href="b.js"><link rel="modulepreload" href="module.js"><script src="main.js"></script><p id="ready">Dynamic script fixture</p>',
  ],
  '/dynamic-scripts/main.js': ['text/javascript', 'globalThis.dynamicFixtureReady=true;'],
  '/dynamic-scripts/a.js': ['text/javascript', 'globalThis.__dynamic.order.push("A");'],
  '/dynamic-scripts/b.js': ['text/javascript', 'globalThis.__dynamic.order.push("B");'],
  '/dynamic-scripts/module.js': ['text/javascript', 'export default 47;'],
};
const publisherServer = http.createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  if (request.url === '/policy.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(policyCode);
    return;
  }
  if (request.url === '/isolated/') {
    response.setHeader('Content-Type', 'text/html');
    response.setHeader(
      'Content-Security-Policy',
      `default-src 'none';script-src 'self' blob: 'nonce-${nonce}';connect-src 'self';object-src 'none';frame-src 'none'; ${SCRIPT_URL_CSP}`,
    );
    response.end(
      '<!doctype html><script src="/policy.js"></script><p id="ready">Isolated script policy fixture</p>',
    );
    return;
  }
  const item = documents[new URL(request.url || '/', publisher).pathname];
  if (!item) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.setHeader('Content-Type', item[0]);
  response.end(item[1]);
});
const receiverServer = http.createServer((request, response) => {
  receiverRequests.push(request.url || '/');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Content-Type', 'text/javascript');
  response.end('globalThis.receiverScriptExecuted=true;');
});
receiverServer.on('connection', () => receiverConnections.push(Date.now()));
for (const [server, port] of [
  [publisherServer, 4340],
  [receiverServer, 4341],
] as const)
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
const host = policyOnly ? { close: async () => {} } : await servers({ receiver: false });
const results = {
  provenance: await testProvenance(import.meta.url),
  mode: policyOnly ? 'isolated script/DOM policy fixture' : 'full runtime installation',
  date: new Date().toISOString(),
  browsers: [] as object[],
};

async function exercise(page: Page) {
  return page.evaluate(async (base) => {
    const state = { order: [] as string[], module: 0, blob: 0, text: 0, literal: '' };
    Reflect.set(globalThis, '__dynamic', state);
    state.order.push('before');
    const inline = document.createElement('script');
    inline.text = 'globalThis.__dynamic.order.push("inline")';
    document.head.appendChild(inline);
    state.order.push('after');
    const synchronous = [...state.order];
    const textScript = document.createElement('script');
    document.head.appendChild(textScript);
    textScript.appendChild(document.createTextNode('globalThis.__dynamic.text=9;'));
    const textSynchronous = state.text === 9;
    const literalScript = document.createElement('script');
    literalScript.innerHTML = 'globalThis.__dynamic.literal="<iframe>";';
    document.head.appendChild(literalScript);
    const loaded: string[] = [];
    const loading = ['a.js', 'b.js'].map(
      (path) =>
        new Promise<void>((resolve, reject) => {
          setTimeout(() => reject(new Error('Ordered script timeout: ' + path)), 5000);
          const script = document.createElement('script');
          script.async = false;
          script.setAttribute('src', base + path);
          script.onload = () => {
            loaded.push(path);
            resolve();
          };
          script.onerror = () => reject(new Error('Script failed: ' + path));
          document.head.appendChild(script);
        }),
    );
    await Promise.all(loading);
    await new Promise<void>((resolve, reject) => {
      Reflect.set(state, 'completeModule', (value: number) => {
        state.module = value;
        resolve();
      });
      const script = document.createElement('script');
      setTimeout(() => reject(new Error('Inline module timeout')), 5000);
      script.type = 'module';
      script.textContent =
        'import value from ' +
        JSON.stringify(base + 'module.js') +
        ';globalThis.__dynamic.completeModule(value);';
      script.onerror = () => reject(new Error('Inline module failed'));
      document.head.appendChild(script);
    });
    const blob = URL.createObjectURL(
      new Blob(['globalThis.__dynamic.blob=3;'], { type: 'text/javascript' }),
    );
    try {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        setTimeout(() => reject(new Error('Blob script timeout')), 5000);
        script.src = blob;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Blob script failed'));
        document.head.appendChild(script);
      });
    } finally {
      URL.revokeObjectURL(blob);
    }
    return {
      synchronous,
      textSynchronous,
      literal: state.literal,
      order: state.order,
      loaded,
      module: state.module,
      blob: state.blob,
    };
  }, publisher);
}

try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      const context = await browser.newContext();
      context.setDefaultTimeout(20000);
      let app: Page;
      if (policyOnly) {
        app = await context.newPage();
        app.on('pageerror', (error) => console.error('policy fixture:', error.message));
        await app.goto('http://127.0.0.1:4340/isolated/');
        await app.waitForFunction(
          () => document.documentElement.dataset.policyReady === 'true',
        );
      } else {
        const manager = await context.newPage();
        await manager.goto('http://127.0.0.1:4210/privacy-frames/');
        await manager.getByText('Ready to install.', { exact: true }).waitFor();
        await manager.locator('#app-url').fill(publisher);
        await manager.locator('#install button').click();
        const link = manager.locator('[data-app="dynamic-scripts"]');
        await link.waitFor();
        const opened = context.waitForEvent('page');
        await link.click();
        app = await opened;
      }
      await app.locator('#ready').waitFor();
      const isolated = await exercise(app);
      assert.deepEqual(isolated.synchronous, ['before', 'inline', 'after']);
      assert.deepEqual(isolated.order, ['before', 'inline', 'after', 'A', 'B']);
      assert.deepEqual(isolated.loaded, ['a.js', 'b.js']);
      assert.equal(isolated.textSynchronous, true);
      assert.equal(isolated.literal, '<iframe>');
      assert.equal(isolated.module, 47);
      assert.equal(isolated.blob, 3);
      const start = receiverRequests.length;
      const connections = receiverConnections.length;
      const blocked = await app.evaluate(async (target) => {
        const script = document.createElement('script');
        let sourceDenied = false,
          type = false,
          coercions = 0;
        try {
          script.src = target + 'private-marker-' + crypto.randomUUID();
        } catch {
          sourceDenied = true;
        }
        try {
          script.type = {
            toString() {
              coercions++;
              return coercions === 1 ? 'text/javascript' : 'speculationrules';
            },
          } as unknown as string;
        } catch {
          /* A checked type can be rejected. */
        }
        const checkedType = script.type;
        try {
          script.setAttribute('type', 'speculationrules');
        } catch {
          type = true;
        }
        let sourceOutcome = 'denied';
        if (!sourceDenied)
          sourceOutcome = await new Promise<string>((resolve) => {
            const timeout = setTimeout(() => resolve('timeout'), 5000);
            script.onload = () => {
              clearTimeout(timeout);
              resolve('load');
            };
            script.onerror = () => {
              clearTimeout(timeout);
              resolve('error');
            };
            document.head.append(script);
          });
        const physical = script.getAttribute('src');
        const localPlaceholder =
          physical !== null &&
          new URL(physical, location.href).origin === location.origin &&
          new URL(physical, location.href).pathname.endsWith(
            '/__contexts/unavailable-script',
          );
        const inline = document.createElement('script');
        inline.text =
          'globalThis.__dynamic.transport=fetch(' +
          JSON.stringify(target + 'inline-private-marker') +
          ').then(()=>false,()=>true);';
        document.head.append(inline);
        return {
          sourceDenied,
          sourceOutcome,
          localPlaceholder,
          externalScriptExecuted:
            Reflect.get(globalThis, 'receiverScriptExecuted') === true,
          type,
          coercions,
          checkedType,
          inlineFetchBlocked: await Reflect.get(globalThis, '__dynamic').transport,
        };
      }, receiver);
      if (policyOnly) {
        assert.equal(blocked.sourceDenied, true);
        assert.equal(blocked.sourceOutcome, 'denied');
      } else {
        assert.equal(blocked.sourceDenied, false);
        assert.equal(blocked.sourceOutcome, 'error');
        assert.equal(blocked.localPlaceholder, true);
      }
      assert.equal(blocked.externalScriptExecuted, false);
      assert.equal(blocked.type, true);
      assert.equal(blocked.coercions, 1);
      assert.equal(blocked.checkedType, 'text/javascript');
      assert.equal(blocked.inlineFetchBlocked, true);
      await app.waitForTimeout(150);
      assert.equal(receiverRequests.length, start);
      assert.equal(receiverConnections.length, connections);
      const control = await context.newPage();
      await control.goto(publisher);
      const unrestricted = await exercise(control);
      assert.deepEqual(unrestricted, isolated);
      const controlStart = receiverRequests.length;
      const controlMarker = await control.evaluate(async (target) => {
        const marker = 'control-marker-' + crypto.randomUUID();
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = target + marker;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Inactive script receiver control'));
          document.head.append(script);
        });
        if (Reflect.get(globalThis, 'receiverScriptExecuted') !== true)
          throw new Error('Native receiver script did not execute');
        return marker;
      }, receiver);
      assert(
        receiverRequests.slice(controlStart).some((path) => path === '/' + controlMarker),
      );
      assert(receiverConnections.length > connections);
      results.browsers.push({
        name,
        version: browser.version(),
        isolated,
        unrestricted,
        blocked,
        privateRequests: 0,
        privateConnections: 0,
        activeScriptControl: true,
      });
      await context.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  await host.close();
  for (const server of [publisherServer, receiverServer]) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await mkdir(new URL('../results/contexts/', import.meta.url), { recursive: true });
  await writeFile(
    new URL(
      '../results/contexts/' +
        (policyOnly ? 'dynamic-scripts-policy.json' : 'dynamic-scripts.json'),
      import.meta.url,
    ),
    JSON.stringify(results, null, 2) + '\n',
  );
}
console.log(
  'Dynamic classic, module and Blob scripts pass native controls; unsupported policy types and network disclosure are blocked in both browsers.',
);
