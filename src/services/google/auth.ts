import { GOOGLE_OAUTH } from '../../config/constants';
import { googleJson } from './googleApi';

export interface TokenResult {
    accessToken: string;
    expiresAt: number;
}

interface GoogleTokenResponse {
    access_token?: string;
    expires_in?: number;
    error?: string;
}

interface GoogleIdentity {
    accounts: {
        oauth2: {
            initTokenClient(config: {
                client_id: string;
                scope: string;
                callback: (r: GoogleTokenResponse) => void;
                error_callback?: (e: unknown) => void;
            }): { requestAccessToken(): void };
        };
    };
}

const isLocalhost = () => ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const getClientId = () => (isLocalhost() ? GOOGLE_OAUTH.localClientId : GOOGLE_OAUTH.productionClientId);

/** Obre el diàleg de Google i retorna el token (o error si l'usuari el tanca). */
export function requestAccessToken(): Promise<TokenResult> {
    return new Promise((resolve, reject) => {
        const google = (window as unknown as { google?: GoogleIdentity }).google;
        if (!google?.accounts?.oauth2) {
            reject(new Error('La llibreria de Google encara no s\'ha carregat'));
            return;
        }
        const client = google.accounts.oauth2.initTokenClient({
            client_id: getClientId(),
            scope: GOOGLE_OAUTH.scopes.join(' '),
            callback: r => {
                if (r.access_token) resolve({ accessToken: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 });
                else reject(new Error(r.error || 'No s\'ha obtingut cap token'));
            },
            error_callback: e => reject(e instanceof Error ? e : new Error('Autorització cancel·lada')),
        });
        client.requestAccessToken();
    });
}

export interface UserInfo {
    email?: string;
    picture?: string;
}

export const fetchUserInfo = (token: string) =>
    googleJson<UserInfo>('https://www.googleapis.com/oauth2/v3/userinfo', token);
