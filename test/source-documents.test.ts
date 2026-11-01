import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadWebsite } from '../src/installation/import-website.ts';
import { prepareDocument } from '../src/installation/document.ts';
import { prepareRuntimeDocument } from '../src/runtime/document.ts';
import { compileDocumentContent } from '../src/runtime/contexts/document-content.ts';
import { validateMarkup } from '../src/shared/markup.ts';

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg"><script><![CDATA[window.svgReady = true]]></script><script href="/assets/svg.js"></script></svg>';
test('static documents, local sources and captured bases use one immutable resource graph', async () => {
  const source = 'https://publisher.test/app/index.html';
  const pages = new Map<string, [string, string]>([
    [
      source,
      [
        `<base href="/assets/"><title>Documents</title><body onload="rootLoaded()"><iframe src="child.html"></iframe><iframe srcdoc="&lt;base href='/inline/'&gt;&lt;script src='inline.js'&gt;&lt;/script&gt;"></iframe><object data="data:image/svg+xml,${encodeURIComponent(svg)}"></object><object data="diagram.svg"></object><img src="icon.svg">`,
        'text/html',
      ],
    ],
    [
      'https://publisher.test/assets/child.html',
      [
        '<base href="/child-assets/"><script src="boot.js"></script><iframe src="/app/index.html"></iframe>',
        'text/html',
      ],
    ],
    [
      'https://publisher.test/child-assets/boot.js',
      ['window.childReady = true;', 'text/javascript'],
    ],
    [
      'https://publisher.test/inline/inline.js',
      ['window.inlineReady = true;', 'text/javascript'],
    ],
    [
      'https://publisher.test/assets/svg.js',
      ['window.externalSVGReady = true;', 'text/javascript'],
    ],
    [
      'https://publisher.test/assets/diagram.svg',
      [
        '<svg xmlns="http://www.w3.org/2000/svg"><script href="svg.js"></script></svg>',
        'image/svg+xml',
      ],
    ],
    // This is an image, not a requested execution context. Do not compile it as
    // active native XML merely because its media type is SVG.
    [
      'https://publisher.test/assets/icon.svg',
      [
        '<svg xmlns="http://www.w3.org/2000/svg"><metadata><rdf:RDF xmlns:rdf="urn:metadata"/></metadata></svg>',
        'image/svg+xml',
      ],
    ],
  ]);
  const fetched: string[] = [];
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    fetched.push(url);
    const item = pages.get(url);
    return item
      ? new Response(item[0], { headers: { 'Content-Type': item[1] } })
      : new Response('Not found', { status: 404 });
  };
  try {
    const app = await downloadWebsite({ url: source });
    assert.equal(app.format, 'offline-resources-v1');
    assert.equal(app.documentBase, 'https://publisher.test/assets/');
    const child = app.resources.find((resource) => resource.url.endsWith('/child.html'))!;
    assert.equal(child.documentBase, 'https://publisher.test/child-assets/');
    const diagram = app.resources.find((resource) =>
      resource.url.endsWith('/diagram.svg'),
    )!;
    assert.equal(diagram.documentBase, 'https://publisher.test/assets/diagram.svg');
    const icon = app.resources.find((resource) => resource.url.endsWith('/icon.svg'))!;
    assert.equal(icon.documentBase, undefined);
    assert(new TextDecoder().decode(icon.bytes).includes('rdf:RDF'));
    assert(app.resources.some((resource) => resource.url.endsWith('/inline/inline.js')));
    assert(app.resources.some((resource) => resource.url.includes('__pf_inline_')));
    assert.equal(
      fetched.filter((url) => url === source).length,
      1,
      'HTTP document cycle downloaded repeatedly',
    );
    assert.equal(fetched.filter((url) => url.endsWith('/child.html')).length, 1);
    const entry = app.resources.find((resource) => resource.path === app.manifest.entry)!;
    const prepared = prepareRuntimeDocument(
      { ...app, documentBase: 'https://stale.test/' },
      entry.bytes,
      new URL('https://runtime.test/'),
    );
    assert.equal(prepared.documentBase, 'https://publisher.test/assets/');
    assert.equal(prepared.document.kind, 'html');
    const inlineAlias = prepared.aliases.find(([source]) =>
      source.endsWith('/inline/inline.js'),
    );
    assert(inlineAlias);
    assert(prepared.scripts.includes(inlineAlias[1]));
    assert(
      prepared.scripts.every((url) =>
        prepared.aliases.some(([, target]) => target === url),
      ),
    );
    assert.equal('head' in prepared, false);
    assert.equal('body' in prepared, false);
    const content = compileDocumentContent(prepared.document);
    assert.equal(content.kind, 'html');
    if (content.kind !== 'html') throw new Error('Wrong root content kind');
    assert.equal(content.contexts.length, 4);
    assert.equal(content.handlers[0].code, 'rootLoaded()');
    assert(!/<(?:iframe|object|script)\b/.test(content.html.body));
    assert.throws(() => validateMarkup('<iframe></iframe>', { initial: true }));
  } finally {
    globalThis.fetch = nativeFetch;
  }
});

test('local nested source parsing is bounded before a browser context exists', () => {
  let text = '<p>leaf</p>';
  for (let index = 0; index < 67; index++)
    text =
      '<iframe srcdoc="' +
      text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') +
      '"></iframe>';
  assert.throws(() => prepareDocument(text, 'https://publisher.test/'), /work limit/);
});
