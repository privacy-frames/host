#!/usr/bin/env python3
"""Check actual indexed branches, with ordinary/descriptor continuations out of scope."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import runpy
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
TOOLS = runpy.run_path(str(HERE / 'check-records.py'))
ROOT, IMAGE = TOOLS['ROOT'], TOOLS['IMAGE']
sha, function, checked_run = TOOLS['sha'], TOOLS['function'], TOOLS['checked_run']
RECEIPT = ROOT / 'results/quickjs-confinement/wasm-authority-fastpaths.json'


def indexed_prefix(source: str, name: str) -> str:
    body = function(source, name)
    if name == 'js_proxy_get':
        anchor = '    s = get_proxy_method(ctx, &method, obj, JS_ATOM_get);'
        continuation = '    return (JSValue){0};\n validate_result:\n    return ret;\n}'
    else:
        anchor = ' ordinary_set:\n'
        continuation = ' ordinary_set:\n    return 0;\n validate_result:\n    return ret;\n}'
    if body.count(anchor) != 1:
        raise RuntimeError('Indexed branch continuation changed: ' + name)
    return body[:body.index(anchor)] + continuation


def main():
    RECEIPT.unlink(missing_ok=True)
    paths = [ROOT / 'vendor/quickjs/upstream/quickjs.c', ROOT / 'vendor/quickjs/upstream/quickjs.h',
             HERE / 'record-model.h', HERE / 'fastpath-model.h', HERE / 'fastpath-harness.c',
             HERE / 'check-records.py', Path(__file__)]
    before = {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in paths}
    c, header = paths[0].read_text(), paths[1].read_text()
    tags = re.search(r'enum \{[^{}]*JS_TAG_FIRST[^{}]*JS_TAG_FLOAT64[^{}]*\};', header)
    classes = re.search(r'enum \{[^{}]*JS_CLASS_OBJECT = 1,[^{}]*JS_CLASS_INIT_COUNT[^{}]*\};', c)
    record = re.search(r'struct JSIndexedProxyAccess \{[^{}]*\};', c)
    proxy = re.search(r'typedef struct JSProxyData \{[^{}]*\} JSProxyData;', c)
    atom_tag = re.search(r'^#define JS_ATOM_TAG_INT .*$', c, re.M)
    if not all([tags, classes, record, proxy, atom_tag]):
        raise RuntimeError('Actual ABI enum/struct extraction failed')
    actual = '\n\n'.join([classes[0], record[0], proxy[0], atom_tag[0]] +
                            [function(c, name) for name in ['__JS_AtomIsTaggedInt', '__JS_AtomToUInt32']] +
                            [function(header, name) for name in ['JS_IsObject', 'JS_IsSymbol', 'JS_IsBigInt']])
    get = indexed_prefix(c, 'js_proxy_get')
    setter = indexed_prefix(c, 'js_proxy_set')
    prelude = tags[0] + '\n' + paths[2].read_text().replace('#define JS_TAG_OBJECT -1\n', '')
    source = prelude + '\n' + paths[3].read_text() + '\n' + actual + '\n' + get + '\n' + setter + '\n' + paths[4].read_text()
    bound = ' && __JS_AtomToUInt32(atom) < s->indexed->length'
    if source.count(bound) != 2:
        raise RuntimeError('Expected two production numeric bound guards')
    control = source.replace(bound, '')
    enabled = 's->indexed->enabled &&'
    if source.count(enabled) != 2:
        raise RuntimeError('Expected two production enabled guards')
    disabled_control = source.replace(enabled, '')
    version = subprocess.check_output(['docker', 'run', '--rm', IMAGE, 'cbmc', '--version'], text=True).strip()
    if version != '6.11.0 (n/a)':
        raise RuntimeError('Unexpected CBMC version: ' + version)
    with tempfile.TemporaryDirectory(prefix='pf-c-fastpaths-') as temporary:
        directory = Path(temporary)
        good, properties, failures, compiled = checked_run(directory, source, 'fastpaths')
        if good.returncode or failures:
            raise RuntimeError('Production branch verification failed: ' + good.stdout + good.stderr)
        controls = []
        for name, changed in [('missing-index-bound', control), ('missing-enabled-guard', disabled_control)]:
            bad, control_properties, failed, changed_hash = checked_run(directory, changed, name)
            expected = {'native access requires every production admission guard',
                        'borrowed view access requires every production admission guard'}
            if bad.returncode != 10 or not expected.issubset({p['description'] for p in failed}):
                raise RuntimeError('Admission control did not fail both paths: ' + bad.stdout)
            controls.append({'name': name, 'exitCode': bad.returncode, 'translationUnitHash': changed_hash,
                             'failures': [{'id': p['property'], 'description': p['description']} for p in failed],
                             'propertyCount': len(control_properties)})
    after = {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in paths}
    if before != after:
        raise RuntimeError('Component source changed during verification')
    receipt = {
        'checkedAt': datetime.now(timezone.utc).isoformat(),
        'scope': 'Actual initial indexed branches of js_proxy_get and js_proxy_set; general Proxy continuations excluded',
        'tool': {'image': IMAGE, 'version': version, 'dataModel': 'ILP32', 'unwind': 5},
        'sourceHashes': before, 'translationUnitHash': compiled,
        'extractedPrefixHashes': {'js_proxy_get': sha(get.encode()), 'js_proxy_set': sha(setter.encode())},
        'properties': [{'id': p['property'], 'description': p['description'], 'status': p['status']} for p in properties],
        'controls': controls,
        'remainingPremises': [
            'QuickJS value/object ABI projections and rooted live proxy/control/view handles',
            'Internal primitive conversions and typed-array operations obey their modeled effects without guest reentry',
            'Supplied native read/write table entries are the actual verified application-memory accessors',
            'Continuation slices deliberately exclude ordinary proxy behavior and descriptor invariant validation',
            'TS caller ownership, detachment/growth invalidation and table-slot lifetime remain composition obligations',
            'CBMC frontend, SAT solver and extraction runner are trusted',
        ],
    }
    RECEIPT.write_text(json.dumps(receipt, indent=2) + '\n')
    print(f'{len(properties)} indexed-branch properties passed; omitted-bound and enabled-guard controls failed both paths')


if __name__ == '__main__':
    main()
