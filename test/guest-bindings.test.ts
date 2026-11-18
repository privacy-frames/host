import assert from 'node:assert/strict';
import test from 'node:test';
import { compileInterfaceDefinitions } from '../scripts/guest-bindings.ts';
import {
  browserBindings,
  collectionMember,
  exposedIn,
  exposedInterfaces,
  globalInterfaceDefinitions,
  interfaceDefinition,
  interfaceLineage,
  interfaceMember,
  interfaceMembers,
} from '../src/guest/interfaces.ts';

test('standard corpus preserves DOM inheritance, mixins and global declarations', () => {
  assert.deepEqual(
    interfaceLineage('HTMLInputElement').map((definition) => definition.name),
    ['HTMLInputElement', 'HTMLElement', 'Element', 'Node', 'EventTarget'],
  );
  assert.equal(
    interfaceMember('Document', 'getElementById')?.owner,
    'NonElementParentNode',
  );
  assert.equal(
    interfaceMember('Window', 'setTimeout')?.owner,
    'WindowOrWorkerGlobalScope',
  );
  assert(
    globalInterfaceDefinitions(['Window']).some(
      (definition) => definition.name === 'Window',
    ),
  );
  assert.equal(interfaceMember('Node', 'ELEMENT_NODE', true)?.kind, 'constant');
  assert.equal(interfaceMember('Node', 'ELEMENT_NODE')?.kind, 'constant');
});

test('global exposure is separate from effect authorization', () => {
  assert(exposedIn(['*'], ['Window']));
  assert(!exposedIn(['Worker'], ['Window']));
  assert(
    exposedInterfaces(['Window']).some((definition) => definition.name === 'WebSocket'),
  );
  assert(
    !exposedInterfaces(['AudioWorklet']).some(
      (definition) => definition.name === 'Document',
    ),
  );
  assert(
    exposedInterfaces(['Worker', 'DedicatedWorker']).some(
      (definition) => definition.name === 'FileReaderSync',
    ),
  );
});

test('collection declarations expose native iteration contracts', () => {
  assert.equal(collectionMember('NodeList', Symbol.iterator)?.kind, 'iterable');
  assert.equal(collectionMember('NodeList', 'forEach')?.kind, 'iterable');
  assert.equal(
    collectionMember('FileSystemDirectoryHandle', Symbol.asyncIterator)?.kind,
    'iterable',
  );
  assert.equal(collectionMember('FileSystemDirectoryHandle', Symbol.iterator), undefined);
  assert.equal(collectionMember('FontFaceSet', 'add')?.kind, 'setlike');
});

test('the generated corpus has complete parent links and stable package provenance', () => {
  assert.equal(browserBindings.webrefVersion, '3.87.0');
  assert.equal(browserBindings.parserVersion, '24.5.0');
  assert.match(browserBindings.sourceHash, /^[a-f0-9]{64}$/);
  assert(browserBindings.interfaces.length > 1000);
  const names = new Set<string>();
  for (const definition of browserBindings.interfaces) {
    assert(!names.has(definition.name), definition.name);
    names.add(definition.name);
    if (definition.parent)
      assert(interfaceDefinition(definition.parent), definition.parent);
    assert(definition.members.every((member) => member !== null));
    interfaceLineage(definition.name);
  }
});

test('compiler joins out-of-order partials, included mixins and operation overloads', () => {
  const definitions = compileInterfaceDefinitions([
    {
      name: 'extension.idl',
      text: 'partial interface Example { undefined run(optional DOMString value); }; interface mixin Extra { readonly attribute long count; }; Example includes Extra;',
    },
    {
      name: 'base.idl',
      text: '[Exposed=(Window,Worker)] interface Example { constructor(DOMString value); undefined run(long value); };',
    },
  ]);
  const example = definitions[0];
  assert.equal(example.name, 'Example');
  assert.deepEqual(example.exposed, ['Window', 'Worker']);
  assert.equal(example.constructorArguments, 1);
  const operations = example.members.filter((member) => member.kind === 'operation');
  assert.deepEqual(
    operations.map((operation) => operation.requiredArguments),
    [1, 0],
  );
  assert.equal(example.members.find((member) => member.name === 'count')?.owner, 'Extra');
});

test('compiler preserves stringifiers, static operations and nonfinite constants', () => {
  const definitions = compileInterfaceDefinitions([
    {
      name: 'example.idl',
      text: '[Exposed=*] interface Example { const unrestricted double MAX = Infinity; stringifier; static undefined check(); };',
    },
  ]);
  const example = definitions[0];
  assert.deepEqual(example.exposed, ['*']);
  assert.equal(
    example.members.find((member) => member.name === 'toString')?.kind,
    'operation',
  );
  assert.equal(example.members.find((member) => member.name === 'check')?.static, true);
  const constant = example.members.find((member) => member.kind === 'constant');
  assert(constant?.kind === 'constant');
  assert.equal(constant.value, 'Infinity');
});

test('compiler refuses unresolved includes and incomplete interface definitions', () => {
  assert.throws(
    () =>
      compileInterfaceDefinitions([
        { name: 'broken.idl', text: 'interface Example {}; Example includes Missing;' },
      ]),
    /Unresolved Web IDL include/,
  );
  assert.throws(
    () =>
      compileInterfaceDefinitions([
        { name: 'broken.idl', text: 'partial interface Example { undefined run(); };' },
      ]),
    /Missing primary Web IDL interface/,
  );
  assert.throws(
    () =>
      compileInterfaceDefinitions([
        { name: 'broken.idl', text: 'interface Example : Missing {};' },
      ]),
    /Missing Web IDL parent/,
  );
  assert.throws(
    () =>
      compileInterfaceDefinitions([
        {
          name: 'broken.idl',
          text: 'interface First : Second {}; interface Second : First {};',
        },
      ]),
    /Cyclic Web IDL inheritance/,
  );
});

test('overload lookup retains every standard native operation signature', () => {
  const operations = interfaceMembers('CanvasRenderingContext2D', 'drawImage');
  assert.equal(operations.length, 3);
  assert(operations.every((operation) => operation.kind === 'operation'));
  assert.equal(interfaceMember('HTMLInputElement', 'value')?.kind, 'attribute');
});

// https://webidl.spec.whatwg.org/#legacy-callback-interface-object
test('callback interfaces expose a legacy object only when they declare constants', () => {
  const definitions = compileInterfaceDefinitions([
    {
      name: 'callback.idl',
      text: '[Exposed=Window] callback interface Filter { const unsigned short ACCEPT = 1; unsigned short acceptNode(); }; callback interface Listener { undefined handleEvent(); };',
    },
  ]);
  assert.equal(
    definitions.find((value) => value.name === 'Filter')?.hasInterfaceObject,
    true,
  );
  assert.equal(
    definitions.find((value) => value.name === 'Listener')?.hasInterfaceObject,
    false,
  );
  const nodeFilter = exposedInterfaces(['Window']).find(
    (value) => value.name === 'NodeFilter',
  );
  assert(nodeFilter);
  assert.equal(nodeFilter.kind, 'callback');
  assert.equal(
    nodeFilter.members.find((member) => member.name === 'SHOW_ELEMENT')?.kind,
    'constant',
  );
});
