import type { Rect } from '../types';

export interface Size {
    width: number;
    height: number;
}

export interface Point {
    x: number;
    y: number;
}

/** Converteix un rectangle dibuixat en qualsevol direcció (amplada/alçada negatives) en un de normalitzat. */
export function normalizeRect(r: Rect): Rect {
    return {
        x: r.width < 0 ? r.x + r.width : r.x,
        y: r.height < 0 ? r.y + r.height : r.y,
        width: Math.abs(r.width),
        height: Math.abs(r.height),
    };
}

/** Retalla un rectangle perquè quedi dins dels límits (0,0)-(bounds). */
export function clipRectToBounds(r: Rect, bounds: Size): Rect {
    const x = Math.max(0, r.x);
    const y = Math.max(0, r.y);
    const right = Math.min(bounds.width, r.x + r.width);
    const bottom = Math.min(bounds.height, r.y + r.height);
    return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

/** Desplaça un rectangle (sense canviar-ne la mida) perquè no surti dels límits. */
export function clampPositionToBounds(pos: Point, size: Size, bounds: Size): Point {
    return {
        x: Math.min(Math.max(0, pos.x), Math.max(0, bounds.width - size.width)),
        y: Math.min(Math.max(0, pos.y), Math.max(0, bounds.height - size.height)),
    };
}

/**
 * Limita un rectangle en redimensionament: les vores que surten dels límits s'enganxen a la vora
 * i es respecta una mida mínima. Retorna null si el resultat no és vàlid (s'ha de mantenir l'anterior).
 */
export function clampResizeToBounds(r: Rect, bounds: Size, minSize = 5): Rect | null {
    const clipped = clipRectToBounds(normalizeRect(r), bounds);
    if (clipped.width < minSize || clipped.height < minSize) return null;
    return clipped;
}

/** Escala que fa cabre `content` dins de `container` amb un marge, sense passar de `maxScale`. */
export function fitScale(content: Size, container: Size, opts: { padding?: number; maxScale?: number; fitHeight?: boolean } = {}): number {
    const { padding = 40, maxScale = 1.2, fitHeight = true } = opts;
    const sx = (container.width - padding) / content.width;
    const sy = (container.height - padding) / content.height;
    return fitHeight ? Math.min(sx, sy, maxScale) : Math.min(sx, maxScale);
}

export function pointInRect(p: Point, r: Rect): boolean {
    return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
