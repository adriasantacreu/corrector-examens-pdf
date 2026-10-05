/**
 * Motor de puntuació únic. El corrector, la pantalla de resultats, l'exportació a PDF i els correus
 * fan servir aquestes funcions, de manera que una nota sempre es calcula igual a tot arreu.
 */
import { DEFAULT_EXERCISE_MAX_SCORE } from '../config/constants';
import type {
    Annotation, AnnotationComment, AnnotationStore, ExerciseDef, GradableExercise,
    HighlighterAnnotation, PresetHighlighter, RubricCountStore, ScoringMode, TextAnnotation,
} from '../types';

export const isGradable = (ex: ExerciseDef): ex is GradableExercise => ex.type === 'crop' || ex.type === 'pages';

export const getGradableExercises = (exercises: ExerciseDef[]): GradableExercise[] => exercises.filter(isGradable);

export const getScoringMode = (ex: ExerciseDef): ScoringMode => ex.scoringMode ?? 'from_max';

export const getMaxScore = (ex: ExerciseDef): number => ex.maxScore ?? DEFAULT_EXERCISE_MAX_SCORE;

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Aplica el límit d'un grup (negatiu → penalització màxima, positiu → bonificació màxima). */
export const applyCap = (sum: number, capEnabled?: boolean, capTotal?: number): number => {
    if (!capEnabled || capTotal === undefined) return sum;
    return capTotal >= 0 ? Math.min(sum, capTotal) : Math.max(sum, capTotal);
};

/** Punts efectius d'un fluorescent: si està lligat a un preset, manen els punts actuals del preset. */
export const getHighlightPoints = (ann: HighlighterAnnotation, presets: PresetHighlighter[]): number | undefined => {
    const preset = ann.presetId ? presets.find(p => p.id === ann.presetId) : undefined;
    return preset ? preset.points : ann.points;
};

export const computeHighlightAdjustment = (anns: Annotation[], presets: PresetHighlighter[]): number => {
    const groups = new Map<string, { sum: number; preset?: PresetHighlighter }>();
    for (const ann of anns) {
        if (ann.type !== 'highlighter') continue;
        const pts = getHighlightPoints(ann, presets);
        if (typeof pts !== 'number') continue;
        const preset = ann.presetId ? presets.find(p => p.id === ann.presetId) : undefined;
        const key = preset ? preset.id : `free_${pts}`;
        const group = groups.get(key);
        if (group) group.sum += pts;
        else groups.set(key, { sum: pts, preset });
    }
    let total = 0;
    for (const { sum, preset } of groups.values()) total += applyCap(sum, preset?.capEnabled, preset?.capTotal);
    return total;
};

export const computeCommentAdjustment = (anns: Annotation[], bank: AnnotationComment[]): number => {
    const groups = new Map<string, { sum: number; entry?: AnnotationComment }>();
    let free = 0;
    for (const ann of anns) {
        if (ann.type !== 'text' || typeof ann.score !== 'number') continue;
        if (ann.commentBankId) {
            const group = groups.get(ann.commentBankId);
            if (group) group.sum += ann.score;
            else groups.set(ann.commentBankId, { sum: ann.score, entry: bank.find(c => c.id === ann.commentBankId) });
        } else {
            free += ann.score;
        }
    }
    let total = free;
    for (const { sum, entry } of groups.values()) total += applyCap(sum, entry?.capEnabled, entry?.capTotal);
    return total;
};

export const computeRubricAdjustment = (ex: ExerciseDef, counts: Record<string, number> = {}): number =>
    (ex.rubric ?? []).reduce((sum, item) => sum + item.points * (counts[item.id] ?? 0), 0);

export interface ScoringContext {
    presets: PresetHighlighter[];
    commentBank: AnnotationComment[];
}

export interface ExerciseScore {
    score: number; // Entre 0 i el màxim de l'exercici
    base: number;
    rubric: number;
    highlights: number;
    comments: number;
    max: number;
}

export function computeExerciseScore(
    ex: GradableExercise,
    anns: Annotation[],
    counts: Record<string, number> | undefined,
    ctx: ScoringContext,
): ExerciseScore {
    const base = getScoringMode(ex) === 'from_zero' ? 0 : (ex.maxScore ?? 0);
    const rubric = computeRubricAdjustment(ex, counts);
    const highlights = computeHighlightAdjustment(anns, ctx.presets);
    const comments = computeCommentAdjustment(anns, ctx.commentBank);
    const max = getMaxScore(ex);
    // Entre 0 i el màxim: un comentari positiu no pot fer passar l'exercici de la seva puntuació
    return { score: Math.min(max, Math.max(0, base + rubric + highlights + comments)), base, rubric, highlights, comments, max };
}

/** Suma de notes màximes dels exercicis corregibles (la base per escalar a la nota final). */
export const getTotalPossiblePoints = (exercises: ExerciseDef[]): number =>
    getGradableExercises(exercises).reduce((acc, ex) => acc + getMaxScore(ex), 0);

/** Factor per passar de punts "reals" a la nota sobre `targetMaxScore`. */
export const getScaleFactor = (exercises: ExerciseDef[], targetMaxScore: number): number => {
    const total = getTotalPossiblePoints(exercises);
    return total > 0 ? targetMaxScore / total : 1;
};

export interface StudentScore {
    raw: number;
    max: number;
    normalized: number;
    perExercise: Record<string, ExerciseScore>;
}

export function computeStudentScore(
    studentId: string,
    exercises: ExerciseDef[],
    annotations: AnnotationStore,
    rubricCounts: RubricCountStore,
    targetMaxScore: number,
    ctx: ScoringContext,
): StudentScore {
    const perExercise: Record<string, ExerciseScore> = {};
    let raw = 0;
    for (const ex of getGradableExercises(exercises)) {
        const result = computeExerciseScore(ex, annotations[studentId]?.[ex.id] ?? [], rubricCounts[studentId]?.[ex.id], ctx);
        perExercise[ex.id] = result;
        raw += result.score;
    }
    const max = getTotalPossiblePoints(exercises);
    return {
        raw: round2(raw),
        max,
        normalized: max > 0 ? round2((raw / max) * targetMaxScore) : 0,
        perExercise,
    };
}

export const formatScaledPoints = (points: number, factor: number): string => {
    const scaled = round2(points * factor);
    return (scaled > 0 ? '+' : '') + scaled;
};

/** Un alumne té un exercici començat si hi ha anotacions o algun criteri de rúbrica marcat. */
export const hasWork = (anns: Annotation[] | undefined, counts: Record<string, number> | undefined): boolean =>
    (anns?.length ?? 0) > 0 || Object.values(counts ?? {}).some(v => v > 0);

/** Percentatge de parelles alumne-exercici ja treballades (el que es mostra a les targetes de sessió). */
export function calculateProgress(
    studentIds: string[],
    exercises: ExerciseDef[],
    annotations: AnnotationStore,
    rubricCounts: RubricCountStore = {},
): number {
    const gradable = getGradableExercises(exercises);
    if (!studentIds.length || !gradable.length) return 0;
    let completed = 0;
    for (const id of studentIds) {
        for (const ex of gradable) if (hasWork(annotations[id]?.[ex.id], rubricCounts[id]?.[ex.id])) completed++;
    }
    return Math.round((completed / (studentIds.length * gradable.length)) * 100);
}

const groupRepetitions = (items: { label: string; pts?: number }[], format: (p: number) => string): string => {
    const map = new Map<string, { count: number; pts?: number }>();
    for (const item of items) {
        const existing = map.get(item.label);
        if (existing) map.set(item.label, { count: existing.count + 1, pts: (existing.pts ?? 0) + (item.pts ?? 0) });
        else map.set(item.label, { count: 1, pts: item.pts });
    }
    return Array.from(map.entries())
        .map(([label, d]) => `${label}${d.count > 1 ? ` (x${d.count})` : ''}${d.pts !== undefined ? ` (${format(d.pts)})` : ''}`)
        .join(', ');
};

/** Línies de resum (rúbrica, fluorescents, comentaris) que acompanyen el segell de nota. */
export function buildScoreSummaryLines(
    ex: ExerciseDef,
    anns: Annotation[],
    counts: Record<string, number>,
    presets: PresetHighlighter[],
    factor: number,
): string[] {
    const format = (p: number) => formatScaledPoints(p, factor);

    const rubric = (ex.rubric ?? [])
        .filter(item => (counts[item.id] ?? 0) > 0)
        .map(item => `${item.label}${counts[item.id] > 1 ? ` (x${counts[item.id]})` : ''} (${format(item.points * counts[item.id])})`)
        .join(', ');

    const highlights = groupRepetitions(
        anns.filter((a): a is HighlighterAnnotation => a.type === 'highlighter')
            .map(a => ({ label: (a.label || 'Marc').trim(), pts: getHighlightPoints(a, presets) }))
            .filter(i => i.pts !== undefined),
        format,
    );

    const texts = anns.filter((a): a is TextAnnotation => a.type === 'text' && a.id !== SCORE_STAMP_ID && a.text.trim().length > 0);
    const scored = groupRepetitions(texts.filter(a => a.score !== undefined).map(a => ({ label: a.text.trim(), pts: a.score })), format);
    const pure = groupRepetitions(texts.filter(a => a.score === undefined).map(a => ({ label: a.text.trim() })), format);

    return [
        rubric ? `Rúbrica: ${rubric}` : '',
        highlights ? `Fluorescents: ${highlights}` : '',
        scored ? `Comentaris (+pts): ${scored}` : '',
        pure ? `Comentaris: ${pure}` : '',
    ].filter(Boolean);
}

/** Identificador reservat de l'anotació que guarda la posició del segell de nota per a un alumne concret. */
export const SCORE_STAMP_ID = 'system_score_stamp';
