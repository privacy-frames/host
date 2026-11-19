import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const applications = [
  'bindings',
  'wikipedia',
  'excalidraw',
  'drawio',
  'stackedit',
  'cyberchef',
] as const;
const browsers = ['chromium', 'firefox'] as const;
const directory = process.env.CORPUS_RUNTIME_DIRECTORY || 'dist-runtime';
const output = 'results/guest-runtime';
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const artifacts = Object.fromEntries(
  await Promise.all(
    (await readdir(directory))
      .sort()
      .map(async (name) => [name, hash(await readFile(path.join(directory, name)))]),
  ),
);
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const failures: string[] = [];
const observations: Record<string, unknown>[] = [];
const exitCodes: Record<string, number> = {};

interface CorpusReceipt {
  id: string;
  started: string;
  browser: string;
  guardHash: string;
  publisherRevision: string;
  runtimeRevision: string;
  url: string;
  passed: boolean;
  task?: string;
  offlineTask?: string;
  offlinePersistence?: boolean;
  errors: string[];
  error?: string;
}

for (const browser of browsers) {
  const started = Date.now();
  const environment: NodeJS.ProcessEnv = { ...process.env, CORPUS_BROWSER: browser };
  delete environment.CORPUS_TARGET;
  delete environment.CORPUS_GUARD;
  delete environment.CORPUS_CAPTURE_STORAGE;
  exitCodes[browser] = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'test/guest-corpus.ts'], {
      stdio: 'inherit',
      env: environment,
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  }).catch((error) => {
    failures.push(`${browser}: runner failed: ${String(error)}`);
    return 1;
  });
  if (exitCodes[browser])
    failures.push(`${browser}: corpus runner exited ${exitCodes[browser]}`);

  for (const application of applications) {
    try {
      const receipt = JSON.parse(
        await readFile(
          path.join(output, 'corpus', `${browser}-${application}.json`),
          'utf8',
        ),
      ) as CorpusReceipt;
      assert.equal(receipt.id, application);
      assert.equal(
        receipt.guardHash,
        artifacts['guard.js'],
        'Kernel changed or a stale receipt was read',
      );
      assert(Date.parse(receipt.started) >= started, 'Receipt predates this run');
      assert(
        Array.isArray(receipt.errors) &&
          receipt.errors.every((error) => typeof error === 'string'),
      );
      const optionalResourceFailures = receipt.errors.filter((error) =>
        error.includes('Script resource is not installed:'),
      );
      const remaining = receipt.errors.filter(
        (error) => !optionalResourceFailures.includes(error),
      );
      const runtimeErrors = remaining.filter((error) =>
        /^(?:Application error )?(?:Error|TypeError|ReferenceError|RangeError|SyntaxError|InternalError|RuntimeError):|Aborted\(|JS_FreeRuntime/.test(
          error,
        ),
      );
      const otherConsoleDiagnostics = remaining.filter(
        (error) => !runtimeErrors.includes(error),
      );
      if (!receipt.passed || runtimeErrors.length)
        failures.push(
          `${browser}/${application}: ${receipt.error || runtimeErrors.join('\n') || 'Task failed'}`,
        );
      observations.push({
        application,
        browser,
        version: receipt.browser,
        passed: receipt.passed,
        task: receipt.task,
        offlineTask: receipt.offlineTask,
        offlinePersistence: receipt.offlinePersistence,
        optionalResourceFailures,
        runtimeErrors,
        otherConsoleDiagnostics,
        publisherRevision: receipt.publisherRevision,
        runtimeRevision: receipt.runtimeRevision,
      });
    } catch (error) {
      failures.push(`${browser}/${application}: invalid receipt: ${String(error)}`);
    }
  }
}
for (const [name, digest] of Object.entries(artifacts))
  if (hash(await readFile(path.join(directory, name))) !== digest)
    failures.push(`Runtime artifact changed during evaluation: ${name}`);
await mkdir(output, { recursive: true });
await writeFile(
  path.join(output, 'corpus-matrix.json'),
  JSON.stringify(
    { sourceRevision, artifacts, exitCodes, observations, failures },
    null,
    2,
  ) + '\n',
);
assert.deepEqual(failures, []);
