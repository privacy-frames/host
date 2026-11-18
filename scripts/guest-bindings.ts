import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'webidl2';
import type {
  Argument,
  ConstructorMemberType,
  ExtendedAttribute,
  IDLInterfaceMemberType,
  IDLRootType,
  IDLTypeDescription,
  ValueDescription,
} from 'webidl2';
import type {
  BrowserBindingManifest,
  BrowserInterfaceDefinition,
  InterfaceArgument,
  InterfaceMember,
} from '../src/guest/interface-definitions.ts';

const require = createRequire(import.meta.url);

interface SourceDefinition {
  source: string;
  definition: IDLRootType;
}

interface DefinitionParts {
  primary: SourceDefinition;
  partials: SourceDefinition[];
  mixins: string[];
}

// webidl2 24.5 emits this distinct declaration; @types/webidl2 still models the
// older iterable.async shape. Keep the parser's actual variant explicit here.
interface AsyncIterableMember {
  type: 'async_iterable';
  extAttrs: ExtendedAttribute[];
  idlType: IDLTypeDescription[];
  arguments: Argument[];
}

function attributeValues(
  attributes: readonly ExtendedAttribute[],
  name: string,
): string[] {
  const attribute = attributes.find((item) => item.name === name);
  const rhs = attribute?.rhs;
  if (!rhs) return [];
  // The parser supports Exposed=*; older declaration packages omit that RHS kind.
  if (String(rhs.type) === '*') return ['*'];
  return typeof rhs.value === 'string'
    ? [rhs.value]
    : rhs.value.map((value) => value.value);
}

function typeName(type: IDLTypeDescription | null): string {
  if (!type) return 'undefined';
  const value =
    typeof type.idlType === 'string'
      ? type.idlType
      : type.union
        ? '(' + type.idlType.map(typeName).join(' or ') + ')'
        : type.generic + '<' + type.idlType.map(typeName).join(', ') + '>';
  return value + (type.nullable ? '?' : '');
}

const argumentsOf = (args: readonly Argument[]): InterfaceArgument[] =>
  args.map((argument) => ({
    name: argument.name,
    type: typeName(argument.idlType),
    optional: argument.optional,
    variadic: argument.variadic,
  }));

const requiredArguments = (args: readonly Argument[]) =>
  args.filter((argument) => !argument.optional && !argument.variadic).length;

function constantLiteral(value: ValueDescription): string {
  switch (value.type) {
    case 'number':
      return value.value;
    case 'string':
      return JSON.stringify(value.value);
    case 'boolean':
      return String(value.value);
    case 'null':
      return 'null';
    case 'Infinity':
      return value.negative ? '-Infinity' : 'Infinity';
    case 'NaN':
      return 'NaN';
    default:
      throw new Error('Nonconstant Web IDL value');
  }
}

function interfaceMember(
  owner: string,
  member: IDLInterfaceMemberType | AsyncIterableMember,
  namespace: boolean,
): InterfaceMember | null {
  const attributes = member.extAttrs.map((attribute) => attribute.name);
  const base = {
    owner,
    exposed: attributeValues(member.extAttrs, 'Exposed'),
    attributes,
    static: namespace || ('special' in member && member.special === 'static'),
  };

  switch (member.type) {
    case 'attribute':
      return {
        ...base,
        kind: 'attribute',
        name: member.name,
        type: typeName(member.idlType),
        readonly: member.readonly,
        unforgeable: attributes.includes('LegacyUnforgeable'),
        sameObject: attributes.includes('SameObject'),
      };
    case 'operation':
      return {
        ...base,
        kind: 'operation',
        name: member.name || (member.special === 'stringifier' ? 'toString' : ''),
        type: typeName(member.idlType),
        arguments: argumentsOf(member.arguments),
        requiredArguments: requiredArguments(member.arguments),
        special: member.special === 'static' ? null : member.special || null,
      };
    case 'const':
      return {
        ...base,
        kind: 'constant',
        name: member.name,
        type: typeName(member.idlType),
        value: constantLiteral(member.value),
      };
    case 'iterable':
    case 'maplike':
    case 'setlike':
      return {
        ...base,
        kind: member.type,
        name: member.async ? '@@asyncIterator' : '@@iterator',
        types: member.idlType.map(typeName),
        readonly: member.readonly,
        async: member.async,
      };
    case 'async_iterable':
      return {
        ...base,
        kind: 'iterable',
        name: '@@asyncIterator',
        types: member.idlType.map(typeName),
        readonly: false,
        async: true,
      };
    case 'constructor':
      return null;
  }
}

/** Compile declaration shape, retaining overloads and flattening partials/mixins. */
export function compileInterfaceDefinitions(
  sources: readonly { name: string; text: string }[],
): BrowserInterfaceDefinition[] {
  const entries = sources.flatMap((source) =>
    parse(source.text, { sourceName: source.name }).map((definition) => ({
      source: source.name,
      definition,
    })),
  );
  const parts = new Map<string, DefinitionParts>();
  const mixins = new Map<string, SourceDefinition[]>();

  for (const entry of entries) {
    const { definition } = entry;
    if (definition.type === 'interface mixin') {
      const previous = mixins.get(definition.name) || [];
      previous.push(entry);
      mixins.set(definition.name, previous);
    } else if (
      definition.type === 'interface' ||
      definition.type === 'namespace' ||
      definition.type === 'callback interface'
    ) {
      const previous = parts.get(definition.name);
      if (previous) {
        if (definition.partial) previous.partials.push(entry);
        else if (
          'partial' in previous.primary.definition &&
          previous.primary.definition.partial
        ) {
          previous.partials.push(previous.primary);
          previous.primary = entry;
        } else throw new Error('Duplicate Web IDL interface: ' + definition.name);
      } else parts.set(definition.name, { primary: entry, partials: [], mixins: [] });
    }
  }

  for (const { definition } of entries) {
    if (definition.type !== 'includes') continue;
    const target = parts.get(definition.target);
    if (!target || !mixins.has(definition.includes))
      throw new Error(
        'Unresolved Web IDL include: ' +
          definition.target +
          ' includes ' +
          definition.includes,
      );
    target.mixins.push(definition.includes);
  }

  const definitions = [...parts]
    .map(([name, part]): BrowserInterfaceDefinition => {
      const primary = part.primary.definition;
      if (
        primary.type !== 'interface' &&
        primary.type !== 'namespace' &&
        primary.type !== 'callback interface'
      )
        throw new Error('Invalid interface declaration');
      if (primary.partial) throw new Error('Missing primary Web IDL interface: ' + name);
      const merged = [
        part.primary,
        ...part.partials,
        ...part.mixins.flatMap((name) => mixins.get(name) || []),
      ];
      const members = merged.flatMap(({ definition }) => {
        if (!('members' in definition)) return [];
        if (
          definition.type !== 'interface' &&
          definition.type !== 'namespace' &&
          definition.type !== 'callback interface' &&
          definition.type !== 'interface mixin'
        )
          return [];
        return definition.members
          .map((member) =>
            interfaceMember(definition.name, member, primary.type === 'namespace'),
          )
          .filter((member): member is InterfaceMember => member !== null);
      });
      const constructors =
        primary.type === 'interface'
          ? primary.members.filter(
              (member): member is ConstructorMemberType => member.type === 'constructor',
            )
          : [];
      const attributes = primary.extAttrs.map((attribute) => attribute.name);
      return {
        name,
        kind: primary.type === 'callback interface' ? 'callback' : primary.type,
        parent: primary.inheritance,
        exposed: attributeValues(primary.extAttrs, 'Exposed'),
        global: attributeValues(primary.extAttrs, 'Global'),
        constructorArguments: constructors.length
          ? Math.min(...constructors.map((member) => requiredArguments(member.arguments)))
          : null,
        legacyAliases: [
          ...attributeValues(primary.extAttrs, 'LegacyWindowAlias'),
          ...attributeValues(primary.extAttrs, 'LegacyFactoryFunction'),
        ],
        hasInterfaceObject:
          !attributes.includes('LegacyNoInterfaceObject') &&
          primary.type !== 'callback interface',
        attributes,
        members,
        sources: [...new Set(merged.map((entry) => entry.source))].sort(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));

  const byName = new Map(definitions.map((definition) => [definition.name, definition]));
  for (const definition of definitions) {
    const lineage = new Set<string>();
    let current: BrowserInterfaceDefinition | undefined = definition;
    while (current) {
      if (lineage.has(current.name))
        throw new Error('Cyclic Web IDL inheritance: ' + current.name);
      lineage.add(current.name);
      if (current.parent && !byName.has(current.parent))
        throw new Error('Missing Web IDL parent: ' + current.parent);
      current = current.parent ? byName.get(current.parent) : undefined;
    }
  }
  return definitions;
}

/** Generate the checked-in standard interface table before bundling the runtime. */
export async function generateGuestBindings(
  root: string,
): Promise<BrowserBindingManifest> {
  const directory = dirname(require.resolve('@webref/idl'));
  const filenames = (await readdir(directory))
    .filter((name) => name.endsWith('.idl'))
    .sort();
  const sources = await Promise.all(
    filenames.map(async (name) => ({
      name,
      text: await readFile(resolve(directory, name), 'utf8'),
    })),
  );
  const hash = createHash('sha256');
  for (const source of sources)
    hash
      .update(source.name + '\0')
      .update(source.text)
      .update('\0');
  const webrefPackage: { version: string } = JSON.parse(
    await readFile(resolve(directory, 'package.json'), 'utf8'),
  );
  const parserPackage: { version: string } = JSON.parse(
    await readFile(
      resolve(dirname(fileURLToPath(import.meta.resolve('webidl2'))), 'package.json'),
      'utf8',
    ),
  );
  const manifest: BrowserBindingManifest = {
    webrefVersion: webrefPackage.version,
    parserVersion: parserPackage.version,
    sourceHash: hash.digest('hex'),
    interfaces: compileInterfaceDefinitions(sources),
  };
  const source =
    '// Generated by scripts/guest-bindings.ts from the pinned @webref/idl corpus.\n' +
    '// Interface shape is not native-effect authorization.\n' +
    "import type { BrowserBindingManifest } from './interface-definitions.ts';\n\n" +
    '// prettier-ignore\nexport const browserBindings: BrowserBindingManifest = ' +
    JSON.stringify(manifest, null, 2) +
    ';\n';
  const target = resolve(root, 'src/guest/generated-interfaces.ts');
  const previous = await readFile(target, 'utf8').catch(() => null);
  if (previous !== source) await writeFile(target, source);
  return manifest;
}
