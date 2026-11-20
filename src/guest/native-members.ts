import { nativeMemberManifest } from './generated-native-members.ts';
import type {
  NativeInterfaceMembers,
  NativeMemberIdentity,
  NativeMemberResolution,
} from './native-member-definitions.ts';

export { nativeMemberManifest };
export type {
  NativeInterfaceMembers,
  NativeMemberIdentity,
  NativeMemberManifest,
  NativeMemberResolution,
} from './native-member-definitions.ts';

export class AmbiguousNativeMemberError extends Error {
  constructor(
    readonly interfaceName: string,
    readonly memberName: string,
    readonly candidates: readonly NativeMemberIdentity[],
  ) {
    super(
      `Ambiguous native member ${interfaceName}.${memberName}: ${candidates.map((member) => member.owner).join(', ')}`,
    );
    this.name = 'AmbiguousNativeMemberError';
  }
}

/** Resolves declaration identity. A successful lookup grants no native authority. */
export class NativeMemberIndex {
  private readonly definitions: ReadonlyMap<string, NativeInterfaceMembers>;
  private readonly declarations = new Map<
    string,
    Map<string, readonly NativeMemberIdentity[]>
  >();

  constructor(
    definitions: readonly NativeInterfaceMembers[] = nativeMemberManifest.interfaces,
  ) {
    const byName = new Map<string, NativeInterfaceMembers>();
    for (const definition of definitions) {
      if (byName.has(definition.name))
        throw new Error('Duplicate native interface: ' + definition.name);
      byName.set(definition.name, definition);
      const members = new Map<string, NativeMemberIdentity[]>();
      for (const member of definition.members) {
        const key = this.identityKey(member);
        if (!key) continue;
        const entries = members.get(key) ?? [];
        entries.push(member);
        members.set(key, entries);
      }
      this.declarations.set(definition.name, members);
    }
    this.definitions = byName;
    for (const definition of definitions) {
      const seen = new Set<string>();
      let current: NativeInterfaceMembers | undefined = definition;
      while (current) {
        if (seen.has(current.name))
          throw new Error('Cyclic native interface metadata: ' + current.name);
        seen.add(current.name);
        if (current.parent && !byName.has(current.parent))
          throw new Error('Missing native interface parent: ' + current.parent);
        current = current.parent ? byName.get(current.parent) : undefined;
      }
    }
  }

  /** Most-derived declaration first; included mixin ownership stays on the member. */
  lineage(name: string): readonly NativeInterfaceMembers[] {
    const lineage: NativeInterfaceMembers[] = [];
    let definition = this.definitions.get(name);
    while (definition) {
      lineage.push(definition);
      definition = definition.parent
        ? this.definitions.get(definition.parent)
        : undefined;
    }
    return lineage;
  }

  resolve(
    name: string,
    key: PropertyKey,
    staticMember = false,
  ): NativeMemberResolution | undefined {
    let encoded: string;
    if (typeof key === 'symbol') {
      if (key === Symbol.iterator) encoded = 'symbol:iterator';
      else if (key === Symbol.asyncIterator) encoded = 'symbol:asyncIterator';
      else return;
    } else {
      encoded = 'name:' + String(key);
    }
    return this.lookup(
      name,
      (staticMember ? 'static:' : 'instance:') + encoded,
      String(key),
    );
  }

  /** Anonymous named/indexed operations are not ordinary JS property names. */
  resolveSpecial(
    name: string,
    special: 'getter' | 'setter' | 'deleter',
    propertyKind: 'indexed' | 'named',
  ): NativeMemberResolution | undefined {
    return this.lookup(
      name,
      `special:${special}:${propertyKind}`,
      `${propertyKind} ${special}`,
    );
  }

  private identityKey(member: NativeMemberIdentity): string | undefined {
    if (member.name === null) return;
    const key = member.symbol ? 'symbol:' + member.symbol : 'name:' + member.name;
    return (member.static ? 'static:' : 'instance:') + key;
  }

  private lookup(
    name: string,
    key: string,
    label: string,
  ): NativeMemberResolution | undefined {
    for (const definition of this.lineage(name)) {
      const members = key.startsWith('special:')
        ? definition.members.filter(
            (member) =>
              !member.static &&
              member.special &&
              `special:${member.special}:${member.propertyKind}` === key,
          )
        : this.declarations.get(definition.name)?.get(key);
      if (!members?.length) continue;
      if (members.length !== 1)
        throw new AmbiguousNativeMemberError(definition.name, label, members);
      return { interface: definition.name, member: members[0] };
    }
  }
}
