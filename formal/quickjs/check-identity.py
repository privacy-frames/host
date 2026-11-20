#!/usr/bin/env python3
"""Kernel-check bounded identity allocation and reject faulty allocation rules."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'formal/quickjs/Identity.lean'
RECEIPT = ROOT / 'results/quickjs-confinement/identity-model.json'
LEAN = Path(os.environ.get('PF_LEAN', str(ROOT / '.tools/lean-4.35.0-linux/bin/lean')))
THEOREMS = [
    'initial_valid',
    'success_exact',
    'success_bounded',
    'preserves_valid',
    'rejection_unchanged',
    'exhausted_rejects',
    'valid_rejection_exhausted',
    'trace_final_valid',
    'trace_counter_matches_outputs',
    'trace_identity_bounds',
    'trace_strictly_increasing',
    'trace_unique',
    'trace_exhaustion_stable',
    'distinct_scopes_distinct_identities',
]


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def check(path: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(LEAN), '--trust=0', str(path)],
        capture_output=True,
        text=True,
        timeout=60,
        cwd=ROOT,
    )


def main() -> None:
    RECEIPT.unlink(missing_ok=True)
    version = subprocess.check_output([str(LEAN), '--version'], text=True).strip()
    if ('Lean (version 4.35.0,' not in version or
            'commit eb6cafb7290e8bd5f2937522d8d804f58f02bafc' not in version):
        raise SystemExit(f'Unexpected Lean toolchain: {version}')
    source = SOURCE.read_text()
    if re.search(r'\b(?:sorry|axiom|admit)\b', source):
        raise SystemExit('Unchecked proof declaration or placeholder in identity model')
    production = check(SOURCE)
    expected = {
        f"'PrivacyFrames.Identity.{name}' does not depend on any axioms"
        for name in THEOREMS
    }
    if (production.returncode != 0 or production.stderr or
            set(production.stdout.splitlines()) != expected or
            len(production.stdout.splitlines()) != len(THEOREMS)):
        raise SystemExit('Unexpected identity proof result:\n' +
                         production.stdout + production.stderr)

    # Change the allocator itself, retaining all theorem statements and proof
    # bodies. The exact advancement theorem must cease to type-check.
    anchor = '(next + 1, some next)'
    if source.count(anchor) != 1:
        raise SystemExit('Allocation-rule fault anchor changed')
    theorem_start = source[:source.index('theorem success_exact')].count('\n') + 1
    theorem_end = source[:source.index('theorem success_bounded')].count('\n') + 1
    controls = []
    for name, replacement in [
        ('omitted-increment', '(next, some next)'),
        ('wrap-to-one', '(if next = maximum then 1 else next + 1, some next)'),
    ]:
        mutated = source.replace(anchor, replacement)
        with tempfile.TemporaryDirectory(prefix='pf-identity-fault-') as directory:
            path = Path(directory) / 'Identity.lean'
            path.write_text(mutated)
            outcome = check(path)
            output = outcome.stdout + outcome.stderr
            errors = re.findall(r':(\d+):\d+: error: Application type mismatch', output)
            advancement_failure = any(
                theorem_start <= int(line) < theorem_end for line in errors
            )
            if outcome.returncode != 1 or not advancement_failure:
                raise SystemExit(f'{name}: fault did not fail the advancement proof:\n' + output)
            # Omit temporary path names from the receipt so output hashes bind
            # stable theorem-check diagnostics rather than random directory names.
            stable_output = output.replace(str(path), 'Identity.lean')
            controls.append({
                'name': name,
                'exitCode': outcome.returncode,
                'failedTheorem': 'PrivacyFrames.Identity.success_exact',
                'reason': 'Allocator advancement no longer satisfies the theorem',
                'inputSHA256': hashlib.sha256(mutated.encode()).hexdigest(),
                'outputSHA256': hashlib.sha256(stable_output.encode()).hexdigest(),
                'output': stable_output,
            })

    receipt = {
        'scope': ('Natural-number model of the private bounded identity allocator. '
                  'Production JavaScript, private-state ownership and caller '
                  'correspondence require separate verification.'),
        'productionCorrespondence': 'pending',
        'maximumIdentity': 9007199254740991,
        'exhaustedSentinel': 9007199254740992,
        'callerPrecondition': 'The private next counter is an integer in 1..9007199254740992.',
        'source': str(SOURCE.relative_to(ROOT)),
        'sourceSHA256': sha256(SOURCE),
        'runnerSHA256': sha256(Path(__file__)),
        'toolchain': {
            'version': version,
            'executableSHA256': sha256(LEAN.resolve()),
            'arguments': ['--trust=0'],
        },
        'theorems': [
            {'name': 'PrivacyFrames.Identity.' + name, 'axioms': []}
            for name in THEOREMS
        ],
        'productionExitCode': production.returncode,
        'productionOutputSHA256': hashlib.sha256(production.stdout.encode()).hexdigest(),
        'controls': controls,
        'completedAt': datetime.now(timezone.utc).isoformat(),
    }
    RECEIPT.parent.mkdir(parents=True, exist_ok=True)
    RECEIPT.write_text(json.dumps(receipt, indent=2) + '\n')
    print(f'Identity.lean: {len(THEOREMS)} kernel-checked theorems, no axioms')
    print('Fault controls: omitted increment and wrap-to-one invalidate advancement')
    print('Production and caller correspondence remain separate obligations')


if __name__ == '__main__':
    main()
