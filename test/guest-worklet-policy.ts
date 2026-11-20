import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { version as esbuildVersion } from 'esbuild';

const root = new URL('../', import.meta.url);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const guestFiles = await readdir(new URL('src/guest/', root), { recursive: true });
const sources = [
  ...guestFiles.filter((path) => path.endsWith('.ts')).map((path) => 'src/guest/' + path),
  'test/guest-worklet-policy.ts',
  'test/guest-worklet-policy.test.ts',
  'test/guest-worklet-bootstrap.test.ts',
  'test/guest-worklet-runtime.test.ts',
  'test/guest-contexts.ts',
  'test/guest-contexts.browser.ts',
  'test/guest-contexts.worker.ts',
  'vendor/quickjs/generated/engine.mjs',
  'vendor/quickjs/generated/engine.wasm',
].sort();
const inputHashes = async () =>
  Object.fromEntries(
    await Promise.all(
      sources.map(async (path) => [path, hash(await readFile(new URL(path, root)))]),
    ),
  );
const before = await inputHashes();
const logs = new URL('.tools/quickjs-proof/worklet-policy/', root);
await mkdir(logs, { recursive: true });
const commands = [
  [
    '--import',
    'tsx',
    '--test',
    'test/guest-worklet-policy.test.ts',
    'test/guest-worklet-bootstrap.test.ts',
    'test/guest-worklet-runtime.test.ts',
  ],
  ['--import', 'tsx', 'test/guest-contexts.ts'],
];
const outputs = [];
for (const [index, args] of commands.entries()) {
  const result = await promisify(execFile)(process.execPath, args, {
    cwd: root,
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const log = result.stdout + result.stderr;
  const file = new URL(`${index === 0 ? 'unit' : 'browser'}.log`, logs);
  await writeFile(file, log);
  outputs.push({
    command: [process.execPath, ...args],
    exitCode: 0,
    log: file.pathname,
    sha256: hash(Buffer.from(log)),
  });
  console.log(log);
}
assert.deepEqual(await inputHashes(), before, 'Worklet qualification inputs changed');
const bundles = Object.fromEntries(
  await Promise.all(
    ['browser', 'worker', 'registry', 'worklet'].map(async (name) => [
      name,
      hash(await readFile(new URL(`.tools/guest-context-test/${name}.js`, root))),
    ]),
  ),
);
const browserExecutables = Object.fromEntries(
  await Promise.all(
    [
      ['chromium', chromium],
      ['firefox', firefox],
    ].map(async ([name, browser]) => {
      assert(typeof browser !== 'string');
      const path = browser.executablePath();
      return [name, { path, sha256: hash(await readFile(path)) }];
    }),
  ),
);
const contexts: unknown = JSON.parse(
  await readFile(new URL('results/guest-contexts.json', root), 'utf8'),
);
await writeFile(
  new URL('results/quickjs-confinement/worklet-policy.json', root),
  JSON.stringify(
    {
      scope:
        'Reviewed audio worklet host and MessagePort producer family. Actual QuickJS audio sample/transfer/nativeWasm compatibility in two browsers, scoped native capability tests, omitted registry getter mediation control, and existing actual bootstrap cancellation control. Other browser families remain outside this claim.',
      premises: [
        'Processor endpoints are supplied only by host-created confined AudioWorkletNodes.',
        'Native delivered event.ports contains confined producer endpoints; management endpoints are never transferred into application channels.',
        'Browser event/structured-clone semantics and QuickJS remain trusted; storage namespace isolation is not claimed.',
      ],
      sourceHashes: before,
      bundleHashes: bundles,
      browserExecutables,
      toolchain: { node: process.version, esbuild: esbuildVersion },
      outputs,
      contexts,
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
