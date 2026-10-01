/**
 * Client del model de visió (a través del proxy /api/groq, que guarda la clau al servidor).
 * Gestiona reintents amb espera exponencial quan hi ha límit de peticions (429) o errors temporals.
 */
import { AI_ENDPOINT, AI_VISION_MODEL } from '../../config/constants';

export type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string | ContentPart[];
}

export class AiError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
        super(message);
        this.name = 'AiError';
        this.status = status;
    }
}

export interface ChatOptions {
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    retries?: number;
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
});

/** Envia una conversa i retorna el JSON que respon el model. */
export async function chatJson<T>(messages: ChatMessage[], opts: ChatOptions = {}): Promise<{ data: T; model: string }> {
    const { temperature = 0, maxTokens = 2048, signal, retries = 4 } = opts;
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(AI_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal,
                body: JSON.stringify({
                    model: AI_VISION_MODEL,
                    messages,
                    response_format: { type: 'json_object' },
                    temperature,
                    max_completion_tokens: maxTokens,
                }),
            });
            if (res.status === 429 || res.status >= 500) {
                const retryAfter = Number(res.headers.get('retry-after'));
                throw Object.assign(new AiError(`El servei d'IA està saturat (${res.status})`, res.status), {
                    retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
                });
            }
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new AiError(body?.error?.message || body?.error || `Error de la IA (${res.status})`, res.status);
            const content: string | undefined = body?.choices?.[0]?.message?.content;
            if (!content) throw new AiError('La IA no ha retornat cap resposta');
            return { data: parseJsonLoose<T>(content), model: body?.model || AI_VISION_MODEL };
        } catch (err) {
            if ((err as Error).name === 'AbortError') throw err;
            lastError = err;
            const status = (err as AiError).status;
            const retriable = status === undefined || status === 429 || status >= 500 || err instanceof SyntaxError;
            if (!retriable || attempt === retries) break;
            const hinted = (err as { retryAfterMs?: number }).retryAfterMs;
            await sleep(hinted ?? Math.min(30000, 2000 * 2 ** attempt + Math.random() * 1000), signal);
        }
    }
    throw lastError instanceof Error ? lastError : new AiError('Error desconegut de la IA');
}

/** Alguns models embolcallen el JSON amb ```json ... ``` o hi afegeixen text: n'extraiem l'objecte. */
export function parseJsonLoose<T>(text: string): T {
    try {
        return JSON.parse(text) as T;
    } catch {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1)) as T;
        throw new SyntaxError('Resposta de la IA no és JSON');
    }
}
