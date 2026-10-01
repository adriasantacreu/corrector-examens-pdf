/**
 * Accés a IndexedDB. La base de dades és la mateixa que feia servir l'app original
 * (PDFCorrectorDB), així els PDFs ja desats es conserven; la versió 2 hi afegeix les sessions.
 */
const DB_NAME = 'PDFCorrectorDB';
const DB_VERSION = 2;
export const STORES = { pdfs: 'pdfs', sessions: 'sessions' } as const;
type StoreName = typeof STORES[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORES.pdfs)) db.createObjectStore(STORES.pdfs, { keyPath: 'fileName' });
            if (!db.objectStoreNames.contains(STORES.sessions)) db.createObjectStore(STORES.sessions, { keyPath: 'fileName' });
        };
        request.onsuccess = () => {
            const db = request.result;
            // Si una altra pestanya actualitza la BD, tanquem aquesta connexió perquè no la bloquegi
            db.onversionchange = () => { db.close(); dbPromise = null; };
            resolve(db);
        };
        request.onerror = () => { dbPromise = null; reject(request.error); };
        request.onblocked = () => console.warn('[db] Actualització bloquejada per una altra pestanya oberta');
    });
    return dbPromise;
}

async function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await openDB();
    return new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(request.result as T);
        tx.onerror = () => reject(tx.error ?? request.error);
        tx.onabort = () => reject(tx.error ?? new Error('Transacció avortada'));
    });
}

export const idbPut = (store: StoreName, value: unknown) => run<IDBValidKey>(store, 'readwrite', s => s.put(value));
export const idbGet = <T>(store: StoreName, key: string) => run<T | undefined>(store, 'readonly', s => s.get(key));
export const idbDelete = (store: StoreName, key: string) => run<undefined>(store, 'readwrite', s => s.delete(key));
export const idbGetAll = <T>(store: StoreName) => run<T[]>(store, 'readonly', s => s.getAll());
