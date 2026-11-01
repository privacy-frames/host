"""Challenge structural evidence checks; these tests do not certify confinement."""

import hashlib
import importlib.util
import io
import json
from contextlib import redirect_stdout
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
CHECKER = ROOT / 'formal/claims/check.py'


class LedgerChecks(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.artifact = self.root / 'evidence.json'
        self.artifact.write_text('{"scope":"fixture"}\n')
        self.ledger = {
            'schema_version': 1,
            'source_baseline': '0' * 40,
            'scope': 'Structural checker fixture only.',
            'artifact_sha256': {
                'evidence.json': hashlib.sha256(self.artifact.read_bytes()).hexdigest(),
            },
            'claims': [{
                'id': 'fixture',
                'disposition': 'unverified',
                'title': 'Fixture claim',
                'preconditions': 'Fixture input exists.',
                'enforcement': 'No runtime enforcement is claimed.',
                'source_paths': ['evidence.json'],
                'evidence': [{
                    'kind': 'discovery',
                    'description': 'Synthetic checker input.',
                    'paths': ['evidence.json'],
                }],
                'control_status': {
                    name: 'not-recorded'
                    for name in ('native_control', 'confined_test', 'fault_control')
                },
                'open_obligations': ['This fixture establishes no security property.'],
            }],
        }

    def run_checker(self):
        ledger = self.root / 'ledger.json'
        ledger.write_text(json.dumps(self.ledger))
        return subprocess.run(
            [sys.executable, str(CHECKER), '--root', str(self.root),
             '--ledger', str(ledger)],
            capture_output=True, text=True, check=False,
        )

    def rejects(self, message):
        result = self.run_checker()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn(message, result.stderr)

    def test_valid_structural_control(self):
        result = self.run_checker()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('1 claims and 1 referenced artifacts checked', result.stdout)

    def test_changed_artifact(self):
        self.artifact.write_text('{"scope":"changed"}\n')
        self.rejects('Artifact changed; review required')

    def test_missing_artifact(self):
        self.artifact.unlink()
        self.rejects('Missing artifact')

    def test_removed_evidence(self):
        self.ledger['claims'][0]['evidence'] = []
        self.rejects('missing evidence')

    def test_unbacked_control_status(self):
        self.ledger['claims'][0]['control_status']['fault_control'] = 'recorded'
        self.rejects('inconsistent fault_control status')

    def test_unknown_evidence_kind(self):
        self.ledger['claims'][0]['evidence'][0]['kind'] = 'complete_proof'
        self.rejects('unknown evidence kind')


class RouteChecks(unittest.TestCase):
    def test_unverified_dependency_cannot_establish_route(self):
        spec = importlib.util.spec_from_file_location(
            'route_review_generator', ROOT / 'formal/route-review/generate.py',
        )
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        generator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(generator)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative in ('formal/evidence/context-idl-join.json',
                             'formal/claims/ledger.json'):
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((ROOT / relative).read_bytes())
            triage = json.loads((ROOT / 'formal/route-review/triage.json').read_text())
            key = 'websockets|WebSocket|constructor|constructor'
            claim_id = triage['claimLinks'][key]['claim']
            ledger_path = root / 'formal/claims/ledger.json'
            ledger = json.loads(ledger_path.read_text())
            for claim in ledger['claims']:
                if claim['id'] == claim_id:
                    claim['disposition'] = 'unverified'
            ledger_path.write_text(json.dumps(ledger))
            triage['claimLinks'][key]['disposition'] = 'unverified'
            annotation = root / 'triage.json'
            annotation.write_text(json.dumps(triage))
            with patch.object(generator, 'ROOT', root), \
                    patch.object(generator, 'TRIAGE', annotation), \
                    patch.object(generator, 'OUTPUT', root / 'queue.json'), \
                    patch.object(sys, 'argv', ['generate.py']):
                with redirect_stdout(io.StringIO()):
                    generator.main()
                queue = root / 'queue.json'
                self.assertTrue(queue.is_file())
                queue.unlink()
                # Change only the unsupported promotion in the positive input.
                for disposition in ('enforced-scoped', 'excluded-scoped'):
                    with self.subTest(disposition=disposition):
                        triage['claimLinks'][key]['disposition'] = disposition
                        annotation.write_text(json.dumps(triage))
                        with self.assertRaisesRegex(
                            ValueError, 'unreviewed claim cannot establish',
                        ):
                            generator.main()
                        self.assertFalse(queue.exists())


if __name__ == '__main__':
    unittest.main()
