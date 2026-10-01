/** Còpia local dels PDFs perquè en recarregar la pàgina (F5) no calgui tornar-los a pujar. */
import { idbDelete, idbGet, idbPut, STORES } from './db';

interface StoredPdf {
    fileName: string;
    file: File;
    timestamp: number;
}

/** Clau amb què es desa el solucionari d'una sessió (el mateix format que l'app original). */
export const solutionCacheKey = (sessionFileName: string, solutionFileName: string) =>
    `solution_${sessionFileName}_${solutionFileName}`;

export async function storePdf(key: string, file: File): Promise<void> {
    await idbPut(STORES.pdfs, { fileName: key, file, timestamp: Date.now() } satisfies StoredPdf);
}

export async function getPdf(key: string): Promise<File | null> {
    try {
        const entry = await idbGet<StoredPdf>(STORES.pdfs, key);
        return entry?.file ?? null;
    } catch (err) {
        console.error('[pdfCache] No s\'ha pogut llegir el PDF', key, err);
        return null;
    }
}

export async function deletePdf(key: string): Promise<void> {
    try {
        await idbDelete(STORES.pdfs, key);
    } catch (err) {
        console.error('[pdfCache] No s\'ha pogut esborrar el PDF', key, err);
    }
}
