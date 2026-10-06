import { describe, expect, it } from 'vitest';
import { findStampSpot, type InkGrid } from '../freeSpot';

/** Graella de 10×10 cel·les de 10 unitats; `inked` són rectangles [c0, r0, c1, r1) plens de tinta. */
function grid(inked: [number, number, number, number][]): InkGrid {
    const ink = new Float32Array(100);
    for (const [c0, r0, c1, r1] of inked) for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) ink[r * 10 + c] = 1;
    return { cell: 10, cols: 10, rows: 10, ink };
}
const bounds = { width: 100, height: 100 };
const fp = { width: 30, height: 20 };

describe('segell en zona lliure (C5)', () => {
    it('full en blanc: baix a la dreta, a una cel·la de la vora', () => {
        expect(findStampSpot(grid([]), bounds, fp)).toEqual({ x: 60, y: 70 });
    });

    it('si baix a la dreta hi ha escrit, busca el forat lliure més proper', () => {
        const spot = findStampSpot(grid([[0, 5, 10, 10]]), bounds, fp); // meitat de baix plena
        expect(spot.y + fp.height).toBeLessThanOrEqual(50);
        expect(spot.x).toBe(60);
    });

    it('si no hi ha cap forat, el lloc amb menys tinta', () => {
        const almost = grid([[0, 0, 10, 10]]);
        almost.ink[1 * 10 + 1] = 0; almost.ink[1 * 10 + 2] = 0; almost.ink[1 * 10 + 3] = 0; almost.ink[2 * 10 + 1] = 0; almost.ink[2 * 10 + 2] = 0; almost.ink[2 * 10 + 3] = 0;
        expect(findStampSpot(almost, bounds, fp)).toEqual({ x: 10, y: 10 });
    });

    it('retall més petit que el segell: la cantonada menys ocupada', () => {
        const small = { cell: 10, cols: 2, rows: 1, ink: Float32Array.from([1, 0]) };
        expect(findStampSpot(small, { width: 20, height: 10 }, fp)).toEqual({ x: 0, y: 0 });
    });
});
