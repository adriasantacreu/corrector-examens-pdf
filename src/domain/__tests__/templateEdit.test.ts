import { describe, expect, it } from 'vitest';
import type { CropExercise, ExerciseDef } from '../../types';
import { duplicateRegion, findBlankZones, inkRatio, nudge, snapMove, snapResize, snapTargets, type Luma } from '../templateEdit';

const page = { width: 1000, height: 1400 };
const crop = (id: string, x: number, y: number, w = 200, h = 100): CropExercise =>
    ({ id, type: 'crop', name: `Ex ${id}`, maxScore: 2, pageIndex: 0, x, y, width: w, height: h, rubric: [{ id: 'r1', label: 'a', points: 1 }] } as CropExercise);

describe('R2: teclat', () => {
    it('les fletxes mouen i no surten del full', () => {
        expect(nudge(crop('a', 10, 10), -20, 5, page)).toEqual({ x: 0, y: 15 });
        expect(nudge(crop('a', 790, 10), 20, 0, page)).toEqual({ x: 800, y: 10 });
    });

    it('duplicar copia nota i rúbrica amb ids nous; el nom i la nota final no es dupliquen', () => {
        const d = duplicateRegion(crop('a', 100, 100), page, 'nou')!;
        expect(d).toMatchObject({ id: 'nou', x: 140, y: 140, width: 200, maxScore: 2, name: 'Ex a (còpia)' });
        expect(d.rubric![0].id).not.toBe('r1');
        expect(duplicateRegion({ ...crop('n', 0, 0), type: 'ocr_name' } as never, page, 'x')).toBeNull();
    });
});

describe('R3: imant', () => {
    const t = snapTargets([crop('a', 100, 100), crop('b', 400, 300)], 'a', page);

    it('una vora a prop d\'una altra zona o del full s\'hi enganxa', () => {
        expect(snapMove({ x: 395, y: 6, width: 100, height: 50 }, t, 8)).toEqual({ x: 400, y: 0 });
        // la vora dreta (397) toca l'esquerra de b (400)
        expect(snapMove({ x: 297, y: 500, width: 100, height: 50 }, t, 8).x).toBe(300);
    });

    it('lluny de tot no es mou', () => {
        expect(snapMove({ x: 250, y: 700, width: 50, height: 50 }, t, 8)).toEqual({ x: 250, y: 700 });
    });

    it('en redimensionar només s\'enganxa la vora que es mou', () => {
        const prev = { x: 100, y: 100, width: 200, height: 100 };
        expect(snapResize({ x: 100, y: 100, width: 296, height: 100 }, prev, t, 8)).toEqual({ x: 100, y: 100, width: 300, height: 100 });
    });
});

describe('R4: zones en blanc', () => {
    const img = (inked: boolean): Luma => {
        const w = 100, h = 140, data = new Uint8Array(w * h).fill(250);
        if (inked) for (let x = 20; x < 60; x++) data[30 * w + x] = 20; // una ratlla dins la zona
        return { width: w, height: h, scale: 0.1, data };
    };

    it('mesura la tinta respecte del fons', () => {
        expect(inkRatio(img(false), crop('a', 100, 200, 600, 300))).toBe(0);
        expect(inkRatio(img(true), crop('a', 100, 200, 600, 300))).toBeGreaterThan(0.01);
    });

    it('troba l\'alumne amb el retall en blanc, o sense pàgina, i espera les que no s\'han carregat', () => {
        const exercises: ExerciseDef[] = [crop('a', 100, 200, 600, 300), { id: 'p', type: 'pages', name: 'P', maxScore: 1, pageIndexes: [0] } as ExerciseDef];
        const pages = [img(true), img(false), undefined, null];
        expect(findBlankZones(4, exercises, s => pages[s])).toEqual([
            { studentIdx: 1, exerciseId: 'a' },
            { studentIdx: 2, exerciseId: 'a' },
        ]);
    });
});
