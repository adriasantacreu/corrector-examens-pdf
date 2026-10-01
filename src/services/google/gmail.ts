import { googleFetch } from './googleApi';

const utf8ToBase64 = (str: string): string => {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
};

const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, '$&\r\n').trimEnd();

export interface MailAttachment {
    fileName: string;
    contentType: string;
    base64: string;
}

/** Construeix un missatge MIME amb text UTF-8 i un adjunt. */
export function buildMimeMessage(to: string, subject: string, body: string, attachment?: MailAttachment): string {
    const boundary = `flowgrading-boundary-${Date.now()}`;
    const safeName = attachment?.fileName.replace(/"/g, '');
    const parts = [
        `To: ${to}`,
        `Subject: =?UTF-8?B?${utf8ToBase64(subject)}?=`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        wrap76(utf8ToBase64(body)),
        '',
    ];
    if (attachment) {
        parts.push(
            `--${boundary}`,
            `Content-Type: ${attachment.contentType}; name="${safeName}"`,
            `Content-Disposition: attachment; filename="${safeName}"`,
            'Content-Transfer-Encoding: base64',
            '',
            wrap76(attachment.base64),
            '',
        );
    }
    parts.push(`--${boundary}--`);
    return parts.join('\r\n');
}

/** El missatge ja és ASCII (tot el contingut no ASCII va en base64), així que es pot codificar directament. */
export const toGmailRaw = (mime: string) => btoa(mime).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function sendMail(token: string, mime: string): Promise<void> {
    await googleFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: toGmailRaw(mime) }),
    });
}

export async function blobToBase64(blob: Blob): Promise<string> {
    const buffer = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
    return btoa(binary);
}
