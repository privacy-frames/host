#!/usr/bin/env python3
"""Check Wasm32 address arithmetic; caller ownership is a separate obligation."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'formal/quickjs/wasm/Bounds.lean'
RECEIPT = ROOT / 'results/quickjs-confinement/wasm-authority-bounds.json'
LEAN = Path(os.environ.get('PF_LEAN', str(ROOT / '.tools/lean-4.35.0-linux/bin/lean')))
THEOREMS = [
    'element_fits',
    'mathematical_address_bounded',
    'remainder_unchanged',
    'uint32_address_exact',
    'uint32_access_within_view',
]


def digest(path: Path) -> str:
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def main() -> None:
    RECEIPT.unlink(missing_ok=True)
    version = subprocess.check_output([str(LEAN), '--version'], text=True).strip()
    if ('Lean (version 4.35.0,' not in version or
            'commit eb6cafb7290e8bd5f2937522d8d804f58f02bafc' not in version):
        raise SystemExit('Unexpected Lean version: ' + version)
    source = SOURCE.read_text()
    if re.search(r'\b(?:sorry|axiom|admit)\b', source):
        raise SystemExit('Unchecked declaration or placeholder in bounds model')
    result = subprocess.run([str(LEAN), '--trust=0', str(SOURCE)], cwd=ROOT,
                            capture_output=True, text=True, timeout=60)
    expected = {f"'PrivacyFrames.WasmBounds.{name}' does not depend on any axioms"
                for name in THEOREMS}
    if (result.returncode or result.stderr or set(result.stdout.splitlines()) != expected
            or len(result.stdout.splitlines()) != len(THEOREMS)):
        raise SystemExit(result.stdout + result.stderr)
    expression = '(offset + (index * width) % modulus) % modulus'
    if source.count(expression) != 1:
        raise SystemExit('Arithmetic fault anchor changed')
    with tempfile.TemporaryDirectory(prefix='pf-wasm-bounds-') as directory:
        fault = Path(directory) / 'WrongAddress.lean'
        fault.write_text(source.replace(expression,
                                        '(offset + (index * width) % modulus + 1) % modulus'))
        negative = subprocess.run([str(LEAN), '--trust=0', str(fault)], cwd=ROOT,
                                  capture_output=True, text=True, timeout=60)
        proof_start = source[:source.index('theorem uint32_address_exact')].count('\n') + 1
        proof_end = source[:source.index('theorem uint32_access_within_view')].count('\n') + 1
        errors = [int(match) for match in re.findall(r':(\d+):\d+: error', negative.stdout)]
        if (negative.returncode == 0 or negative.stderr or
                not any(proof_start <= line < proof_end for line in errors) or
                'unknownIdentifier' in negative.stdout):
            raise SystemExit('Wrong-address control did not fail its preservation proof:\n' +
                             negative.stdout + negative.stderr)
    c_source = ROOT / 'vendor/quickjs/upstream/quickjs.c'
    c = c_source.read_text()
    formula = 'access->offset + (index << access->shift)'
    if c.count(formula) != 2:
        raise SystemExit('The reviewed C read/write address expressions changed')
    if c.count('access->shift = kind & 3;') != 1:
        raise SystemExit('The reviewed C shift restriction changed')
    receipt = {
        'scope': 'Kernel-checked natural-number/Wasm32 modular address arithmetic, '
                 'conditional on a valid native view and live registered control. '
                 'This does not prove C pointer lifetime, caller ownership or all C behavior.',
        'lean': version,
        'sourceSHA256': digest(SOURCE),
        'runnerSHA256': digest(Path(__file__)),
        'cSourceSHA256': digest(c_source),
        'sourceCorrespondence': 'The two C read/write formulas and shift mask are checked '
                                'against the reviewed spellings. This is not a C semantics proof.',
        'theorems': THEOREMS,
        'axiomDependencies': [],
        'wrongAddressControl': {
            'passed': True,
            'exitCode': negative.returncode,
            'outputSHA256': hashlib.sha256(negative.stdout.encode()).hexdigest(),
        },
        'premises': [
            'Native typed-array getters establish index < length and '
            'offset + length * width <= buffer byteLength.',
            'The backing is fixed, nonshared, live and at most 2^32 bytes.',
            'The C uint32 shift/add implements arithmetic modulo 2^32; '
            'width is 2^shift with shift in 0..3.',
            'Control records, borrowed handles and private table slots remain valid '
            'through the native call.',
        ],
        'completed': datetime.now(timezone.utc).isoformat(),
    }
    RECEIPT.parent.mkdir(parents=True, exist_ok=True)
    RECEIPT.write_text(json.dumps(receipt, indent=2) + '\n')
    print('Five axiom-free Wasm32 bounds theorems passed; a wrong-address rule failed.')


if __name__ == '__main__':
    main()
