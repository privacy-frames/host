import type { Page } from 'playwright';

export interface BrowserStorageState {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  databases: {
    name: string;
    version: number;
    stores: Record<string, unknown[]>;
  }[];
}

/** Only used with fresh synthetic acceptance-test browser contexts. */
export async function browserStorageState(page: Page): Promise<BrowserStorageState> {
  return page.evaluate(async () => {
    const databases = [];
    for (const entry of await indexedDB.databases()) {
      if (!entry.name) continue;
      const name = entry.name;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const stores: Record<string, unknown[]> = {};
      try {
        for (const name of database.objectStoreNames) {
          stores[name] = await new Promise<unknown[]>((resolve, reject) => {
            const request = database.transaction(name).objectStore(name).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        }
        databases.push({ name: database.name, version: database.version, stores });
      } finally {
        database.close();
      }
    }
    return {
      localStorage: Object.fromEntries(Object.entries(localStorage)),
      sessionStorage: Object.fromEntries(Object.entries(sessionStorage)),
      databases,
    };
  });
}
