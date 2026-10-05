import { describe, expect, it } from 'vitest';
import { stampComment } from '../annotations';
import { contrastRatio, displayFill, displayInk, parseColor } from '../colors';

const BLACK = { r: 0, g: 0, b: 0, a: 1 };

describe('colors de pantalla en mode fosc', () => {
    it('entén hex curt, llarg, amb alfa i rgba', () => {
        expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
        expect(parseColor('#10b98180').a).toBeCloseTo(0.5, 2);
        expect(parseColor('rgba(249, 115, 22, 0.4)')).toEqual({ r: 249, g: 115, b: 22, a: 0.4 });
    });

    it('en mode clar no canvia res', () => {
        for (const c of ['#111827', '#000000', 'rgba(0,0,0,0.6)', '#ef4444']) {
            expect(displayInk(c, false)).toBe(c);
            expect(displayFill(c, false)).toBe(c);
        }
    });

    it('la tinta fosca es llegeix sobre el full invertit (contrast ≥ 4,5)', () => {
        for (const c of ['#111827', '#000000', '#1e293b', '#059669', '#dc2626', '#3b82f6', '#8b5cf6']) {
            expect(contrastRatio(parseColor(displayInk(c, true)), BLACK), c).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('manté el to: el verd segueix sent verd i l\'alfa no canvia', () => {
        const g = parseColor(displayInk('#059669', true));
        expect(g.g).toBeGreaterThan(g.r);
        expect(g.g).toBeGreaterThan(g.b);
        expect(parseColor(displayInk('rgba(0,0,0,0.6)', true)).a).toBe(0.6);
    });

    it('el fons blanc d\'un comentari passa a fosc', () => {
        const f = parseColor(displayFill('rgba(255,255,255,0.7)', true));
        expect(f.r + f.g + f.b).toBe(0);
        expect(f.a).toBe(0.7);
    });
});

describe('comentari segellat', () => {
    it('es desa amb colors de paper, sigui quin sigui el tema', () => {
        const ann = stampComment({ id: 'c', text: 'Molt bé', score: 0.5, colorMode: 'score' }, { x: 0, y: 0 }, 18);
        expect(ann.color).toBe('#059669');
        expect(ann.bgFill).toBe('#10b98115');
        const neutral = stampComment({ id: 'n', text: 'Mira-ho', colorMode: 'neutral' }, { x: 0, y: 0 }, 18);
        expect(neutral.color).toBe('#111827');
    });
});
