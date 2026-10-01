/**
 * Precorrecció amb IA: el model mira la resposta de l'alumne (i el solucionari, si n'hi ha) i proposa
 * quins criteris de la rúbrica s'apliquen i un comentari breu. El docent sempre revisa i accepta o descarta.
 * Segueix el mateix esquema que els scripts de correcció del servidor (pregrade_exercises_groq.py).
 */
import { getMaxScore, getScoringMode } from '../../domain/scoring';
import type { AiSuggestion, GradableExercise } from '../../types';
import { chatJson, type ContentPart } from './aiClient';
import { shrinkDataUrl } from './images';

export interface PreGradeInput {
    exercise: GradableExercise;
    studentImages: string[];   // Imatges (dataURL) de la resposta de l'alumne
    solutionImages?: string[]; // Imatges del solucionari corresponents a l'exercici
    signal?: AbortSignal;
}

interface RawGrading {
    criteria?: { id?: unknown; count?: unknown; met?: unknown }[];
    comment?: unknown;
    confidence?: unknown;
    score?: unknown;
}

const MAX_COUNT = 10;

export function buildPrompt(exercise: GradableExercise, hasSolution: boolean): string {
    const mode = getScoringMode(exercise);
    const max = getMaxScore(exercise);
    const rubric = exercise.rubric ?? [];
    const rubricText = rubric.length
        ? rubric.map(r => `- id "${r.id}": ${r.label || '(sense descripció)'} (${r.points > 0 ? '+' : ''}${r.points} punts cada vegada)`).join('\n')
        : '(no hi ha criteris definits)';
    const howToCount = mode === 'from_zero'
        ? 'La nota parteix de 0 i cada criteri assolit suma els seus punts. Posa count 1 si l\'alumne ho fa correctament, 0 si no.'
        : `La nota parteix de ${max} i els criteris negatius resten. Posa a count quantes vegades l'alumne comet aquell error (0 si no el comet).`;

    return [
        'Ets un assistent de correcció d\'exàmens d\'un professor de secundària. Corregeixes amb rigor però amb criteri humà:',
        'un error petit de càlcul no invalida un procediment correcte.',
        `Exercici: ${exercise.name || 'sense nom'} (nota màxima ${max}).`,
        exercise.aiInstructions?.trim() ? `Indicacions del professor (enunciat, solució, criteris):\n${exercise.aiInstructions.trim()}` : '',
        hasSolution ? 'Després de la resposta de l\'alumne tens les imatges del solucionari oficial.' : '',
        `Criteris de la rúbrica:\n${rubricText}`,
        howToCount,
        'Escriu un comentari en català, breu (1-2 frases), adreçat a l\'alumne, que expliqui l\'error principal o reconegui la bona feina.',
        'Si la resposta és en blanc o il·legible, digues-ho al comentari i no apliquis criteris positius.',
        'Respon NOMÉS amb JSON amb aquest format:',
        '{"criteria": [{"id": "<id del criteri>", "count": <enter>}], "comment": "<comentari>", "confidence": <0..1>, "score": <nota proposada entre 0 i la màxima>}',
    ].filter(Boolean).join('\n');
}

export function normalizeGrading(raw: RawGrading, exercise: GradableExercise, model: string): AiSuggestion {
    const validIds = new Set((exercise.rubric ?? []).map(r => r.id));
    const rubricCounts: Record<string, number> = {};
    for (const c of Array.isArray(raw.criteria) ? raw.criteria : []) {
        const id = typeof c?.id === 'string' ? c.id : undefined;
        if (!id || !validIds.has(id)) continue;
        const rawCount = typeof c.count === 'number' ? c.count : c.met === true ? 1 : 0;
        const count = Math.max(0, Math.min(MAX_COUNT, Math.round(rawCount)));
        if (count > 0) rubricCounts[id] = count;
    }
    const confidence = typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : undefined;
    const suggestedScore = typeof raw.score === 'number' ? Math.max(0, Math.min(getMaxScore(exercise), raw.score)) : undefined;
    return {
        rubricCounts,
        comment: typeof raw.comment === 'string' ? raw.comment.trim() : '',
        confidence,
        suggestedScore,
        model,
        createdAt: new Date().toISOString(),
        status: 'pending',
    };
}

export async function preGradeExercise({ exercise, studentImages, solutionImages = [], signal }: PreGradeInput): Promise<AiSuggestion> {
    const content: ContentPart[] = [{ type: 'text', text: buildPrompt(exercise, solutionImages.length > 0) }];
    content.push({ type: 'text', text: 'Resposta de l\'alumne:' });
    for (const img of studentImages.slice(0, 3)) content.push({ type: 'image_url', image_url: { url: await shrinkDataUrl(img, 1600) } });
    if (solutionImages.length) {
        content.push({ type: 'text', text: 'Solucionari:' });
        for (const img of solutionImages.slice(0, 2)) content.push({ type: 'image_url', image_url: { url: await shrinkDataUrl(img, 1400) } });
    }
    const { data, model } = await chatJson<RawGrading>([{ role: 'user', content }], { signal, maxTokens: 1024 });
    return normalizeGrading(data, exercise, model);
}
