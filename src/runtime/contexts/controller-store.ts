import { internalRecord } from '../../shared/primordials.ts';
import { CONTEXT_POLICY_VERSION } from './model.ts';
import type {
  ContextIdentity,
  ContextKind,
  ContextState,
  ContextStorage,
} from './model.ts';

function kind(value: unknown): value is ContextKind {
  return (
    value === 'window' ||
    value === 'dedicated-worker' ||
    value === 'shared-worker' ||
    value === 'worklet'
  );
}
function state(value: unknown): value is ContextState {
  return (
    value === 'preparing' ||
    value === 'ready' ||
    value === 'running' ||
    value === 'closed'
  );
}
function parse(value: unknown): ContextIdentity {
  if (
    !value ||
    typeof value !== 'object' ||
    !('policyVersion' in value) ||
    value.policyVersion !== CONTEXT_POLICY_VERSION ||
    !('installationGeneration' in value) ||
    typeof value.installationGeneration !== 'string' ||
    !value.installationGeneration ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    !('application' in value) ||
    typeof value.application !== 'string' ||
    !value.application ||
    !('parent' in value) ||
    !(
      value.parent === null ||
      (typeof value.parent === 'string' && value.parent !== '')
    ) ||
    !('kind' in value) ||
    !kind(value.kind) ||
    !('state' in value) ||
    !state(value.state) ||
    !('url' in value) ||
    typeof value.url !== 'string' ||
    !value.url
  )
    throw new Error('Invalid stored context identity');
  return internalRecord({
    policyVersion: value.policyVersion,
    installationGeneration: value.installationGeneration,
    id: value.id,
    application: value.application,
    parent: value.parent,
    kind: value.kind,
    state: value.state,
    url: value.url,
  });
}

interface Binding {
  client: string;
  identity: ContextIdentity;
}

function binding(value: unknown): Binding {
  if (
    !value ||
    typeof value !== 'object' ||
    !('client' in value) ||
    typeof value.client !== 'string' ||
    !value.client ||
    !('identity' in value)
  )
    throw new Error('Invalid context binding');
  return internalRecord({ client: value.client, identity: parse(value.identity) });
}

/** Native transactions enforce uniqueness and closure across controller instances. */
export function controllerContextStorage(base: URL): ContextStorage {
  const databaseName = 'privacy-frames-browser-contexts-v1:' + new URL('./', base).href;
  const factory = indexedDB;
  let connection: Promise<IDBDatabase> | undefined;
  function open(): Promise<IDBDatabase> {
    if (!connection) {
      connection = new Promise((resolve, reject) => {
        const request = factory.open(databaseName, 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          const contexts = database.createObjectStore(
            'contexts',
            internalRecord({ keyPath: 'client' }),
          );
          contexts.createIndex(
            'context',
            'identity.id',
            internalRecord({ unique: true }),
          );
          database.createObjectStore('closures');
        };
        request.onerror = () =>
          reject(request.error || new Error('Context database failed'));
        request.onsuccess = () => {
          const database = request.result;
          database.onversionchange = () => {
            database.close();
            connection = undefined;
          };
          resolve(database);
        };
      });
      connection.catch(() => {
        connection = undefined;
      });
    }
    return connection;
  }
  async function transaction<T>(
    mode: IDBTransactionMode,
    operation: (
      contexts: IDBObjectStore,
      closures: IDBObjectStore,
      read: <R>(request: IDBRequest<R>, accept: (value: unknown) => void) => void,
      finish: (value: T) => void,
      fail: (error: unknown) => void,
    ) => void,
  ): Promise<T> {
    const database = await open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(['contexts', 'closures'], mode);
      let result: T;
      let finished = false;
      let failure: unknown;
      tx.oncomplete = () =>
        finished
          ? resolve(result)
          : reject(new Error('Context transaction produced no result'));
      tx.onabort = () =>
        reject(failure || tx.error || new Error('Context transaction aborted'));
      const fail = (error: unknown) => {
        failure = error;
        tx.abort();
      };
      const read = <R>(request: IDBRequest<R>, accept: (value: unknown) => void) => {
        request.onsuccess = () => {
          try {
            accept(request.result);
          } catch (error) {
            fail(error);
          }
        };
      };
      try {
        operation(
          tx.objectStore('contexts'),
          tx.objectStore('closures'),
          read,
          (value) => {
            result = value;
            finished = true;
          },
          fail,
        );
      } catch (error) {
        fail(error);
      }
    });
  }
  return internalRecord({
    get(client: string) {
      return transaction<ContextIdentity | undefined>(
        'readonly',
        (contexts, _closures, read, finish) => {
          read(contexts.get(client), (value) => {
            if (value === undefined) return finish(undefined);
            const stored = binding(value);
            if (stored.client !== client) throw new Error('Context client key mismatch');
            finish(stored.identity);
          });
        },
      );
    },
    bind(client: string, identity: ContextIdentity) {
      const checked = parse(identity);
      if (!client || checked.state !== 'preparing')
        return Promise.reject(new Error('Invalid initial context binding'));
      return transaction<void>('readwrite', (contexts, closures, read, finish, fail) => {
        const insert = () => {
          const request = contexts.add(internalRecord({ client, identity: checked }));
          request.onerror = () => {
            if (request.error?.name === 'ConstraintError')
              fail(new Error('Browser client or context identifier already bound'));
          };
          read(request, () => finish(undefined));
        };
        if (!checked.parent) return insert();
        read(closures.get([checked.parent, checked.application, checked.id]), (value) => {
          if (value !== undefined)
            return fail(new Error('Browser context closed before startup'));
          insert();
        });
      });
    },
    lookupByContext(context: string) {
      return transaction<string | undefined>(
        'readonly',
        (contexts, _closures, read, finish) => {
          read(contexts.index('context').getKey(context), (value) => {
            if (value !== undefined && (typeof value !== 'string' || !value))
              throw new Error('Invalid context client index');
            finish(value);
          });
        },
      );
    },
    close(parent: string, application: string, context: string) {
      return transaction<boolean>('readwrite', (contexts, closures, read, finish) => {
        read(contexts.index('context').get(context), (value) => {
          if (value === undefined) {
            read(closures.put(true, [parent, application, context]), () => finish(true));
            return;
          }
          const stored = binding(value);
          if (
            stored.identity.id !== context ||
            stored.identity.parent !== parent ||
            stored.identity.application !== application
          )
            return finish(false);
          closures.put(true, [parent, application, context]);
          read(
            contexts.put(
              internalRecord({
                client: stored.client,
                identity: internalRecord({ ...stored.identity, state: 'closed' }),
              }),
            ),
            () => finish(true),
          );
        });
      });
    },
  });
}
