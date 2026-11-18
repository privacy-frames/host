/** Prefixing preserves application behavior; it is not cross-application isolation. */
export function guestStorage(native: Storage, prefix: string): Storage {
  const names = () =>
    Object.keys(native)
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));
  const storage: Storage = {
    get length() {
      return names().length;
    },
    key(index: number) {
      return names()[Number(index)] ?? null;
    },
    getItem(key: string) {
      return native.getItem(prefix + String(key));
    },
    setItem(key: string, value: string) {
      native.setItem(prefix + String(key), String(value));
    },
    removeItem(key: string) {
      native.removeItem(prefix + String(key));
    },
    clear() {
      for (const key of names()) native.removeItem(prefix + key);
    },
  };
  for (const key of Reflect.ownKeys(storage)) {
    const descriptor = Object.getOwnPropertyDescriptor(storage, key);
    if (descriptor)
      Object.defineProperty(storage, key, { ...descriptor, enumerable: false });
  }
  return new Proxy(storage, {
    get(target, key, receiver) {
      return Reflect.has(target, key) || typeof key !== 'string'
        ? Reflect.get(target, key, receiver)
        : (native.getItem(prefix + key) ?? undefined);
    },
    set(_target, key, value) {
      if (typeof key !== 'string') return false;
      native.setItem(prefix + key, String(value));
      return true;
    },
    deleteProperty(_target, key) {
      if (typeof key === 'string') native.removeItem(prefix + key);
      return true;
    },
    ownKeys(target) {
      return [...new Set([...Reflect.ownKeys(target), ...names()])];
    },
    getOwnPropertyDescriptor(target, key) {
      return (
        Reflect.getOwnPropertyDescriptor(target, key) ||
        (typeof key === 'string' && native.getItem(prefix + key) !== null
          ? {
              value: native.getItem(prefix + key),
              writable: true,
              enumerable: true,
              configurable: true,
            }
          : undefined)
      );
    },
  });
}

export function guestIndexedDB(native: IDBFactory, prefix: string): IDBFactory {
  const factory: IDBFactory = {
    open: (name, version) =>
      version === undefined
        ? native.open(prefix + String(name))
        : native.open(prefix + String(name), version),
    deleteDatabase: (name) => native.deleteDatabase(prefix + String(name)),
    cmp: (first, second) => native.cmp(first, second),
    databases: async () =>
      (await native.databases())
        .filter((database) => database.name?.startsWith(prefix))
        .map((database) => ({ ...database, name: database.name?.slice(prefix.length) })),
  };
  return factory;
}

export function guestCaches(native: CacheStorage, prefix: string): CacheStorage {
  return {
    open: (name) => native.open(prefix + String(name)),
    delete: (name) => native.delete(prefix + String(name)),
    has: (name) => native.has(prefix + String(name)),
    keys: async () =>
      (await native.keys())
        .filter((name) => name.startsWith(prefix))
        .map((name) => name.slice(prefix.length)),
    async match(request, options = {}) {
      const names =
        options.cacheName === undefined
          ? (await native.keys()).filter((name) => name.startsWith(prefix))
          : [prefix + options.cacheName];
      for (const name of names) {
        const match = await (await native.open(name)).match(request, options);
        if (match) return match;
      }
      return undefined;
    },
  };
}
