// Persistência local com IndexedDB (sem dependências)
const DB_NAME = 'organizador-viagens';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('trips')) db.createObjectStore('trips', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        let result;
        const r = fn(s);
        if (r) r.onsuccess = () => (result = r.result);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export const getAllTrips = () => tx('trips', 'readonly', (s) => s.getAll()).then((r) => r || []);
export const putTrip = (trip) => tx('trips', 'readwrite', (s) => s.put(trip));
export const deleteTrip = (id) => tx('trips', 'readwrite', (s) => s.delete(id));
export const getMeta = (key) => tx('meta', 'readonly', (s) => s.get(key)).then((r) => r?.value);
export const setMeta = (key, value) => tx('meta', 'readwrite', (s) => s.put({ key, value }));

export function replaceAllTrips(trips) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction('trips', 'readwrite');
        const s = t.objectStore('trips');
        s.clear();
        for (const trip of trips) s.put(trip);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      })
  );
}
