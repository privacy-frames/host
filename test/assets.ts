import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url),
  sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
interface ReleaseEvidence {
  date: string;
  assets: { site: string; file: string; sha256: string }[];
  githubEntry?: { managerURL: string; runtimeURL: string; installationURL: string };
  unpublishedPaths: { url: string; status: number; githubEdgeError: boolean }[];
}
const evidence: ReleaseEvidence = {
  date: new Date().toISOString(),
  assets: [],
  unpublishedPaths: [],
};

async function assertUnpublished(url: URL) {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.text();
  // GitHub Pages intermittently returns its Varnish error template for missing
  // paths. Record that hosting error separately from an ordinary missing file.
  const githubEdgeError =
    response.status === 503 &&
    response.headers.get('server') === 'Varnish' &&
    /<title>Unicorn! &middot; GitHub<\/title>/.test(body);
  assert(
    response.status === 404 || githubEdgeError,
    `Unexpected response for an unpublished path: ${url} (${response.status})`,
  );
  assert(!/<script\b/i.test(body), 'Unpublished paths must not execute scripts');
  evidence.unpublishedPaths.push({
    url: url.href,
    status: response.status,
    githubEdgeError,
  });
}
async function filesUnder(directory: URL, prefix = ''): Promise<string[]> {
  const paths = [];
  for (const item of await readdir(new URL(prefix, directory), { withFileTypes: true })) {
    const path = prefix + item.name;
    if (item.isDirectory()) paths.push(...(await filesUnder(directory, path + '/')));
    else if (item.isFile()) paths.push(path);
  }
  return paths;
}

for (const [site, base, directory] of [
  ['manager', 'https://pf.damenh.com/', 'dist-manager'],
  ['runtime', 'https://apps.pf.damenh.com/', 'dist-runtime'],
  ['installation', 'https://install.pf.damenh.com/', 'dist-installation'],
]) {
  for (const file of (await filesUnder(new URL(directory + '/', root))).filter(
    (file) => !file.startsWith('.'),
  )) {
    const response = await fetch(new URL(file, base), {
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get('server') || '',
      /github/i,
      'Trusted sites must be served by GitHub Pages',
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(
      sha(bytes),
      sha(await readFile(new URL(directory + '/' + file, root))),
      site + '/' + file,
    );
    evidence.assets.push({ site, file, sha256: sha(bytes) });
  }
  await assertUnpublished(new URL('AAAAAAAAAAA/not-installed/', base));
  for (const path of [
    'notes/index.html',
    'adversary/index.html',
    'ordinary/index.html',
    'resource-lists/notes.uris',
  ]) {
    await assertUnpublished(new URL(path, base));
  }
}
for (const id of [
  'notes',
  'image',
  'adversary',
  'playground',
  'ordinary',
  'resource-lists',
]) {
  const base = `https://privacy-frames.github.io/apps/${id}/`;
  const directory = new URL('dist-examples/' + id + '/', root);
  for (const file of (await filesUnder(directory)).filter(
    (file) => !['_headers', '_redirects'].includes(file.split('/').at(-1) || ''),
  )) {
    const response = await fetch(new URL(file, base), {
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    if (file.endsWith('.uris'))
      assert.match(response.headers.get('content-type') || '', /^text\/uri-list(?:;|$)/i);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(
      sha(bytes),
      sha(await readFile(new URL(file, directory))),
      id + '/' + file,
    );
    evidence.assets.push({ site: id, file, sha256: sha(bytes) });
  }
}
const github = await fetch('https://privacy-frames.github.io/host/config.json');
assert.equal(github.status, 200);
const config: unknown = await github.json();
assert(
  config &&
    typeof config === 'object' &&
    'managerURL' in config &&
    'runtimeURL' in config &&
    'installationURL' in config &&
    'managerOrigins' in config,
);
assert(
  typeof config.managerURL === 'string' &&
    typeof config.runtimeURL === 'string' &&
    typeof config.installationURL === 'string',
);
assert.equal(config.managerURL, 'https://pf.damenh.com/');
assert.equal(config.installationURL, 'https://install.pf.damenh.com/');
assert.deepEqual(config.managerOrigins, ['https://pf.damenh.com']);
evidence.githubEntry = {
  managerURL: config.managerURL,
  runtimeURL: config.runtimeURL,
  installationURL: config.installationURL,
};
await writeFile(
  new URL('results/assets.json', root),
  JSON.stringify(evidence, null, 2) + '\n',
);
console.log(
  evidence.assets.length,
  'published assets match release source files; unpublished paths contain no scripts (404 or recorded GitHub edge errors).',
);
