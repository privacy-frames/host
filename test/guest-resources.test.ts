import assert from 'node:assert/strict';
import test from 'node:test';
import { GuestResources } from '../src/guest/resources.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';

const resource = (path: string, text: string, contentType: string) => ({
  path,
  url: new URL(path, 'https://publisher.test/').href,
  contentType,
  bytes: new TextEncoder().encode(text).buffer,
});

const fixture = (): GuestContextCatalog => ({
  application: 'fixture',
  generation: 'installed',
  sourceURL: 'https://publisher.test/',
  documentBase: 'https://publisher.test/',
  applicationURL: 'https://runtime.test/fixture/app/',
  runtimeURL: 'https://runtime.test/',
  engineWasm: new ArrayBuffer(0),
  workerBootstrap: {
    dedicated: new ArrayBuffer(0),
    shared: new ArrayBuffer(0),
    worklet: new ArrayBuffer(0),
  },
  resources: [
    resource(
      'main.css',
      '@import "./nested/other.css";p{background:url(image.png)}',
      'text/css',
    ),
    resource(
      'nested/other.css',
      '@import "../main.css";@font-face{src:url(../font.woff2)}',
      'text/css',
    ),
    resource('image.png', 'image bytes', 'image/png'),
    resource('font.woff2', 'font bytes', 'font/woff2'),
  ],
});

test('native rendering receives local resources, including nested CSS and import cycles', async () => {
  const resources = new GuestResources(fixture());
  try {
    const main = resources.nativeURL('main.css');
    const nested = resources.nativeURL('nested/other.css');
    const image = resources.nativeURL('image.png');
    const font = resources.nativeURL('font.woff2');
    assert(main.startsWith('blob:'));
    const css = await (await resources.fetch(main)).text();
    const nestedCSS = await (await resources.fetch(nested)).text();
    assert(css.includes(nested));
    assert(css.includes(image));
    assert(nestedCSS.includes(font));
    assert(nestedCSS.includes('data:text/css,'));
    assert.equal(await (await resources.fetch(image)).text(), 'image bytes');
    assert.equal(await (await resources.fetch(font)).text(), 'font bytes');
    assert.equal(resources.nativeURL('image.png?private=value'), image);
    assert.equal(resources.nativeURL('image.png#fragment'), image + '#fragment');
    assert(
      resources
        .nativeURL('https://receiver.test/missing?private=value')
        .startsWith('data:'),
    );
    await assert.rejects(
      resources.fetch('https://receiver.test/missing'),
      /not installed/,
    );
    resources.dispose();
    await assert.rejects(resources.fetch(image), /not installed/);
  } finally {
    resources.dispose();
  }
});
