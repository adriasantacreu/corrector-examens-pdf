/**
 * Operacions sobre la definició d'exercicis (plantilla): crear, repartir la rúbrica, avisos.
 */
import type { ExerciseDef, PagesExercise, RegionExercise, Rect, RubricItem } from '../types';
import { getScoringMode, isGradable } from './scoring';

export type RegionKind = 'crop' | 'ocr_name' | 'total_score';

const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

/** Les regions de control (nom, nota final) són úniques: com a molt n'hi ha una de cada. */
export const isSingletonRegion = (kind: RegionKind) => kind === 'ocr_name' || kind === 'total_score';

export function defaultRegionName(kind: RegionKind, exercises: ExerciseDef[]): string {
    if (kind === 'ocr_name') return 'Àrea del nom';
    if (kind === 'total_score') return 'Nota final';
    return `Exercici de retall ${exercises.filter(e => e.type === 'crop').length + 1}`;
}

export function createRegion(kind: RegionKind, pageIndex: number, rect: Rect, exercises: ExerciseDef[]): RegionExercise {
    return {
        id: uid('ex'),
        type: kind,
        pageIndex,
        ...rect,
        name: defaultRegionName(kind, exercises),
        maxScore: 1,
        scoringMode: 'from_zero',
        rubric: [],
        ...(kind === 'crop' ? { autoDistribute: true } : {}),
    } as RegionExercise;
}

export function createPagesExercise(pageIndex: number, exercises: ExerciseDef[]): PagesExercise {
    return {
        id: uid('ex_page'),
        type: 'pages',
        name: `Exercici de pàgina ${exercises.filter(e => e.type === 'pages').length + 1}`,
        pageIndexes: [pageIndex],
        maxScore: 1,
        scoringMode: 'from_zero',
        rubric: [],
        autoDistribute: true,
    };
}

/** Afegeix una regió; si és una regió de control única, substitueix l'anterior. */
export function addRegion(exercises: ExerciseDef[], region: RegionExercise): ExerciseDef[] {
    const rest = isSingletonRegion(region.type as RegionKind) ? exercises.filter(e => e.type !== region.type) : exercises;
    return [...rest, region];
}

/** L'auto-repartiment està actiu per defecte fins que l'usuari toca manualment uns punts. */
export const isAutoDistribute = (ex: ExerciseDef): boolean => ex.autoDistribute !== false;

/** Reparteix la nota màxima a parts iguals entre els criteris (negatius si es compta des del màxim). */
export function distributeRubric(ex: ExerciseDef): RubricItem[] {
    const items = ex.rubric ?? [];
    if (!items.length || ex.maxScore === undefined) return items;
    let perItem = Math.round((ex.maxScore / items.length) * 100) / 100;
    if (getScoringMode(ex) === 'from_max') perItem = -perItem;
    return items.map(r => ({ ...r, points: perItem }));
}

export function withAutoDistribution<T extends ExerciseDef>(ex: T): T {
    return isAutoDistribute(ex) ? { ...ex, rubric: distributeRubric(ex) } : ex;
}

/** La suma de criteris supera la nota màxima (només és un avís: no es bloqueja). */
export function rubricExceedsMax(ex: ExerciseDef): boolean {
    if (ex.maxScore === undefined) return false;
    const sum = (ex.rubric ?? []).reduce((s, i) => s + (i.points || 0), 0);
    return getScoringMode(ex) === 'from_max' ? Math.abs(sum) > ex.maxScore : sum > ex.maxScore;
}

export const newRubricItem = (label = ''): RubricItem => ({ id: uid('r'), label, points: 0 });

export const hasGradableExercises = (exercises: ExerciseDef[]): boolean => exercises.some(isGradable);

/** Pàgines lògiques de l'examen on hi ha un exercici. */
export function exercisePages(ex: ExerciseDef): number[] {
    return ex.type === 'pages' ? ex.pageIndexes : [ex.pageIndex];
}
