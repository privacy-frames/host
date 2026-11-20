#!/usr/bin/env python3
"""Extract actual C record controls and check their bounded ownership contracts."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
IMAGE = 'ghcr.io/diffblue/cbmc@sha256:d9fe087b098c5295280a0245d7b653c3485f5a6efc9c034bb3c1854455757d93'
RECEIPT = ROOT / 'results/quickjs-confinement/wasm-authority-records.json'
CORE = ['JS_IndexedProxyAccessSize', 'JS_NewIndexedProxyAccess', 'JS_SetIndexedProxyView',
        'JS_SetIndexedProxyMemory', 'JS_DisableIndexedProxyAccess', 'JS_MarkIndexedProxyDirty',
        'JS_TakeIndexedProxyDirty', 'JS_FreeIndexedProxyAccess']
WRAPPERS = ['QTS_NewIndexedProxyAccess', 'QTS_SetIndexedProxyView', 'QTS_SetIndexedProxyMemory',
            'QTS_DisableIndexedProxyAccess', 'QTS_MarkIndexedProxyDirty',
            'QTS_TakeIndexedProxyDirty', 'QTS_FreeIndexedProxyAccess']


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def function(source: str, name: str) -> str:
    matches = list(re.finditer(r'^\w[\w \t*]*\b' + name + r'\([^;{}]*\)\s*\{', source, re.M))
    if len(matches) != 1:
        raise ValueError(f'Expected one actual definition of {name}')
    start = matches[0].start()
    opening = source.index('{', start)
    depth = 1
    cursor = opening + 1
    while depth:
        # Reviewed functions contain no braces inside strings or comments.
        depth += (source[cursor] == '{') - (source[cursor] == '}')
        cursor += 1
    return source[start:cursor]


def checked_run(directory: Path, source: str, name: str):
    path = directory / (name + '.c')
    path.write_text(source)
    command = ['docker', 'run', '--rm', '-v', f'{directory}:/proof:ro', IMAGE,
               'cbmc', f'/proof/{name}.c', '--32', '--c11', '--bounds-check',
               '--pointer-check', '--memory-leak-check', '--memory-cleanup-check',
               '--malloc-may-fail', '--malloc-fail-null', '--unwind', '5',
               '--unwinding-assertions', '--json-ui']
    result = subprocess.run(command, text=True, capture_output=True, timeout=120)
    try:
        output = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(result.stdout + result.stderr)
    properties = [p for item in output for p in item.get('result', [])]
    if not properties or any(p['status'] not in ('SUCCESS', 'FAILURE') for p in properties):
        raise RuntimeError('Missing or inconclusive properties: ' + result.stdout)
    failures = [p for p in properties if p['status'] == 'FAILURE']
    return result, properties, failures, sha(source.encode())


def main():
    RECEIPT.unlink(missing_ok=True)
    paths = [ROOT / 'vendor/quickjs/upstream/quickjs.c', ROOT / 'vendor/quickjs/c/interface.c',
             HERE / 'record-model.h', HERE / 'record-harness.c', Path(__file__),
             ROOT / 'src/guest/indexed-access.ts', ROOT / 'test/quickjs-indexed-lifetime.test.ts',
             ROOT / 'vendor/quickjs/generated/engine.wasm',
             ROOT / 'vendor/quickjs/generated/engine.mjs',
             ROOT / 'vendor/quickjs/generated/build.json',
             ROOT / 'src/guest/quickjs.ts', ROOT / 'src/guest/wasm-accessors.ts',
             ROOT / 'test/quickjs-indexed.test.ts', ROOT / 'package-lock.json']
    before = {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in paths}
    c, wrapper = paths[0].read_text(), paths[1].read_text()
    classes = re.search(r'enum \{[^{}]*JS_CLASS_OBJECT = 1,[^{}]*JS_CLASS_INIT_COUNT[^{}]*\};', c)
    record = re.search(r'struct JSIndexedProxyAccess \{[^{}]*\};', c)
    proxy = re.search(r'typedef struct JSProxyData \{[^{}]*\} JSProxyData;', c)
    if not all([classes, record, proxy]):
        raise RuntimeError('Actual enum/record extraction failed')
    actual = '\n\n'.join([classes[0], record[0], proxy[0]] +
                            [function(c, name) for name in CORE] +
                            [function(wrapper, name) for name in WRAPPERS])
    source = paths[2].read_text() + '\n' + actual + '\n' + paths[3].read_text()
    anchor = 'if (s && s->indexed == access)\n        s->indexed = NULL;'
    if source.count(anchor) != 1:
        raise RuntimeError('Unlink control anchor changed')
    control = source.replace(anchor, 'if (s && s->indexed == access)\n        (void)access;')
    paired = '    QTS_FreeIndexedProxyAccess(&proxy, access);\n    __CPROVER_assert(data.indexed == NULL, "lifecycle terminal free removes the attached pointer");'
    if source.count(paired) != 1:
        raise RuntimeError('Paired caller control anchor changed')
    wrong_pair = source.replace(paired, '''    JSProxyData other_data = {0};
    JSObject other_object = { .class_id = JS_CLASS_PROXY, .proxy = &other_data };
    JSValue other_proxy = { .tag = JS_TAG_OBJECT, .object = &other_object };
    QTS_FreeIndexedProxyAccess(&other_proxy, access);
    __CPROVER_assert(data.indexed == NULL, "lifecycle terminal free removes the attached pointer");''')
    version = subprocess.check_output(['docker', 'run', '--rm', IMAGE, 'cbmc', '--version'], text=True).strip()
    if version != '6.11.0 (n/a)':
        raise RuntimeError('Unexpected CBMC version: ' + version)
    with tempfile.TemporaryDirectory(prefix='pf-c-records-') as temporary:
        directory = Path(temporary)
        good, properties, failures, compiled = checked_run(directory, source, 'records')
        if good.returncode or failures:
            raise RuntimeError('Actual-source verification failed: ' + good.stdout + good.stderr)
        bad, control_properties, control_failures, control_hash = checked_run(directory, control, 'missing-unlink')
        expected = {'paired free unlinks before storage release',
                    'lifecycle terminal free removes the attached pointer'}
        descriptions = {p['description'] for p in control_failures}
        if bad.returncode != 10 or not expected.issubset(descriptions):
            raise RuntimeError('Missing-unlink control did not fail ownership assertions: ' + bad.stdout)
        mismatched, mismatch_properties, mismatch_failures, mismatch_hash = checked_run(directory, wrong_pair, 'wrong-pair')
        if (mismatched.returncode != 10 or
                'lifecycle terminal free removes the attached pointer' not in
                {p['description'] for p in mismatch_failures}):
            raise RuntimeError('Wrong-pair control did not demonstrate the caller premise: ' + mismatched.stdout)
    tests = subprocess.run(['node', '--import', 'tsx', '--test', '--test-reporter=tap',
                            'test/quickjs-indexed-lifetime.test.ts', 'test/quickjs-indexed.test.ts'],
                           cwd=ROOT, capture_output=True, text=True, timeout=60)
    if tests.returncode or not re.search(r'^# tests 8$', tests.stdout, re.M) or not re.search(r'^# fail 0$', tests.stdout, re.M):
        raise RuntimeError('Actual SDK/C lifetime tests failed: ' + tests.stdout + tests.stderr)
    after = {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in paths}
    if before != after:
        raise RuntimeError('Component source changed during verification')
    receipt = {
        'checkedAt': datetime.now(timezone.utc).isoformat(),
        'scope': 'Extracted production C indexed record controls under explicit QuickJS ABI and caller lifetime projections',
        'tool': {'image': IMAGE, 'version': version, 'dataModel': 'ILP32',
                 'allocationMayFail': True, 'memoryCleanupCheck': True, 'unwind': 5},
        'functions': CORE + WRAPPERS,
        'runtimeTests': {
            'node': subprocess.check_output(['node', '--version'], text=True).strip(),
            'passed': 8, 'outputHash': sha(tests.stdout.encode()),
            'scope': 'Five acquisition/lifetime tests and three numeric/indexed tests against actual SDK and compiled C',
        },
        'sourceHashes': before,
        'extractedSourceHash': sha(actual.encode()), 'translationUnitHash': compiled,
        'properties': [{'id': p['property'], 'description': p['description'], 'status': p['status']}
                       for p in properties],
        'control': {'name': 'missing production unlink', 'translationUnitHash': control_hash,
                    'exitCode': bad.returncode,
                    'failures': [{'id': p['property'], 'description': p['description']}
                                 for p in control_failures],
                    'propertyCount': len(control_properties)},
        'callerPremiseControl': {
            'name': 'free called with a different live proxy', 'translationUnitHash': mismatch_hash,
            'exitCode': mismatched.returncode, 'propertyCount': len(mismatch_properties),
            'failures': [{'id': p['property'], 'description': p['description']} for p in mismatch_failures],
        },
        'remainingPremises': [
            'QuickJS value/object ABI, native brand projection and typed_array_is_oob semantics',
            'Host owns each proxy/control pairing and roots borrowed view handles through enabled use',
            'Trusted function-table entries remain live until all records are unlinked',
            'Guest entry/exit and reentry barriers disable stale views after growth or detachment',
            'No asynchronous execution interrupts individual synchronous control operations',
            'The 4-operation lifecycle harness does not prove arbitrary TS caller histories or the numeric fast paths',
            'CBMC frontend, allocator model, SAT solver and extraction runner are trusted',
        ],
    }
    RECEIPT.write_text(json.dumps(receipt, indent=2) + '\n')
    print(f'{len(properties)} actual-source properties passed; missing-unlink control failed {len(control_failures)} properties')


if __name__ == '__main__':
    main()
