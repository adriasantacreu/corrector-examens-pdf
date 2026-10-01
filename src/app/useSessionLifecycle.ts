/**
 * Fluxos d'obrir, reprendre, tancar i esborrar sessions, i la navegació entre pantalles.
 */
import { useCallback } from 'react';
import type { SessionData, SessionSummary } from '../domain/session';
import { createEmptySession, mergeWithGlobals } from '../domain/session';
import { buildStudentsFromPages } from '../domain/students';
import { hasWork } from '../domain/scoring';
import { deleteCloudSession, fetchPdfFromCloud, loadCloudSession, syncPdfToCloud } from '../services/google/sessionCloud';
import { loadPdf, isPdfFile } from '../services/pdf/pdfDocument';
import { deletePdf, getPdf, solutionCacheKey, storePdf } from '../services/storage/pdfCache';
import { deleteSession, hasSession, loadSession } from '../services/storage/sessionRepository';
import type { AppMode } from '../types';
import type { Dialogs } from '../state/useDialogs';
import type { GlobalSettingsApi } from '../state/useGlobalSettings';
import type { GoogleAuth } from '../state/useGoogleAuth';
import type { SessionStore } from '../state/useSessionStore';

const PREVIOUS_MODE: Partial<Record<AppMode, AppMode>> = {
    organize_pages: 'setup',
    configure_crops: 'organize_pages',
    correction: 'configure_crops',
    results: 'correction',
};

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

export function useSessionLifecycle(deps: {
    store: SessionStore;
    globals: GlobalSettingsApi;
    auth: GoogleAuth;
    dialogs: Dialogs;
    setProcessing: (message: string | null) => void;
    syncPdf: (fileName: string, shouldSync: boolean, solutionFileName?: string) => Promise<void>;
    onSessionsChanged: () => void;
    removeSummary: (fileName: string) => void;
}) {
    const { store, globals, auth, dialogs, setProcessing, syncPdf, onSessionsChanged, removeSummary } = deps;
    const { showToast, showConfirm } = dialogs;
    const { accessToken, handleApiError } = auth;

    const loadSolution = useCallback(async (session: SessionData) => {
        store.setSolutionPdfDoc(null);
        if (!session.solutionFileName) return;
        let file = await getPdf(solutionCacheKey(session.fileName, session.solutionFileName));
        if (!file && accessToken) {
            try { file = await fetchPdfFromCloud(accessToken, session.fileName, session.solutionFileName); } catch (err) { handleApiError(err); }
        }
        if (file) store.setSolutionPdfDoc(await loadPdf(file));
    }, [store, accessToken, handleApiError]);

    /** Obre un PDF amb la seva sessió desada (si n'hi ha) o una de nova. */
    const openPdf = useCallback(async (file: File, opts: { forceReset?: boolean; cloudSync?: boolean; saved?: SessionData | null } = {}) => {
        setProcessing('Carregant PDF...');
        try {
            const doc = await loadPdf(file);
            const saved = opts.forceReset ? null : (opts.saved ?? await loadSession(file.name));
            const { settings } = globals;
            const session = saved ? mergeWithGlobals(saved, settings) : createEmptySession(file.name, settings);
            if (opts.cloudSync !== undefined) session.cloudSyncPDF = opts.cloudSync;
            store.open(session, doc);
            globals.update({ lastActiveFileName: file.name });
            storePdf(file.name, file).catch(err => console.error('[pdfCache]', err));
            void loadSolution(session);
        } catch (err) {
            console.error(err);
            showToast('Error', 'Error carregant el fitxer PDF.', 'error');
        } finally {
            setProcessing(null);
        }
    }, [globals, store, setProcessing, showToast, loadSolution]);

    /** PDF nou des del botó o arrossegant-lo a la pantalla d'inici. */
    const processUploadedFile = useCallback(async (file: File) => {
        if (!isPdfFile(file)) {
            showToast('Fitxer no vàlid', 'Només es permeten fitxers PDF.', 'error');
            return;
        }
        if (await hasSession(file.name)) {
            showConfirm(
                'Sessió existent',
                `Hem trobat dades guardades per a '${file.name}'. Vols continuar amb la correcció o començar de zero (s'esborraran les dades anteriors)?`,
                () => void openPdf(file),
                { onCancel: () => void openPdf(file, { forceReset: true }), confirmLabel: 'Continuar', cancelLabel: 'Començar de zero' },
            );
        } else if (accessToken) {
            showConfirm(
                'Sincronització al núvol',
                'Vols activar la sincronització al núvol per a aquest fitxer? Això et permetrà continuar la correcció des de qualsevol dispositiu.',
                () => { globals.update({ cloudSyncPDF: true }); void openPdf(file, { cloudSync: true }); },
                { onCancel: () => { globals.update({ cloudSyncPDF: false }); void openPdf(file, { cloudSync: false }); }, cancelLabel: 'Només local', confirmLabel: 'Sí, al núvol' },
            );
        } else {
            void openPdf(file);
        }
    }, [accessToken, globals, openPdf, showConfirm, showToast]);

    /** Obre una sessió de la llista de sessions recents. */
    const resumeSession = useCallback(async (summary: SessionSummary, knownFile?: File) => {
        let file = knownFile ?? await getPdf(summary.fileName);
        if (!file && accessToken) {
            setProcessing('Recuperant PDF del núvol...');
            try {
                file = await fetchPdfFromCloud(accessToken, summary.fileName);
                if (file) { setProcessing('PDF recuperat ✅'); await pause(800); }
            } catch (err) {
                if (!handleApiError(err)) console.error('[cloud] No s\'ha pogut recuperar el PDF', err);
            } finally {
                setProcessing(null);
            }
        }

        // Si la còpia del núvol és més nova que la local (p. ex. s'ha corregit en un altre ordinador), mana la del núvol
        let saved: SessionData | null = null;
        const local = await loadSession(summary.fileName);
        if (summary.isCloud && summary.cloudId && accessToken) {
            try {
                const cloud = await loadCloudSession(accessToken, summary.cloudId);
                saved = !local || new Date(summary.lastModified) > new Date(local.lastModified) ? cloud : local;
            } catch (err) {
                handleApiError(err);
                saved = local;
            }
        } else {
            saved = local;
        }

        if (file) {
            await openPdf(file, { saved });
            return;
        }
        showToast('Fitxer no trobat', 'Carrega el PDF manualment per continuar.', 'error');
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/pdf';
        input.onchange = () => {
            const picked = input.files?.[0];
            if (picked && picked.name === summary.fileName) void openPdf(picked, { saved });
            else if (picked) showToast('Fitxer incorrecte', 'El fitxer no coincideix.', 'error');
        };
        input.click();
    }, [accessToken, handleApiError, openPdf, setProcessing, showToast]);

    const removeSession = useCallback(async (summary: SessionSummary) => {
        removeSummary(summary.fileName);
        if (globals.settings.lastActiveFileName === summary.fileName) globals.update({ lastActiveFileName: null });
        await deleteSession(summary.fileName);
        await deletePdf(summary.fileName);
        if (summary.solutionFileName) await deletePdf(solutionCacheKey(summary.fileName, summary.solutionFileName));
        if (accessToken) {
            try {
                if (summary.isCloud) await deleteCloudSession(accessToken, summary);
                // Abans el PDF quedava orfe a Drive en esborrar la sessió
                await syncPdfToCloud(accessToken, summary.fileName, false);
                if (summary.solutionFileName) await syncPdfToCloud(accessToken, summary.fileName, false, summary.solutionFileName);
            } catch (err) {
                if (!handleApiError(err)) console.error('[cloud] Error esborrant del núvol', err);
            }
        }
        onSessionsChanged();
    }, [accessToken, globals, handleApiError, onSessionsChanged, removeSummary]);

    const setMode = useCallback((mode: AppMode) => store.update({ mode }), [store]);

    const goBack = useCallback(() => {
        const mode = store.session?.mode;
        if (!mode) return;
        if (mode === 'setup') {
            void store.flush();
            store.close();
            return;
        }
        const previous = PREVIOUS_MODE[mode];
        if (previous) setMode(previous);
    }, [store, setMode]);

    /** "Continuar" des de la configuració: sincronitza els PDFs i reparteix les pàgines entre alumnes. */
    const startConfiguration = useCallback(async () => {
        const session = store.session;
        const doc = store.pdfDoc;
        if (!session || !doc) return;
        await syncPdf(session.fileName, session.cloudSyncPDF);
        if (session.solutionFileName) await syncPdf(session.fileName, session.cloudSyncSolution, session.solutionFileName);

        const pages = Math.max(1, session.pagesPerExam || 1);
        const needsRebuild = !session.students.length || session.studentsPagesPerExam !== pages;
        const rebuild = () => store.update({
            students: buildStudentsFromPages(doc.numPages, pages),
            studentsPagesPerExam: pages,
            mode: 'organize_pages',
        });
        if (!needsRebuild) {
            setMode('organize_pages');
            return;
        }
        const anyWork = session.students.some(s => Object.keys(session.annotations[s.id] ?? {}).some(exId =>
            hasWork(session.annotations[s.id]?.[exId], session.rubricCounts[s.id]?.[exId])));
        if (anyWork) {
            showConfirm(
                'Tornar a repartir pàgines',
                'Has canviat les pàgines per examen. Es tornaran a repartir les pàgines entre alumnes i les correccions fetes podrien quedar assignades a un altre alumne. Vols continuar?',
                rebuild,
            );
        } else {
            rebuild();
        }
    }, [store, syncPdf, setMode, showConfirm]);

    return { openPdf, processUploadedFile, resumeSession, removeSession, goBack, setMode, startConfiguration, loadSolution };
}
