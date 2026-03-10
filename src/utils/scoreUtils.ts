import type { ExerciseDef, AnnotationStore, RubricCountStore } from '../types';

export const calculateStudentScore = (
    studentId: string,
    exercises: ExerciseDef[],
    annotations: AnnotationStore,
    rubricCounts: RubricCountStore,
    targetMaxScore: number
) => {
    let total = 0;
    let maxPossible = 0;

    for (const ex of exercises) {
        if (ex.type !== 'crop' && ex.type !== 'pages') continue;

        const exAnns = annotations[studentId]?.[ex.id] || [];
        const exRubricCounts = rubricCounts[studentId]?.[ex.id] || {};

        const highlightAdj = exAnns.reduce((s, a) => (
            a.type === 'highlighter' && typeof a.points === 'number' ? s + a.points :
            (a.type === 'text' && typeof a.score === 'number' ? s + a.score : s)
        ), 0);

        const rubricBase = (ex.scoringMode === 'from_zero' && ex.rubric) ?
            ex.rubric.reduce((s, item) => s + item.points * (exRubricCounts[item.id] ?? 0), 0) :
            (ex.maxScore ?? 0);

        total += (rubricBase + highlightAdj);
        maxPossible += (ex.maxScore ?? 0);
    }

    const normalized = maxPossible > 0 ? (total / maxPossible) * targetMaxScore : 0;
    return {
        raw: total,
        max: maxPossible,
        normalized: Math.round(normalized * 100) / 100
    };
};
