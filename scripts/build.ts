import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { appIcon } from './icons.ts';
import { buildExamples } from './build-examples.ts';
import { trustedPolicyPlugin } from './trusted-policy.ts';

const root = resolve(import.meta.dirname, '..');
const configPath = process.env.HOST_CONFIG || resolve(root, 'deployment/config.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const sources = await readdir(resolve(root, 'src'), { recursive: true });
const hash = createHash('sha256');
for (const path of sources.sort()) {
  if (/\.(ts|tsx|html|css)$/.test(path))
    hash.update(await readFile(resolve(root, 'src', path)));
}
for (const path of [
  'package-lock.json',
  'REPORT.md',
  'scripts/build.ts',
  'scripts/build-examples.ts',
  'scripts/icons.ts',
  'scripts/report.ts',
  'scripts/trusted-policy.ts',
])
  hash.update(await readFile(resolve(root, path)));
hash.update(JSON.stringify(config));
const buildId = hash.digest('hex').slice(0, 16);
const trustedPolicy = await trustedPolicyPlugin(root);
const entries = {
  manager: 'src/manager.tsx',
  worker: 'src/runtime/worker.ts',
  guard: 'src/runtime/guard.ts',
  connect: 'src/bridge/connect.ts',
  installation: 'src/installation/controller.ts',
  'document-guard': 'src/runtime/contexts/document-guard.ts',
  'shared-worker-guard': 'src/runtime/contexts/shared-worker-guard.ts',
  'worklet-guard': 'src/runtime/contexts/worklet-guard.ts',
  'publisher-worker-guard': 'src/runtime/publisher/guard.ts',
};
const roles = process.env.HOST_ROLE
  ? [process.env.HOST_ROLE]
  : ['manager', 'runtime', 'installation'];
for (const role of roles) {
  if (!['manager', 'runtime', 'installation'].includes(role))
    throw new Error('Invalid build role');
  const output = process.env.BUILD_DIRECTORY || `dist-${role}`;
  const directory = resolve(root, output);
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  for (const [name, entry] of Object.entries(entries)) {
    if (role === 'manager' && !['manager', 'worker'].includes(name)) continue;
    if (role === 'installation' && name !== 'installation') continue;
    if (role === 'runtime' && ['manager', 'installation'].includes(name)) continue;
    await build({
      entryPoints: [
        resolve(
          root,
          name === 'worker' && role === 'manager'
            ? 'src/manager/offline-worker.ts'
            : entry,
        ),
      ],
      outfile: resolve(directory, name === 'worker' ? 'sw.js' : `${name}.js`),
      bundle: true,
      define: {
        __BUILD_ID__: JSON.stringify(buildId),
        'process.env.NODE_ENV': '"production"',
      },
      banner: { js: '"use strict";' },
      format: ['manager', 'connect', 'installation', 'worklet-guard'].includes(name)
        ? 'esm'
        : 'iife',
      target: 'es2022',
      jsx: 'automatic',
      plugins: [trustedPolicy],
    });
  }
  await cp(
    resolve(
      root,
      'src',
      role === 'manager'
        ? 'index.html'
        : role === 'installation'
          ? 'installation/index.html'
          : 'connect.html',
    ),
    resolve(directory, role === 'runtime' ? 'connect.html' : 'index.html'),
  );
  await writeFile(resolve(directory, 'config.json'), JSON.stringify(config, null, 2));
  await writeFile(resolve(directory, '.nojekyll'), '');
  if (role === 'installation') {
    console.log(`Built ${role} in ${output}`);
    continue;
  }
  execFileSync(
    process.execPath,
    [
      resolve(root, 'node_modules/@tailwindcss/cli/dist/index.mjs'),
      '-i',
      resolve(root, 'src/host.css'),
      '-o',
      resolve(directory, 'host.css'),
      '--minify',
    ],
    { stdio: 'inherit' },
  );
  for (const size of [192, 512])
    await writeFile(resolve(directory, `pwa-${size}.png`), appIcon(size));
  if (role === 'runtime')
    await writeFile(
      resolve(directory, 'index.html'),
      '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy Frames applications</title><link rel="stylesheet" href="./host.css"><main><h1>Privacy Frames</h1><a href="https://pf.damenh.com/">Open manager</a></main></html>',
    );
  execFileSync(process.execPath, [resolve(root, 'scripts/report.ts')], {
    cwd: root,
    env: { ...process.env, BUILD_DIRECTORY: directory },
    stdio: 'inherit',
  });
  console.log(`Built ${role} in ${output}`);
}
if (!process.env.HOST_ROLE) await buildExamples();
