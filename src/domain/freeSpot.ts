/**
 * C5: on posar el segell de nota sense trepitjar el que ha escrit l'alumne (ni l'enunciat).
 * Treballa sobre una graella de tinta (fracció de píxels amb tinta per cel·la, en coordenades del contingut),
 * que el corrector i l'exportació calculen a partir de les mateixes pàgines: el segell cau al mateix lloc a tots dos.
 */
import type { Point, Size } from './geometry';

export interface InkGrid {
    /** Costat de cada cel·la, en unitats del contingut. */
    cell: number;
    cols: number;
    rows: number;
    /** Fracció de tinta (0–1) de cada cel·la, fila a fila. Les zones sense paper compten com a plenes. */
    ink: Float32Array;
}

/** Espai que reserva el segell (títol + unes 3 línies de resum). Fix, perquè no salti en anotar. */
export const stampFootprint = (size: number, scale: number): Size => ({ width: 11 * size * scale, height: 4.7 * size * scale });

/** Per sota d'aquesta tinta (en cel·les plenes equivalents) la zona es considera lliure. */
const FREE_INK = 0.5;

/**
 * Cantonada superior esquerra d'una zona lliure on hi càpiga `fp`, a una cel·la de la vora.
 * Entre les zones lliures, la més a prop de baix a la dreta (on anava abans); si no n'hi ha cap, la menys ocupada.
 * Si el segell no hi cap, la cantonada amb menys tinta (encara que trepitgi).
 */
export function findStampSpot(grid: InkGrid, bounds: Size, fp: Size): Point {
    const { cell, cols, rows, ink } = grid;
    // Sumes acumulades per sumar qualsevol rectangle de cel·les en temps constant
    const sum = new Float64Array((cols + 1) * (rows + 1));
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            sum[(r + 1) * (cols + 1) + c + 1] = ink[r * cols + c] + sum[r * (cols + 1) + c + 1] + sum[(r + 1) * (cols + 1) + c] - sum[r * (cols + 1) + c];
        }
    }
    const inkIn = (x: number, y: number, w: number, h: number) => {
        const c0 = Math.max(0, Math.floor(x / cell)), r0 = Math.max(0, Math.floor(y / cell));
        const c1 = Math.min(cols, Math.ceil((x + w) / cell)), r1 = Math.min(rows, Math.ceil((y + h) / cell));
        if (c1 <= c0 || r1 <= r0) return 0;
        return sum[r1 * (cols + 1) + c1] - sum[r0 * (cols + 1) + c1] - sum[r1 * (cols + 1) + c0] + sum[r0 * (cols + 1) + c0];
    };

    const margin = cell;
    const maxX = bounds.width - fp.width - margin, maxY = bounds.height - fp.height - margin;
    if (maxX < margin || maxY < margin) {
        const corners = [
            { x: bounds.width - fp.width, y: bounds.height - fp.height }, { x: 0, y: bounds.height - fp.height },
            { x: bounds.width - fp.width, y: 0 }, { x: 0, y: 0 },
        ].map(p => ({ x: Math.max(0, p.x), y: Math.max(0, p.y) }));
        return corners.reduce((best, p) => (inkIn(p.x, p.y, fp.width, fp.height) < inkIn(best.x, best.y, fp.width, fp.height) ? p : best));
    }

    let best: Point = { x: maxX, y: maxY };
    let bestKey = [Infinity, Infinity];
    for (let y = maxY; y >= margin - 1e-9; y -= cell) {
        for (let x = maxX; x >= margin - 1e-9; x -= cell) {
            const amount = inkIn(x, y, fp.width, fp.height);
            const key = [amount < FREE_INK ? 0 : amount, (maxX - x) ** 2 + (maxY - y) ** 2];
            if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) { best = { x, y }; bestKey = key; }
        }
    }
    return { x: Math.round(best.x), y: Math.round(best.y) };
}
