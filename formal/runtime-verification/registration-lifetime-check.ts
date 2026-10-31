import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const scratch = resolve(root, '.tools/registration-lifetime');
const receipt = new URL('./registration-lifetime.json', import.meta.url);
const queueReceipt = new URL('./registration-queue.json', import.meta.url);
await rm(receipt, { force: true });
await rm(queueReceipt, { force: true });
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

// The prefix model deliberately permits schedules that the per-scope API queue
// can exclude. Check that queue separately, without claiming browser refinement.
const queueSource = await readFile(
  new URL('./RegistrationQueue.lean', import.meta.url),
  'utf8',
);
const queueTheorems = [
  'initial_well_formed',
  'held_update_blocks_queue',
  'step_preserves_well_formed',
  'acknowledged_step_no_request',
  'arbitrary_trace_well_formed',
  'acknowledged_arbitrary_trace_no_request',
  'held_unregister_not_acknowledged',
  'fence_does_not_erase_prior_request',
  'without_unregister_two_requests',
];
const queueReports = (source: string) =>
  source +
  '\n' +
  queueTheorems.map((name) => `#print axioms RegistrationQueue.${name}`).join('\n') +
  '\n';
const queueExpected = queueTheorems
  .map((name, index) =>
    index < 6
      ? `'RegistrationQueue.${name}' depends on axioms: [propext]`
      : `'RegistrationQueue.${name}' does not depend on any axioms`,
  )
  .join('\n');
function validateQueueReports(output: string) {
  assert.equal(output.trim(), queueExpected, 'Unexpected queue theorem/axiom reports');
}
const queueChecked = queueReports(queueSource);
const queuePath = resolve(scratch, 'QueueChecked.lean');
await writeFile(queuePath, queueChecked);
const queueProof = check(queuePath);
assert.equal(queueProof.status, 0, queueProof.stdout + queueProof.stderr);
assert.equal(queueProof.stderr, '');
validateQueueReports(queueProof.stdout);
await writeFile(resolve(scratch, 'queue-proof.log'), queueProof.stdout);
const queueControls = [];
for (const control of [
  {
    name: 'queue-bypass-held-update',
    anchor: 'if state.updateInFlight then state',
    replacement: 'if False then state',
  },
  {
    name: 'queue-retain-registration',
    anchor: 'registered := false, pending := rest, unregisterAcknowledged := true',
    replacement: 'registered := true, pending := rest, unregisterAcknowledged := true',
  },
]) {
  assert.equal(queueSource.split(control.anchor).length, 2);
  const faulty = queueSource.replace(control.anchor, control.replacement);
  const path = resolve(scratch, control.name + '.lean');
  await writeFile(path, faulty);
  const result = check(path);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /error: (Tactic|Type mismatch|Application type mismatch)/);
  await writeFile(resolve(scratch, control.name + '.log'), result.stdout + result.stderr);
  queueControls.push({
    name: control.name,
    disposition: 'proof-rejected',
    sourceSHA256: hash(faulty),
    outputSHA256: hash(result.stdout + result.stderr),
  });
}
const queueProofStart = queueSource.indexOf('theorem step_preserves_well_formed ');
const queueProofEnd = queueSource.indexOf('\ntheorem acknowledged_step_no_request ');
const queueBody = queueSource.indexOf(':= by\n', queueProofStart);
assert(queueProofStart >= 0 && queueBody > queueProofStart && queueProofEnd > queueBody);
const queueUnchecked = queueReports(
  queueSource.slice(0, queueBody) + ':= by\n  sorry\n' + queueSource.slice(queueProofEnd),
);
const queueUncheckedPath = resolve(scratch, 'queue-unchecked-proof.lean');
await writeFile(queueUncheckedPath, queueUnchecked);
const queueUncheckedResult = check(queueUncheckedPath);
assert.equal(queueUncheckedResult.status, 0);
assert.match(queueUncheckedResult.stdout, /depends on axioms:.*sorryAx/);
const strippedReports = queueUncheckedResult.stdout
  .split('\n')
  .filter((line) => line.startsWith("'RegistrationQueue."))
  .join('\n');
assert.throws(() => validateQueueReports(strippedReports), /Unexpected queue theorem/);
await writeFile(
  resolve(scratch, 'queue-unchecked-proof.log'),
  queueUncheckedResult.stdout,
);
queueControls.push({
  name: 'queue-unchecked-proof',
  disposition: 'axiom-report-rejected',
  sourceSHA256: hash(queueUnchecked),
  outputSHA256: hash(queueUncheckedResult.stdout + queueUncheckedResult.stderr),
});
await writeFile(
  queueReceipt,
  JSON.stringify(
    {
      scope:
        'Unbounded single-scope update/unregister queue model. An acknowledgment fences future modeled updates without erasing earlier requests. This is not a browser refinement proof, global job drain or production launch barrier.',
      preconditions: [
        'One scope and storage key; no re-registration, replacement or external modification of registration state during the modeled lifetime.',
        'Update and unregister jobs start serially; an active update must finish before the next job starts.',
        'Requests are counted at update start, before response completion; earlier requests remain counted after unregistration.',
        'Changed-worker install/activate work, other browser queues, native controller inheritance, scope selection and production launch correspondence remain outside this model.',
      ],
      modelSHA256: hash(queueSource),
      checkedSourceSHA256: hash(queueChecked),
      runnerSHA256: hash(await readFile(import.meta.filename)),
      leanVersion: version,
      leanExecutableSHA256: hash(await readFile(lean)),
      proofOutput: queueProof.stdout.trim(),
      controls: queueControls,
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Nine queue theorems checked; ordering, registration and unchecked-proof controls rejected',
);
