import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { launch } from '../../test/browser-profile.ts';

const named = "require-trusted-types-for 'script'; trusted-types host-runtime";
const server = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader(
    'Content-Security-Policy',
    'worker-src blob:; ' +
      ((request.url || '').includes('named')
        ? (request.url || '').includes('default')
          ? named.replace('host-runtime', 'host-runtime default')
          : named
        : ''),
  );
  response.end('<!doctype html><title>Native local bootstrap policy</title>');
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const origin = 'http://127.0.0.1:' + address.port;
const receipt = new URL('./local-bootstrap-policy.json', import.meta.url);
await rm(receipt, { force: true });
const rows: object[] = [];
let completed = false;
let failure: string | undefined;
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      for (const mode of [
        'baseline',
        'exact-blob',
        'named',
        'named-then-none',
        'named-default-reject-url',
        'named-captured-policy',
        'named-worker-imports',
      ] as const) {
        const context = await browser.newContext();
        try {
          const page = await context.newPage();
          await page.goto(origin + '/' + mode);
          const result = await page.evaluate(async (mode) => {
            function factory(target: Window): unknown {
              return Reflect.get(target, 'trustedTypes');
            }
            function policy(target: Window): unknown {
              const tt = factory(target);
              if (
                !tt ||
                typeof tt !== 'object' ||
                !('createPolicy' in tt) ||
                typeof tt.createPolicy !== 'function'
              )
                throw new Error('Trusted Types unavailable');
              return Reflect.apply(tt.createPolicy, tt, [
                'host-runtime',
                { createScriptURL: (value: string) => value },
              ]);
            }
            function trusted(holder: unknown, url: string): unknown {
              if (
                !holder ||
                typeof holder !== 'object' ||
                !('createScriptURL' in holder) ||
                typeof holder.createScriptURL !== 'function'
              )
                throw new Error('Native policy method missing');
              return Reflect.apply(holder.createScriptURL, holder, [url]);
            }
            function meta(value: string) {
              const element = document.createElement('meta');
              element.httpEquiv = 'Content-Security-Policy';
              element.content = value;
              document.head.appendChild(element);
            }
            function worker(
              url: unknown,
            ): Promise<{ outcome: string; value?: unknown; error?: string }> {
              return new Promise((resolve) => {
                let handle: Worker | undefined;
                const timer = setTimeout(() => {
                  handle?.terminate();
                  resolve({ outcome: 'timeout' });
                }, 5000);
                try {
                  const created: unknown = Reflect.construct(Worker, [url]);
                  if (!(created instanceof Worker))
                    throw new Error('Native Worker brand missing');
                  handle = created;
                  created.onmessage = (event) => {
                    clearTimeout(timer);
                    created.terminate();
                    resolve({ outcome: 'message', value: event.data });
                  };
                  created.onerror = (event) => {
                    event.preventDefault();
                    clearTimeout(timer);
                    created.terminate();
                    resolve({ outcome: 'error', error: event.message });
                  };
                } catch (error) {
                  clearTimeout(timer);
                  handle?.terminate();
                  resolve({ outcome: 'throw', error: String(error) });
                }
              });
            }
            async function frame(url?: string): Promise<HTMLIFrameElement> {
              const element = document.createElement('iframe');
              const ready = new Promise<void>((resolve) => {
                element.onload = () => resolve();
              });
              element.src = url || 'about:blank';
              document.body.appendChild(element);
              await ready;
              return element;
            }
            const prefix = `
let available=false, created=false, error;
try {
  available=typeof trustedTypes==='object';
  if(available) {trustedTypes.createPolicy('host-runtime',{createScriptURL:value=>value});created=true;}
} catch(failure) {error=String(failure);}
postMessage({label:'host-prefix',available,created,error});`;
            const first = URL.createObjectURL(
              new Blob([prefix], { type: 'text/javascript' }),
            );
            const application = URL.createObjectURL(
              new Blob(["postMessage({label:'application'})"], {
                type: 'text/javascript',
              }),
            );
            try {
              if (mode === 'baseline')
                return {
                  supported: Boolean(factory(window)),
                  first: await worker(first),
                  application: await worker(application),
                };
              if (mode === 'exact-blob') {
                meta('worker-src ' + first);
                return {
                  first: await worker(first),
                  application: await worker(application),
                };
              }
              if (!factory(window)) return { supported: false };
              const owned = policy(window);
              let duplicate = false;
              try {
                policy(window);
              } catch {
                duplicate = true;
              }
              if (mode === 'named-captured-policy') {
                if (
                  !owned ||
                  typeof owned !== 'object' ||
                  !('createScriptURL' in owned) ||
                  typeof owned.createScriptURL !== 'function'
                )
                  throw new Error('Private URL policy missing');
                const mint = owned.createScriptURL;
                const token = Reflect.apply(mint, owned, [first]);
                if (!token || typeof token !== 'object')
                  throw new Error('Native script URL object missing');
                const policyPrototype = Object.getPrototypeOf(owned);
                const urlPrototype = Object.getPrototypeOf(token);
                let policyCalls = 0;
                let coercions = 0;
                Object.defineProperty(policyPrototype, 'createScriptURL', {
                  configurable: true,
                  value() {
                    policyCalls++;
                    throw new Error('Application policy replacement invoked');
                  },
                });
                for (const key of ['toString', 'valueOf', Symbol.toPrimitive])
                  Object.defineProperty(urlPrototype, key, {
                    configurable: true,
                    value() {
                      coercions++;
                      return application;
                    },
                  });
                const retained = Reflect.apply(mint, owned, [first]);
                const privateURL = await worker(retained);
                const afterPrivate = { policyCalls, coercions };
                const explicitCoercion = String(retained);
                let replacementRefused = false;
                try {
                  Reflect.apply(owned.createScriptURL, owned, [first]);
                } catch {
                  replacementRefused = true;
                }
                const raw = await worker(application);
                return {
                  supported: true,
                  duplicateRefused: duplicate,
                  privateURL,
                  raw,
                  afterPrivate,
                  mutationControl: {
                    replacementRefused,
                    policyCalls,
                    coercions,
                    substituted: explicitCoercion === application,
                  },
                };
              }
              if (mode === 'named-worker-imports') {
                const importSource = URL.createObjectURL(
                  new Blob(['globalThis.importMarker = 17'], {
                    type: 'text/javascript',
                  }),
                );
                const importer = URL.createObjectURL(
                  new Blob(
                    [
                      `
const source = ${JSON.stringify(importSource)};
const policy = trustedTypes.createPolicy('host-runtime', {
  createScriptURL: value => value,
});
const mint = policy.createScriptURL;
const nativeImport = importScripts;
let rawRefused = false;
try { nativeImport(source); } catch(error) { rawRefused = error instanceof TypeError; }
const before = globalThis.importMarker;
const value = Reflect.apply(mint, policy, [source]);
Reflect.apply(nativeImport, self, [value]);
postMessage({ label: 'worker-imports', rawRefused, before, after: globalThis.importMarker });
`,
                    ],
                    { type: 'text/javascript' },
                  ),
                );
                try {
                  return {
                    supported: true,
                    duplicateRefused: duplicate,
                    raw: await worker(importer),
                    privateURL: await worker(trusted(owned, importer)),
                  };
                } finally {
                  URL.revokeObjectURL(importer);
                  URL.revokeObjectURL(importSource);
                }
              }
              if (mode === 'named-default-reject-url') {
                const tt = factory(window);
                if (
                  !tt ||
                  typeof tt !== 'object' ||
                  !('createPolicy' in tt) ||
                  typeof tt.createPolicy !== 'function'
                )
                  throw new Error('Native policy factory missing');
                Reflect.apply(tt.createPolicy, tt, [
                  'default',
                  {
                    createHTML: (value: string) => value,
                    createScript: (value: string) => value,
                    createScriptURL: () => {
                      throw new TypeError('Private script URL required');
                    },
                  },
                ]);
                const ordinary = document.createElement('div');
                ordinary.innerHTML = '<b>ordinary HTML</b>';
                const defaultPolicy: unknown = Reflect.get(tt, 'defaultPolicy');
                if (
                  !defaultPolicy ||
                  typeof defaultPolicy !== 'object' ||
                  !('createScriptURL' in defaultPolicy) ||
                  typeof defaultPolicy.createScriptURL !== 'function'
                )
                  throw new Error('Default policy missing');
                let spoofedSinkRefused = false;
                try {
                  Reflect.apply(defaultPolicy.createScriptURL, defaultPolicy, [
                    application,
                    'TrustedScriptURL',
                    'HTMLScriptElement src',
                  ]);
                } catch {
                  spoofedSinkRefused = true;
                }
                let scriptSinkRefused = false;
                try {
                  document.createElement('script').src = application;
                } catch {
                  scriptSinkRefused = true;
                }
                return {
                  supported: true,
                  duplicateRefused: duplicate,
                  raw: await worker(first),
                  privateURL: await worker(trusted(owned, first)),
                  html: ordinary.textContent,
                  evaluation: eval('1 + 1'),
                  spoofedSinkRefused,
                  scriptSinkRefused,
                };
              }
              if (mode === 'named') {
                const child = await frame();
                const target = child.contentWindow;
                if (!target) throw new Error('Child Window missing');
                let childMint: unknown, childError: string | undefined;
                try {
                  childMint = trusted(policy(target), application);
                } catch (error) {
                  childError = String(error);
                }
                const result = {
                  supported: true,
                  duplicateRefused: duplicate,
                  raw: await worker(first),
                  privateURL: await worker(trusted(owned, first)),
                  childPolicy: childMint !== undefined,
                  childError,
                  childURL: childMint === undefined ? null : await worker(childMint),
                };
                child.remove();
                return result;
              }
              // Different creator CSP distinguishes Blob-entry from caller-policy inheritance.
              const helper = await frame('/helper-named');
              const helperWindow = helper.contentWindow;
              if (!helperWindow) throw new Error('Helper Window missing');
              const blobConstructor: unknown = Reflect.get(helperWindow, 'Blob');
              const urlConstructor: unknown = Reflect.get(helperWindow, 'URL');
              if (
                typeof blobConstructor !== 'function' ||
                typeof urlConstructor !== 'function'
              )
                throw new Error('Native helper constructors missing');
              const body: unknown = Reflect.construct(blobConstructor, [
                [prefix],
                { type: 'text/javascript' },
              ]);
              const create: unknown = Reflect.get(urlConstructor, 'createObjectURL');
              if (typeof create !== 'function')
                throw new Error('Native URL factory missing');
              const helperURL: unknown = Reflect.apply(create, urlConstructor, [body]);
              if (typeof helperURL !== 'string') throw new Error('Helper URL missing');
              meta("trusted-types 'none'");
              const blank = await frame();
              let childPolicy = false,
                childError: string | undefined;
              try {
                policy(blank.contentWindow!);
                childPolicy = true;
              } catch (error) {
                childError = String(error);
              }
              const result = {
                supported: true,
                duplicateRefused: duplicate,
                childPolicy,
                childError,
                callerBlob: await worker(trusted(owned, first)),
                helperBlob: await worker(trusted(owned, helperURL)),
              };
              blank.remove();
              helper.remove();
              return result;
            } finally {
              URL.revokeObjectURL(first);
              URL.revokeObjectURL(application);
            }
          }, mode);
          if (mode === 'baseline') {
            assert('first' in result && result.first?.outcome === 'message');
            assert('application' in result && result.application?.outcome === 'message');
          }
          if (mode !== 'baseline' && mode !== 'exact-blob')
            assert('supported' in result && result.supported === true);
          if (mode === 'exact-blob') {
            assert('first' in result && result.first?.outcome === 'error');
            assert('application' in result && result.application?.outcome === 'error');
          }
          if (mode === 'named') {
            assert('childPolicy' in result && result.childPolicy === true);
            assert('childURL' in result && result.childURL?.outcome === 'message');
            assert.deepEqual(result.childURL.value, { label: 'application' });
          }
          if (mode === 'named-then-none') {
            assert('childPolicy' in result && result.childPolicy === false);
            assert('callerBlob' in result && 'helperBlob' in result);
            for (const entry of [result.callerBlob, result.helperBlob]) {
              assert(entry?.outcome === 'message');
              assert(entry.value && typeof entry.value === 'object');
              assert('created' in entry.value && entry.value.created === false);
            }
          }
          if (
            (mode === 'named' ||
              mode === 'named-default-reject-url' ||
              mode === 'named-captured-policy' ||
              mode === 'named-worker-imports') &&
            'supported' in result &&
            result.supported
          ) {
            assert('raw' in result && result.raw?.outcome === 'throw');
            assert('privateURL' in result && result.privateURL?.outcome === 'message');
            assert('duplicateRefused' in result && result.duplicateRefused === true);
          }
          if (mode === 'named-captured-policy' && 'afterPrivate' in result) {
            assert.deepEqual(result.afterPrivate, { policyCalls: 0, coercions: 0 });
            assert.deepEqual(result.mutationControl, {
              replacementRefused: true,
              policyCalls: 1,
              coercions: 1,
              substituted: true,
            });
            assert(
              'privateURL' in result &&
                result.privateURL?.value &&
                typeof result.privateURL.value === 'object' &&
                'label' in result.privateURL.value &&
                result.privateURL.value.label === 'host-prefix',
            );
          }
          if (mode === 'named-worker-imports' && 'privateURL' in result) {
            assert.deepEqual(result.privateURL?.value, {
              label: 'worker-imports',
              rawRefused: true,
              before: undefined,
              after: 17,
            });
          }
          if (
            mode === 'named-default-reject-url' &&
            'supported' in result &&
            result.supported
          ) {
            assert('html' in result && result.html === 'ordinary HTML');
            assert('evaluation' in result && result.evaluation === 2);
            assert('spoofedSinkRefused' in result && result.spoofedSinkRefused === true);
            assert('scriptSinkRefused' in result && result.scriptSinkRefused === true);
          }
          rows.push({ browser: name, version: browser.version(), mode, result });
          console.log(name, mode, JSON.stringify(result));
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
  assert.equal(rows.length, 14);
  completed = true;
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  try {
    const hashes: Record<string, string> = {};
    for (const path of [
      'formal/runtime-verification/local-bootstrap-policy.ts',
      'test/browser-profile.ts',
      'package-lock.json',
    ])
      hashes[path] = createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
    await writeFile(
      receipt,
      JSON.stringify(
        {
          scope:
            'Native CSP/Trusted Types prerequisites for local bootstrap design. Metadata-only scripts, intentionally accessible test policy and unprepared test frames. Not a production mitigation, application escape, or complete confinement result.',
          completed,
          failure,
          sourceSHA256: hashes,
          rows,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
