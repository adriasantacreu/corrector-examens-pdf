import { useCallback, useEffect, useState } from 'react';
import type { SessionSummary } from '../domain/session';
import { mergeSummaries } from '../domain/session';
import { listCloudSummaries } from '../services/google/sessionCloud';
import { getPdf } from '../services/storage/pdfCache';
import { listLocalSummaries } from '../services/storage/sessionRepository';

export interface PendingSession {
    summary: SessionSummary;
    file: File;
}

/**
 * Sessions de la pantalla d'inici: les locals i les del núvol, i la "sessió pendent"
 * (l'última oberta, si en tenim el PDF) per al botó "Continuar PDF".
 */
export function useRecentSessions(active: boolean, accessToken: string | null, lastActiveFileName: string | null, onCloudError: (err: unknown) => void) {
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [pending, setPending] = useState<PendingSession | null>(null);

    const reload = useCallback(async () => {
        const local = await listLocalSummaries();
        let cloud: SessionSummary[] = [];
        if (accessToken) {
            try { cloud = await listCloudSummaries(accessToken); } catch (err) { onCloudError(err); }
        }
        const merged = mergeSummaries(local, cloud);
        setSessions(merged);

        const byDate = [...local].sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
        const target = lastActiveFileName ?? byDate[0]?.fileName;
        const summary = target ? merged.find(s => s.fileName === target) : undefined;
        const file = summary ? await getPdf(summary.fileName) : null;
        setPending(summary && file ? { summary, file } : null);
    }, [accessToken, lastActiveFileName, onCloudError]);

    useEffect(() => {
        if (active) void reload();
    }, [active, reload]);

    /** Actualització optimista d'una targeta (àlies, núvol...). */
    const patchLocal = useCallback((fileName: string, patch: Partial<SessionSummary>) => {
        setSessions(prev => prev.map(s => (s.fileName === fileName ? { ...s, ...patch } : s)));
        setPending(p => (p && p.summary.fileName === fileName ? { ...p, summary: { ...p.summary, ...patch } } : p));
    }, []);

    const removeLocal = useCallback((fileName: string) => {
        setSessions(prev => prev.filter(s => s.fileName !== fileName));
        setPending(p => (p?.summary.fileName === fileName ? null : p));
    }, []);

    return { sessions, pending, reload, patchLocal, removeLocal };
}
