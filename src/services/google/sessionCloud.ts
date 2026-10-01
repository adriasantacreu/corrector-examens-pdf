/**
 * Sincronització de sessions i PDFs amb Drive.
 * Els desats es fan d'un en un (mai dos a la vegada) i es recorda l'id de cada fitxer, per evitar
 * duplicats i consultes innecessàries.
 */
import type { SessionData, SessionSummary } from '../../domain/session';
import { migrateSession, toSummary } from '../../domain/session';
import { getPdf, solutionCacheKey, storePdf } from '../storage/pdfCache';
import {
    deleteAppDataFileByName, deleteFile, downloadBlob, downloadJson, findAppDataFile, listSessionFiles,
    sessionJsonName, sessionPdfName, solutionPdfName, upsertAppDataFile,
} from './drive';

const fileIds = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();

/** Posa una operació a la cua (s'executa quan acaben les anteriors). */
function enqueue<T>(op: () => Promise<T>): Promise<T> {
    const next = queue.then(op, op);
    queue = next.catch(() => undefined);
    return next;
}

export function saveSessionToCloud(token: string, session: SessionData): Promise<void> {
    return enqueue(async () => {
        const name = sessionJsonName(session.fileName);
        const id = await upsertAppDataFile(token, name, JSON.stringify(session), 'application/json', fileIds.get(name));
        fileIds.set(name, id);
    });
}

export async function listCloudSummaries(token: string): Promise<SessionSummary[]> {
    const files = await listSessionFiles(token);
    const results = await Promise.all(files.map(async f => {
        try {
            const session = migrateSession(await downloadJson(token, f.id));
            if (!session.fileName) return null;
            fileIds.set(f.name, f.id);
            return toSummary({ ...session, lastModified: f.modifiedTime ?? session.lastModified }, { isCloud: true, cloudId: f.id });
        } catch {
            return null;
        }
    }));
    return results.filter((s): s is SessionSummary => s !== null);
}

export async function loadCloudSession(token: string, cloudId: string): Promise<SessionData> {
    return migrateSession(await downloadJson(token, cloudId));
}

export function deleteCloudSession(token: string, summary: SessionSummary): Promise<void> {
    return enqueue(async () => {
        const name = sessionJsonName(summary.fileName);
        if (summary.cloudId) await deleteFile(token, summary.cloudId);
        else await deleteAppDataFileByName(token, name);
        fileIds.delete(name);
    });
}

/** Puja o esborra el PDF d'una sessió (o el seu solucionari) segons `shouldSync`. Retorna què s'ha fet. */
export async function syncPdfToCloud(
    token: string,
    sessionFileName: string,
    shouldSync: boolean,
    solutionFileName?: string,
): Promise<'uploaded' | 'deleted' | 'unchanged'> {
    const driveName = solutionFileName ? solutionPdfName(sessionFileName, solutionFileName) : sessionPdfName(sessionFileName);
    const cacheKey = solutionFileName ? solutionCacheKey(sessionFileName, solutionFileName) : sessionFileName;
    const existing = await findAppDataFile(token, driveName);
    if (shouldSync && !existing) {
        const file = await getPdf(cacheKey);
        if (!file) return 'unchanged';
        await upsertAppDataFile(token, driveName, file, 'application/pdf');
        return 'uploaded';
    }
    if (!shouldSync && existing) {
        await deleteFile(token, existing.id);
        return 'deleted';
    }
    return 'unchanged';
}

/** Recupera un PDF del núvol i el desa a la memòria local. */
export async function fetchPdfFromCloud(token: string, sessionFileName: string, solutionFileName?: string): Promise<File | null> {
    const driveName = solutionFileName ? solutionPdfName(sessionFileName, solutionFileName) : sessionPdfName(sessionFileName);
    const found = await findAppDataFile(token, driveName);
    if (!found) return null;
    const blob = await downloadBlob(token, found.id);
    const file = new File([blob], solutionFileName ?? sessionFileName, { type: 'application/pdf' });
    await storePdf(solutionFileName ? solutionCacheKey(sessionFileName, solutionFileName) : sessionFileName, file);
    return file;
}
