/**
 * Persistència local de sessions i preferències.
 *
 * Les sessions es desen a IndexedDB (sense el límit de ~5 MB de localStorage, que feia petar el desat
 * quan hi havia imatges enganxades o molts retalls de noms). Les sessions antigues de localStorage es
 * continuen llegint (no s'esborren mai automàticament) i es passen a IndexedDB el primer cop que es desen.
 */
import { STORAGE_KEYS } from '../../config/constants';
import type { GlobalSettings, SessionData, SessionSummary } from '../../domain/session';
import { migrateGlobalSettings, migrateSession, toSummary } from '../../domain/session';
import { idbDelete, idbGet, idbGetAll, idbPut, STORES } from './db';

const legacyKey = (fileName: string) => STORAGE_KEYS.sessionPrefix + fileName;

function readLegacySession(fileName: string): SessionData | null {
    try {
        const raw = localStorage.getItem(legacyKey(fileName));
        return raw ? migrateSession(JSON.parse(raw), fileName) : null;
    } catch {
        return null;
    }
}

function listLegacySessions(): SessionData[] {
    const sessions: SessionData[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(STORAGE_KEYS.sessionPrefix)) continue;
        try {
            sessions.push(migrateSession(JSON.parse(localStorage.getItem(key)!), key.slice(STORAGE_KEYS.sessionPrefix.length)));
        } catch { /* entrada corrupta: s'ignora */ }
    }
    return sessions;
}

const newer = (a: SessionData, b: SessionData) => new Date(a.lastModified).getTime() >= new Date(b.lastModified).getTime();

export async function loadSession(fileName: string): Promise<SessionData | null> {
    let stored: SessionData | null = null;
    try {
        const raw = await idbGet<unknown>(STORES.sessions, fileName);
        stored = raw ? migrateSession(raw, fileName) : null;
    } catch (err) {
        console.error('[sessions] Error llegint IndexedDB', err);
    }
    const legacy = readLegacySession(fileName);
    if (stored && legacy) return newer(stored, legacy) ? stored : legacy;
    return stored ?? legacy;
}

export async function hasSession(fileName: string): Promise<boolean> {
    return (await loadSession(fileName)) !== null;
}

export async function saveSession(session: SessionData): Promise<void> {
    await idbPut(STORES.sessions, session);
}

export async function deleteSession(fileName: string): Promise<void> {
    localStorage.removeItem(legacyKey(fileName));
    try {
        await idbDelete(STORES.sessions, fileName);
    } catch (err) {
        console.error('[sessions] Error esborrant la sessió', err);
    }
}

export async function listLocalSessions(): Promise<SessionData[]> {
    const byName = new Map<string, SessionData>();
    for (const s of listLegacySessions()) byName.set(s.fileName, s);
    try {
        const stored = await idbGetAll<unknown>(STORES.sessions);
        for (const raw of stored) {
            const s = migrateSession(raw);
            const existing = byName.get(s.fileName);
            if (!existing || newer(s, existing)) byName.set(s.fileName, s);
        }
    } catch (err) {
        console.error('[sessions] Error llistant IndexedDB', err);
    }
    return [...byName.values()];
}

export async function listLocalSummaries(): Promise<SessionSummary[]> {
    return (await listLocalSessions()).map(s => toSummary(s));
}

/** Canvia només alguns camps d'una sessió desada (p. ex. l'àlies o el núvol des de la pantalla d'inici). */
export async function patchSession(fileName: string, patch: Partial<SessionData>): Promise<void> {
    const session = await loadSession(fileName);
    if (session) await saveSession({ ...session, ...patch });
}

export function loadGlobalSettings(): GlobalSettings {
    try {
        return migrateGlobalSettings(JSON.parse(localStorage.getItem(STORAGE_KEYS.global) || '{}'));
    } catch {
        return migrateGlobalSettings({});
    }
}

export function saveGlobalSettings(settings: GlobalSettings): void {
    try {
        localStorage.setItem(STORAGE_KEYS.global, JSON.stringify(settings));
    } catch (err) {
        console.error('[settings] No s\'han pogut desar les preferències', err);
    }
}
