import { useCallback, useEffect, useState } from 'react';
import type { GlobalSettings } from '../domain/session';
import { loadGlobalSettings, saveGlobalSettings } from '../services/storage/sessionRepository';

/** Preferències compartides entre sessions (tema, compte de Google, comentaris i fluorescents generals). */
export function useGlobalSettings() {
    const [settings, setSettings] = useState<GlobalSettings>(loadGlobalSettings);

    useEffect(() => { saveGlobalSettings(settings); }, [settings]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', settings.theme);
    }, [settings.theme]);

    const update = useCallback((patch: Partial<GlobalSettings> | ((s: GlobalSettings) => Partial<GlobalSettings>)) => {
        setSettings(prev => {
            const p = typeof patch === 'function' ? patch(prev) : patch;
            const next = { ...prev, ...p };
            return (Object.keys(p) as (keyof GlobalSettings)[]).some(k => prev[k] !== next[k]) ? next : prev;
        });
    }, []);

    const toggleTheme = useCallback(() => update(s => ({ theme: s.theme === 'light' ? 'dark' : 'light' })), [update]);

    return { settings, update, toggleTheme };
}

export type GlobalSettingsApi = ReturnType<typeof useGlobalSettings>;
