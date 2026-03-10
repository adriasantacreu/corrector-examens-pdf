const DB_NAME = 'PDFCorrectorDB';
const STORE_NAME = 'pdfs';

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (event: any) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'fileName' });
            }
        };
        request.onsuccess = (event: any) => resolve(event.target.result);
        request.onerror = (event: any) => reject(event.target.error);
    });
}

export async function storePDFLocal(fileName: string, file: File): Promise<void> {
    console.log('[DB] Storing PDF:', fileName, file.size);
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put({ fileName, file, timestamp: Date.now() });
            request.onsuccess = () => {
                console.log('[DB] PDF stored successfully');
                db.close();
                resolve();
            };
            request.onerror = () => {
                console.error('[DB] Error storing PDF:', request.error);
                db.close();
                reject(request.error);
            };
        });
    } catch (err) {
        console.error('[DB] Failed to open DB for storage:', err);
        throw err;
    }
}

export async function getPDFLocal(fileName: string): Promise<File | null> {
    console.log('[DB] Getting PDF:', fileName);
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(fileName);
            request.onsuccess = () => {
                db.close();
                if (request.result) {
                    console.log('[DB] PDF found in local storage');
                    resolve(request.result.file);
                } else {
                    console.log('[DB] PDF not found in local storage');
                    resolve(null);
                }
            };
            request.onerror = () => {
                db.close();
                console.error('[DB] Error getting PDF:', request.error);
                reject(request.error);
            };
        });
    } catch (err) {
        console.error('[DB] Failed to open DB for retrieval:', err);
        return null;
    }
}
