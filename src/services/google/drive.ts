/**
 * Sincronització amb la carpeta privada de l'app a Google Drive (appDataFolder).
 * Els noms dels fitxers són els mateixos que feia servir l'app original, per mantenir la compatibilitat.
 */
import { googleFetch, googleJson } from './googleApi';

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export interface DriveFile {
    id: string;
    name: string;
    modifiedTime?: string;
}

export const sessionJsonName = (fileName: string) => `${fileName}.json`;
export const sessionPdfName = (fileName: string) => `${fileName}.pdf`;
export const solutionPdfName = (sessionFileName: string, solutionFileName: string) =>
    `solution_${sessionFileName}_${solutionFileName}.pdf`;

/** Escapa un valor per a les consultes `q` de Drive (els noms amb apòstrof, com "l'examen", trencaven la cerca). */
export const escapeDriveQuery = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export async function findAppDataFile(token: string, name: string): Promise<DriveFile | null> {
    const url = new URL(FILES);
    url.searchParams.set('q', `name='${escapeDriveQuery(name)}' and 'appDataFolder' in parents and trashed=false`);
    url.searchParams.set('spaces', 'appDataFolder');
    url.searchParams.set('fields', 'files(id,name,modifiedTime)');
    const data = await googleJson<{ files?: DriveFile[] }>(url.toString(), token);
    return data.files?.[0] ?? null;
}

export async function listSessionFiles(token: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
        const url = new URL(FILES);
        url.searchParams.set('q', "mimeType='application/json' and 'appDataFolder' in parents and trashed=false");
        url.searchParams.set('spaces', 'appDataFolder');
        url.searchParams.set('fields', 'nextPageToken,files(id,name,modifiedTime)');
        url.searchParams.set('pageSize', '100');
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        const data = await googleJson<{ files?: DriveFile[]; nextPageToken?: string }>(url.toString(), token);
        files.push(...(data.files ?? []).filter(f => f.name.endsWith('.json')));
        pageToken = data.nextPageToken;
    } while (pageToken);
    return files;
}

export async function downloadJson<T>(token: string, fileId: string): Promise<T> {
    return googleJson<T>(`${FILES}/${fileId}?alt=media`, token);
}

export async function downloadBlob(token: string, fileId: string): Promise<Blob> {
    const res = await googleFetch(`${FILES}/${fileId}?alt=media`, token);
    return res.blob();
}

function multipartBody(metadata: object, content: Blob | string, contentType: string): { body: Blob; boundary: string } {
    const boundary = `flowgrading_${Math.random().toString(36).slice(2)}`;
    const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
        content,
        `\r\n--${boundary}--`,
    ]);
    return { body, boundary };
}

/** Crea o actualitza un fitxer a appDataFolder. Retorna l'id. */
export async function upsertAppDataFile(
    token: string,
    name: string,
    content: Blob | string,
    contentType: string,
    existingId?: string | null,
): Promise<string> {
    const id = existingId ?? (await findAppDataFile(token, name))?.id ?? null;
    const metadata = id ? { name } : { name, parents: ['appDataFolder'] };
    const { body, boundary } = multipartBody(metadata, content, contentType);
    const res = await googleJson<{ id: string }>(
        id ? `${UPLOAD}/${id}?uploadType=multipart` : `${UPLOAD}?uploadType=multipart`,
        token,
        { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
    );
    return res.id;
}

export async function deleteFile(token: string, fileId: string): Promise<void> {
    await googleFetch(`${FILES}/${fileId}`, token, { method: 'DELETE' });
}

export async function deleteAppDataFileByName(token: string, name: string): Promise<boolean> {
    const file = await findAppDataFile(token, name);
    if (!file) return false;
    await deleteFile(token, file.id);
    return true;
}
