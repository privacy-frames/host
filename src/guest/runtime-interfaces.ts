import { runtimeInterfaces } from './generated-runtime-interfaces.ts';
import type { RuntimeInterfaceDefinition } from './interface-definitions.ts';

export { runtimeInterfaces };
export type {
  RuntimeInterfaceDefinition,
  RuntimeInterfaceMember,
} from './interface-definitions.ts';

const exposedIn = (exposure: readonly string[], globalNames: readonly string[]) =>
  exposure.includes('*') || globalNames.some((name) => exposure.includes(name));

/** Interface shape is filtered by the host's separate native-effect policy. */
export function exposedInterfaces(
  globalNames: readonly string[],
): readonly RuntimeInterfaceDefinition[] {
  return runtimeInterfaces.filter(
    (definition) =>
      definition.hasInterfaceObject && exposedIn(definition.exposed, globalNames),
  );
}

export function globalInterfaceDefinitions(
  globalNames: readonly string[],
): readonly RuntimeInterfaceDefinition[] {
  return runtimeInterfaces.filter((definition) =>
    definition.global.some((name) => globalNames.includes(name)),
  );
}
