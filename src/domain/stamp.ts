/**
 * Segell de nota de cada exercici ("Nota: x / y" + resum). La posició es pot fixar per a tots els alumnes
 * (a l'exercici) o només per a un (amb una anotació especial). El corrector i el PDF fan servir aquestes funcions.
 */
import type { Annotation, ExerciseDef, TextAnnotation } from '../types';
import type { Size } from './geometry';
import { SCORE_STAMP_ID } from './scoring';

/** Amplada de referència del bloc del segell (a escala 1). */
export const STAMP_WIDTH = 500;
export const DEFAULT_STAMP_SIZE = 24;

export interface StampPlacement {
    x: number;
    y: number;
    scale: number;
}

export function defaultStampPosition(lastPageWidth: number, contentHeight: number): { x: number; y: number } {
    return {
        x: lastPageWidth > 600 ? lastPageWidth - 550 : 20,
        y: contentHeight > 100 ? contentHeight - 80 : 10,
    };
}

/** El segell no pot quedar fora del contingut. */
export const clampStamp = (pos: { x: number; y: number }, bounds: Size) => ({
    x: Math.max(0, Math.min(pos.x, bounds.width - 100)),
    y: Math.max(0, Math.min(pos.y, bounds.height - 50)),
});

/**
 * Posició efectiva: la de l'alumne, si no la de l'exercici, si no la zona lliure (`free`, C5) o la per defecte
 * (i sempre dins del contingut).
 */
export function resolveStamp(ex: ExerciseDef, anns: Annotation[], lastPageWidth: number, bounds: Size, free?: { x: number; y: number }): StampPlacement {
    const custom = anns.find(a => a.id === SCORE_STAMP_ID) as TextAnnotation | undefined;
    const fallback = free ?? defaultStampPosition(lastPageWidth, bounds.height);
    const pos = clampStamp({ x: custom?.x ?? ex.stampX ?? fallback.x, y: custom?.y ?? ex.stampY ?? fallback.y }, bounds);
    return { ...pos, scale: custom?.width ? custom.width / STAMP_WIDTH : ex.stampScale ?? 1 };
}

/** Anotació que guarda la posició del segell només per a un alumne. */
export function customStampAnnotation(p: StampPlacement, fontSize: number): TextAnnotation {
    return {
        id: SCORE_STAMP_ID, type: 'text', text: '', x: p.x, y: p.y, color: '#000', fontSize,
        width: STAMP_WIDTH * p.scale, height: 100 * p.scale,
    };
}

export const stampTitleColor = (score: number, max: number) => (score >= max / 2 ? '#10b981' : '#ef4444');
