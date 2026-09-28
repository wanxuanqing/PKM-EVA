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
      const request = indexedDB.open('pkm-eva-calculations', 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('distributions', { keyPath: 'key' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  }));
}
export async function cached<T>(key: string): Promise<T | undefined> {
  const database = await db();
  if (!database) return;
  return new Promise((resolve) => {
    try {
      const req = database.transaction('distributions').objectStore('distributions').get(key);
      req.onsuccess = () => resolve(req.result?.value);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}
export async function cache(key: string, value: unknown): Promise<void> {
  const database = await db();
  if (!database) return;
  try {
    const store = database.transaction('distributions', 'readwrite').objectStore('distributions');
    store.put({ key, value, date: Date.now() });
    const request = store.getAll();
    request.onsuccess = () => {
      const old = request.result.sort((a, b) => b.date - a.date).slice(32);
      for (const entry of old) store.delete(entry.key);
    };
  } catch {
    /* Calculations still work when device storage is unavailable. */
  }
}
