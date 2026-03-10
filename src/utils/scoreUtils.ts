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
            a.type === 'highlighter' && typeof (a as any).points === 'number' ? s + (a as any).points :
            (a.type === 'text' && typeof (a as any).score === 'number' ? s + (a as any).score : s)
        ), 0);

        let exerciseScore = 0;
        const base = (ex.scoringMode === 'from_zero') ? 0 : (ex.maxScore ?? 0);

        if (ex.rubricSections && ex.rubricSections.length > 0) {
            let sectionsTotal = 0;
            const N = ex.rubricSections.length;
            
            ex.rubricSections.forEach(section => {
                let sectionAdj = 0;
                section.items.forEach(item => {
                    sectionAdj += item.points * (exRubricCounts[item.id] ?? 0);
                });
                // In section mode, each section starts from base/N if from_max, or 0 if from_zero
                const sectionBase = (ex.scoringMode === 'from_zero') ? 0 : (ex.maxScore ?? 0) / N;
                sectionsTotal += Math.max(0, sectionBase + sectionAdj);
            });
            
            exerciseScore = sectionsTotal + highlightAdj;
        } else {
            const rubricAdj = (ex.rubric ?? []).reduce((s, item) => s + item.points * (exRubricCounts[item.id] ?? 0), 0);
            exerciseScore = Math.max(0, base + rubricAdj + highlightAdj);
        }

        total += exerciseScore;
        maxPossible += (ex.maxScore ?? 0);
    }

    const normalized = maxPossible > 0 ? (total / maxPossible) * targetMaxScore : 0;
    return {
        raw: total,
        max: maxPossible,
        normalized: Math.round(normalized * 100) / 100
    };
};
