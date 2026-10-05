import { describe, expect, it } from 'vitest';
import type { Annotation, CropExercise, ExerciseDef, PagesExercise } from '../../types';
import {
    applyCap, buildScoreSummaryLines, calculateProgress, computeExerciseScore, computeStudentScore,
    getScaleFactor, getTotalPossiblePoints,
} from '../scoring';

const crop = (over: Partial<CropExercise> = {}): CropExercise => ({
    id: 'c1', type: 'crop', pageIndex: 0, x: 0, y: 0, width: 100, height: 100, maxScore: 2, ...over,
});

const ctx = { presets: [{ id: 'p1', label: 'Error', color: 'rgba(1,2,3,0.4)', points: -0.5, capEnabled: true, capTotal: -1 }], commentBank: [] };

describe('scoring', () => {
    it('applies caps in both directions', () => {
        expect(applyCap(-3, true, -1)).toBe(-1);
        expect(applyCap(3, true, 2)).toBe(2);
        expect(applyCap(3, false, 2)).toBe(3);
    });

    it('counts rubric in from_max mode too (the old total ignored it)', () => {
        const ex = crop({ scoringMode: 'from_max', rubric: [{ id: 'r1', label: 'x', points: -0.5 }] });
        const res = computeExerciseScore(ex, [], { r1: 2 }, ctx);
        expect(res.score).toBe(1);
    });

    it('uses current preset points and caps per preset', () => {
        const anns: Annotation[] = [1, 2, 3].map(i => ({ id: `h${i}`, type: 'highlighter', x: 0, y: 0, width: 1, height: 1, color: 'x', presetId: 'p1', points: -5 }));
        const res = computeExerciseScore(crop({ scoringMode: 'from_max' }), anns, {}, ctx);
        expect(res.highlights).toBe(-1);
        expect(res.score).toBe(1);
    });

    it('never goes below zero', () => {
        const ex = crop({ scoringMode: 'from_zero', rubric: [{ id: 'r1', label: 'x', points: -1 }] });
        expect(computeExerciseScore(ex, [], { r1: 3 }, ctx).score).toBe(0);
    });

    it('never goes above the exercise max (positive comments included)', () => {
        const anns: Annotation[] = [{ id: 't', type: 'text', x: 0, y: 0, text: 'Excel·lent!', score: 1, color: '#000', fontSize: 18 }];
        const ex = crop({ scoringMode: 'from_max', maxScore: 3 });
        expect(computeExerciseScore(ex, anns, {}, ctx).score).toBe(3);
    });

    it('ignores control regions when computing the total and scale factor', () => {
        const exercises: ExerciseDef[] = [
            crop({ maxScore: 3 }),
            { id: 'o', type: 'ocr_name', pageIndex: 0, x: 0, y: 0, width: 1, height: 1, maxScore: 1 },
            { id: 'p', type: 'pages', pageIndexes: [1], maxScore: 2 } as PagesExercise,
        ];
        expect(getTotalPossiblePoints(exercises)).toBe(5);
        expect(getScaleFactor(exercises, 10)).toBe(2);
    });

    it('normalizes the student score', () => {
        const exercises: ExerciseDef[] = [crop({ id: 'a', maxScore: 2, scoringMode: 'from_max' }), crop({ id: 'b', maxScore: 2, scoringMode: 'from_zero', rubric: [{ id: 'r', label: 'ok', points: 1 }] })];
        const res = computeStudentScore('s1', exercises, {}, { s1: { b: { r: 1 } } }, 10, ctx);
        expect(res.raw).toBe(3);
        expect(res.normalized).toBe(7.5);
    });

    it('builds summary lines with effective highlight points', () => {
        const anns: Annotation[] = [{ id: 'h', type: 'highlighter', x: 0, y: 0, width: 1, height: 1, color: 'x', presetId: 'p1', points: -9, label: 'Error' }];
        const lines = buildScoreSummaryLines(crop(), anns, {}, ctx.presets, 1);
        expect(lines).toEqual(['Fluorescents: Error (-0.5)']);
    });

    it('computes progress including rubric-only work', () => {
        expect(calculateProgress(['s1', 's2'], [crop()], {}, { s1: { c1: { r: 1 } } })).toBe(50);
    });
});
