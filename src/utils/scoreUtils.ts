import type { ExerciseDef, AnnotationStore, RubricCountStore, PresetHighlighter, AnnotationComment, Annotation, TextAnnotation } from '../types';

const applyCap = (sum: number, capEnabled?: boolean, capTotal?: number): number => {
    if (!capEnabled || capTotal === undefined) return sum;
    return capTotal >= 0 ? Math.min(sum, capTotal) : Math.max(sum, capTotal);
};

const computeHighlightAdj = (anns: Annotation[], presets: PresetHighlighter[]): number => {
    const groups = new Map<string, { sum: number; preset?: PresetHighlighter }>();
    for (const ann of anns) {
        if (ann.type !== 'highlighter') continue;
        const preset = (ann as any).presetId ? presets.find(p => p.id === (ann as any).presetId) : undefined;
        const pts = preset ? preset.points : (ann as any).points;
        if (typeof pts !== 'number') continue;
        const key = (ann as any).presetId || `free_${pts}`;
        const g = groups.get(key);
        if (g) g.sum += pts; else groups.set(key, { sum: pts, preset });
    }
    let total = 0;
    for (const { sum, preset } of groups.values())
        total += applyCap(sum, preset?.capEnabled, preset?.capTotal);
    return total;
};

const computeCommentAdj = (anns: Annotation[], bank: AnnotationComment[]): number => {
    const groups = new Map<string, { sum: number; entry?: AnnotationComment }>();
    let free = 0;
    for (const ann of anns) {
        if (ann.type !== 'text') continue;
        const ta = ann as TextAnnotation;
        if (typeof ta.score !== 'number') continue;
        if (ta.commentBankId) {
            const entry = bank.find(c => c.id === ta.commentBankId);
            const g = groups.get(ta.commentBankId);
            if (g) g.sum += ta.score; else groups.set(ta.commentBankId, { sum: ta.score, entry });
        } else {
            free += ta.score;
        }
    }
    let total = free;
    for (const { sum, entry } of groups.values())
        total += applyCap(sum, entry?.capEnabled, entry?.capTotal);
    return total;
};

export const calculateStudentScore = (
    studentId: string,
    exercises: ExerciseDef[],
    annotations: AnnotationStore,
    rubricCounts: RubricCountStore,
    targetMaxScore: number,
    presets: PresetHighlighter[] = [],
    commentBank: AnnotationComment[] = []
) => {
    let total = 0;
    let maxPossible = 0;

    for (const ex of exercises) {
        if (ex.type !== 'crop' && ex.type !== 'pages') continue;

        const exAnns = annotations[studentId]?.[ex.id] || [];
        const exRubricCounts = rubricCounts[studentId]?.[ex.id] || {};

        const highlightAdj = computeHighlightAdj(exAnns, presets) + computeCommentAdj(exAnns, commentBank);
        const rubricAdj = (ex.rubric ?? []).reduce((s, item) => s + item.points * (exRubricCounts[item.id] ?? 0), 0);
        const base = (ex.scoringMode === 'from_zero') ? 0 : (ex.maxScore ?? 0);

        total += Math.max(0, base + rubricAdj + highlightAdj);
        maxPossible += (ex.maxScore ?? 0);
    }

    const normalized = maxPossible > 0 ? (total / maxPossible) * targetMaxScore : 0;
    return {
        raw: total,
        max: maxPossible,
        normalized: Math.round(normalized * 100) / 100
    };
};
