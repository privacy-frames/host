#!/usr/bin/env python3
"""Check context epoch preservation and its semantic negative control."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
lean = os.environ.get('PF_LEAN', str(root / '.tools/lean-4.35.0-linux/bin/lean'))
version = subprocess.check_output([lean, '--version'], text=True)
assert 'Lean (version 4.35.0,' in version, version
source_path = root / 'formal/quickjs/context-publication.lean'
source = source_path.read_text()
run = subprocess.run([lean, '--trust=0', str(source_path)], capture_output=True, text=True)
assert run.returncode == 0, run.stdout + run.stderr
names = ['initial_well_formed', 'step_well_formed', 'begin_accepts_current',
         'close_denies_every_token', 'step_rejects_retained', 'run_preserves_safe',
         'invalidation_never_revives_retained', 'history_well_formed',
         'reused_token_counterexample']
expected = {f"'ContextPublication.{name}' does not depend on any axioms" for name in names}
assert set(run.stdout.splitlines()) == expected and not run.stderr, run.stdout + run.stderr
anchor = '| .invalidate => advance state true'
assert source.count(anchor) == 1
fault = source.replace(anchor, '| .invalidate => advance state false')
with tempfile.TemporaryDirectory(prefix='pf-context-epoch-fault-') as temporary:
    path = Path(temporary) / 'Fault.lean'
    path.write_text(fault)
    broken = subprocess.run([lean, '--trust=0', str(path)], capture_output=True, text=True)
    output = broken.stdout + broken.stderr
    assert broken.returncode != 0
    assert "'ContextPublication.close_denies_every_token' depends on axioms: [sorryAx]" in output, output
    assert 'Unknown' not in output and 'unknown' not in output, output
hash_text = lambda text: hashlib.sha256(text.encode()).hexdigest()
receipt = {'scope': 'Unbounded begin/invalidate histories over ghost names for fresh private object identities. This proves epoch preservation, not complete browser/context confinement.',
           'leanVersion': version.strip(), 'trust': 0, 'theorems': names, 'axioms': [],
           'sourceSHA256': hash_text(source), 'runnerSHA256': hash_text(Path(__file__).read_text()),
           'productionOutputSHA256': hash_text(run.stdout),
           'fault': {'mutation': 'Invalidation leaves the epoch live', 'sourceSHA256': hash_text(fault),
                     'exitCode': broken.returncode, 'outputSHA256': hash_text(output),
                     'rejectedTheorem': 'ContextPublication.close_denies_every_token'}}
out = root / 'results/quickjs-confinement/context-publication-lean.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(receipt, indent=2) + '\n')
print('Nine axiom-free context epoch theorems checked; live-invalidation fault rejected.')
