import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const scratch = resolve(root, '.tools/registration-lifetime');
const receipt = new URL('./registration-lifetime.json', import.meta.url);
await rm(receipt, { force: true });
await rm(scratch, { recursive: true, force: true });
await mkdir(scratch, { recursive: true });
const lean = process.env.PF_LEAN || resolve(root, '.tools/lean-4.35.0-linux/bin/lean');
const version = execFileSync(lean, ['--version'], { encoding: 'utf8' }).trim();
assert(version.includes('version 4.35.0,'));
const source = await readFile(
  new URL('./RegistrationLifetime.lean', import.meta.url),
  'utf8',
);
const theorems = [
  'separated_no_covering_registration',
  'equal_length_distinct_scopes_separated',
  'initial_safe',
  'no_covering_match',
  'step_safe',
  'arbitrary_trace_safe',
  'separated_scopes_no_old_network',
  'ancestor_counterexample',
  'descendant_counterexample',
  'scope_reuse_counterexample',
  'sibling_delivery_no_network',
  'unregistered_delivery_no_network',
  'distinct_ancestor_is_forbidden',
  'unregister_after_authorization_counterexample',
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
const expectedReports = theorems
  .map((name, index) =>
    index < 2
      ? `'RegistrationLifetime.${name}' does not depend on any axioms`
      : `'RegistrationLifetime.${name}' depends on axioms: [propext, Quot.sound]`,
  )
  .join('\n');
function validateReports(output: string) {
  assert.equal(output.trim(), expectedReports, 'Unexpected named theorem/axiom reports');
}
validateReports(proof.stdout);
await writeFile(resolve(scratch, 'proof.log'), proof.stdout);
const controls = [];
for (const control of [
  {
    name: 'unconditional-delivery',
    anchor: 'if state.authorized = 0 then state',
    replacement: 'if False then state',
    diagnostic: /Tactic `rfl` failed/,
  },
  {
    name: 'exact-scope-only',
    anchor: '| .register scope => Separated old scope',
    replacement: '| .register scope => scope ≠ old',
    diagnostic: /Application type mismatch|Type mismatch/,
  },
]) {
  assert.equal(source.split(control.anchor).length, 2);
  const fault = source.replace(control.anchor, control.replacement);
  const faultPath = resolve(scratch, control.name + '.lean');
  await writeFile(faultPath, fault);
  const rejected = check(faultPath);
  assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
  assert.match(rejected.stdout, control.diagnostic);
  await writeFile(
    resolve(scratch, control.name + '.log'),
    rejected.stdout + rejected.stderr,
  );
  controls.push({
    name: control.name,
    disposition: 'proof-rejected',
    source: fault,
    output: rejected.stdout + rejected.stderr,
  });
}
const start = source.indexOf('theorem step_safe ');
const end = source.indexOf('\ntheorem arbitrary_trace_safe ');
assert(start >= 0 && end > start);
const proofStart = source.indexOf(':= by\n', start);
assert(proofStart > start && proofStart < end);
const unchecked = source.slice(0, proofStart) + ':= by\n  sorry\n' + source.slice(end);
const uncheckedPath = resolve(scratch, 'unchecked-proof.lean');
const uncheckedInput =
  unchecked +
  '\n' +
  theorems.map((name) => '#print axioms RegistrationLifetime.' + name).join('\n') +
  '\n';
await writeFile(uncheckedPath, uncheckedInput);
const uncheckedResult = check(uncheckedPath);
assert.equal(uncheckedResult.status, 0, uncheckedResult.stdout + uncheckedResult.stderr);
assert.match(uncheckedResult.stdout, /depends on axioms:.*sorryAx/);
const uncheckedReports = uncheckedResult.stdout
  .split('\n')
  .filter((line) => line.startsWith("'RegistrationLifetime."))
  .join('\n');
assert.throws(() => validateReports(uncheckedReports), /Unexpected named theorem/);
await writeFile(resolve(scratch, 'unchecked-proof.log'), uncheckedResult.stdout);
controls.push({
  name: 'unchecked-proof',
  disposition: 'axiom-report-rejected',
  source: uncheckedInput,
  output: uncheckedResult.stdout + uncheckedResult.stderr,
});

const hash = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');
await writeFile(
  receipt,
  JSON.stringify(
    {
      scope:
        'Unbounded prefix/queue model for one origin and storage key, not a browser or implementation proof. Current covering registrations can authorize queued old-client effects, which may transmit after unregistration. Prefix-separated registrations preserve safety for all client association addresses within the protected scope.',
      preconditions: [
        'All active registrations are prefix-incomparable with the protected scope at entry to private execution and throughout the relevant lifetimes.',
        'Every modeled job uses a client association address under the protected scope, not the remote script destination; native inheritance and selection must establish this correspondence.',
        'No old-client-caused request is already authorized at the private boundary. Authorization and transmission are separate steps; unregistering does not cancel an authorized effect.',
        'Addresses are lists of natural-number URL symbols, not a checked URL parser, serialized browser URL binding or production allocator.',
        'Trusted setup traffic requires a separate independence argument; actual launch ordering, retained browser state and offline reload remain implementation/browser obligations.',
      ],
      modelSHA256: hash(source),
      checkedSourceSHA256: hash(checked),
      runnerSHA256: hash(await readFile(import.meta.filename)),
      leanVersion: version,
      leanExecutableSHA256: hash(await readFile(lean)),
      proofOutput: proof.stdout.trim(),
      controls: controls.map((control) => ({
        name: control.name,
        disposition: control.disposition,
        sourceSHA256: hash(control.source),
        outputSHA256: hash(control.output),
      })),
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Fourteen prefix/queue theorems checked; delivery, exact-scope-only and unchecked-proof controls rejected',
);
