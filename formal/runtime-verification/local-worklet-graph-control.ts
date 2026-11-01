import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

function field(value: unknown, key: string): unknown {
  assert(value && typeof value === 'object' && Object.hasOwn(value, key));
  return Reflect.get(value, key);
}
async function receipt(path: string): Promise<unknown> {
  const data: unknown = JSON.parse(
    await readFile(new URL(path, import.meta.url), 'utf8'),
  );
  return data;
}
const baselineEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  PF_WORKLET_OMIT_PREPARATION: '0',
};
delete baselineEnvironment.PF_WORKLET_BROWSER;
await rm(new URL('./local-worklet-graph.json', import.meta.url), { force: true });
const normal = spawnSync(
  process.execPath,
  [new URL('./local-worklet-graph.ts', import.meta.url).pathname],
  { encoding: 'utf8', timeout: 120000, env: baselineEnvironment },
);
await writeFile(
  new URL('./local-worklet-graph-normal.log', import.meta.url),
  normal.stdout + normal.stderr,
);
assert.ifError(normal.error);
assert.equal(normal.signal, null);
assert.equal(normal.status, 0, 'The complete native/local baseline must work');
const baseline = await receipt('./local-worklet-graph.json');
assert.equal(field(baseline, 'completed'), true);
assert.equal(field(baseline, 'omittedPreparation'), false);
const nativeRows = field(baseline, 'rows');
assert(Array.isArray(nativeRows) && nativeRows.length === 6);
for (const browser of ['chromium', 'firefox']) {
  await rm(
    new URL(`./local-worklet-graph-omitted-preparation-${browser}.json`, import.meta.url),
    { force: true },
  );
  const child = spawnSync(
    process.execPath,
    [new URL('./local-worklet-graph.ts', import.meta.url).pathname],
    {
      encoding: 'utf8',
      timeout: 120000,
      env: {
        ...process.env,
        PF_WORKLET_OMIT_PREPARATION: '1',
        PF_WORKLET_BROWSER: browser,
      },
    },
  );
  await writeFile(
    new URL(`./local-worklet-graph-omitted-preparation-${browser}.log`, import.meta.url),
    child.stdout + child.stderr,
  );
  assert.ifError(child.error);
  assert.equal(child.signal, null);
  assert.equal(child.status, 1, 'Omitting preparation must fail the comparison');
  const broken = await receipt(
    `./local-worklet-graph-omitted-preparation-${browser}.json`,
  );
  assert.equal(field(broken, 'completed'), false);
  assert.equal(field(broken, 'omittedPreparation'), true);
  assert.equal(field(broken, 'browserFilter'), browser);
  for (const key of ['sourceStable', 'artifactsStable'])
    assert.equal(field(broken, key), true);
  const before = field(broken, 'before');
  const expected = field(baseline, 'before');
  assert.equal(field(before, 'sourceSHA256'), field(expected, 'sourceSHA256'));
  assert.deepEqual(field(before, 'artifacts'), field(expected, 'artifacts'));
  assert.equal(field(broken, 'runnerBefore'), field(baseline, 'runnerBefore'));
  assert.equal(
    field(broken, 'compilerSourceSHA256'),
    field(baseline, 'compilerSourceSHA256'),
  );
  assert.notEqual(field(broken, 'bootstrapSHA256'), field(baseline, 'bootstrapSHA256'));
  const rows = field(broken, 'rows');
  assert(Array.isArray(rows) && rows.length === 2);
  const last: unknown = rows[1];
  assert.equal(field(last, 'name'), browser);
  assert.equal(field(last, 'mode'), 'local');
  assert.deepEqual(field(last, 'traffic'), []);
  const controls = field(last, 'guardControls');
  assert(Array.isArray(controls) && controls.length === 2);
  const rejected: unknown = controls[1];
  assert.equal(field(rejected, 'failedPreparation'), true);
  assert.equal(
    field(rejected, 'registered'),
    true,
    'The control must detect guest execution after rejected preparation',
  );
  console.log(`${browser}: actual preparation-dependency omission detected`);
}
