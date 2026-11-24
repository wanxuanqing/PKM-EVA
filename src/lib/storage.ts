export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`pkm-eva:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function saveLocal(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(`pkm-eva:${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
let dbPromise: Promise<IDBDatabase | null> | undefined;
function db(): Promise<IDBDatabase | null> {
  return (dbPromise ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open('pkm-eva-calculations', 2);
      request.onupgradeneeded = () => {
        const database = request.result;
        const tx = request.transaction!;
        for (const name of ['distributions', 'topIdeals']) {
          const store = database.objectStoreNames.contains(name)
            ? tx.objectStore(name)
            : database.createObjectStore(name, { keyPath: 'key' });
          if (!store.indexNames.contains('byDate')) store.createIndex('byDate', 'date');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  }));
}
async function readStore<T>(storeName: string, key: string): Promise<T | undefined> {
  const database = await db();
  if (!database) return;
  return new Promise((resolve) => {
    try {
      const req = database.transaction(storeName).objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result?.value);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}
async function writeStore(
  storeName: string,
  key: string,
  value: unknown,
  maxEntries: number,
): Promise<void> {
  const database = await db();
  if (!database) return;
  try {
    const store = database.transaction(storeName, 'readwrite').objectStore(storeName);
    store.put({ key, value, date: Date.now() });
    const countReq = store.count();
    countReq.onsuccess = () => {
      let excess = countReq.result - maxEntries;
      if (excess <= 0) return;
      // Evict oldest keys via index key cursor without deserializing stored values.
      const cursorReq = store.index('byDate').openKeyCursor(null, 'next');
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || excess <= 0) return;
        store.delete(cursor.primaryKey);
        excess--;
        cursor.continue();
      };
    };
  } catch {
    /* Calculations still work when device storage is unavailable. */
  }
}
export function cached<T>(key: string): Promise<T | undefined> {
  return readStore<T>('distributions', key);
}
export function cache(key: string, value: unknown): Promise<void> {
  return writeStore('distributions', key, value, 32);
}
export function cachedTopIdeals<T>(key: string): Promise<T | undefined> {
  return readStore<T>('topIdeals', key);
}
export function cacheTopIdeals(key: string, value: unknown): Promise<void> {
  return writeStore('topIdeals', key, value, 6);
}
