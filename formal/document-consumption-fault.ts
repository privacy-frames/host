import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build, type Plugin } from 'esbuild';
import { chromium, firefox } from 'playwright';
import { trustedPolicyPlugin } from '../scripts/trusted-policy.ts';

interface Result {
  scenario: string;
  consumedBeforeMutation: boolean;
  validations: number;
  accepted: boolean;
  body: string;
}
declare global {
  interface Window {
    runConsumptionRace(): Promise<Result[]>;
  }
}

const root = fileURLToPath(new URL('../', import.meta.url));
const existing = await readFile(join(root, 'test/document-consumption-race.ts'), 'utf8');
const start = '    contents: `\n';
const end = '\n};`,';
assert.equal(existing.split(start).length, 2, 'Fixture start anchor changed');
const afterStart = existing.split(start)[1];
assert.equal(afterStart.split(end).length, 2, 'Fixture end anchor changed');
const fixtureSource = afterStart.split(end)[0] + '\n};';

async function compile(fault: boolean) {
  let transformed = 0;
  const plugin: Plugin = {
    name: 'test-only-remove-post-consumption-check',
    setup(builder) {
      builder.onLoad(
        { filter: /[/\\]contexts[/\\]document-controller\.ts$/ },
        async ({ path }) => {
          const original = await readFile(path, 'utf8');
          const check = '    await current();\n    return content.input;';
          assert.equal(
            original.split(check).length,
            2,
            'Authority mutation anchor changed',
          );
          transformed++;
          return {
            contents: original.replace(check, '    return content.input;'),
            loader: 'ts',
          };
        },
      );
    },
  };
  const result = await build({
    stdin: {
      resolveDir: root,
      sourcefile: 'document-consumption-fault-fixture.js',
      contents: fixtureSource,
    },
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    plugins: [await trustedPolicyPlugin(root), ...(fault ? [plugin] : [])],
  });
  assert.equal(transformed, fault ? 1 : 0);
  return result.outputFiles[0].contents;
}
const normal = await compile(false);
const fault = await compile(true);
assert.notDeepEqual(normal, fault, 'Mutation did not change the bundle');
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const server = http.createServer((request, reply) => {
  reply.setHeader('Cache-Control', 'no-store');
  if (request.url === '/normal.js' || request.url === '/fault.js') {
    reply.setHeader('Content-Type', 'text/javascript');
    reply.end(request.url === '/fault.js' ? fault : normal);
  } else {
    reply.setHeader('Content-Type', 'text/html');
    const script = request.url === '/fault' ? 'fault.js' : 'normal.js';
    reply.end(
      `<!doctype html><title>Consumption fault</title><script src="/${script}"></script>`,
    );
  }
});
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
assert(address && typeof address !== 'string');
const receipt = {
  scope:
    'Actual document controller and real IndexedDB with simulated browser clients and in-memory context storage. Test-only in-memory mutation deletes exactly the post-consumption isCurrent guard. This is authority/content delivery, not a network-leak demonstration.',
  revision: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  runnerSHA256: hash(await readFile(fileURLToPath(import.meta.url))),
  sourceHashes: Object.fromEntries(
    await Promise.all(
      [
        'src/runtime/contexts/document-controller.ts',
        'src/runtime/contexts/document-intents.ts',
        'src/runtime/contexts/model.ts',
        'src/runtime/storage.ts',
        'test/document-consumption-race.ts',
        'package-lock.json',
      ].map(async (path) => [path, hash(await readFile(join(root, path)))]),
    ),
  ),
  normalBundleSHA256: hash(normal),
  faultBundleSHA256: hash(fault),
  completed: false,
  browsers: [] as object[],
};
try {
  for (const engine of [chromium, firefox]) {
    const browser = await engine.launch();
    try {
      const profiles: object[] = [];
      for (const profile of ['normal', 'fault']) {
        const context = await browser.newContext();
        try {
          const page = await context.newPage();
          await page.goto(`http://127.0.0.1:${address.port}/${profile}`);
          const results = await page.evaluate(() => window.runConsumptionRace());
          assert.equal(results.length, 4);
          for (const item of results) {
            assert.equal(item.consumedBeforeMutation, true);
            assert.equal(item.validations, profile === 'normal' ? 1 : 0);
            if (profile === 'normal' && item.scenario !== 'unchanged') {
              assert.equal(item.accepted, false);
              assert.equal(item.body, '');
            } else {
              assert.equal(item.accepted, true);
              assert.equal(
                JSON.parse(item.body).text,
                '<p>Admitted private document</p>',
              );
            }
          }
          profiles.push({ profile, results });
        } finally {
          await context.close();
        }
      }
      receipt.browsers.push({
        name: engine.name(),
        version: browser.version(),
        profiles,
      });
    } finally {
      await browser.close();
    }
  }
  receipt.completed = true;
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await writeFile(
    new URL('evidence/document-consumption-fault.json', import.meta.url),
    JSON.stringify(receipt, null, 2) + '\n',
  );
}
console.log(
  'Document consumption authority mutation rejected by the real checks in both browsers',
);
