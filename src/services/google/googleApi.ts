/**
 * Crida a les APIs de Google amb el token d'accés. Un 401 es tradueix en `AuthExpiredError`
 * perquè la capa d'estat pugui tancar la sessió de manera neta.
 */
export class AuthExpiredError extends Error {
    constructor() {
        super('La sessió de Google ha caducat');
        this.name = 'AuthExpiredError';
    }
}

export class GoogleApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.name = 'GoogleApiError';
        this.status = status;
    }
}

export async function googleFetch(url: string, token: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) throw new AuthExpiredError();
    if (!res.ok) {
        let message = `${res.status} ${res.statusText}`;
        try {
            const body = await res.json();
            message = body?.error?.message || message;
        } catch { /* cos no JSON */ }
        throw new GoogleApiError(res.status, message);
    }
    return res;
}

export async function googleJson<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
    const res = await googleFetch(url, token, init);
    return res.json() as Promise<T>;
}

/** Recorre totes les pàgines d'una llista paginada de Google (`nextPageToken`). */
export async function googleListAll<T>(baseUrl: string, token: string, key: string): Promise<T[]> {
    const items: T[] = [];
    let pageToken: string | undefined;
    do {
        const url = new URL(baseUrl);
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        const data = await googleJson<Record<string, unknown> & { nextPageToken?: string }>(url.toString(), token);
        items.push(...((data[key] as T[] | undefined) ?? []));
        pageToken = data.nextPageToken;
    } while (pageToken);
    return items;
}
