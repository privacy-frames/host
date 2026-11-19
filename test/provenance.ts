import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = resolve(directory, entry.name);
        return entry.isDirectory() ? filesBelow(path) : [path];
      }),
    )
  ).flat();
}

/** Record both source inputs and actual outputs used by a local browser run. */
export async function testProvenance(runner: string) {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const names = git(
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    'src',
    'scripts',
    'patches',
    'REPORT.md',
    'test',
    'deployment',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'publisher-source-ref.txt',
  );
  const source = createHash('sha256');
  for (const name of [...new Set(names.split('\n'))].filter(Boolean).sort()) {
    let bytes: Uint8Array;
    try {
      bytes = await readFile(resolve(root, name));
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        source.update(name + '\0deleted\0');
        continue;
      }
      throw error;
    }
    source.update(name + '\0' + bytes.byteLength + '\0');
    source.update(bytes);
  }
  const artifacts: Record<string, string> = {};
  for (const directory of ['dist-manager', 'dist-runtime', 'dist-installation'])
    for (const path of (await filesBelow(resolve(root, directory))).sort())
      artifacts[relative(root, path)] = hash(await readFile(path));
  return {
    capturedAt: new Date().toISOString(),
    revision: git('rev-parse', 'HEAD'),
    dirty: git('status', '--porcelain=v1') !== '',
    sourceSHA256: source.digest('hex'),
    runner: relative(root, fileURLToPath(runner)),
    runnerSHA256: hash(await readFile(fileURLToPath(runner))),
    publisherRevision: (
      await readFile(resolve(root, 'publisher-source-ref.txt'), 'utf8')
    ).trim(),
    artifacts,
  };
}
