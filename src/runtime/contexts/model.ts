import { internalRecord } from '../../shared/primordials.ts';
import { isApplicationRoute } from '../../shared/application-navigation.ts';

export const CONTEXT_POLICY_VERSION = 3;

export type ContextKind = 'window' | 'dedicated-worker' | 'shared-worker' | 'worklet';
export type ContextState = 'preparing' | 'ready' | 'running' | 'closed';

export interface ContextIdentity {
  policyVersion: number;
  installationGeneration: string;
  id: string;
  application: string;
  parent: string | null;
  kind: ContextKind;
  state: ContextState;
  url: string;
}

export interface WorkerBootstrapMetadata {
  identity: ContextIdentity;
  runtime: string;
  applicationURL: string;
  aliases: [string, string][];
  rootAliases: [string, string][];
}

export interface ContextStorage {
  get(client: string): Promise<ContextIdentity | undefined>;
  bind(client: string, identity: ContextIdentity): Promise<void>;
  lookupByContext(context: string): Promise<string | undefined>;
  close(parent: string, application: string, context: string): Promise<boolean>;
}

// Live phase labels remain valid in the persistent protocol. They do not grant
// readiness; the local guard establishes preparation before application execution.
function sameAuthority(current: ContextIdentity | undefined, expected: ContextIdentity) {
  return (
    !!current &&
    expected.state !== 'closed' &&
    current.id === expected.id &&
    current.application === expected.application &&
    current.installationGeneration === expected.installationGeneration &&
    current.parent === expected.parent &&
    current.kind === expected.kind &&
    current.policyVersion === expected.policyVersion &&
    current.url === expected.url
  );
}

/** Only the browser-facing controller creates identity bindings. */
export class ContextRegistry {
  private readonly storage: ContextStorage;
  private mutations: Promise<void> = Promise.resolve();

  constructor(storage: ContextStorage) {
    this.storage = storage;
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutations.then(operation);
    this.mutations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  bind(client: string, identity: ContextIdentity): Promise<void> {
    return this.mutate(async () => {
      if (
        !client ||
        !identity.id ||
        !identity.application ||
        !identity.url ||
        !identity.installationGeneration ||
        identity.policyVersion !== CONTEXT_POLICY_VERSION
      )
        throw new Error('Incomplete browser context identity');
      await this.storage.bind(
        client,
        internalRecord({ ...identity, state: 'preparing' }),
      );
    });
  }

  async resolve(client: {
    id: string;
    url: string;
  }): Promise<ContextIdentity | undefined> {
    const identity = await this.storage.get(client.id);
    if (identity?.policyVersion !== CONTEXT_POLICY_VERSION || identity.state === 'closed')
      return;
    let address = client.url;
    if (identity.kind === 'window') {
      if (identity.parent === null)
        return isApplicationRoute(address, identity.url) ? identity : undefined;
      try {
        const url = new URL(address);
        url.hash = '';
        address = url.href;
      } catch {
        return;
      }
    }
    return identity.url === address ? identity : undefined;
  }

  async resolveWorker(client: string): Promise<ContextIdentity | undefined> {
    const identity = await this.storage.get(client);
    return identity?.policyVersion === CONTEXT_POLICY_VERSION &&
      identity.state !== 'closed' &&
      (identity.kind === 'dedicated-worker' || identity.kind === 'shared-worker')
      ? identity
      : undefined;
  }

  /** A bearer grants immutable graph reads only; it never supplies browser identity. */
  async resourceCapability(
    context: string,
    caller: string,
  ): Promise<{ client: string; identity: ContextIdentity } | undefined> {
    const client = await this.storage.lookupByContext(context);
    if (!client || (caller && caller !== client)) return undefined;
    const identity = await this.resolveWorker(client);
    return identity?.id === context ? internalRecord({ client, identity }) : undefined;
  }

  /** Revalidate after asynchronous work, ordered with binding and closure. */
  isCurrent(client: { id: string; url: string }, expected: ContextIdentity) {
    return this.mutate(
      async () =>
        sameAuthority(await this.resolve(client), expected) &&
        sameAuthority(await this.resolve(client), expected),
    );
  }

  isCapabilityCurrent(
    context: string,
    caller: string,
    expected: { client: string; identity: ContextIdentity },
  ) {
    return this.mutate(async () => {
      const current = await this.resourceCapability(context, caller);
      if (
        current?.client !== expected.client ||
        !sameAuthority(current?.identity, expected.identity)
      )
        return false;
      const latest = await this.resourceCapability(context, caller);
      return (
        latest?.client === expected.client &&
        sameAuthority(latest?.identity, expected.identity)
      );
    });
  }

  closeChild(parent: string, application: string, context: string): Promise<boolean> {
    return this.mutate(async () => {
      if (!parent || !application || !context) return false;
      return this.storage.close(parent, application, context);
    });
  }
}
