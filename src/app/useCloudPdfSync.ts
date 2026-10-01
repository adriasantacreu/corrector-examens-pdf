import { useCallback } from 'react';
import { syncPdfToCloud } from '../services/google/sessionCloud';
import type { ShowToast } from '../state/useDialogs';

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Puja o esborra de Drive el PDF d'una sessió (o el seu solucionari), mostrant el progrés
 * a la pantalla de "processant" igual que abans.
 */
export function useCloudPdfSync(
    accessToken: string | null,
    setProcessing: (message: string | null) => void,
    showToast: ShowToast,
    handleApiError: (err: unknown) => boolean,
) {
    return useCallback(async (sessionFileName: string, shouldSync: boolean, solutionFileName?: string) => {
        if (!accessToken) return;
        const what = solutionFileName ? 'solucionari' : 'PDF';
        const What = solutionFileName ? 'Solucionari' : 'PDF';
        try {
            setProcessing(shouldSync ? `Sincronitzant ${what} al núvol...` : 'Alliberant espai al Drive...');
            const result = await syncPdfToCloud(accessToken, sessionFileName, shouldSync, solutionFileName);
            if (result === 'uploaded') { setProcessing(`${What} sincronitzat ✅`); await pause(800); }
            if (result === 'deleted') { setProcessing('Espai alliberat ✅'); await pause(800); }
        } catch (err) {
            if (!handleApiError(err)) {
                console.error('[cloud] Error sincronitzant', err);
                showToast('Sync fallida', "No s'ha pogut canviar l'estat del fitxer al núvol.", 'error');
            }
        } finally {
            setProcessing(null);
        }
    }, [accessToken, setProcessing, showToast, handleApiError]);
}
