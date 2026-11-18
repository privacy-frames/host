import { browserBindings } from './generated-interfaces.ts';
import type {
  BrowserInterfaceDefinition,
  InterfaceMember,
} from './interface-definitions.ts';

export { browserBindings };
export type {
  BrowserBindingManifest,
  BrowserInterfaceDefinition,
  InterfaceArgument,
  InterfaceAttribute,
  InterfaceCollection,
  InterfaceConstant,
  InterfaceMember,
  InterfaceOperation,
} from './interface-definitions.ts';

const definitions = new Map(
  browserBindings.interfaces.map((definition) => [definition.name, definition]),
);

export const interfaceDefinition = (name: string) => definitions.get(name);

/** Most-derived first, so an override wins over an inherited declaration. */
export function interfaceLineage(name: string): readonly BrowserInterfaceDefinition[] {
  const lineage: BrowserInterfaceDefinition[] = [];
  const visited = new Set<string>();
  let current = definitions.get(name);

  while (current) {
    if (visited.has(current.name)) throw new Error('Cyclic browser interface metadata');
    visited.add(current.name);
    lineage.push(current);
    current = current.parent ? definitions.get(current.parent) : undefined;
  }
  return lineage;
}

export function exposedIn(
  exposure: readonly string[],
  globalNames: readonly string[],
): boolean {
  return exposure.includes('*') || globalNames.some((name) => exposure.includes(name));
}

export function exposedInterfaces(
  globalNames: readonly string[],
): readonly BrowserInterfaceDefinition[] {
  return browserBindings.interfaces.filter(
    (definition) =>
      definition.hasInterfaceObject && exposedIn(definition.exposed, globalNames),
  );
}

/** Returns every overload belonging to the first declaration in the lineage. */
export function interfaceMembers(
  name: string,
  key: string,
  staticMember = false,
): readonly InterfaceMember[] {
  for (const definition of interfaceLineage(name)) {
    const matches = definition.members.filter(
      (member) =>
        member.name === key &&
        (member.kind === 'constant' || member.static === staticMember),
    );
    if (matches.length) return matches;
  }
  return [];
}

export const interfaceMember = (name: string, key: string, staticMember = false) =>
  interfaceMembers(name, key, staticMember)[0];

/** Collection declarations create these standard members without listing them. */
export function collectionMember(
  name: string,
  key: PropertyKey,
): InterfaceMember | undefined {
  for (const definition of interfaceLineage(name)) {
    for (const member of definition.members) {
      if (member.kind === 'iterable') {
        if (member.async && key === Symbol.asyncIterator) return member;
        if (
          !member.async &&
          (key === Symbol.iterator ||
            ['entries', 'keys', 'values', 'forEach'].includes(String(key)))
        )
          return member;
      }
      if (member.kind === 'maplike' || member.kind === 'setlike') {
        const keys = ['size', 'entries', 'keys', 'values', 'forEach', 'has'];
        if (member.kind === 'maplike') keys.push('get');
        if (!member.readonly)
          keys.push('clear', 'delete', member.kind === 'maplike' ? 'set' : 'add');
        if (key === Symbol.iterator || keys.includes(String(key))) return member;
      }
    }
  }
  return undefined;
}

export function globalInterfaceDefinitions(
  globalNames: readonly string[],
): readonly BrowserInterfaceDefinition[] {
  return browserBindings.interfaces.filter((definition) =>
    definition.global.some((name) => globalNames.includes(name)),
  );
}
