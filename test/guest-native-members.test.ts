import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import {
  compileInterfaceDefinitions,
  nativeMemberProjection,
} from '../scripts/guest-bindings.ts';
import { browserBindings } from '../src/guest/generated-interfaces.ts';
import { NativePolicy, NativePolicyError } from '../src/guest/native-policy.ts';
import {
  AmbiguousNativeMemberError,
  NativeMemberIndex,
  nativeMemberManifest,
  type NativeInterfaceMembers,
  type NativeMemberIdentity,
} from '../src/guest/native-members.ts';

const fixture = compileInterfaceDefinitions([
  {
    name: 'native-members.idl',
    text: `
  [Exposed=Window] interface Base {
    const unsigned short FLAG = 1;
    undefined inherited();
  };
  interface mixin Extra { undefined mixed(); };
  [Exposed=Window] interface Child : Base {
    stringifier attribute USVString href;
    undefined overloaded(DOMString value);
    undefined overloaded(long value);
    static undefined staticMethod();
  };
  Child includes Extra;
  [Exposed=Window] interface Named {
    getter DOMString (DOMString name);
    setter undefined (DOMString name, DOMString value);
    deleter boolean (DOMString name);
  };
  [Exposed=Window] interface Indexed {
    getter DOMString item(unsigned long index);
    setter undefined (unsigned long index, DOMString value);
  };
  [Exposed=Window] interface Unclassified {
    getter DOMString (USVString name);
  };
  [Exposed=Window] interface Values { iterable<DOMString>; };
  [Exposed=Window] interface AsyncValues { async iterable<DOMString>; };
  [Exposed=Window] interface AsyncPairs { async iterable<DOMString, DOMString>; };
  [Exposed=Window] interface MutableMap { maplike<DOMString, long>; };
  [Exposed=Window] interface ReadonlySet { readonly setlike<DOMString>; };
  [Exposed=Window] namespace Constants { const unsigned short FLAG = 1; };
`,
  },
]);
const fixtureProjection = nativeMemberProjection(fixture);
const index = new NativeMemberIndex(fixtureProjection);

function sameDeclaration(
  member: NativeMemberIdentity,
  full: (typeof browserBindings.interfaces)[number]['members'][number],
): boolean {
  if (member.owner !== full.owner) return false;
  if (member.sourceAttribute)
    return (
      full.kind === 'attribute' &&
      full.stringifier === true &&
      full.name === member.sourceAttribute
    );
  if (member.collection)
    return (
      full.kind ===
        (member.collection === 'async-iterable' ? 'iterable' : member.collection) &&
      (full.kind !== 'iterable' ||
        full.async === (member.collection === 'async-iterable'))
    );
  return (
    member.kind === full.kind &&
    member.name === (full.name || null) &&
    (full.kind === 'constant' || member.static === full.static)
  );
}

test('native projection covers every pinned declaration and retains matching provenance', () => {
  assert.equal(nativeMemberManifest.webrefVersion, browserBindings.webrefVersion);
  assert.equal(nativeMemberManifest.parserVersion, browserBindings.parserVersion);
  assert.equal(nativeMemberManifest.sourceHash, browserBindings.sourceHash);
  assert.deepEqual(
    nativeMemberManifest.interfaces,
    nativeMemberProjection(browserBindings.interfaces),
  );
  for (let position = 0; position < nativeMemberManifest.interfaces.length; position++) {
    const compact: NativeInterfaceMembers = nativeMemberManifest.interfaces[position];
    const full = browserBindings.interfaces[position];
    assert.equal(compact.name, full.name);
    assert.equal(compact.kind, full.kind);
    assert.equal(compact.parent, full.parent);
    const serialized = compact.members.map((member) => JSON.stringify(member));
    assert.equal(new Set(serialized).size, serialized.length, compact.name);
    for (const declaration of full.members)
      assert(
        compact.members.some((member) => sameDeclaration(member, declaration)),
        `${full.name}.${declaration.name}`,
      );
    for (const member of compact.members) {
      assert(
        full.members.some((declaration) => sameDeclaration(member, declaration)),
        `${compact.name}.${member.name}`,
      );
      for (const field of [
        'arguments',
        'requiredArguments',
        'type',
        'types',
        'value',
        'exposed',
        'attributes',
      ])
        assert(!Object.hasOwn(member, field), field);
    }
  }
});

test('inheritance, mixin owners, static placement and overload deduplication retain identity', () => {
  assert.deepEqual(
    index.lineage('Child').map((definition) => definition.name),
    ['Child', 'Base'],
  );
  assert.equal(index.resolve('Child', 'inherited')?.interface, 'Base');
  assert.equal(index.resolve('Child', 'mixed')?.member.owner, 'Extra');
  assert.equal(index.resolve('Child', 'mixed')?.interface, 'Child');
  const overloaded = fixtureProjection
    .find((definition) => definition.name === 'Child')!
    .members.filter((member) => member.name === 'overloaded');
  assert.equal(overloaded.length, 1);
  assert.equal(index.resolve('Child', 'staticMethod'), undefined);
  assert.equal(index.resolve('Child', 'staticMethod', true)?.member.static, true);
  assert.equal(index.resolve('Child', 'FLAG')?.member.readonly, true);
  assert.equal(index.resolve('Child', 'FLAG', true)?.member.readonly, true);
  assert.equal(index.resolve('Constants', 'FLAG'), undefined);
  assert.equal(index.resolve('Constants', 'FLAG', true)?.member.kind, 'constant');
});

test('anonymous named/indexed operations never become empty-name properties', () => {
  assert.equal(index.resolve('Named', ''), undefined);
  assert.equal(index.resolve('Named', 'arbitrary'), undefined);
  assert.equal(index.resolveSpecial('Named', 'getter', 'named')?.member.name, null);
  assert.equal(
    index.resolveSpecial('Named', 'setter', 'named')?.member.firstArgumentType,
    'DOMString',
  );
  assert.equal(
    index.resolveSpecial('Named', 'deleter', 'named')?.member.propertyKind,
    'named',
  );
  assert.equal(index.resolveSpecial('Indexed', 'getter', 'indexed')?.member.name, 'item');
  assert.equal(index.resolve('Indexed', 'item')?.member.special, 'getter');
  assert.equal(index.resolveSpecial('Indexed', 'setter', 'indexed')?.member.name, null);
  assert.equal(index.resolveSpecial('Unclassified', 'getter', 'named'), undefined);
  const unclassified = index.lineage('Unclassified')[0].members[0];
  assert.equal(unclassified.propertyKind, 'unclassified');
  assert.equal(unclassified.firstArgumentType, 'USVString');
});

test('stringifier attributes preserve the source member and add an implicit toString identity', () => {
  const child = fixture.find((definition) => definition.name === 'Child')!;
  const attribute = child.members.find((member) => member.name === 'href');
  assert(attribute?.kind === 'attribute' && attribute.stringifier);
  const stringifier = index.resolve('Child', 'toString')!;
  assert.equal(stringifier.member.special, 'stringifier');
  assert.equal(stringifier.member.sourceAttribute, 'href');
  assert.equal(stringifier.member.owner, 'Child');
  const location = new NativeMemberIndex();
  assert.equal(location.resolve('Location', 'assign')?.member.unforgeable, true);
  assert.equal(location.resolve('Location', 'toString')?.member.unforgeable, true);
  const native = new NativeMemberIndex();
  assert.equal(
    native.resolve('HTMLAnchorElement', 'toString')?.member.owner,
    'HTMLHyperlinkElementUtils',
  );
  assert.equal(
    native.resolve('HTMLAnchorElement', 'toString')?.member.sourceAttribute,
    'href',
  );
});

test('implicit collection methods preserve readonly rules and actual symbol identity', () => {
  for (const key of ['entries', 'keys', 'values', 'forEach'])
    assert.equal(index.resolve('Values', key)?.member.collection, 'iterable');
  assert.equal(index.resolve('Values', Symbol.iterator)?.member.symbol, 'iterator');
  assert.equal(index.resolve('Values', '@@iterator'), undefined);
  assert.equal(index.resolve('Values', Symbol('iterator')), undefined);
  assert.equal(
    index.resolve('AsyncValues', 'values')?.member.collection,
    'async-iterable',
  );
  assert.equal(index.resolve('AsyncValues', 'entries'), undefined);
  assert.equal(index.resolve('AsyncValues', 'keys'), undefined);
  assert.equal(index.resolve('AsyncValues', 'forEach'), undefined);
  assert.equal(index.resolve('AsyncValues', Symbol.iterator), undefined);
  assert.equal(
    index.resolve('AsyncValues', Symbol.asyncIterator)?.member.symbol,
    'asyncIterator',
  );
  assert(index.resolve('AsyncPairs', 'entries'));
  assert(index.resolve('AsyncPairs', 'keys'));
  for (const key of [
    'get',
    'set',
    'has',
    'delete',
    'clear',
    'entries',
    'keys',
    'values',
    'forEach',
  ])
    assert.equal(index.resolve('MutableMap', key)?.member.collection, 'maplike');
  assert.equal(index.resolve('MutableMap', 'size')?.member.readonly, true);
  for (const key of ['add', 'delete', 'clear'])
    assert.equal(index.resolve('ReadonlySet', key), undefined);
});

test('ambiguous mixin declarations refuse lookup rather than choosing their input order', () => {
  const definitions = compileInterfaceDefinitions([
    {
      name: 'ambiguous.idl',
      text: `
    interface mixin First { undefined conflict(); };
    interface mixin Second { undefined conflict(); };
    [Exposed=Window] interface Parent {};
    Parent includes First;
    Parent includes Second;
    [Exposed=Window] interface Derived : Parent { undefined conflict(); };
  `,
    },
  ]);
  const ambiguous = new NativeMemberIndex(nativeMemberProjection(definitions));
  assert.throws(
    () => ambiguous.resolve('Parent', 'conflict'),
    AmbiguousNativeMemberError,
  );
  assert.equal(ambiguous.resolve('Derived', 'conflict')?.member.owner, 'Derived');
  assert.equal(ambiguous.resolve('Missing', 'conflict'), undefined);
  assert.equal(ambiguous.resolve('Parent', 'missing'), undefined);
  const cyclic: NativeInterfaceMembers[] = [
    { name: 'A', kind: 'interface', parent: 'B', members: [] },
    { name: 'B', kind: 'interface', parent: 'A', members: [] },
  ];
  assert.throws(() => new NativeMemberIndex(cyclic), /Cyclic native interface/);
  assert.throws(
    () =>
      new NativeMemberIndex([
        { name: 'A', kind: 'interface', parent: 'Missing', members: [] },
      ]),
    /Missing native interface parent/,
  );
});

test('native member presence cannot create an effect permission', () => {
  const native = new NativeMemberIndex();
  assert(native.resolve('WebSocket', 'send'));
  const proto = {
    send() {
      throw new Error('must not execute');
    },
  };
  const value = Object.create(proto);
  const policy = new NativePolicy();
  policy.registerPrototype(proto, { name: 'WebSocket', members: [] });
  policy.admitObject(value);
  assert.throws(() => policy.read(value, 'send'), NativePolicyError);
});

test('global provisioning projection does not import the new identity catalogue', async () => {
  const bundle = await build({
    stdin: {
      contents:
        'import {runtimeInterfaces} from "./src/guest/runtime-interfaces.ts"; console.log(runtimeInterfaces.length);',
      resolveDir: process.cwd(),
      sourcefile: 'runtime-projection-independence.ts',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    metafile: true,
  });
  assert(
    !Object.keys(bundle.metafile.inputs).some((input) =>
      /native-members|generated-interfaces/.test(input),
    ),
  );
});
