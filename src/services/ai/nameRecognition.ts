/**
 * Lectura de noms manuscrits amb IA. Els retalls s'envien en lots de 5 imatges numerades
 * (abans s'enganxaven en un mosaic amb números de 10 px que el model no llegia bé).
 */
import { findBestNameMatch } from '../../domain/students';
import { chatJson, type ContentPart } from './aiClient';
import { shrinkDataUrl } from './images';

const BATCH_SIZE = 5;

export interface NameReading {
    raw: string | null;     // Text llegit per la IA
    matched: string | null; // Nom de la llista oficial que hi correspon
}

async function readBatch(crops: string[], known: string[], signal?: AbortSignal): Promise<(string | null)[]> {
    const listText = known.length
        ? `Llista d'alumnes de la classe (tria sempre d'aquesta llista si hi ha coincidència): ${known.join('; ')}.`
        : 'No hi ha llista d\'alumnes: transcriu el nom tal com està escrit.';
    const content: ContentPart[] = [{
        type: 'text',
        text: `Ets un expert llegint noms escrits a mà en exàmens escanejats. Tens ${crops.length} imatges, en ordre. ` +
            `${listText} Per a cada imatge retorna el nom de l'alumne, o null si no s'hi llegeix cap nom. ` +
            'Respon NOMÉS amb JSON: {"names": ["...", ...]} amb exactament un element per imatge i en el mateix ordre.',
    }];
    for (let i = 0; i < crops.length; i++) {
        content.push({ type: 'text', text: `Imatge ${i + 1}:` });
        content.push({ type: 'image_url', image_url: { url: await shrinkDataUrl(crops[i], 1000) } });
    }
    const { data } = await chatJson<{ names?: unknown }>([{ role: 'user', content }], { signal, maxTokens: 512 });
    const names = Array.isArray(data.names) ? data.names : [];
    return crops.map((_, i) => {
        const n = names[i];
        return typeof n === 'string' && n.trim() && !/^desconegut$/i.test(n.trim()) ? n.trim() : null;
    });
}

/** Llegeix tots els retalls de nom. `onProgress` rep quants n'hi ha de fets. */
export async function recognizeNames(
    crops: string[],
    known: string[],
    opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<NameReading[]> {
    const results: NameReading[] = [];
    for (let i = 0; i < crops.length; i += BATCH_SIZE) {
        const batch = crops.slice(i, i + BATCH_SIZE);
        const valid = batch.map(c => !!c);
        const readings = await readBatch(batch.filter(Boolean), known, opts.signal);
        let k = 0;
        for (const ok of valid) {
            const raw = ok ? readings[k++] ?? null : null;
            results.push({ raw, matched: raw ? findBestNameMatch(raw, known) : null });
        }
        opts.onProgress?.(Math.min(i + BATCH_SIZE, crops.length), crops.length);
    }
    return results;
}
