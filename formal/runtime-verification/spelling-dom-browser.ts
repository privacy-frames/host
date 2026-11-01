import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';
import { trustedPolicyPlugin } from '../../scripts/trusted-policy.ts';
import { launch } from '../../test/browser-profile.ts';
import { testProvenance } from '../../test/provenance.ts';
import { SCRIPT_URL_CSP } from '../../src/shared/script-url-policy.ts';

const runner = await readFile(new URL(import.meta.url));
const provenance = await testProvenance(import.meta.url);
const scripts = new Map<string, string>();
for (const guarded of [false, true]) {
  const result = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
import {prepareScriptURLs} from './src/runtime/enforcement/script-urls.ts';
import {prepareRuntimeIntrinsics} from './src/runtime/intrinsics.ts';
import {createPolicyTools} from './src/runtime/enforcement/native.ts';
import {createTrustedPolicy} from './src/runtime/trusted/client.ts';
import {installDOMPolicy,installResourceAttributePolicy} from './src/runtime/enforcement/dom.ts';
import {attemptSpellingChanges} from './test/fixtures/native-spelling.ts';
const stringify=JSON.stringify;
if(${guarded}){
  prepareScriptURLs();
  const policy=createTrustedPolicy(location.href);
  prepareRuntimeIntrinsics();
  const tools=createPolicyTools();
  installDOMPolicy(tools,Element.prototype.getAttribute,policy);
  installResourceAttributePolicy(tools,String);
}
window.probeSpelling=()=>stringify(attemptSpellingChanges());
window.probeCallbacks = () => {
  const observations = [];
  customElements.define('spelling-callback', class extends HTMLElement {
    static observedAttributes = ['spellcheck'];
    attributeChangedCallback() {
      observations.push({ value: this.getAttribute('spellcheck'), enabled: this.spellcheck });
    }
  });
  const element = document.createElement('spelling-callback');
  document.body.appendChild(element);
  element.setAttribute('spellcheck', 'false');
  const attribute = element.getAttributeNode('spellcheck');
  const removed = element.removeAttributeNode(attribute);
  return stringify({ observations,
    detachedOriginal: removed === attribute && removed.ownerElement === null });
};
window.probeCoercion = () => {
  const field = document.querySelector('textarea');
  field.setAttribute('spellcheck', 'false');
  let nameCalls = 0;
  Reflect.apply(field.removeAttribute, field, [{
    toString() { return ++nameCalls === 1 ? 'data-unrelated' : 'spellcheck'; }
  }]);
  const name = { route: 'remove-name', calls: nameCalls,
    value: field.getAttribute('spellcheck'), expected: 'false' };
  field.setAttribute('spellcheck', 'false');
  let namespaceCalls = 0;
  Reflect.apply(field.removeAttributeNS, field, [{
    toString() { return ++namespaceCalls === 1 ? 'urn:unrelated' : ''; }
  }, 'spellcheck']);
  const namespace = { route: 'remove-namespace', calls: namespaceCalls,
    value: field.getAttribute('spellcheck'), expected: 'false' };
  const animation = document.createElementNS('http://www.w3.org/2000/svg', 'set');
  let valueCalls = 0;
  Reflect.apply(animation.setAttribute, animation, ['attributeName', {
    toString() { return ++valueCalls === 1 ? 'width' : 'spellcheck'; }
  }]);
  const value = { route: 'animation-value', calls: valueCalls,
    value: animation.getAttribute('attributeName'), expected: 'width' };
  field.setAttribute('spellcheck', 'true');
  return stringify([name, namespace, value]);
};
`,
    },
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    plugins: [await trustedPolicyPlugin(process.cwd())],
  });
  scripts.set(guarded ? 'guarded' : 'native', result.outputFiles[0].text);
}
const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://local');
  const mode = url.searchParams.get('mode') || 'guarded';
  if (url.pathname === '/fixture.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(scripts.get(mode));
    return;
  }
  response.setHeader('Content-Type', 'text/html');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
      (mode === 'guarded' ? SCRIPT_URL_CSP : ''),
  );
  response.end(
    '<!doctype html><link rel="icon" href="data:,"><textarea spellcheck="true"></textarea>' +
      `<script src="/fixture.js?mode=${mode}"></script>`,
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const rows: object[] = [];
let completed = false;
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      const page = await browser.newPage();
      for (const mode of ['native', 'guarded']) {
        await page.goto(`http://127.0.0.1:${address.port}/?mode=${mode}`);
        const coercion: Array<{
          route: string;
          calls: number;
          value: string | null;
          expected: string;
        }> = JSON.parse(
          await page.evaluate(() => Reflect.get(window, 'probeCoercion')()),
        );
        rows.push({ browser: name, version: browser.version(), mode, coercion });
        assert.deepEqual(coercion, [
          { route: 'remove-name', calls: 1, value: 'false', expected: 'false' },
          { route: 'remove-namespace', calls: 1, value: 'false', expected: 'false' },
          { route: 'animation-value', calls: 1, value: 'width', expected: 'width' },
        ]);
        const callbacks: {
          observations: Array<{ value: string | null; enabled: boolean }>;
          detachedOriginal: boolean;
        } = JSON.parse(
          await page.evaluate(() => Reflect.get(window, 'probeCallbacks')()),
        );
        rows.push({ browser: name, version: browser.version(), mode, callbacks });
        assert.equal(callbacks.detachedOriginal, true);
        assert(callbacks.observations.length > 0);
        if (mode === 'guarded')
          for (const observation of callbacks.observations)
            assert.deepEqual(observation, { value: 'false', enabled: false });
        else assert(callbacks.observations.some((row) => row.value === null));
        const attempts: Array<{ route: string; enabled: boolean; error?: string }> =
          JSON.parse(await page.evaluate(() => Reflect.get(window, 'probeSpelling')()));
        assert.equal(attempts.length, 20);
        if (mode === 'native') {
          for (const route of ['initial-markup', 'IDL-property', 'innerHTML'])
            assert(
              attempts.some((attempt) => attempt.route === route && attempt.enabled),
            );
        } else
          for (const attempt of attempts) {
            assert.equal(attempt.enabled, false, `${name}: ${attempt.route}`);
            assert.equal(attempt.error, undefined, attempt.route);
          }
        rows.push({ browser: name, version: browser.version(), mode, attempts });
        console.log(name, mode, attempts.length, 'DOM spelling observations');
      }
    } finally {
      await browser.close();
    }
  }
  completed = true;
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const after = await testProvenance(import.meta.url);
  const sourceStable = provenance.sourceSHA256 === after.sourceSHA256;
  const artifactsStable =
    JSON.stringify(provenance.artifacts) === JSON.stringify(after.artifacts);
  const runnerStable = runner.equals(await readFile(new URL(import.meta.url)));
  await writeFile(
    new URL('./spelling-dom-browser.json', import.meta.url),
    JSON.stringify(
      {
        completed: completed && sourceStable && artifactsStable && runnerStable,
        scope:
          'Native attribute/parser component comparison only. No remote spelling service or complete runtime confinement is established by DOM reflection.',
        provenance,
        sourceStable,
        artifactsStable,
        runnerStable,
        fixtureSHA256: Object.fromEntries(
          [...scripts].map(([mode, source]) => [
            mode,
            createHash('sha256').update(source).digest('hex'),
          ]),
        ),
        rows,
      },
      null,
      2,
    ) + '\n',
  );
  assert(
    sourceStable && artifactsStable && runnerStable,
    'Spelling comparison inputs changed',
  );
}
