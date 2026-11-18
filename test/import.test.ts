import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDocument, cssReferences } from '../src/installation/document.ts';
import {
  applicationURL,
  applicationLaunchURL,
  applicationIdentity,
  publicAlias,
} from '../src/shared/runtime-url.ts';
import { webManifest } from '../src/runtime/pwa.ts';
const app = {
  id: 'pitch-training-cb0257e77b5a1a7925a6540f3d1a49cbb9511ebd0246f3807acecb7f3db1036f',
  source: 'https://publisher.test/app/',
  manifest: { id: 'pitch-training', name: 'Pitch Training', entry: 'index.html' },
  resources: [],
};
test('initial JSON data blocks stay inert rather than becoming executable resources', () => {
  const result = prepareDocument(
    '<script type="application/ld+json">{"name":"Example"}</script><script type="application/json" id="data">{"value":42}</script>',
    'https://publisher.test/',
  );
  assert.equal(result.inlineScripts.length, 0);
  assert.equal(result.links.length, 0);
  assert(result.html.includes('application/ld+json'));
  assert(result.html.includes('"value":42'));
  assert.throws(() =>
    prepareDocument(
      '<script type="application/json" src="x.json"></script>',
      'https://publisher.test/',
    ),
  );
  assert.throws(() =>
    prepareDocument(
      '<script type="speculationrules">{}</script>',
      'https://publisher.test/',
    ),
  );
});
test('short alias is source-derived and label does not select identity', () => {
  assert.equal(publicAlias(app.id), 'ywJX53taGnk');
  const url = applicationURL(app, 'https://runtime.test/');
  assert.equal(url.href, 'https://runtime.test/ywJX53taGnk/pitch-training/');
  assert.equal(
    applicationIdentity(
      'https://runtime.test/ywJX53taGnk/wrong/#/reference',
      'https://runtime.test/',
    ),
    'ywJX53taGnk',
  );
  assert.equal(
    applicationIdentity(
      'https://other.test/ywJX53taGnk/pitch-training/',
      'https://runtime.test/',
    ),
    null,
  );
  assert.equal(publicAlias(app.id), publicAlias('different-' + app.id.slice(-64)));
});
test('generic document base is resolved once and removed before admission', () => {
  const result = prepareDocument(
    '<base href="/assets/"><base href="https://ignored.test/"><title>Document</title><link rel="manifest" href="../app.webmanifest"><link rel="stylesheet" href="sheet.css"><style>p{background:url(bg.svg)}</style><img src="photo.png" srcset="large.png 2x"><a href="#section">Section</a>',
    'https://publisher.test/docs/index.html',
  );
  assert(!result.html.includes('<base'));
  assert.equal(result.manifestURL, 'https://publisher.test/app.webmanifest');
  assert(result.links.includes('https://publisher.test/assets/sheet.css'));
  assert(result.links.includes('https://publisher.test/assets/bg.svg'));
  assert(result.links.includes('https://publisher.test/assets/photo.png'));
  assert(!result.html.includes('srcset='));
  assert(!result.links.includes('https://ignored.test/'));
  const dormant = prepareDocument(
    '<base href="/assets/"><template><iframe></iframe></template>',
    'https://publisher.test/',
  );
  assert(dormant.html.includes('<template><iframe'));
  assert.equal(dormant.baseURL, 'https://publisher.test/assets/');
});
test('CSS dependency discovery handles imports, relative resources and cycles without following data', () => {
  assert.deepEqual(
    cssReferences(
      '@import "theme.css";p{background:url(../bg.svg)}b{mask:url(data:image/svg+xml,x)}',
      'https://publisher.test/css/main.css',
    ),
    ['https://publisher.test/css/theme.css', 'https://publisher.test/bg.svg'],
  );
});
test('manifest adapts identity, hash launch and presentation without granting handlers', () => {
  const value = {
    name: 'Publisher name',
    short_name: 'Short',
    start_url: './#/reference',
    scope: '/',
    display: 'standalone',
    theme_color: '#123456',
    file_handlers: [{ action: 'https://attacker.test/' }],
    protocol_handlers: [{ protocol: 'web+bad' }],
    shortcuts: [
      { name: 'Reference', url: './#/reference' },
      { name: 'Outside', url: 'https://attacker.test/' },
    ],
  };
  const manifest = webManifest(
    {
      ...app,
      publisherManifest: {
        value,
        url: 'https://publisher.test/app/manifest.webmanifest',
      },
    },
    'https://runtime.test/',
  );
  assert.equal(manifest.name, 'Publisher name');
  assert.equal(manifest.id, '/ywJX53taGnk/');
  assert.equal(manifest.scope, '/ywJX53taGnk/');
  assert.equal(manifest.start_url, '/ywJX53taGnk/pitch-training/#/reference');
  assert.equal(manifest.shortcuts?.length, 1);
  assert(!('file_handlers' in manifest));
  assert(!('protocol_handlers' in manifest));
  assert.equal(manifest.icons.length, 2);
});

test('invalid bases fall back to the document and base targets cannot open new contexts', () => {
  const invalid = prepareDocument(
    '<base href="http://[bad"><base href="https://ignored.test/"><link rel="stylesheet" href="sheet.css?theme=dark">',
    'https://publisher.test/docs/index.html',
  );
  assert.deepEqual(invalid.links, ['https://publisher.test/docs/sheet.css?theme=dark']);
  const target = prepareDocument(
    '<base href="./assets/" target="_blank"><a href="#section">Section</a>',
    'https://publisher.test/docs/index.html',
  );
  assert(target.html.includes('href="#section"'));
  assert(!target.html.includes('<base'));
  assert(!target.html.includes('target="_blank"'));
});

test('unreadable or malformed optional publisher manifests preserve a valid document installation', async () => {
  const { downloadWebsite } = await import('../src/installation/import-website.ts'),
    nativeFetch = globalThis.fetch;
  try {
    for (const failure of ['malformed', 'unreadable']) {
      const progress: string[] = [];
      globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.endsWith('/index.html'))
          return new Response(
            '<!doctype html><title>Fallback document</title><link rel="manifest" href="manifest.webmanifest"><p>Content</p>',
            { headers: { 'content-type': 'text/html' } },
          );
        if (url.endsWith('/manifest.webmanifest')) {
          if (failure === 'unreadable')
            throw new TypeError('Synthetic unreadable metadata');
          return new Response('{bad json');
        }
        return new Response('Missing', { status: 404 });
      };
      const installed = await downloadWebsite(
        { url: 'https://publisher.test/demo/index.html' },
        {
          onProgress: (value) => progress.push(value),
        },
      );
      assert.equal(installed.publisherManifest, null);
      assert.equal(installed.manifest.name, 'Fallback document');
      assert.equal(installed.format, 'offline-resources-v1');
      assert(
        progress.some((value) => value.startsWith('Optional manifest unavailable:')),
      );
      assert.equal(webManifest(installed, 'https://runtime.test/').icons.length, 2);
    }
  } finally {
    globalThis.fetch = nativeFetch;
  }
});

test('a small publisher icon keeps its identity and gains installable fallback sizes', () => {
  const source = {
    ...app,
    resources: [{ url: 'https://publisher.test/app/tiny.png', contentType: 'image/png' }],
    publisherManifest: {
      url: 'https://publisher.test/app/manifest.webmanifest',
      value: { icons: [{ src: 'tiny.png', sizes: '16x16', type: 'image/png' }] },
    },
  };
  const manifest = webManifest(source, 'https://runtime.test/');
  assert.equal(manifest.icons.length, 3);
  assert(manifest.icons[0].src.includes('/__icon/'));
  assert(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert(manifest.icons.some((icon) => icon.sizes === '512x512'));
});

test('inline bootstraps and preload declarations become installation inputs', () => {
  const source = 'https://publisher.test/editor/';
  const bootstrap = 'import init from "./editor.js"; await init("./editor.wasm");';
  const result = prepareDocument(
    `<title>Editor</title><link rel="modulepreload" href="./editor.js"><link rel="preload" as="fetch" href="./editor.wasm"><script type="module">${bootstrap}</script>`,
    source,
  );
  assert(result.links.includes('https://publisher.test/editor/editor.js'));
  assert(result.links.includes('https://publisher.test/editor/editor.wasm'));
  assert.equal(result.inlineScripts.length, 1);
  assert.equal(result.inlineScripts[0].code, bootstrap);
  assert(result.html.includes(`src="${result.inlineScripts[0].url}"`));
  assert(!result.html.includes('rel="modulepreload"'));
  assert(!result.html.includes('rel="preload"'));
  assert(!result.html.includes('await init'));
});

test('module discovery follows literal imports without treating comments or strings as imports', async () => {
  const { moduleReferences, relocateModule } =
    await import('../src/installation/modules.ts');
  const source = 'https://publisher.test/editor/main.js';
  const code =
    'import "./dependency.js"; const example = "import fake"; /* import "./ignored.js" */ await import("../optional.js");';
  assert.deepEqual(await moduleReferences(code, source), [
    'https://publisher.test/editor/dependency.js',
    'https://publisher.test/optional.js',
  ]);
  const relocated = await relocateModule(
    code,
    source,
    'main.js',
    new Map([
      ['https://publisher.test/editor/dependency.js', 'dependency.js'],
      ['https://publisher.test/optional.js', 'resources/optional.js'],
    ]),
  );
  assert(relocated.includes('import "./dependency.js"'));
  assert(relocated.includes('import("./resources/optional.js")'));
  await assert.rejects(moduleReferences('import "bare-package";', source), /import map/);
});

test('installation policy admits up to 100 MiB and serves Wasm with its native media type', async () => {
  const { LIMITS, mime } = await import('../src/shared/policy.ts');
  assert.equal(LIMITS.bytes, 100 * 1024 * 1024);
  assert.equal(mime('editor.wasm'), 'application/wasm');
  assert.equal(mime('asset.constructor'), 'application/octet-stream');
  assert.equal(mime('asset.toString'), 'application/octet-stream');
});

test('relocated module imports preserve fragments and both static quote styles', async () => {
  const { moduleReferences, relocateModule } =
    await import('../src/installation/modules.ts');
  const source = 'https://publisher.test/modules/main.js';
  const code = `import { value } from './first.js#variant'; export { other } from "./second.js"; const later = await import('./third.js#late');`;
  const relocated = await relocateModule(
    code,
    source,
    'main.js',
    new Map([
      ['https://publisher.test/modules/first.js', "resources/it's.js"],
      ['https://publisher.test/modules/second.js', 'resources/"quoted".js'],
      ['https://publisher.test/modules/third.js', 'resources/third.js'],
    ]),
  );
  assert.deepEqual(
    await moduleReferences(relocated, 'https://installation.invalid/main.js'),
    [
      "https://installation.invalid/resources/it's.js#variant",
      'https://installation.invalid/resources/%22quoted%22.js',
      'https://installation.invalid/resources/third.js#late',
    ],
  );
  assert(relocated.includes('const later = await import("./resources/third.js#late")'));
});

test('publisher scripts cannot be overwritten by generated inline resource names', async () => {
  const { downloadWebsite } = await import('../src/installation/import-website.ts');
  const originalFetch = globalThis.fetch;
  const declaredCode = 'window.declaredResource = true;';
  const inlineCode = 'window.inlineResource = true;';
  const declaredURL = 'https://publisher.test/collision/__pf_inline_0.js';
  try {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/index.html'))
        return new Response(
          `<title>Collision</title><script src="./__pf_inline_0.js"></script><script type="module">${inlineCode}</script>`,
          { headers: { 'content-type': 'text/html' } },
        );
      if (url === declaredURL)
        return new Response(declaredCode, {
          headers: { 'content-type': 'text/javascript' },
        });
      return new Response('Missing', { status: 404 });
    };
    const installed = await downloadWebsite({
      url: 'https://publisher.test/collision/index.html',
    });
    const declared = installed.resources.find((resource) => resource.url === declaredURL);
    const generated = installed.resources.filter(
      (resource) =>
        /javascript/.test(resource.contentType) && resource.url !== declaredURL,
    );
    assert(declared);
    assert.equal(new TextDecoder().decode(declared.bytes), declaredCode);
    assert.equal(generated.length, 1);
    assert.equal(new TextDecoder().decode(generated[0].bytes), inlineCode);
    assert.notEqual(generated[0].url, declaredURL);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('secondary captured HTML collects its inline module and that module dependencies', async () => {
  const { downloadWebsite } = await import('../src/installation/import-website.ts');
  const originalFetch = globalThis.fetch;
  const inlineCode =
    'import { value } from "./secondary-dependency.js"; window.secondary = value;';
  const requests: string[] = [];
  try {
    globalThis.fetch = async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith('/index.html'))
        return new Response(
          '<title>Secondary HTML</title><link rel="preload" as="fetch" href="./secondary.html">',
          { headers: { 'content-type': 'text/html' } },
        );
      if (url.endsWith('/secondary.html'))
        return new Response(
          `<p>Secondary</p><script type="module">${inlineCode}</script>`,
          { headers: { 'content-type': 'text/html' } },
        );
      if (url.endsWith('/secondary-dependency.js'))
        return new Response('export const value = 42;', {
          headers: { 'content-type': 'text/javascript' },
        });
      return new Response('Missing', { status: 404 });
    };
    const installed = await downloadWebsite({
      url: 'https://publisher.test/nested/index.html',
    });
    const secondary = installed.resources.find(
      (resource) => resource.path === 'secondary.html',
    );
    assert(secondary);
    const html = new TextDecoder().decode(secondary.bytes);
    assert(!html.includes(inlineCode));
    const generatedURL = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
    assert(generatedURL);
    const inline = installed.resources.find((resource) => resource.url === generatedURL);
    assert(inline);
    assert.equal(new TextDecoder().decode(inline.bytes), inlineCode);
    assert(requests.includes('https://publisher.test/nested/secondary-dependency.js'));
    assert(
      installed.resources.some((resource) => resource.path === 'secondary-dependency.js'),
    );
    assert.equal(installed.format, 'offline-resources-v1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a standard webpage can install a streamed asset larger than the former 20 MiB limit', async () => {
  const { downloadWebsite } = await import('../src/installation/import-website.ts');
  const originalFetch = globalThis.fetch;
  const chunk = new Uint8Array(1024 * 1024);
  const chunks = 21;
  try {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/index.html'))
        return new Response(
          '<title>Large asset</title><link rel="preload" as="fetch" href="./large.bin">',
          { headers: { 'content-type': 'text/html' } },
        );
      if (url.endsWith('/large.bin'))
        return new Response(
          new ReadableStream({
            start(controller) {
              for (let index = 0; index < chunks; index++) controller.enqueue(chunk);
              controller.close();
            },
          }),
          { headers: { 'content-type': 'application/octet-stream' } },
        );
      return new Response('Missing', { status: 404 });
    };
    const installed = await downloadWebsite({
      url: 'https://publisher.test/large/index.html',
    });
    const asset = installed.resources.find((resource) => resource.path === 'large.bin');
    assert(asset);
    assert.equal(asset.bytes.byteLength, chunks * chunk.byteLength);
    assert(installed.size > 20 * 1024 * 1024);
    assert.equal(installed.format, 'offline-resources-v1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('streamed installation bytes crossing 100 MiB abort even when content-length understates them', async () => {
  const { downloadWebsite } = await import('../src/installation/import-website.ts');
  const originalFetch = globalThis.fetch;
  const chunk = new Uint8Array(1024 * 1024);
  let assetSignal: AbortSignal | undefined;
  let produced = 0;
  try {
    globalThis.fetch = async (input, options) => {
      const url = String(input);
      if (url.endsWith('/index.html'))
        return new Response(
          '<title>Oversized asset</title><link rel="preload" as="fetch" href="./large.bin">',
          { headers: { 'content-type': 'text/html' } },
        );
      if (url.endsWith('/large.bin')) {
        assetSignal = options?.signal ?? undefined;
        return new Response(
          new ReadableStream({
            pull(controller) {
              if (produced === 101) {
                controller.close();
                return;
              }
              produced++;
              controller.enqueue(chunk);
            },
          }),
          {
            headers: {
              'content-type': 'application/octet-stream',
              'content-length': '1',
            },
          },
        );
      }
      return new Response('Missing', { status: 404 });
    };
    await assert.rejects(
      downloadWebsite({ url: 'https://publisher.test/oversized/index.html' }),
      /size limit/,
    );
    assert(assetSignal?.aborted);
    assert(produced >= 100 && produced <= 101);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('publisher query configuration survives launch and PWA metadata without changing resource bases', () => {
  const configured = { ...app, source: app.source + '?mode=offline&text=a%26b' };
  const launch = applicationLaunchURL(configured, 'https://runtime.test/');
  assert.equal(launch.search, '?mode=offline&text=a%26b');
  assert.equal(applicationURL(configured, 'https://runtime.test/').search, '');
  assert.equal(new URL('assets/main.js', launch).search, '');
  const manifest = webManifest(configured, 'https://runtime.test/');
  assert.equal(manifest.start_url, launch.pathname + launch.search);
  const publisher = webManifest(
    {
      ...configured,
      publisherManifest: {
        url: 'https://publisher.test/app/manifest.json',
        value: { start_url: './?mode=offline&text=a%26b#start' },
      },
    },
    'https://runtime.test/',
  );
  assert.equal(publisher.start_url, launch.pathname + launch.search + '#start');
});
