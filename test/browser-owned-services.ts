import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

// This driver grants the browser loopback access only. The service override is
// diagnostic configuration, not the mechanism preventing outside communication.
// Locally cached node:22.14.0-bookworm-slim, addressed by immutable image ID.
const image = 'sha256:1c18d9ab3af4585870b92e4dbc5cac5a0dc77dd13df1a5905cea89fc720eb05b';
const root = process.cwd();
const browserDirectory = path.dirname(chromium.executablePath());
const libraryDirectory = '/usr/lib/x86_64-linux-gnu';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const name = `pf-browser-services-${process.pid}`;
const mount = (source: string, destination: string) => [
  '--mount',
  `type=bind,src=${source},dst=${destination},readonly`,
];
const args = [
  'run',
  '--name',
  name,
  '--network',
  'none',
  '--cap-drop',
  'ALL',
  '--security-opt',
  'no-new-privileges',
  '--read-only',
  '--tmpfs',
  '/tmp:rw,nosuid,size=512m',
  '--env',
  'XDG_CONFIG_HOME=/tmp/config',
  '--env',
  'XDG_CACHE_HOME=/tmp/cache',
  ...mount(libraryDirectory, libraryDirectory),
  ...mount(await realpath(process.execPath), '/node'),
  ...mount(browserDirectory, '/browser'),
  ...mount(root, '/work'),
  '--workdir',
  '/work',
  '--entrypoint',
  '/node',
  image,
  '--import',
  'tsx',
  'test/browser-owned-services.container.ts',
];
let stdout = '';
let stderr = '';
let configuration: unknown;
let exitCode: number | null = null;
try {
  exitCode = await new Promise<number | null>((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    child.once('error', reject);
    child.once('exit', resolve);
  });
  const [container] = JSON.parse(
    execFileSync('docker', ['inspect', name], { encoding: 'utf8' }),
  );
  assert.equal(container.HostConfig.NetworkMode, 'none');
  assert(container.HostConfig.CapDrop.includes('ALL'));
  assert(container.HostConfig.SecurityOpt.includes('no-new-privileges'));
  configuration = {
    image: container.Image,
    networkMode: container.HostConfig.NetworkMode,
    capDrop: container.HostConfig.CapDrop,
    securityOpt: container.HostConfig.SecurityOpt,
    readOnlyRoot: container.HostConfig.ReadonlyRootfs,
  };
} finally {
  execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
}
const sourceFiles = [
  'test/browser-owned-services.ts',
  'test/browser-owned-services.container.ts',
];
const artifactFiles = (
  await Promise.all(
    ['manager', 'runtime', 'installation'].map(async (role) => {
      const directory = 'dist-' + role;
      return (await readdir(directory)).sort().map((name) => path.join(directory, name));
    }),
  )
).flat();
const provenance = Object.fromEntries(
  await Promise.all(
    [...sourceFiles, ...artifactFiles].map(async (name) => [
      name,
      hash(await readFile(name)),
    ]),
  ),
);
const directory = 'results/quickjs-confinement/browser-owned-services';
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, 'container.log'), stderr);
const receipt = {
  completed: new Date().toISOString(),
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  provenance,
  browserSHA256: hash(await readFile(chromium.executablePath())),
  configuration,
  exitCode,
  observation: stdout.trim() ? (JSON.parse(stdout) as unknown) : null,
};
await writeFile(
  path.join(directory, 'result.json'),
  JSON.stringify(receipt, null, 2) + '\n',
);
assert.equal(exitCode, 0, stderr);
console.log(JSON.stringify(receipt.observation));
