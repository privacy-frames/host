import type { Installation, PreparedInstallation } from '../shared/types.ts';

export interface StoredInstallation extends Installation {
  generation: string;
}

// This schema has no migration path. Metadata queries never load resource bodies.
const DATABASE = 'privacy-frames-resources';
const METADATA = 'installations';
const BODIES = 'resources';

function resourceKeys(id: string): IDBKeyRange {
  // Array keys sort after every string path, including strings prefixed by U+FFFF.
  return IDBKeyRange.bound([id, ''], [id, []], false, true);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(METADATA, { keyPath: 'id' });
      request.result.createObjectStore(BODIES);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function read<T>(store: string, key?: IDBValidKey): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(store, 'readonly');
      const request =
        key === undefined
          ? transaction.objectStore(store).getAll()
          : transaction.objectStore(store).get(key);
      let result: T;
      request.onsuccess = () => {
        result = request.result;
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export const getApp = (id: string) => read<StoredInstallation | undefined>(METADATA, id);
export const listApps = () => read<StoredInstallation[]>(METADATA);
export async function getResource(
  id: string,
  path: string,
  expectedGeneration: string,
): Promise<ArrayBuffer> {
  if (typeof expectedGeneration !== 'string' || !expectedGeneration)
    throw new Error('Installation generation missing; reinstall this application');
  const database = await openDatabase();
  try {
    return await new Promise<ArrayBuffer>((resolve, reject) => {
      const transaction = database.transaction([METADATA, BODIES], 'readonly');
      const metadata = transaction.objectStore(METADATA).get(id);
      const resource = transaction.objectStore(BODIES).get([id, path]);
      transaction.oncomplete = () => {
        const installation: StoredInstallation | undefined = metadata.result;
        const bytes: ArrayBuffer | undefined = resource.result;
        if (installation?.generation !== expectedGeneration)
          reject(new Error('Installation generation changed'));
        else if (!bytes) reject(new Error('Installed resource missing'));
        else resolve(bytes);
      };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function putApp(app: PreparedInstallation): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([METADATA, BODIES], 'readwrite');
      const resources = transaction.objectStore(BODIES);
      resources.delete(resourceKeys(app.id));
      for (const resource of app.resources)
        resources.put(resource.bytes, [app.id, resource.path]);
      const metadata: StoredInstallation = {
        ...app,
        generation: crypto.randomUUID(),
        resources: app.resources.map(({ bytes: _bytes, ...resource }) => resource),
      };
      transaction.objectStore(METADATA).put(metadata);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function deleteApp(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([METADATA, BODIES], 'readwrite');
      transaction.objectStore(METADATA).delete(id);
      transaction.objectStore(BODIES).delete(resourceKeys(id));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}
