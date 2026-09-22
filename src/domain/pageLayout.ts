/**
 * Disposició de les pàgines d'un exercici de tipus "pàgines" en un únic espai de coordenades.
 * El visor i l'exportació a PDF fan servir exactament aquesta funció, de manera que una anotació
 * sempre cau al mateix lloc a la pantalla i al PDF.
 */
import { PAGE_GAP } from '../config/constants';
import type { Annotation } from '../types';
import type { Point, Size } from './geometry';

export interface PageSlot {
    /** Posició dins de `exercise.pageIndexes`. */
    order: number;
    /** Mida renderitzada, o null si la pàgina no es mostra (buida, ignorada o inexistent). */
    size: Size | null;
}

export interface PagePlacement {
    order: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * En mode "dues pàgines en paral·lel" les posicions senars van a la dreta de la parella.
 * Les pàgines amagades no ocupen espai, però mantenen la seva posició lògica (dreta/esquerra).
 */
export function layoutPages(slots: PageSlot[], spansTwoPages: boolean): PagePlacement[] {
    const placements: PagePlacement[] = [];
    let y = 0;
    if (!spansTwoPages) {
        for (const slot of slots) {
            if (!slot.size) continue;
            placements.push({ order: slot.order, x: 0, y, width: slot.size.width, height: slot.size.height });
            y += slot.size.height + PAGE_GAP;
        }
        return placements;
    }
    // Mode paral·lel: cada fila és una parella (posició parella a l'esquerra, senar a la dreta).
    const rows = new Map<number, PageSlot[]>();
    for (const slot of slots) {
        if (!slot.size) continue;
        const row = Math.floor(slot.order / 2);
        rows.set(row, [...(rows.get(row) ?? []), slot]);
    }
    for (const row of [...rows.keys()].sort((a, b) => a - b)) {
        const pair = rows.get(row)!;
        for (const slot of pair) {
            const isRight = slot.order % 2 !== 0;
            placements.push({
                order: slot.order,
                x: isRight ? slot.size!.width + PAGE_GAP : 0,
                y,
                width: slot.size!.width,
                height: slot.size!.height,
            });
        }
        y += Math.max(...pair.map(s => s.size!.height)) + PAGE_GAP;
    }
    return placements;
}

export function layoutBounds(placements: PagePlacement[]): Size {
    if (!placements.length) return { width: 0, height: 0 };
    return {
        width: Math.max(...placements.map(p => p.x + p.width)),
        height: Math.max(...placements.map(p => p.y + p.height)),
    };
}

/** Punt d'ancoratge d'una anotació (el que decideix a quina pàgina pertany). */
export function annotationAnchor(ann: Annotation): Point {
    if (ann.type === 'pen') return { x: ann.points[0] ?? 0, y: ann.points[1] ?? 0 };
    return { x: ann.x ?? 0, y: ann.y ?? 0 };
}

const TOLERANCE = 10;

export function findPlacement(point: Point, placements: PagePlacement[]): PagePlacement | undefined {
    return placements.find(p =>
        point.x >= p.x && point.x < p.x + p.width + TOLERANCE &&
        point.y >= p.y && point.y < p.y + p.height + TOLERANCE);
}

export function translateAnnotation<T extends Annotation>(ann: T, dx: number, dy: number): T {
    if (dx === 0 && dy === 0) return ann;
    if (ann.type === 'pen') {
        return { ...ann, points: ann.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) };
    }
    return { ...ann, x: ann.x + dx, y: ann.y + dy };
}

/** Mou una anotació d'una disposició a una altra (p. ex. en canviar entre mode scroll i mode complet). */
export function relayoutAnnotation<T extends Annotation>(ann: T, from: PagePlacement[], to: PagePlacement[]): T {
    const anchor = annotationAnchor(ann);
    const source = findPlacement(anchor, from);
    const target = source && to.find(p => p.order === source.order);
    if (!source || !target) return ann;
    return translateAnnotation(ann, target.x - source.x, target.y - source.y);
}

export function relayoutPoint(point: Point, from: PagePlacement[], to: PagePlacement[]): Point {
    const source = findPlacement(point, from);
    const target = source && to.find(p => p.order === source.order);
    if (!source || !target) return point;
    return { x: point.x + target.x - source.x, y: point.y + target.y - source.y };
}
