import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import {
  applicationRecipe,
  createShareURL,
  matchingInstallation,
  readShareHash,
  SHARE_LINK_LENGTH,
} from '../src/manager/share-link.ts';
import { RESOURCE_LIST_BYTES } from '../src/installation/resource-list.ts';
import type { AppSummary } from '../src/manager/types.ts';

const manager = 'https://pf.damenh.com/';
const source = 'https://publisher.test/app/?language=no&mode=edit';
const roundTrip = async (input: Parameters<typeof createShareURL>[0]) => {
  const url = new URL(await createShareURL(input, manager + '?discard=1#old'));
  assert.equal(url.origin, new URL(manager).origin);
  assert.equal(url.search, '');
  return readShareHash(url.hash);
};

test('share recipes preserve launch queries and URL or embedded resource lists', async () => {
  assert.deepEqual(await roundTrip({ url: source }), { url: source });
  assert.deepEqual(
    await roundTrip({
      url: source,
      resourceList: { kind: 'url', url: 'https://assets.test/list?version=2' },
    }),
    {
      url: source,
      resourceList: { kind: 'url', url: 'https://assets.test/list?version=2' },
    },
  );
  const text =
    '# Uploaded list\r\nhttps://assets.test/æ.js\r\nhttps://assets.test/æ.js\nhttps://assets.test/data?x=1&y=2#ignored';
  assert.deepEqual(
    await roundTrip({ url: source, resourceList: { kind: 'text', text } }),
    {
      url: source,
      resourceList: {
        kind: 'text',
        text: 'https://assets.test/%C3%A6.js\nhttps://assets.test/data?x=1&y=2',
      },
    },
  );
});

test('long resource lists compress and round-trip without a file or list server', async () => {
  const text = Array.from(
    { length: 900 },
    (_, index) => `https://assets.test/application/resources/module-${index}.js`,
  ).join('\n');
  const input = { url: source, resourceList: { kind: 'text', text } } as const;
  const link = await createShareURL(input, manager);
  assert(link.includes('list-gzip='));
  assert(link.length < 5000);
  assert.deepEqual(await readShareHash(new URL(link).hash), input);
});

test('malformed and ambiguous share links fail before installation', async () => {
  const base = '#v=1&url=' + encodeURIComponent(source);
  const bad = [
    '#v=2&url=' + encodeURIComponent(source),
    '#v=1',
    '#v=1&url=javascript%3Aalert(1)',
    '#v=1&url=data%3Atext%2Fhtml%2Ctest',
    '#v=1&url=https%3A%2F%2Fuser%3Apassword%40publisher.test',
    '#v=1&url=http%3A%2F%2Fpublisher.test',
    base + '&role=manager',
    base + '&v=1',
    base + '&url=' + encodeURIComponent(source),
    base + '&list=https%3A%2F%2Fassets.test%2Fa&list=https%3A%2F%2Fassets.test%2Fb',
    base +
      '&list=https%3A%2F%2Fassets.test%2Fa&list-url=https%3A%2F%2Fassets.test%2Flist',
    base + '&list=',
    base + '&list=not-a-url',
    base + '&list-url=javascript%3Aalert(1)',
    base + '&list-gzip=not_gzip',
    base + '&list-gzip=%21%21',
    base + '&list-gzip=',
    base + '&list=' + 'x'.repeat(SHARE_LINK_LENGTH),
  ];
  for (const hash of bad) await assert.rejects(readShareHash(hash), hash.slice(0, 120));
  assert.equal(await readShareHash(''), null);
  assert.equal(await readShareHash('#install'), null);
});

test('compressed lists enforce decoded byte and resource count limits', async () => {
  const base = '#v=1&url=' + encodeURIComponent(source) + '&list-gzip=';
  for (const text of [
    'x'.repeat(RESOURCE_LIST_BYTES + 1),
    Array.from({ length: 1001 }, (_, index) => `https://assets.test/${index}`).join('\n'),
  ]) {
    const compressed = gzipSync(text).toString('base64url');
    assert(compressed.length < SHARE_LINK_LENGTH);
    await assert.rejects(readShareHash(base + compressed), /256 KiB|Too many/);
  }
  await assert.rejects(
    readShareHash(base + gzipSync(Buffer.from([255])).toString('base64url')),
  );
});

test('unshareably large recipes produce an actionable error', async () => {
  const text = Array.from(
    { length: 300 },
    () => `https://assets.test/${randomBytes(90).toString('hex')}`,
  ).join('\n');
  await assert.rejects(
    createShareURL({ url: source, resourceList: { kind: 'text', text } }, manager),
    /too large to share/,
  );
});

test('library shares include resolved resources and source URLs select existing local copies', async () => {
  const app: AppSummary = {
    id: 'example-' + 'a'.repeat(64),
    manifest: { id: 'example', name: 'Example', entry: 'index.html' },
    source,
    installedAt: '2026-10-31T12:00:00.000Z',
    size: 42,
    additionalResources: ['https://assets.test/b.js', 'https://assets.test/a.js'],
  };
  const recipe = applicationRecipe(app);
  assert.deepEqual(await roundTrip(recipe), recipe);
  assert.equal(matchingInstallation(recipe, [app]), app);
  assert.equal(
    matchingInstallation(
      {
        url: source,
        resourceList: {
          kind: 'text',
          text: [...app.additionalResources].reverse().join('\n'),
        },
      },
      [app],
    ),
    app,
  );
  assert.equal(matchingInstallation({ url: source }, [app]), app);
  assert.equal(
    matchingInstallation({ ...recipe, url: source + '&other=1' }, [app]),
    undefined,
  );
  assert.equal(
    matchingInstallation(
      { url: source, resourceList: { kind: 'url', url: 'https://assets.test/list' } },
      [app],
    ),
    app,
  );
  const withoutList = { ...app, additionalResources: [] };
  assert.deepEqual(applicationRecipe(withoutList), { url: source });
  assert.equal(matchingInstallation({ url: source }, [withoutList]), withoutList);
});
