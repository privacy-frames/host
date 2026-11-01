import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDocumentRegistration,
  parseDocumentBootstrap,
  parseDocumentContentInput,
  parseWindowContentMetadata,
} from '../src/runtime/contexts/document-protocol.ts';
import { CONTEXT_POLICY_VERSION } from '../src/runtime/contexts/model.ts';

const id = '11111111-1111-4111-8111-111111111111';
const nonce = '22222222-2222-4222-8222-222222222222';
const parentToken = '33333333-3333-4333-8333-333333333333';
const applicationURL = 'https://runtime.test/app/';
const registration = {
  id,
  nonce,
  parentToken,
  kind: 'svg',
  carrier: 'frame',
  url: applicationURL + '__contexts/' + id + '/document.svg',
};
const configuration = {
  ...registration,
  policyVersion: CONTEXT_POLICY_VERSION,
  application: 'application',
  installationGeneration: 'host-generation',
  applicationURL,
  runtimeURL: 'https://runtime.test/',
  content: {
    installationGeneration: 'host-generation',
    aliases: [['https://publisher.test/asset.js', applicationURL + 'asset.js']],
    scripts: [applicationURL + 'asset.js'],
    source: 'https://publisher.test/',
  },
};

test('Window script inventories require unique admitted canonical resources', () => {
  assert.deepEqual(
    Array.from(parseWindowContentMetadata(configuration.content, applicationURL).scripts),
    configuration.content.scripts,
  );
  for (const scripts of [
    undefined,
    null,
    'asset.js',
    [undefined],
    new Array(1),
    ['https://publisher.test/asset.js'],
    [applicationURL + 'other.js'],
    [applicationURL + 'asset.js#secret'],
    [applicationURL + 'asset.js?secret=1'],
    [applicationURL + 'asset.js', applicationURL + 'asset.js'],
  ])
    assert.throws(() =>
      parseWindowContentMetadata({ ...configuration.content, scripts }, applicationURL),
    );
  const accessor = { ...configuration.content };
  Object.defineProperty(accessor, 'scripts', {
    get() {
      throw new Error('Untrusted accessor was invoked');
    },
  });
  assert.throws(
    () => parseWindowContentMetadata(accessor, applicationURL),
    /requires data properties/,
  );
  assert.throws(() =>
    parseWindowContentMetadata(
      { ...configuration.content, aliases: new Array(1), scripts: [] },
      applicationURL,
    ),
  );
});

test('registration addresses are fixed to the owning application, context and media type', () => {
  assert.deepEqual(
    structuredClone(parseDocumentRegistration(registration, applicationURL)),
    registration,
  );
  for (const url of [
    registration.url + '?secret=1',
    registration.url + '#fragment',
    registration.url.replace('/app/', '/other/'),
    registration.url.replace('.svg', '.html'),
  ])
    assert.throws(() =>
      parseDocumentRegistration({ ...registration, url }, applicationURL),
    );
  assert.throws(() =>
    parseDocumentRegistration(
      { ...registration, parentToken: 'claimed-token' },
      applicationURL,
    ),
  );
});

test('bootstrap metadata and content cannot introduce foreign resource targets or policy versions', () => {
  const parsed = parseDocumentBootstrap(configuration, registration.url);
  const input = {
    kind: 'svg',
    text: '<svg/>',
    sourceURL: 'https://publisher.test/image.svg',
    aliases: configuration.content.aliases,
  };
  assert.equal(parseDocumentContentInput(input, parsed).text, '<svg/>');
  assert.throws(() =>
    parseDocumentBootstrap({ ...configuration, policyVersion: -1 }, registration.url),
  );
  assert.throws(() => parseDocumentBootstrap(configuration, registration.url + '?other'));
  assert.throws(() =>
    parseDocumentBootstrap(
      {
        ...configuration,
        content: { ...configuration.content, installationGeneration: 'other-generation' },
      },
      registration.url,
    ),
  );
  assert.throws(() => parseDocumentContentInput({ ...input, kind: 'html' }, parsed));
  assert.throws(() =>
    parseDocumentContentInput(
      { ...input, aliases: [['https://publisher.test/', 'https://manager.test/']] },
      parsed,
    ),
  );
});

test('registration parsing uses captured native URL getters after publisher replacement', () => {
  const original = Object.getOwnPropertyDescriptor(URL.prototype, 'href')!;
  let invoked = 0;
  try {
    Object.defineProperty(URL.prototype, 'href', {
      ...original,
      get() {
        invoked++;
        return registration.url;
      },
    });
    assert.deepEqual(
      structuredClone(parseDocumentRegistration(registration, applicationURL)),
      registration,
    );
    assert.equal(invoked, 0);
  } finally {
    Object.defineProperty(URL.prototype, 'href', original);
  }
});

test('root documents validate content and metadata before installing resource aliases', async () => {
  const { parseInstalledDocument } =
    await import('../src/runtime/contexts/document-protocol.ts');
  const root = {
    ...configuration.content,
    document: {
      kind: 'html',
      text: '<h1>Installed root</h1>',
      sourceURL: 'https://publisher.test/',
      aliases: configuration.content.aliases,
    },
  };
  assert.equal(parseInstalledDocument(root, applicationURL).document.kind, 'html');
  for (const document of [
    null,
    {},
    { ...root.document, kind: 'svg' },
    {
      ...root.document,
      aliases: [['https://publisher.test/asset.js', 'https://manager.test/asset.js']],
    },
  ])
    assert.throws(() => parseInstalledDocument({ ...root, document }, applicationURL));
  assert.throws(() =>
    parseInstalledDocument({ ...root, source: 'javascript:1' }, applicationURL),
  );
});

test('popup grants retain their carrier and normalized opener policy', () => {
  const popup = {
    ...registration,
    carrier: 'popup',
    popup: { name: 'details', noopener: false, noreferrer: true },
  };
  const parsed = parseDocumentRegistration(popup, applicationURL);
  assert.equal(parsed.carrier, 'popup');
  assert.deepEqual(structuredClone(parsed.popup), {
    name: 'details',
    noopener: true,
    noreferrer: true,
  });
  const config = parseDocumentBootstrap({ ...configuration, ...popup }, popup.url);
  assert.equal(config.carrier, 'popup');
  assert.equal(config.popup?.noopener, true);
  for (const invalid of [
    { ...registration, carrier: undefined },
    { ...registration, carrier: 'worker' },
    { ...registration, popup: popup.popup },
    { ...popup, popup: undefined },
    { ...popup, popup: { ...popup.popup, noopener: 'true' } },
    { ...popup, popup: { ...popup.popup, name: 'bad\nname' } },
  ])
    assert.throws(() => parseDocumentRegistration(invalid, applicationURL));
});
