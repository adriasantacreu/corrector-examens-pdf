import { describe, expect, it } from 'vitest';
import type { Annotation, CropExercise, Student } from '../../types';
import { buildReport, formatNumber, formatPoints, toneOf, type ReportInput } from '../report';
import { computeStudentScore } from '../scoring';

const crop = (id: string, over: Partial<CropExercise> = {}): CropExercise => ({
    id, type: 'crop', pageIndex: 0, x: 0, y: 0, width: 100, height: 100, maxScore: 2, ...over,
});
const student: Student = { id: 's1', name: 'Maria G.P.', pageIndexes: [1] };
const hl = (id: string, presetId: string): Annotation => ({ id, type: 'highlighter', x: 0, y: 0, width: 1, height: 1, color: 'x', presetId });
const txt = (id: string, text: string, score?: number, commentBankId?: string): Annotation =>
    ({ id, type: 'text', x: 0, y: 0, text, score, commentBankId, color: '#000', fontSize: 18 });

const input = (anns: Annotation[], counts: Record<string, number> = {}): ReportInput => ({
    title: 'Matrius',
    exercises: [
        { id: 'name', type: 'name', pageIndex: 0, x: 0, y: 0, width: 1, height: 1 } as never,
        crop('e1', { name: 'Determinants', rubric: [{ id: 'r1', label: 'Signe', points: -0.5 }] }),
        crop('e2'),
    ],
    annotations: { s1: { e1: anns } },
    rubricCounts: { s1: { e1: counts } },
    targetMaxScore: 10,
    presets: [{ id: 'p1', label: 'Error de càlcul', color: 'x', points: -0.25, capEnabled: true, capTotal: -0.5 }],
    commentBank: [],
});

describe('informe', () => {
    it('formats in Catalan', () => {
        expect(formatNumber(7.5)).toBe('7,5');
        expect(formatNumber(10)).toBe('10');
        expect(formatPoints(-1.25)).toBe('–1,25');
        expect(formatPoints(0.5)).toBe('+0,5');
        expect([toneOf(2, 2), toneOf(1, 2), toneOf(0, 2)]).toEqual(['full', 'partial', 'zero']);
    });

    it('gives the same scores as the scoring engine, scaled like the stamp', () => {
        const inp = input([hl('h1', 'p1'), hl('h2', 'p1'), hl('h3', 'p1')], { r1: 1 });
        const r = buildReport(inp, student, new Date(2026, 9, 6));
        const engine = computeStudentScore('s1', inp.exercises, inp.annotations, inp.rubricCounts, 10, inp);
        expect(r.score).toBe(engine.normalized);
        // 2 exercicis de 2 punts → factor 2,5; e1 = 2 − 0,5 (rúbrica) − 0,5 (límit del preset) = 1 → 2,5 / 5
        expect(r.exercises.map(e => [e.title, e.score, e.max, e.tone])).toEqual([
            ['Exercici 1 — Determinants', 2.5, 5, 'partial'],
            ['Exercici 2', 5, 5, 'full'],
        ]);
        expect(r.date).toBe('06/10/2026');
        expect(r.pass).toBe(true);
    });

    it('lists rubric, highlights (capped) and comments; plain comments go apart', () => {
        const r = buildReport(input([
            hl('h1', 'p1'), hl('h2', 'p1'), hl('h3', 'p1'),
            txt('t1', 'Revisa el signe', -0.25), txt('t2', 'Revisa el signe', -0.25), txt('t3', 'Bona notació'),
        ], { r1: 2 }), student, new Date());
        expect(r.exercises[0].rows).toEqual([
            { kind: 'rubric', label: 'Signe', count: 2, points: -2.5 },
            { kind: 'highlight', label: 'Error de càlcul', count: 3, points: -1.25 },
            { kind: 'comment', label: 'Revisa el signe', count: 2, points: -1.25 },
        ]);
        expect(r.exercises[0].notes).toEqual(['Bona notació']);
        expect(r.exercises[1].rows).toEqual([]);
    });
});
