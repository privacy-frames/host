import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const scratch = resolve(root, '.tools/registration-lifetime');
const receipt = new URL('./registration-lifetime.json', import.meta.url);
await rm(receipt, { force: true });
await mkdir(scratch, { recursive: true });
const lean = process.env.PF_LEAN || resolve(root, '.tools/lean-4.35.0-linux/bin/lean');
const version = execFileSync(lean, ['--version'], { encoding: 'utf8' }).trim();
assert(version.includes('version 4.35.0,'));
const source = await readFile(
  new URL('./RegistrationLifetime.lean', import.meta.url),
  'utf8',
);
const theorems = [
  'initial_safe',
  'step_safe',
  'arbitrary_trace_safe',
  'fresh_scopes_no_old_network',
  'scope_reuse_counterexample',
  'unregistered_delivery_no_network',
];
const checked =
  source +
  '\n' +
  theorems.map((name) => `#print axioms RegistrationLifetime.${name}`).join('\n') +
  '\n';
const checkedPath = resolve(scratch, 'Checked.lean');
await writeFile(checkedPath, checked);
function check(path: string) {
  const result = spawnSync(lean, ['--trust=0', path], {
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}
const proof = check(checkedPath);
assert.equal(proof.status, 0, proof.stdout + proof.stderr);
assert.equal(proof.stderr, '');
assert.equal(
  proof.stdout.trim(),
  theorems
    .map((name) =>
      ['step_safe', 'arbitrary_trace_safe', 'fresh_scopes_no_old_network'].includes(name)
        ? `'RegistrationLifetime.${name}' depends on axioms: [propext]`
        : `'RegistrationLifetime.${name}' does not depend on any axioms`,
    )
    .join('\n'),
);
await writeFile(resolve(scratch, 'proof.log'), proof.stdout);
const anchor = 'oldClientNetwork := state.oldClientNetwork || state.registered old';
assert.equal(source.split(anchor).length, 2);
const fault = source.replace(anchor, 'oldClientNetwork := true');
const faultPath = resolve(scratch, 'Wrong.lean');
await writeFile(faultPath, fault);
const rejected = check(faultPath);
assert.notEqual(rejected.status, 0);
assert.match(rejected.stdout, /Tactic `rfl` failed/);
await writeFile(resolve(scratch, 'control.log'), rejected.stdout + rejected.stderr);
const hash = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');
await writeFile(
  receipt,
  JSON.stringify(
    {
      scope:
        'Unbounded abstract scope/queue lemma, not implementation correspondence or a complete browser model. Old-client jobs retain one scope and consult its registration map entry at delivery. Trusted setup traffic is excluded only under a separate independence obligation.',
      preconditions: [
        'The protected scope remains absent throughout old-client and queued-job lifetimes.',
        'Old-client-caused jobs use that scope; they cannot select another registration.',
        'Scope names are abstract natural numbers, not emitted URL slugs or a verified allocator.',
        'Browser inheritance, registration semantics and the production launch protocol require separate correspondence.',
      ],
      modelSHA256: hash(source),
      runnerSHA256: hash(await readFile(import.meta.filename)),
      leanVersion: version,
      leanExecutableSHA256: hash(await readFile(lean)),
      proofOutput: proof.stdout.trim(),
      faultyDeliveryControl: {
        disposition: 'proof-rejected',
        sourceSHA256: hash(fault),
        outputSHA256: hash(rejected.stdout + rejected.stderr),
      },
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Six scope/queue theorems kernel-checked with recorded logical axioms; unconditional network delivery rejected',
);
