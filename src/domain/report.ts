/**
 * Informe de correcció (bloc C): què hi surt, sense saber com es pinta. Les notes surten del motor únic
 * (`scoring.ts`), de manera que l'informe, la pantalla i el PDF corregit sempre diuen el mateix.
 */
import type { Annotation, ExerciseDef, HighlighterAnnotation, Student, TextAnnotation } from '../types';
import {
    applyCap, computeExerciseScore, computeStudentScore, getGradableExercises, getHighlightPoints, getMaxScore,
    getScaleFactor, round2, SCORE_STAMP_ID, type ScoringContext,
} from './scoring';
import type { AnnotationStore, RubricCountStore } from '../types';

/** Verd = màxim, ambre = parcial, vermell = zero (com la precorrecció). */
export type Tone = 'full' | 'partial' | 'zero';

export interface ReportRow {
    kind: 'rubric' | 'highlight' | 'comment';
    label: string;
    count: number;
    points: number; // Ja escalats a la nota final, com el segell
}

export interface ReportExercise {
    title: string;
    score: number;
    max: number;
    tone: Tone;
    rows: ReportRow[];
    notes: string[]; // Comentaris sense punts
}

export interface ReportModel {
    title: string;
    student: string;
    date: string;
    score: number;
    max: number;
    pass: boolean;
    exercises: ReportExercise[];
}

export interface ReportInput extends ScoringContext {
    title: string;
    exercises: ExerciseDef[];
    annotations: AnnotationStore;
    rubricCounts: RubricCountStore;
    targetMaxScore: number;
}

export const toneOf = (score: number, max: number): Tone =>
    score >= max - 0.001 ? 'full' : score <= 0.001 ? 'zero' : 'partial';

/** Coma decimal i sense zeros sobrers: 7.50 → «7,5». */
export const formatNumber = (n: number): string => String(round2(n)).replace('.', ',');

/** Amb signe, per als ajustos: «+0,5», «–1» (guió mitjà: la font no té el signe menys matemàtic). */
export const formatPoints = (n: number): string => (n > 0 ? '+' : n < 0 ? '–' : '') + formatNumber(Math.abs(n));

export const formatDate = (d: Date): string =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

/** Agrupa per clau i suma, aplicant el límit del grup si n'hi ha (igual que el motor de puntuació). */
function grouped<T>(items: T[], key: (t: T) => string, label: (t: T) => string, pts: (t: T) => number | undefined,
    cap: (t: T) => { capEnabled?: boolean; capTotal?: number } | undefined, kind: ReportRow['kind'], factor: number): ReportRow[] {
    const groups = new Map<string, { label: string; count: number; sum: number; first: T }>();
    for (const it of items) {
        const p = pts(it);
        if (typeof p !== 'number') continue;
        const k = key(it);
        const g = groups.get(k);
        if (g) { g.count++; g.sum += p; } else groups.set(k, { label: label(it), count: 1, sum: p, first: it });
    }
    return [...groups.values()].map(g => {
        const c = cap(g.first);
        return { kind, label: g.label, count: g.count, points: round2(applyCap(g.sum, c?.capEnabled, c?.capTotal) * factor) };
    });
}

export function buildReport(input: ReportInput, student: Student, now: Date): ReportModel {
    const factor = getScaleFactor(input.exercises, input.targetMaxScore);
    const total = computeStudentScore(student.id, input.exercises, input.annotations, input.rubricCounts, input.targetMaxScore, input);

    const exercises = getGradableExercises(input.exercises).map((ex, i): ReportExercise => {
        const anns: Annotation[] = input.annotations[student.id]?.[ex.id] ?? [];
        const counts = input.rubricCounts[student.id]?.[ex.id] ?? {};
        const { score } = computeExerciseScore(ex, anns, counts, input);
        const rubric: ReportRow[] = (ex.rubric ?? []).filter(r => (counts[r.id] ?? 0) > 0)
            .map(r => ({ kind: 'rubric', label: r.label, count: counts[r.id], points: round2(r.points * counts[r.id] * factor) }));
        const highlights = grouped(
            anns.filter((a): a is HighlighterAnnotation => a.type === 'highlighter'),
            a => a.presetId && input.presets.some(p => p.id === a.presetId) ? a.presetId : `free_${(a.label || 'Marca').trim()}`,
            a => (input.presets.find(p => p.id === a.presetId)?.label ?? a.label ?? 'Marca').trim(),
            a => getHighlightPoints(a, input.presets),
            a => input.presets.find(p => p.id === a.presetId),
            'highlight', factor);
        const texts = anns.filter((a): a is TextAnnotation => a.type === 'text' && a.id !== SCORE_STAMP_ID && a.text.trim().length > 0);
        const comments = grouped(
            texts,
            a => a.commentBankId ?? `free_${a.text.trim()}`,
            a => a.text.trim(),
            a => a.score,
            a => input.commentBank.find(c => c.id === a.commentBankId),
            'comment', factor);
        const notes = [...new Set(texts.filter(a => a.score === undefined).map(a => a.text.trim()))];
        const max = round2(getMaxScore(ex) * factor);
        const scaled = round2(score * factor);
        return {
            title: `Exercici ${i + 1}${ex.name ? ` — ${ex.name}` : ''}`,
            score: scaled, max, tone: toneOf(scaled, max),
            rows: [...rubric, ...highlights, ...comments], notes,
        };
    });

    return {
        title: input.title,
        student: student.name,
        date: formatDate(now),
        score: total.normalized,
        max: input.targetMaxScore,
        pass: total.normalized >= input.targetMaxScore / 2,
        exercises,
    };
}
