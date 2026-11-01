import { SCRIPT_URL_CSP } from '../src/shared/script-url-policy.ts';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';

const policy = await build({
  entryPoints: ['src/runtime/trusted/entry.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: '__trustedPolicy',
  target: 'es2022',
  banner: { js: '"use strict";' },
});
const policySource = `(() => {${policy.outputFiles[0].text}\nreturn __trustedPolicy.dispatch;})()`;
const probe = await build({
  stdin: {
    loader: 'ts',
    resolveDir: process.cwd(),
    contents: `
      import {createTrustedContext} from './src/runtime/trusted/context.ts';
      import {prepareScriptURLs} from './src/runtime/enforcement/script-urls.ts';
      prepareScriptURLs();
      const policySource = ${JSON.stringify(policySource)};
      globalThis.probeTrusted = (backend) => {
        const originalFrames = window.length;
        // Native mode is a research control; production uses the private frame.
        let call;
        if (backend === 'native') {
          const Constructor = Reflect.get(globalThis, 'ShadowRealm');
          const realm = Reflect.construct(Constructor, []);
          const native = realm.evaluate(policySource);
          call = (operation, serialized) => {
            if(typeof operation !== 'string' || typeof serialized !== 'string')
              throw new TypeError('Expected primitive text');
            return native(operation, serialized);
          };
        } else call = createTrustedContext(policySource);
        const input = JSON.stringify({
          kind:'html', text:'<h1>Hello</h1><script>globalThis.appRan = true</script>',
          sourceURL:location.origin+'/publisher/index.html',
          applicationURL:location.origin+'/installed/', aliases:[]
        });
        const baseline = call('document', input);
        const fragment = JSON.stringify({
          text:'<div><iframe srcdoc="hello"></iframe></div>',
          localName:'section', namespace:'http://www.w3.org/1999/xhtml', markerPrefix:'test'
        });
        const prepared = JSON.parse(call('fragment', fragment));
        const snapshots = [
          [Array.prototype, 'map'], [Map.prototype, 'get'],
          [String.prototype, 'toLowerCase'], [Object.prototype, 'toJSON']
        ].map(([owner,key])=>[owner,key,Object.getOwnPropertyDescriptor(owner,key)]);
        const define = Object.defineProperty;
        const remove = Reflect.deleteProperty;
        const poison = () => {throw new Error('Application intrinsic was used')};
        let unaffected = false;
        let refused = false;
        try {
          for (const [owner,key] of snapshots)
            define(owner,key,{value:poison,writable:true,configurable:true});
          unaffected = call('document', input) === baseline;
          const packet = JSON.parse(call('fragment', '{"text":42}'));
          refused = packet.ok === false && typeof packet.error === 'string';
        } finally {
          for (const [owner,key,descriptor] of snapshots) {
            if (descriptor) define(owner,key,descriptor);
            else remove(owner,key);
          }
        }
        const compilation = JSON.parse(baseline);
        const control = document.createElement('input');
        control.type = 'checkbox'; document.body.append(control);
        control.addEventListener('click', event => event.preventDefault());
        control.click();
        let objectRejected = false;
        try {call('document', {})} catch {objectRejected = true}
        return {
          backend, unaffected, refused, objectRejected,
          privateFrameRemoved:window.length===originalFrames,
          publisherNotExecuted:globalThis.appRan!==true,
          scriptPreserved:compilation.ok && compilation.value.scripts.length===1,
          fragmentPrepared:prepared.ok && prepared.value.contexts.length===1 &&
            !prepared.value.html.includes('<iframe'),
          nativeScriptBinding:globalThis.readNativeLexical()===42,
          nativeDefaultCancelled:!control.checked,
          nativeWasm:new WebAssembly.Instance(new WebAssembly.Module(
            new Uint8Array([0,97,115,109,1,0,0,0])
          )) instanceof WebAssembly.Instance
        };
      };
    `,
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
});
const script = probe.outputFiles[0].text;
let origin = '';
const server = http.createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/probe.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(script);
    return;
  }
  response.setHeader('Content-Type', 'text/html');
  response.setHeader(
    'Content-Security-Policy',
    "sandbox allow-scripts allow-same-origin; default-src 'none'; " +
      "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' 'nonce-control'; " +
      `frame-src ${origin}/installed/__contexts/; connect-src 'self'; ${SCRIPT_URL_CSP}`,
  );
  response.end(
    '<!doctype html><body><script nonce="control">let nativeLexical=42;</script>' +
      '<script nonce="control">globalThis.readNativeLexical=()=>nativeLexical;</script>' +
      '<script src="/probe.js"></script>',
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
origin = `http://127.0.0.1:${address.port}`;
const rows = [];
try {
  for (const [engine, backend, args] of [
    [chromium, 'native', ['--js-flags=--harmony-shadow-realm']],
    [chromium, 'frame', []],
    [firefox, 'frame', []],
  ] as const) {
    const browser = await launch(engine, { args: [...args] });
    try {
      const page = await browser.newPage();
      await page.goto(origin);
      const result = await page.evaluate(
        (backend) => globalThis.probeTrusted(backend),
        backend,
      );
      for (const [name, value] of Object.entries(result))
        if (name !== 'backend')
          assert.equal(value, true, `${engine.name()}/${backend}/${name}`);
      rows.push({ browser: engine.name(), version: browser.version(), ...result });
      console.log(JSON.stringify(rows.at(-1)));
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
await mkdir('results/trusted-runtime', { recursive: true });
await writeFile(
  'results/trusted-runtime/computation.json',
  JSON.stringify(
    {
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      testedAt: new Date().toISOString(),
      scope:
        'Isolated computation under confined CSP; production integration and complete confinement not yet qualified.',
      policySHA256: createHash('sha256').update(policySource).digest('hex'),
      policyBytes: Buffer.byteLength(policySource),
      rows,
    },
    null,
    2,
  ) + '\n',
);
