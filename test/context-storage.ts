import type { ContextIdentity, ContextStorage } from '../src/runtime/contexts/model.ts';

/** Atomic in-memory contract fixture; native persistence is tested separately. */
export function memoryContextStorage(
  records = new Map<string, ContextIdentity>(),
  closures = new Set<string>(),
  changed: () => void = () => {},
): ContextStorage {
  const closure = (parent: string, application: string, context: string) =>
    JSON.stringify([parent, application, context]);
  const lookup = (context: string) =>
    [...records].find(([, identity]) => identity.id === context);
  return {
    async get(client) {
      return records.get(client);
    },
    async lookupByContext(context) {
      return lookup(context)?.[0];
    },
    async bind(client, identity) {
      if (records.has(client)) throw new Error('Browser client already bound');
      if (lookup(identity.id)) throw new Error('Context identifier already bound');
      if (
        identity.parent &&
        closures.has(closure(identity.parent, identity.application, identity.id))
      )
        throw new Error('Browser context closed before startup');
      records.set(client, { ...identity });
      changed();
    },
    async close(parent, application, context) {
      const existing = lookup(context);
      if (existing) {
        const [client, identity] = existing;
        if (identity.parent !== parent || identity.application !== application)
          return false;
        records.set(client, { ...identity, state: 'closed' });
      }
      closures.add(closure(parent, application, context));
      changed();
      return true;
    },
  };
}
