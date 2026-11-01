import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDocumentContent } from '../src/runtime/contexts/document-content.ts';
import {
  CONTENT_MARKER,
  type DocumentContentInput,
} from '../src/runtime/contexts/document-content-types.ts';
import { validateMarkup } from '../src/shared/markup.ts';
import { prepareFragment } from '../src/runtime/trusted/fragment.ts';

const aliases = [
  ['https://publisher.test/assets/main.js', 'https://runtime.test/app/main.js'],
  ['https://publisher.test/assets/module.js', 'https://runtime.test/app/module.js'],
  ['https://publisher.test/assets/site.css', 'https://runtime.test/app/site.css'],
  ['https://publisher.test/assets/photo.png', 'https://runtime.test/app/photo.png'],
  ['https://publisher.test/assets/child.html', 'https://runtime.test/app/child.html'],
] as const;
function html(text: string) {
  return compileDocumentContent({
    kind: 'html',
    text,
    sourceURL: 'https://publisher.test/index.html',
    aliases,
  });
}
function svg(text: string) {
  return compileDocumentContent({
    kind: 'svg',
    text,
    sourceURL: 'https://publisher.test/assets/picture.svg',
    aliases,
  });
}

test('editable HTML and template content disable native spelling before publication', () => {
  const content =
    '<textarea spellcheck="true"></textarea><div contenteditable spellcheck="">' +
    'Private text</div><template><input spellcheck="true"></template>';
  const result = html(content);
  if (result.kind !== 'html') throw new Error('Wrong kind');
  assert.equal((result.html.body.match(/spellcheck="false"/g) || []).length, 4);
  assert(!result.html.body.includes('spellcheck="true"'));
  const fragment = prepareFragment({
    text: content,
    namespace: 'http://www.w3.org/1999/xhtml',
    localName: 'div',
    markerPrefix: 'fixture',
  });
  assert.equal((fragment.html.match(/spellcheck="false"/g) || []).length, 4);
  assert.throws(
    () => html('<svg><set attributeName="spellcheck" to="true"/></svg>'),
    /effect-control/,
  );
  assert.throws(
    () => validateMarkup('<svg><set attributeName="spellcheck" to="true"/></svg>'),
    /browsing targets/,
  );
});

test('fragment markup preserves the document identity and explicit base query semantics', () => {
  const sourceURL = 'https://publisher.test/page.html?revision=one';
  function compile(base: string) {
    const result = compileDocumentContent({
      kind: 'html',
      sourceURL,
      aliases,
      text: `<base href="${base}"><a href="#section">Section</a>`,
    });
    if (result.kind !== 'html') throw new Error('Wrong kind');
    return result.html.body;
  }
  assert(compile('?revision=one').includes('href="#section"'));
  assert(
    compile('?revision=two').includes(
      'href="https://publisher.test/page.html?revision=two#section"',
    ),
  );
  assert(
    compile('/other.html').includes('href="https://publisher.test/other.html#section"'),
  );
  const vector = svg(
    '<svg xmlns="http://www.w3.org/2000/svg"><style>rect{fill:url(#paint)}</style><defs><linearGradient id="paint"/></defs><rect/><use href="#shape"/></svg>',
  );
  if (vector.kind !== 'svg') throw new Error('Wrong kind');
  assert(vector.svg.content.includes('url(#paint)'));
  assert(vector.svg.content.includes('href="#shape"'));
});

test('HTML compilation extracts scripts and handlers while mapping installed resources and base URLs', () => {
  const result = html(
    `<html lang="en" onload="rootLoaded()"><head><base href="/assets/"><base href="/ignored/"><link rel="stylesheet" href="site.css"><script>"use strict"; window.order = [1];</script><script src="main.js" defer></script></head><body onload="bodyLoaded()"><img src="photo.png#detail" onclick="inspect(event)" style="background:url(photo.png)"><script type="module" async src="module.js"></script></body></html>`,
  );
  assert.equal(result.kind, 'html');
  if (result.kind !== 'html') throw new Error('Wrong kind');
  assert.equal(result.baseURL, 'https://publisher.test/assets/');
  assert(!result.html.head.includes('<base'));
  assert(!result.html.head.includes('<script'));
  assert(!result.html.body.includes('<script'));
  assert(result.html.head.includes('https://runtime.test/app/site.css'));
  assert(result.html.body.includes('https://runtime.test/app/photo.png#detail'));
  assert(result.html.body.includes('https://runtime.test/app/photo.png'));
  assert.equal(result.scripts.length, 3);
  assert.deepEqual(structuredClone(Array.from(result.scripts, (script) => script.kind)), [
    'classic',
    'classic',
    'module',
  ]);
  assert.deepEqual(structuredClone(result.scripts[0].source), {
    kind: 'inline',
    code: '"use strict"; window.order = [1];',
    baseURL: 'https://publisher.test/assets/',
  });
  assert.deepEqual(structuredClone(result.scripts[1].source), {
    kind: 'resource',
    url: 'https://runtime.test/app/main.js',
    sourceURL: 'https://publisher.test/assets/main.js',
  });
  assert.equal(result.scripts[1].defer, true);
  assert.equal(result.scripts[2].async, true);
  assert.equal(result.handlers.length, 3);
  assert.deepEqual(
    structuredClone(Array.from(result.handlers, (handler) => handler.event)),
    ['load', 'load', 'click'],
  );
  assert(result.html.attributes.some((attr) => attr.name === CONTENT_MARKER));
  assert(result.html.bodyAttributes.some((attr) => attr.name === CONTENT_MARKER));
  assert(!result.html.attributes.some((attr) => attr.name.startsWith('on')));
  assert(!result.html.body.includes('onclick='));
});

test('context sources become inert descriptors and object fallback remains dormant', () => {
  const result = html(
    `<iframe src="/assets/child.html" srcdoc="&lt;script&gt;privateApp()&lt;/script&gt;" onload="loaded()"></iframe><iframe src="data:text/html,%3Cscript%3Eapp()%3C/script%3E"></iframe><iframe src="blob:https://publisher.test/fixture"></iframe><iframe src="/assets/child.html"></iframe><iframe></iframe><object data="/assets/child.html"><script>fallback()</script><iframe src="/assets/child.html"></iframe></object>`,
  );
  assert.equal(result.kind, 'html');
  if (result.kind !== 'html') throw new Error('Wrong kind');
  assert(!/<(?:iframe|object|script)\b/.test(result.html.body));
  assert(!result.html.body.includes('srcdoc='));
  assert.deepEqual(
    structuredClone(
      Array.from(result.contexts.slice(0, 5), (context) => context.source.kind),
    ),
    ['srcdoc', 'data', 'blob', 'url', 'empty'],
  );
  assert.deepEqual(structuredClone(result.contexts[0].source), {
    kind: 'srcdoc',
    text: '<script>privateApp()</script>',
    baseURL: 'https://publisher.test/index.html',
  });
  assert.deepEqual(structuredClone(result.contexts[3].source), {
    kind: 'url',
    url: 'https://publisher.test/assets/child.html',
    installedURL: 'https://runtime.test/app/child.html',
  });
  assert.equal(result.scripts[0].templates[0], result.contexts[5].marker);
  assert.equal(result.contexts[6].templates[0], result.contexts[5].marker);
  assert.equal(result.handlers[0].marker, result.contexts[0].marker);
});

test('nested templates retain ancestry and source markers cannot select compiled nodes', () => {
  const result = html(
    `<template ${CONTENT_MARKER}="publisher-choice"><div onclick="later()"></div><template><script>laterScript()</script><iframe src="/assets/child.html"></iframe></template></template><p ${CONTENT_MARKER}="publisher-choice" onclick="now()"></p>`,
  );
  assert.equal(result.kind, 'html');
  if (result.kind !== 'html') throw new Error('Wrong kind');
  assert(!result.html.body.includes('publisher-choice'));
  assert.equal(result.scripts[0].templates.length, 2);
  assert.deepEqual(result.contexts[0].templates, result.scripts[0].templates);
  assert.equal(result.handlers[0].templates.length, 1);
  assert.deepEqual(structuredClone(result.handlers[1].templates), []);
  const markerValues = [
    ...result.html.body.matchAll(/data-privacy-content="([^"]+)"/g),
  ].map((match) => match[1]);
  assert.equal(new Set(markerValues).size, markerValues.length);
});

test('native SVG keeps viewBox, namespaces and CDATA text while extracting all executable source', () => {
  const result = svg(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 20 20" onload="ready()"><script><![CDATA[window.check = 1 < 2;]]></script><script xlink:href="main.js"/><image xlink:href="photo.png"/><foreignObject><div xmlns="http://www.w3.org/1999/xhtml" onclick="clicked()">Hello</div></foreignObject><text><![CDATA[A < B & C]]></text></svg>`,
  );
  assert.equal(result.kind, 'svg');
  if (result.kind !== 'svg') throw new Error('Wrong kind');
  assert(
    result.svg.attributes.some(
      (attr) => attr.name === 'viewBox' && attr.value === '0 0 20 20',
    ),
  );
  assert(result.svg.attributes.some((attr) => attr.name === 'xmlns:xlink'));
  assert(!result.svg.content.includes('<script'));
  assert(!result.svg.content.includes('onclick='));
  assert(result.svg.content.includes('xmlns="http://www.w3.org/1999/xhtml"'));
  assert(result.svg.content.includes('xlink:href="https://runtime.test/app/photo.png"'));
  assert(result.svg.content.includes('A &lt; B &amp; C'));
  assert.equal(result.scripts.length, 2);
  assert.deepEqual(structuredClone(result.scripts[0].source), {
    kind: 'inline',
    code: 'window.check = 1 < 2;',
    baseURL: 'https://publisher.test/assets/picture.svg',
  });
  assert.deepEqual(structuredClone(result.scripts[1].source), {
    kind: 'resource',
    url: 'https://runtime.test/app/main.js',
    sourceURL: 'https://publisher.test/assets/main.js',
  });
  assert.equal(result.handlers.length, 2);
});

test('known inert JSON data remains markup and is not scheduled as executable code', () => {
  const result = html(
    '<script type="application/json" id="config">{"setting":true}</script><template><script type="application/ld+json">{"@type":"Thing"}</script></template>',
  );
  assert.equal(result.kind, 'html');
  if (result.kind !== 'html') throw new Error('Wrong kind');
  assert.equal(result.scripts.length, 0);
  assert(result.html.head.includes('type="application/json"'));
  assert((result.html.head + result.html.body).includes('application/ld+json'));
});

test('malformed HTML is normalized to passive markup with execution kept in descriptors', () => {
  const result = html(
    '<table><svg><script>fromTable()</script></svg><tr><td><iframe srcdoc="&lt;img onerror=attack()&gt;"></iframe></table><div onclick="after()"><b>unclosed',
  );
  assert.equal(result.kind, 'html');
  if (result.kind !== 'html') throw new Error('Wrong kind');
  assert(!/<(?:script|iframe)\b/.test(result.html.body));
  assert(!result.html.body.includes('onclick='));
  assert.equal(result.scripts.length, 1);
  assert.equal(result.contexts.length, 1);
  assert.equal(result.handlers.length, 1);
});

test('unknown external scripts and unsupported active or ambiguous content fail closed', () => {
  for (const text of [
    '<script src="/unknown.js"></script>',
    '<script type="importmap">{}</script>',
    '<script type="application/json" src="/assets/main.js"></script>',
    '<embed src="/assets/child.html">',
    '<frameset><frame src="/assets/child.html"></frameset>',
    '<portal></portal>',
    '<a href="javascript:run()">run</a>',
    '<meta http-equiv="refresh" content="0;url=https://other.test">',
  ]) {
    assert.throws(() => html(text), text);
  }
  assert.throws(() =>
    svg(
      '<svg xmlns="http://www.w3.org/2000/svg"><s:script xmlns:s="http://www.w3.org/2000/svg">run()</s:script></svg>',
    ),
  );
  assert.throws(() =>
    svg(
      '<svg xmlns="http://www.w3.org/2000/svg"><g xmlns="http://www.w3.org/1999/xhtml"/></svg>',
    ),
  );
});

test('compiler support does not broaden ordinary markup admission', () => {
  assert.throws(() =>
    validateMarkup('<iframe src="/child.html"></iframe>', { initial: true }),
  );
  const input: DocumentContentInput = {
    kind: 'html',
    text: '<script src="main.js"></script>',
    sourceURL: 'https://publisher.test/assets/index.html',
    aliases: [
      ['https://publisher.test/assets/main.js', 'https://runtime.test/main.js'],
      ['https://publisher.test/assets/main.js', 'https://runtime.test/other.js'],
    ],
  };
  assert.throws(() => compileDocumentContent(input), /Conflicting/);
});

test('document bases skip inert templates and native SVG xml:base scopes script resolution', () => {
  const document = html(
    '<template><base href="/ignored/"></template><body><base href="/assets/"><script src="main.js"></script></body>',
  );
  assert.equal(document.baseURL, 'https://publisher.test/assets/');
  assert.equal(document.scripts[0].source.kind, 'resource');
  const image = svg(
    '<svg xmlns="http://www.w3.org/2000/svg" xml:base="../"><g xml:base="assets/"><script src="main.js"></script><script>scoped()</script><image href="photo.png"/></g></svg>',
  );
  assert.equal(image.kind, 'svg');
  if (image.kind !== 'svg') throw new Error('Wrong kind');
  assert.equal(image.scripts[0].source.kind, 'resource');
  assert.deepEqual(structuredClone(image.scripts[1].source), {
    kind: 'inline',
    code: 'scoped()',
    baseURL: 'https://publisher.test/assets/',
  });
  assert(image.svg.content.includes('xml:base="https://publisher.test/assets/"'));
  assert(image.svg.content.includes('href="https://runtime.test/app/photo.png"'));
});

test('explicit about:blank sources become controlled empty documents', () => {
  const result = html(
    '<iframe src="about:blank"></iframe><iframe src="about:blank#local"></iframe>',
  );
  assert.deepEqual(
    structuredClone(Array.from(result.contexts, (context) => context.source)),
    [{ kind: 'empty' }, { kind: 'empty' }],
  );
  for (const source of ['about:config', 'about:blank?query=1', 'javascript:run()'])
    assert.throws(() => html(`<iframe src="${source}"></iframe>`));
});

test('compiled browsing targets remain in the prepared document across HTML and SVG', () => {
  const result = html(
    '<a target="_blank" href="#local">Link</a><form target="named"><button formtarget="_top">Submit</button><input formtarget="_parent"></form><template><a target="new">Later</a></template>',
  );
  assert.equal(result.kind, 'html');
  if (result.kind !== 'html') throw new Error('Wrong kind');
  assert(!result.html.body.includes('_blank'));
  assert(!result.html.body.includes('target="named"'));
  assert.equal((result.html.body.match(/target="_self"/g) || []).length, 5);
  const vector = svg(
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="#local"><rect width="5" height="5"/></a></svg>',
  );
  assert.equal(vector.kind, 'svg');
  if (vector.kind !== 'svg') throw new Error('Wrong kind');
  assert(vector.svg.content.includes('target="_self"'));
  for (const source of [
    '<svg><set attributeName="target" to="_blank"/></svg>',
    '<svg><a xmlns:xlink="http://www.w3.org/1999/xlink" xlink:show="new"/></svg>',
  ])
    assert.throws(() => html(source), /browsing-target/);
  assert.throws(
    () => validateMarkup('<a target="_blank">Dynamic native popup</a>'),
    /browsing targets/,
  );
  assert.doesNotThrow(() =>
    validateMarkup('<a target="_self" href="#local">Local link</a>'),
  );
});
