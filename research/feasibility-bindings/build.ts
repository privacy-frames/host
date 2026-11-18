import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const Transformer = require('webidl2js');
const directory = fileURLToPath(new URL('.', import.meta.url));

process.chdir(directory);
await mkdir('generated', { recursive: true });
await copyFile('impls/StudyNode-impl.cjs', 'impls/StudyNode-impl.js');
await writeFile('generated/package.json', '{"type":"commonjs"}\n');
await writeFile('impls/package.json', '{"type":"commonjs"}\n');

const transformer = new Transformer({ implSuffix: '-impl' });
transformer.addSource('idl', 'impls');
await transformer.generate('generated');

await build({
  absWorkingDir: directory,
  entryPoints: ['guest.cjs'],
  bundle: true,
  platform: 'neutral',
  mainFields: ['module', 'main'],
  format: 'iife',
  outfile: 'build/guest.js',
});

await build({
  absWorkingDir: directory,
  entryPoints: ['browser.ts'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  outfile: 'build/browser.js',
});
