import { useCallback, useEffect, useState } from 'react';
import { fetchUserInfo, requestAccessToken } from '../services/google/auth';
import { fetchActiveCourses } from '../services/google/classroom';
import { AuthExpiredError } from '../services/google/googleApi';
import type { ClassroomCourse } from '../types';
import type { GlobalSettingsApi } from './useGlobalSettings';

/**
 * Sessió de Google. Si el token caduca (401) es tanca la sessió de manera neta
 * perquè l'app no quedi "connectada" però sense dades.
 */
export function useGoogleAuth({ settings, update }: GlobalSettingsApi) {
    const [isAuthorizing, setIsAuthorizing] = useState(false);
    const [courses, setCourses] = useState<ClassroomCourse[]>([]);

    const expired = settings.tokenExpiresAt !== null && settings.tokenExpiresAt < Date.now();
    const accessToken = expired ? null : settings.accessToken;

    const logout = useCallback(() => {
        update({ accessToken: null, tokenExpiresAt: null, userEmail: null, userPicture: null });
        setCourses([]);
    }, [update]);

    useEffect(() => {
        if (expired && settings.accessToken) logout();
    }, [expired, settings.accessToken, logout]);

    const authorize = useCallback(async () => {
        setIsAuthorizing(true);
        try {
            const { accessToken: token, expiresAt } = await requestAccessToken();
            update({ accessToken: token, tokenExpiresAt: expiresAt });
        } catch (err) {
            console.warn('[auth] Autorització no completada', err);
        } finally {
            setIsAuthorizing(false);
        }
    }, [update]);

    /** Tracta un error d'una crida a Google: si és de sessió caducada, desconnecta. Retorna true si ho era. */
    const handleApiError = useCallback((err: unknown): boolean => {
        if (err instanceof AuthExpiredError) {
            logout();
            return true;
        }
        return false;
    }, [logout]);

    useEffect(() => {
        if (!accessToken) return;
        let cancelled = false;
        fetchUserInfo(accessToken)
            .then(info => { if (!cancelled && info.email) update({ userEmail: info.email, userPicture: info.picture ?? null }); })
            .catch(handleApiError);
        fetchActiveCourses(accessToken)
            .then(list => { if (!cancelled) setCourses(list); })
            .catch(handleApiError);
        return () => { cancelled = true; };
    }, [accessToken, update, handleApiError]);

    return {
        accessToken,
        userEmail: settings.userEmail,
        userPicture: settings.userPicture,
        isAuthorizing,
        courses,
        authorize,
        logout,
        handleApiError,
    };
}

export type GoogleAuth = ReturnType<typeof useGoogleAuth>;
