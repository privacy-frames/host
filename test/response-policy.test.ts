import test from 'node:test';
import assert from 'node:assert/strict';
import { response } from '../src/runtime/response-policy.ts';
import { SCRIPT_URL_CSP } from '../src/shared/script-url-policy.ts';

test('confined documents and worker responses require the reserved native URL policy', () => {
  for (const type of ['text/html', 'image/svg+xml', 'text/javascript']) {
    const policy = response('guarded', type).headers.get('Content-Security-Policy')!;
    assert(policy.includes(SCRIPT_URL_CSP));
    assert(!policy.includes('allow-duplicates'));
  }
});

test('confined responses deny browser-mediated identity requests', () => {
  assert.match(
    response('shell').headers.get('Permissions-Policy')!,
    /(?:^|,\s*)identity-credentials-get=\(\)(?:,|$)/,
  );
});

test('worker startup defaults to refusal; prepared contexts admit local Blob guards', () => {
  assert.match(
    response('default').headers.get('Content-Security-Policy')!,
    /(?:^|; )worker-src 'none'(?:;|$)/,
  );
  for (const workerSource of [
    'https://runtime.test/installation/__contexts/',
    'http://127.0.0.1:4341/installation/__contexts/',
  ]) {
    const policy = response('bootstrap', 'text/javascript', 200, {
      workerSource,
    }).headers.get('Content-Security-Policy')!;
    assert(policy.includes(`; worker-src ${workerSource} blob:;`));
    assert(!policy.includes("worker-src 'self'"));
    assert(!policy.includes('worker-src blob:'));
  }
});

test('worker bootstrap sources reject ambiguous URLs, credentials and CSP separators', () => {
  for (const workerSource of [
    'https://runtime.test/no-trailing-slash',
    'https://runtime.test/contexts/?',
    'https://runtime.test/contexts/?query=1',
    'https://runtime.test/contexts/#',
    'https://runtime.test/contexts/#fragment',
    'https://user@runtime.test/contexts/',
    'https://user:password@runtime.test/contexts/',
    'https://runtime.test/contexts/;script-src/',
    'https://runtime.test/contexts/\n',
    'https://runtime.test/contexts/ other-source/',
    "https://runtime.test/contexts/'/",
    'blob:https://runtime.test/context',
    'data:text/javascript,postMessage(1)',
    '/relative/contexts/',
  ]) {
    assert.throws(() =>
      response('unavailable', 'text/javascript', 200, { workerSource }),
    );
  }
});

test('worker policy can name its controlling script without allowing its directory', () => {
  const workerSource = 'https://runtime.test/app/__contexts/';
  const controllerSource = 'https://runtime.test/sw.js';
  const policy = response('bootstrap', 'text/javascript', 200, {
    workerSource,
    controllerSource,
  }).headers.get('Content-Security-Policy')!;
  assert(policy.includes(`; worker-src ${workerSource} ${controllerSource} blob:;`));
  for (const invalid of [
    'https://other.test/sw.js',
    'https://runtime.test/',
    'https://runtime.test/sw.js?',
    'https://runtime.test/sw.js#',
    'https://runtime.test/sw.js;worker-src',
  ]) {
    assert.throws(() =>
      response('bootstrap', 'text/javascript', 200, {
        workerSource,
        controllerSource: invalid,
      }),
    );
  }
  assert.throws(() => response('', 'text/javascript', 200, { controllerSource }));
});

test('embedded documents admit only their own guarded contexts and retain sandbox restrictions', () => {
  const workerSource = 'https://runtime.test/app/__contexts/';
  const controllerSource = 'https://runtime.test/sw.js';
  const result = response('shell', 'image/svg+xml', 200, {
    workerSource,
    controllerSource,
    frameSource: workerSource,
    embedded: true,
  });
  const policy = result.headers.get('Content-Security-Policy')!;
  assert(policy.includes(`; frame-src ${workerSource} ${controllerSource};`));
  assert(!policy.includes(`; frame-src ${workerSource} ${controllerSource} blob:`));
  assert(policy.includes("frame-ancestors 'self'"));
  assert(policy.includes('sandbox allow-scripts allow-same-origin allow-forms'));
  assert(policy.includes("object-src 'none'"));
  assert(policy.includes("form-action 'none'"));
  assert.equal(result.headers.get('X-Frame-Options'), 'SAMEORIGIN');
  for (const options of [
    { embedded: true },
    { workerSource, embedded: true },
    { frameSource: workerSource },
    { workerSource, frameSource: 'https://other.test/__contexts/' },
    { workerSource, frameSource: workerSource + 'other/' },
  ])
    assert.throws(() => response('shell', 'text/html', 200, options));
  assert.equal(response('root').headers.get('X-Frame-Options'), 'DENY');
});
