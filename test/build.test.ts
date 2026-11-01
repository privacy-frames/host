import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('configuration changes invalidate bootstrap and role builds expose only their entry points', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'privacy-frames-build-'));
  const configuration = join(temporary, 'configuration.json');
  const output = join(temporary, 'output');
  async function build(role: 'manager' | 'runtime' | 'installation', publisher: string) {
    await writeFile(
      configuration,
      JSON.stringify({
        managerURL: 'https://manager.test/',
        runtimeURL: 'https://runtime.test/',
        installationURL: 'https://installation.test/',
        managerOrigins: ['https://manager.test'],
        examples: [{ name: 'Example', url: publisher }],
      }),
    );
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/build.ts'], {
      cwd: new URL('../', import.meta.url),
      env: {
        ...process.env,
        HOST_ROLE: role,
        HOST_CONFIG: configuration,
        BUILD_DIRECTORY: output,
      },
      stdio: 'pipe',
    });
    return readFile(
      join(output, role === 'installation' ? 'installation.js' : 'sw.js'),
      'utf8',
    );
  }
  try {
    const first = await build('manager', 'https://first.example/');
    const second = await build('manager', 'https://second.example/');
    assert.notEqual(first, second);
    await access(join(output, 'manager.js'));
    await assert.rejects(access(join(output, 'install-worker.js')));
    for (const entry of [
      'guard.js',
      'worker-guard.js',
      'document-guard.js',
      'shared-worker-guard.js',
      'worklet-guard.js',
      'publisher-worker-guard.js',
    ])
      await assert.rejects(access(join(output, entry)));
    const runtime = await build('runtime', 'https://second.example/');
    assert.notEqual(second, runtime);
    for (const entry of [
      'guard.js',
      'document-guard.js',
      'shared-worker-guard.js',
      'worklet-guard.js',
      'publisher-worker-guard.js',
    ])
      await access(join(output, entry));
    await assert.rejects(access(join(output, 'worker-guard.js')));
    await access(join(output, 'connect.html'));
    await assert.rejects(access(join(output, 'manager.js')));
    await assert.rejects(access(join(output, 'adversary/index.html')));
    await assert.rejects(access(join(output, 'installation.js')));
    await assert.rejects(access(join(output, 'install-worker.js')));
    await build('installation', 'https://second.example/');
    await access(join(output, 'installation.js'));
    await assert.rejects(access(join(output, 'install-worker.js')));
    for (const entry of ['manager.js', 'sw.js', 'guard.js', 'connect.js'])
      await assert.rejects(access(join(output, entry)));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
