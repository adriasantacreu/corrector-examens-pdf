import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionData } from '../domain/session';
import { withComputedFields } from '../domain/session';
import type { PDFDocumentProxy } from '../services/pdf/pdfDocument';
import { saveSessionToCloud } from '../services/google/sessionCloud';
import { saveSession } from '../services/storage/sessionRepository';
import type { GlobalSettingsApi } from './useGlobalSettings';

export type SessionUpdater = (patch: Partial<SessionData> | ((s: SessionData) => Partial<SessionData>)) => void;

const LOCAL_SAVE_DELAY = 400;
const CLOUD_SAVE_DELAY = 3000;

/**
 * Estat de la sessió oberta. Totes les pantalles hi escriuen a través de `update`, i aquest hook
 * s'encarrega de desar-la (localment gairebé a l'instant i al núvol amb una mica de retard).
 */
export function useSessionStore(globals: GlobalSettingsApi, accessToken: string | null, onCloudError: (err: unknown) => void) {
    const [session, setSession] = useState<SessionData | null>(null);
    const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
    const [solutionPdfDoc, setSolutionPdfDoc] = useState<PDFDocumentProxy | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const latest = useRef<SessionData | null>(null);
    const dirty = useRef(false);

    const update = useCallback<SessionUpdater>(patch => {
        setSession(prev => {
            if (!prev) return prev;
            const p = typeof patch === 'function' ? patch(prev) : patch;
            dirty.current = true;
            return { ...prev, ...p };
        });
    }, []);

    /** Obre una sessió ja preparada (no es desa fins que no hi ha canvis). */
    const open = useCallback((next: SessionData, doc: PDFDocumentProxy) => {
        dirty.current = true;
        setPdfDoc(doc);
        setSession(next);
    }, []);

    const close = useCallback(() => {
        setSession(null);
        setPdfDoc(null);
        setSolutionPdfDoc(null);
    }, []);

    const flush = useCallback(async () => {
        const current = latest.current;
        if (!current || !dirty.current) return;
        dirty.current = false;
        try {
            await saveSession(withComputedFields(current));
            setSaveError(null);
        } catch (err) {
            console.error('[session] Error desant la sessió', err);
            setSaveError('No s\'ha pogut desar la sessió en aquest navegador.');
            dirty.current = true;
        }
    }, []);

    // Desat local (amb un petit retard per agrupar canvis seguits, com els traços del bolígraf)
    useEffect(() => {
        latest.current = session;
        if (!session) return;
        const t = setTimeout(flush, LOCAL_SAVE_DELAY);
        return () => clearTimeout(t);
    }, [session, flush]);

    // Desat al núvol: només l'última versió i mai dues pujades alhora
    useEffect(() => {
        if (!session || !accessToken) return;
        const t = setTimeout(() => {
            saveSessionToCloud(accessToken, withComputedFields(session)).catch(onCloudError);
        }, CLOUD_SAVE_DELAY);
        return () => clearTimeout(t);
    }, [session, accessToken, onCloudError]);

    // Si es tanca la pestanya amb canvis pendents, es desen
    useEffect(() => {
        const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
        window.addEventListener('pagehide', flush);
        document.addEventListener('visibilitychange', onHide);
        return () => {
            window.removeEventListener('pagehide', flush);
            document.removeEventListener('visibilitychange', onHide);
        };
    }, [flush]);

    // Els comentaris i fluorescents generals (sense exercici) es comparteixen entre totes les sessions
    const { update: updateGlobals } = globals;
    useEffect(() => {
        if (!session) return;
        const generalComments = session.commentBank.filter(c => !c.exerciseId);
        const generalPresets = session.presets.filter(p => !p.exerciseId);
        updateGlobals(g => ({
            commentBank: JSON.stringify(g.commentBank) === JSON.stringify(generalComments) ? g.commentBank : generalComments,
            presets: JSON.stringify(g.presets) === JSON.stringify(generalPresets) ? g.presets : generalPresets,
            lastActiveFileName: session.fileName,
        }));
    }, [session?.commentBank, session?.presets, session?.fileName, updateGlobals]); // eslint-disable-line react-hooks/exhaustive-deps

    return { session, update, open, close, flush, pdfDoc, solutionPdfDoc, setSolutionPdfDoc, saveError };
}

export type SessionStore = ReturnType<typeof useSessionStore>;
